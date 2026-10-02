import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { Request } from 'express';
import type { AuthPrincipal } from '../../packages/contracts/src/index.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const database = vi.hoisted(() => ({ pool: undefined as Pool | undefined, tenantId: '' }));
vi.mock('@gc/database', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../packages/database/src/index.js')>(),
  tenantPoolFromId: async (id: string) => {
    if (!database.pool || id !== database.tenantId) throw new Error('Refusing a database outside the owned fixture.');
    return { pool: database.pool };
  },
}));
vi.mock('@gc/platform', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../packages/platform/src/index.js')>(),
  // Controller logic and PostgreSQL transactions are real; no HTTP server is started.
  bootstrapNest: vi.fn().mockResolvedValue(undefined),
}));

import { EldersController } from '../../services/elders-service/src/main.js';

const live = process.env.RUN_PREMIUM_ELDERS_ATOMIC_DB_TESTS === '1' ? describe.sequential : describe.skip;
let fixture: SyntheticTenantFixture;
const controller = new EldersController();
type MutationRequest = Request & { user?: AuthPrincipal };
const tables = [
  'elders.rotations', 'elders.rotation_members', 'elders.department_assignments',
  'elders.programs', 'elders.media', 'elders.service_templates', 'elders.service_template_items',
  'elders.program_platform_members', 'elders.program_service_items',
  'notifications.notifications', 'audit.audit_events',
] as const;

function request(principal = fixture.users.admin.principal): MutationRequest {
  return { user: principal } as MutationRequest;
}

async function snapshot() {
  const result: Record<string, string> = {};
  for (const table of tables) {
    const rows = await fixture.pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) contents FROM ${table} row`);
    // Compare opaque digests; do not serialize fixture identities or media to logs.
    result[table] = createHash('sha256').update(JSON.stringify(rows.rows[0].contents)).digest('hex');
  }
  return result;
}

async function seedProgram() {
  const id = randomUUID();
  await fixture.pool.query(
    `INSERT INTO elders.programs(id,elder_id,service_at,ends_at,service_type,title,created_by)
     VALUES($1,$2,'2030-06-01T10:00:00Z','2030-06-01T12:00:00Z','SABBATH','Synthetic program',$3)`,
    [id, fixture.users.elder.id, fixture.users.admin.id],
  );
  return id;
}

async function seedRotation() {
  const id = randomUUID();
  await fixture.pool.query(
    `INSERT INTO elders.rotations(id,title,starts_on,ends_on,created_by)
     VALUES($1,'Synthetic rotation','2028-01-01','2028-01-07',$2)`, [id, fixture.users.admin.id],
  );
  await fixture.pool.query('INSERT INTO elders.rotation_members(rotation_id,elder_id) VALUES($1,$2)', [id, fixture.users.elder.id]);
  return id;
}

async function seedTemplate() {
  const id = randomUUID();
  await fixture.pool.query(
    `INSERT INTO elders.service_templates(id,name,service_type,created_by) VALUES($1,'Synthetic template','SABBATH',$2)`,
    [id, fixture.users.admin.id],
  );
  await fixture.pool.query(
    `INSERT INTO elders.service_template_items(template_id,sequence,title,participation_type,default_duration_minutes)
     VALUES($1,1,'Synthetic opening','WELCOME',5)`, [id],
  );
  return id;
}

const media = () => ({ originalname: 'synthetic-private-photo.png', mimetype: 'image/png', size: 8, buffer: Buffer.from('fixture!') });
type Mutation = { name: string; action: string; prepare: () => Promise<() => Promise<unknown>>; notification?: string };
const mutations: Mutation[] = [
  {
    name: 'department assignment create', action: 'elders.department_assignment.created', notification: 'elders.department_assigned',
    prepare: async () => () => controller.createDepartmentAssignments(request(), {
      elderId: fixture.users.elder.id, departmentIds: [fixture.departments.youth, fixture.departments.music],
      startsOn: '2031-01-01', endsOn: '2031-12-31', notes: 'Synthetic assignment',
    }),
  },
  {
    name: 'department assignment update', action: 'elders.department_assignment.updated',
    prepare: async () => {
      const id = randomUUID();
      await fixture.pool.query(
        `INSERT INTO elders.department_assignments(id,elder_id,department_id,starts_on,ends_on,created_by)
         VALUES($1,$2,$3,'2032-01-01','2032-12-31',$4)`,
        [id, fixture.users.elder.id, fixture.departments.children, fixture.users.admin.id],
      );
      return () => controller.updateDepartmentAssignment(request(), id, { status: 'INACTIVE', notes: 'Synthetic update' });
    },
  },
  {
    name: 'annual rotations', action: 'elders.annual_plan.created', notification: 'elders.annual_plan_assigned',
    prepare: async () => () => controller.createAnnualRotationPlan(request(), {
      year: 2034, elderIds: [fixture.users.elder.id, fixture.users.firstElder.id], eldersPerWeek: 1,
    }),
  },
  {
    name: 'rotation create', action: 'elders.rotation.created', notification: 'elders.rotation_assigned',
    prepare: async () => () => controller.createRotation(request(), {
      title: 'Synthetic rotation created', startsOn: '2037-01-01', endsOn: '2037-01-07', elderIds: [fixture.users.elder.id],
    }),
  },
  {
    name: 'rotation update and membership replacement', action: 'elders.rotation.updated',
    prepare: async () => {
      const id = await seedRotation();
      return () => controller.updateRotation(request(), id, { title: 'Synthetic updated rotation', elderIds: [fixture.users.firstElder.id] });
    },
  },
  {
    name: 'template create and child items', action: 'elders.platform_template.created',
    prepare: async () => () => controller.createServiceTemplate(request(), {
      name: 'Synthetic new template', serviceType: 'SABBATH',
      items: [{ title: 'Synthetic greeting', participationType: 'WELCOME', durationMinutes: 5 }],
    }),
  },
  {
    name: 'template application replacing prior items', action: 'elders.platform_template.applied',
    prepare: async () => {
      const id = await seedProgram(), templateId = await seedTemplate();
      await fixture.pool.query(
        `INSERT INTO elders.program_service_items(program_id,sequence,title,participation_type,starts_at,duration_minutes)
         VALUES($1,1,'Synthetic prior item','PRAYER','2030-06-01T10:00:00Z',3)`, [id],
      );
      return () => controller.applyPlatformTemplate(request(), id, { templateId });
    },
  },
  {
    name: 'platform member and timeline replacement', action: 'elders.platform.updated', notification: 'elders.platform_assigned',
    prepare: async () => {
      const id = await seedProgram();
      await fixture.pool.query(
        `INSERT INTO elders.program_platform_members(program_id,user_id,display_name,role_label,is_lead,sequence,added_by)
         VALUES($1,$2,'Synthetic prior participant','Platform',true,1,$3)`, [id, fixture.users.elder.id, fixture.users.admin.id],
      );
      await fixture.pool.query(
        `INSERT INTO elders.program_service_items(program_id,sequence,title,participation_type,starts_at,duration_minutes)
         VALUES($1,1,'Synthetic prior item','PRAYER','2030-06-01T10:00:00Z',3)`, [id],
      );
      return () => controller.savePlatform(request(), id, {
        platformMembers: [{ userId: fixture.users.firstElder.id, displayName: 'Synthetic participant', isLead: true }],
        items: [{ title: 'Synthetic welcome', participationType: 'WELCOME', startsAt: '2030-06-01T10:00:00Z', durationMinutes: 5, assigneeUserId: fixture.users.firstElder.id }],
      });
    },
  },
  {
    name: 'published program create', action: 'elders.program.created', notification: 'elders.program_published',
    prepare: async () => () => controller.createProgram(request(), {
      elderId: fixture.users.elder.id, serviceAt: '2030-07-01T10:00:00Z', endsAt: '2030-07-01T12:00:00Z',
      serviceType: 'SABBATH', title: 'Synthetic published program', status: 'PUBLISHED',
    }),
  },
  {
    name: 'program publication transition', action: 'elders.program.updated', notification: 'elders.program_published',
    prepare: async () => {
      const id = await seedProgram();
      return () => controller.updateProgram(request(), id, { title: 'Synthetic updated program', status: 'PUBLISHED' });
    },
  },
  {
    name: 'media insertion', action: 'elders.program_media.uploaded',
    prepare: async () => {
      const id = await seedProgram();
      return () => controller.uploadMedia(request(), id, 'PREACHER', media());
    },
  },
  {
    name: 'media replacement preserves previous bytes on audit failure', action: 'elders.program_media.uploaded',
    prepare: async () => {
      const id = await seedProgram();
      await fixture.pool.query(
        `INSERT INTO elders.media(program_id,kind,original_name,media_type,size_bytes,content,uploaded_by)
         VALUES($1,'ARTIST','synthetic-original.png','image/png',3,$2,$3)`, [id, Buffer.from('old'), fixture.users.admin.id],
      );
      return () => controller.uploadMedia(request(), id, 'ARTIST', media());
    },
  },
];

live('elders mutations are atomic with notifications and audit in an owned PostgreSQL fixture', () => {
  beforeAll(async () => {
    // Suspended fixture prevents background workers from consuming its data.
    fixture = await createTenantFixture({ backgroundWork: false });
    database.pool = fixture.pool; database.tenantId = fixture.id;
    await fixture.pool.query('INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,$3)', [fixture.users.viewer.id, fixture.departments.communications, 'VIEWER']);
    await fixture.pool.query(`
      CREATE TABLE public.premium_elders_fault(enabled boolean NOT NULL);
      INSERT INTO public.premium_elders_fault VALUES(false);
      CREATE FUNCTION public.premium_fail_elders_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action LIKE 'elders.%' AND (SELECT enabled FROM public.premium_elders_fault) THEN
          RAISE EXCEPTION 'Synthetic elders audit failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER premium_elders_audit_fault BEFORE INSERT ON audit.audit_events
        FOR EACH ROW EXECUTE FUNCTION public.premium_fail_elders_audit();
    `);
  }, 120_000);

  afterAll(async () => {
    database.pool = undefined; database.tenantId = '';
    await fixture?.destroy();
  }, 120_000);

  it.each(mutations)('$name rolls back exactly, then commits once with audit', async ({ prepare, action, notification }) => {
    const mutate = await prepare(), before = await snapshot();
    const auditBefore = (await fixture.pool.query('SELECT count(*)::int count FROM audit.audit_events WHERE action=$1', [action])).rows[0].count;
    const noticeBefore = notification ? (await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_type=$1', [notification])).rows[0].count : undefined;
    await fixture.pool.query('UPDATE public.premium_elders_fault SET enabled=true');
    try { await expect(mutate()).rejects.toThrow('Synthetic elders audit failure'); }
    finally { await fixture.pool.query('UPDATE public.premium_elders_fault SET enabled=false'); }
    expect(await snapshot()).toEqual(before);
    await mutate();
    expect((await fixture.pool.query('SELECT count(*)::int count FROM audit.audit_events WHERE action=$1', [action])).rows[0].count).toBe(auditBefore + 1);
    if (notification) expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_type=$1', [notification])).rows[0].count).toBeGreaterThan(noticeBefore!);
    expect((await snapshot())['audit.audit_events']).not.toBe(before['audit.audit_events']);
    if (action === 'elders.program_media.uploaded') {
      const event = (await fixture.pool.query('SELECT after_data FROM audit.audit_events WHERE action=$1 ORDER BY created_at DESC LIMIT 1', [action])).rows[0].after_data;
      expect(Object.keys(event).sort()).toEqual(['kind', 'mediaId', 'mediaType', 'sizeBytes']);
      expect(JSON.stringify(event)).not.toContain('synthetic-private-photo');
      expect(event).not.toHaveProperty('content');
    }
  });

  it('notification failure also rolls back the mutation and leaves no audit', async () => {
    const before = await snapshot();
    await fixture.pool.query(`
      CREATE FUNCTION public.premium_fail_elders_notice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic elders notification failure'; END $$;
      CREATE TRIGGER premium_elders_notice_fault BEFORE INSERT ON notifications.notifications
        FOR EACH ROW EXECUTE FUNCTION public.premium_fail_elders_notice();
    `);
    try {
      await expect(controller.createRotation(request(), {
        title: 'Synthetic failed notice', startsOn: '2039-01-01', endsOn: '2039-01-07', elderIds: [fixture.users.elder.id],
      })).rejects.toThrow('Synthetic elders notification failure');
    } finally { await fixture.pool.query('DROP TRIGGER premium_elders_notice_fault ON notifications.notifications; DROP FUNCTION public.premium_fail_elders_notice()'); }
    expect(await snapshot()).toEqual(before);
  });

  it('keeps ownership permission and MIME rejection before writes', async () => {
    const otherElder = await fixture.createUser(['ELDER']);
    const id = await seedProgram(), before = await snapshot();
    await expect(controller.updateProgram(request(otherElder.principal), id, { title: 'Synthetic forbidden update' })).rejects.toMatchObject({ status: 403 });
    await expect(controller.uploadMedia(request(), id, 'PREACHER', { ...media(), mimetype: 'image/svg+xml' })).rejects.toThrow('Use una imagen JPG, PNG o WebP.');
    expect(await snapshot()).toEqual(before);
  });

  it('a partial program/rotation update keeps published state and omitted participants and content', async () => {
    const programId = await seedProgram(), rotationId = await seedRotation();
    await fixture.pool.query("UPDATE elders.programs SET status='PUBLISHED',preacher_name='Synthetic preacher',singer_name='Synthetic singer',hymn='Synthetic hymn',bible_reading='Synthetic reading',notes='Synthetic notes' WHERE id=$1", [programId]);
    await fixture.pool.query("UPDATE elders.rotations SET notes='Synthetic rotation notes' WHERE id=$1", [rotationId]);
    const before = (await fixture.pool.query('SELECT status,preacher_name,singer_name,hymn,bible_reading,notes FROM elders.programs WHERE id=$1', [programId])).rows[0];
    await controller.updateProgram(request(), programId, { title: 'Synthetic edited program title' });
    expect((await fixture.pool.query('SELECT status,preacher_name,singer_name,hymn,bible_reading,notes FROM elders.programs WHERE id=$1', [programId])).rows[0]).toEqual(before);
    await controller.updateRotation(request(), rotationId, { status: 'COMPLETED' });
    expect((await fixture.pool.query('SELECT title,notes FROM elders.rotations WHERE id=$1', [rotationId])).rows[0]).toEqual({ title: 'Synthetic rotation', notes: 'Synthetic rotation notes' });
    expect((await fixture.pool.query('SELECT elder_id FROM elders.rotation_members WHERE rotation_id=$1', [rotationId])).rows.map(r => r.elder_id)).toEqual([fixture.users.elder.id]);
  });
});
