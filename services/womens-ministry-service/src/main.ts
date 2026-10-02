import 'reflect-metadata';
import type { Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { Body, Controller, Get, Headers, Module, Param, Patch, Post, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { tenantPoolFromId } from '@gc/database';
import { bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public, sha256 } from '@gc/platform';
import { activeDomainClient, atomicDomainMutation, domainTransaction } from '../../shared/atomic-domain-mutation.js';
import { womenBudgetCurrencyTotals } from './budget-currencies.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_womens_ministry_service';

const rosterSchema = z.object({
  userId: z.uuid().nullable().optional(), name: z.string().trim().min(2).max(180), email: z.union([z.email(), z.literal('')]).default(''),
  phone: z.string().trim().max(40).default(''), dateOfBirth: z.iso.date().nullable().optional(),
  membershipStatus: z.enum(['MEMBER', 'VISITOR', 'INACTIVE']).default('MEMBER'), preferredContact: z.enum(['WHATSAPP', 'EMAIL', 'PHONE', 'NONE']).default('WHATSAPP'),
  interests: z.array(z.string().trim().min(2).max(80)).max(20).default([]), inclusionNotes: z.string().trim().max(2000).default('')
});
const activitySchema = z.object({
  calendarActivityId: z.uuid(), title: z.string().trim().min(3).max(180), activityType: z.enum(['SPIRITUAL','FELLOWSHIP','SERVICE','TRAINING','HEALTH','EVANGELISM','OTHER']),
  objective: z.string().trim().min(3).max(3000), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), venue: z.string().trim().max(240).default(''),
  responsibleId: z.uuid().nullable().optional(), targetAgeBands: z.array(z.enum(['UNDER_18','18_25','26_39','40_59','60_PLUS','UNSPECIFIED'])).max(6).default([]),
  plannedBudget: z.number().min(0).max(100000000), currency: z.string().trim().length(3).default('DOP'), status: z.enum(['DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED']).default('PLANNED')
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { path: ['endsAt'], message: 'La finalización debe ser posterior al inicio.' });
const activityUpdateSchema = z.object({ status: z.enum(['DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED']).optional(), outcome: z.string().trim().max(5000).optional() });
const budgetSchema = z.object({ entryType: z.enum(['PLANNED_EXPENSE','EXPENSE','INCOME']), category: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).default(''), amount: z.number().positive().max(100000000), occurredOn: z.iso.date(), receiptReference: z.string().trim().max(180).default('') });
const participationSchema = z.object({ womanId: z.uuid(), status: z.enum(['INVITED','CONFIRMED','ATTENDED','DECLINED','NO_SHOW']), notes: z.string().trim().max(1000).default('') });
const retreatSchema = z.object({
  title: z.string().trim().min(3).max(180), year: z.number().int().min(2020).max(2100), resort: z.string().trim().min(2).max(240), startsOn: z.iso.date(), endsOn: z.iso.date(),
  capacity: z.number().int().min(1).max(10000), costPerPerson: z.number().min(0).max(10000000), totalBudget: z.number().min(0).max(100000000), depositDeadline: z.iso.date().nullable().optional(),
  currency: z.string().trim().length(3).default('DOP'), status: z.enum(['PLANNING','REGISTRATION_OPEN','REGISTRATION_CLOSED','COMPLETED','CANCELLED']).default('PLANNING'), notes: z.string().trim().max(5000).default('')
}).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'La fecha final debe ser igual o posterior al inicio.' });
const registrationSchema = z.object({ womanId: z.uuid(), attendanceStatus: z.enum(['INTERESTED','CONFIRMED','DECLINED','WAITLIST','ATTENDED','NO_SHOW']).default('INTERESTED'), amountDue: z.number().min(0).max(10000000), roomAssignment: z.string().trim().max(120).default(''), transportRequired: z.boolean().default(false), dietaryNotes: z.string().trim().max(1000).default(''), notes: z.string().trim().max(1000).default('') });
const registrationUpdateSchema = registrationSchema.omit({ womanId: true }).partial().extend({
  attendanceStatus: registrationSchema.shape.attendanceStatus.removeDefault().optional(),
  roomAssignment: registrationSchema.shape.roomAssignment.removeDefault().optional(),
  transportRequired: registrationSchema.shape.transportRequired.removeDefault().optional(),
  dietaryNotes: registrationSchema.shape.dietaryNotes.removeDefault().optional(),
  notes: registrationSchema.shape.notes.removeDefault().optional()
});
const paymentSchema = z.object({ amount: z.number().positive().max(10000000), paidOn: z.iso.date(), method: z.enum(['CASH','TRANSFER','CARD','OTHER']), reference: z.string().trim().max(180).default('') });
const followUpSchema = z.object({ womanId: z.uuid(), activityId: z.uuid().nullable().optional(), reason: z.string().trim().min(3).max(1000), dueOn: z.iso.date(), assignedTo: z.uuid().nullable().optional(), notes: z.string().trim().max(2000).default('') });
const followUpUpdateSchema = z.object({ status: z.enum(['OPEN','IN_PROGRESS','COMPLETED','CANCELLED']).optional(), dueOn: z.iso.date().optional(), assignedTo: z.uuid().nullable().optional(), notes: z.string().trim().max(2000).optional() });

type Access = { canRead: boolean; canManage: boolean; canFinance: boolean; departmentRole: string | null };

async function poolFor(user: AuthPrincipal): Promise<Pool | PoolClient> {
  if (user.scope !== 'tenant' || !user.tenantId) throw Object.assign(new Error('Se requiere una iglesia.'), { status: 403 });
  const active = activeDomainClient(user.tenantId);
  if (active) return active;
  return (await tenantPoolFromId(user.tenantId)).pool;
}
const AtomicWrite = atomicDomainMutation(async (request: Request & { user?: AuthPrincipal }) => {
  const user = currentUser(request);
  return { pool: await poolFor(user), tenantId: user.tenantId ?? '' };
});

async function department(pool: Pool | PoolClient) {
  const result = await pool.query<{ id: string; name: string; color: string }>(
    `SELECT id,name,color FROM calendar.departments WHERE active AND lower(translate(name,'áéíóúüñ','aeiouun')) ~ '(ministerio(s)? de la mujer|women.?s ministr)' ORDER BY name LIMIT 1`
  );
  return result.rows[0] ?? null;
}

async function accessFor(pool: Pool | PoolClient, user: Pick<AuthPrincipal, 'sub' | 'roles'>, departmentId: string | null): Promise<Access> {
  const privileged = user.roles.some((role) => ['TENANT_ADMIN','BOARD_SECRETARY'].includes(role));
  const pastoralRead = user.roles.includes('PASTOR');
  if (!departmentId) return { canRead: privileged || pastoralRead, canManage: privileged, canFinance: privileged, departmentRole: null };
  const membership = await pool.query<{ role: string }>(`SELECT role FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2`, [user.sub, departmentId]);
  const role = membership.rows[0]?.role ?? null;
  return {
    canRead: privileged || pastoralRead || Boolean(role),
    canManage: privileged || ['DIRECTOR','ASSISTANT_DIRECTOR','DEPARTMENT_SECRETARY','PLANNER'].includes(role ?? ''),
    canFinance: privileged || ['DIRECTOR','ASSISTANT_DIRECTOR','DEPARTMENT_SECRETARY'].includes(role ?? ''),
    departmentRole: role
  };
}

async function ensureAuthorizedAssignee(pool: Pool | PoolClient, userId: string, departmentId: string | null): Promise<void> {
  const account = await pool.query<{ roles: AuthPrincipal['roles'] }>(`SELECT roles FROM identity.users WHERE id=$1 AND active`, [userId]);
  const roles = account.rows[0]?.roles;
  if (!roles || !(await accessFor(pool, { sub: userId, roles }, departmentId)).canRead) {
    throw Object.assign(new Error('La persona seleccionada debe estar activa y tener acceso al Ministerio de la Mujer.'), { status: 400, code: 'AUTHORIZED_ASSIGNEE_REQUIRED' });
  }
}

function requireRight(access: Access, right: keyof Access) {
  if (!access[right]) throw Object.assign(new Error('No tiene autorización para esta función del Ministerio de la Mujer.'), { status: 403, code: 'WOMENS_MINISTRY_ACCESS_DENIED' });
}

async function audit(pool: Pool | PoolClient, actorId: string, action: string, resourceType: string, resourceId: string, after: unknown) {
  await pool.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data) VALUES($1,$2,$3,$4,$5::jsonb)`, [actorId, action, resourceType, resourceId, JSON.stringify(after)]);
}

async function notify(pool: Pool | PoolClient, ids: string[], title: string, body: string, link = '/womens-ministry', eventType = 'womens_ministry.assignment') {
  if (!ids.length) return;
  await pool.query(`INSERT INTO notifications.notifications(event_id,event_type,user_id,title,body,link) SELECT gen_random_uuid(),$5,id,$2,$3,$4 FROM unnest($1::uuid[]) id`, [[...new Set(ids)], title, body, link, eventType]);
}

type BirthdayWoman = { id: string; name: string; email: string; phone: string; dateOfBirth: string | Date | null; preferredContact: string };
type Birthday = BirthdayWoman & { nextBirthday: string; daysUntil: number; turningAge: number; isToday: boolean };

function dateOnly(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function upcomingBirthdays(women: BirthdayWoman[], today: string): Birthday[] {
  const [currentYear,currentMonth,currentDay]=today.split('-').map(Number) as [number,number,number];
  const todayUtc=Date.UTC(currentYear,currentMonth-1,currentDay);
  return women.flatMap((woman) => {
    if(!woman.dateOfBirth) return [];
    const normalizedBirthDate=dateOnly(woman.dateOfBirth);
    if(!normalizedBirthDate)return [];
    const [birthYear,birthMonth,birthDay]=normalizedBirthDate.split('-').map(Number) as [number,number,number];
    const birthdayIn=(year:number)=>{
      const lastDay=new Date(Date.UTC(year,birthMonth,0)).getUTCDate();
      return new Date(Date.UTC(year,birthMonth-1,Math.min(birthDay,lastDay)));
    };
    let birthdayYear=currentYear;let next=birthdayIn(birthdayYear);
    if(next.getTime()<todayUtc){birthdayYear+=1;next=birthdayIn(birthdayYear);}
    const daysUntil=Math.round((next.getTime()-todayUtc)/86_400_000);
    return [{...woman,nextBirthday:next.toISOString().slice(0,10),daysUntil,turningAge:birthdayYear-birthYear,isToday:daysUntil===0}];
  }).filter((item)=>item.daysUntil<=30).sort((a,b)=>a.daysUntil-b.daysUntil||a.name.localeCompare(b.name,'es'));
}

async function createBirthdayAlerts(pool: Pool | PoolClient, birthdays: Birthday[], team: Array<{id:string;role:string}>) {
  const recipients=[...new Set(team.filter((member)=>['DIRECTOR','ASSISTANT_DIRECTOR','DEPARTMENT_SECRETARY','PLANNER'].includes(member.role)).map((member)=>member.id))];
  if(!recipients.length)return;
  return domainTransaction(pool, async (client) => {
  for(const birthday of birthdays.filter((item)=>item.daysUntil<=7)){
    const birthdayYear=Number(birthday.nextBirthday.slice(0,4));
    const alertStage=birthday.isToday?'TODAY':'UPCOMING';
    const inserted=await client.query<{recipient_id:string}>(`INSERT INTO womens_ministry.birthday_alerts(woman_id,recipient_id,birthday_year,alert_stage,next_birthday) SELECT $1,id,$2,$3,$4::date FROM unnest($5::uuid[]) id ON CONFLICT DO NOTHING RETURNING recipient_id`,[birthday.id,birthdayYear,alertStage,birthday.nextBirthday,recipients]);
    const newRecipients=inserted.rows.map((item)=>item.recipient_id);
    if(!newRecipients.length)continue;
    const title=birthday.isToday?`Cumpleaños de ${birthday.name} hoy`:`Cumpleaños próximo · ${birthday.name}`;
    const body=birthday.isToday?`Hoy celebramos la vida de ${birthday.name}. Recuerda contactarla y acompañarla.`:`${birthday.name} cumple años en ${birthday.daysUntil} día(s), el ${birthday.nextBirthday}.`;
    await notify(client,newRecipients,title,body,'/womens-ministry','womens_ministry.birthday');
    await client.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data) VALUES(NULL,'womens_ministry.birthday_alert.generated','woman_profile',$1,$2::jsonb)`,[birthday.id,JSON.stringify({birthdayYear,alertStage,nextBirthday:birthday.nextBirthday,recipientCount:newRecipients.length,outcome:'SUCCESS'})]);
  }
  });
}

const womenSql = `SELECT w.id,w.user_id "userId",w.church_member_id "churchMemberId",w.name,w.email,w.phone,w.date_of_birth::text "dateOfBirth",w.membership_status "membershipStatus",w.preferred_contact "preferredContact",w.interests,w.inclusion_notes "inclusionNotes",w.active,
  CASE WHEN w.date_of_birth IS NULL THEN 'UNSPECIFIED' WHEN EXTRACT(year FROM age(current_date,w.date_of_birth))<18 THEN 'UNDER_18' WHEN EXTRACT(year FROM age(current_date,w.date_of_birth))<=25 THEN '18_25' WHEN EXTRACT(year FROM age(current_date,w.date_of_birth))<=39 THEN '26_39' WHEN EXTRACT(year FROM age(current_date,w.date_of_birth))<=59 THEN '40_59' ELSE '60_PLUS' END "ageBand",
  CASE WHEN w.date_of_birth IS NULL THEN NULL ELSE EXTRACT(year FROM age(current_date,w.date_of_birth))::int END age,
  COALESCE(stats.attended,0)::int "attendedCount",stats.last_attended "lastAttended",COALESCE(stats.no_shows,0)::int "noShowCount"
  FROM womens_ministry.women w LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE p.status='ATTENDED') attended,max(a.starts_at) FILTER(WHERE p.status='ATTENDED') last_attended,count(*) FILTER(WHERE p.status='NO_SHOW') no_shows FROM womens_ministry.activity_participation p JOIN womens_ministry.activities a ON a.id=p.activity_id WHERE p.woman_id=w.id) stats ON true ORDER BY w.name`;

const activitiesSql = `SELECT a.id,a.calendar_activity_id "calendarActivityId",a.title,a.activity_type "activityType",a.objective,a.starts_at "startsAt",a.ends_at "endsAt",a.venue,a.responsible_id "responsibleId",u.name "responsibleName",a.target_age_bands "targetAgeBands",a.planned_budget::float8 "plannedBudget",a.currency,a.status,a.outcome,
  COALESCE(fin.expenses,0)::float8 "spentBudget",COALESCE(fin.income,0)::float8 income,COALESCE(fin.items,'[]'::jsonb) "budgetEntries",COALESCE(part.items,'[]'::jsonb) participants,COALESCE(part.attended,0)::int "attendedCount",COALESCE(part.invited,0)::int "participantCount"
  FROM womens_ministry.activities a LEFT JOIN identity.users u ON u.id=a.responsible_id
  LEFT JOIN LATERAL (SELECT sum(amount) FILTER(WHERE entry_type='EXPENSE') expenses,sum(amount) FILTER(WHERE entry_type='INCOME') income,jsonb_agg(jsonb_build_object('id',id,'entryType',entry_type,'category',category,'description',description,'amount',amount::float8,'occurredOn',occurred_on,'receiptReference',receipt_reference) ORDER BY occurred_on DESC,created_at DESC) items FROM womens_ministry.activity_budget_entries WHERE activity_id=a.id) fin ON true
  LEFT JOIN LATERAL (SELECT count(*) invited,count(*) FILTER(WHERE p.status='ATTENDED') attended,jsonb_agg(jsonb_build_object('womanId',w.id,'name',w.name,'status',p.status,'notes',p.notes) ORDER BY w.name) items FROM womens_ministry.activity_participation p JOIN womens_ministry.women w ON w.id=p.woman_id WHERE p.activity_id=a.id) part ON true ORDER BY a.starts_at DESC`;

const retreatsSql = `SELECT r.id,r.title,r.year,r.resort,r.starts_on "startsOn",r.ends_on "endsOn",r.capacity,r.cost_per_person::float8 "costPerPerson",r.total_budget::float8 "totalBudget",r.deposit_deadline "depositDeadline",r.currency,r.status,r.notes,
  COALESCE(reg.items,'[]'::jsonb) registrations,COALESCE(reg.registered,0)::int registered,COALESCE(reg.confirmed,0)::int confirmed,COALESCE(reg.collected,0)::float8 collected,COALESCE(reg.expected,0)::float8 expected
  FROM womens_ministry.retreats r LEFT JOIN LATERAL (SELECT count(*) registered,count(*) FILTER(WHERE rr.attendance_status IN ('CONFIRMED','ATTENDED')) confirmed,sum(rr.amount_due) expected,sum(COALESCE(pay.paid,0)) collected,
    jsonb_agg(jsonb_build_object('id',rr.id,'womanId',w.id,'name',w.name,'attendanceStatus',rr.attendance_status,'amountDue',rr.amount_due::float8,'amountPaid',COALESCE(pay.paid,0)::float8,'paymentStatus',CASE WHEN COALESCE(pay.paid,0)>=rr.amount_due THEN 'PAID' WHEN COALESCE(pay.paid,0)>0 THEN 'PARTIAL' ELSE 'UNPAID' END,'roomAssignment',rr.room_assignment,'transportRequired',rr.transport_required,'dietaryNotes',rr.dietary_notes,'notes',rr.notes) ORDER BY w.name) items
    FROM womens_ministry.retreat_registrations rr JOIN womens_ministry.women w ON w.id=rr.woman_id LEFT JOIN LATERAL (SELECT sum(amount) paid FROM womens_ministry.retreat_payments WHERE registration_id=rr.id) pay ON true WHERE rr.retreat_id=r.id) reg ON true ORDER BY r.year DESC,r.starts_on DESC`;

const followUpsSql = `SELECT f.id,f.woman_id "womanId",w.name "womanName",f.activity_id "activityId",a.title "activityTitle",f.reason,f.due_on "dueOn",f.assigned_to "assignedTo",u.name "assignedName",f.status,f.notes,f.created_at "createdAt" FROM womens_ministry.follow_ups f JOIN womens_ministry.women w ON w.id=f.woman_id LEFT JOIN womens_ministry.activities a ON a.id=f.activity_id LEFT JOIN identity.users u ON u.id=f.assigned_to ORDER BY CASE f.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,f.due_on`;

@Controller()
class HealthController { @Public() @Get('health/live') health() { return HEALTH_RESPONSE; } }

@Controller('womens-ministry')
class WomensMinistryController {
  private async authorized(request: Request & { user?: AuthPrincipal }, right: keyof Access = 'canRead') {
    const user = currentUser(request); const pool = await poolFor(user); const ministryDepartment = await department(pool); const access = await accessFor(pool, user, ministryDepartment?.id ?? null); requireRight(access, right); return { user, pool, access, ministryDepartment };
  }

  @Get('context')
  async context(@Req() request: Request & { user?: AuthPrincipal }) {
    const { pool, access, ministryDepartment } = await this.authorized(request);
    const [women, activities, retreats, followUps, availableUsers, team, clock] = await Promise.all([
      pool.query(womenSql), pool.query(activitiesSql), pool.query(retreatsSql), pool.query(followUpsSql),
      access.canManage ? pool.query(`SELECT id,name,email,phone,roles FROM identity.users WHERE active ORDER BY name`) : Promise.resolve({rows:[]}),
      ministryDepartment ? pool.query(`SELECT u.id,u.name,u.email,m.role FROM identity.department_memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.department_id=$1 AND u.active ORDER BY CASE m.role WHEN 'DIRECTOR' THEN 0 WHEN 'ASSISTANT_DIRECTOR' THEN 1 WHEN 'DEPARTMENT_SECRETARY' THEN 2 ELSE 3 END,u.name`, [ministryDepartment.id]) : Promise.resolve({ rows: [] }),
      pool.query<{today:string}>(`SELECT current_date::text today`)
    ]);
    const now = Date.now();
    const enrichedWomen = women.rows.map((woman) => ({ ...woman, engagementStatus: !woman.lastAttended ? 'NEEDS_CONNECTION' : now - new Date(woman.lastAttended).getTime() > 180 * 86_400_000 ? 'FOLLOW_UP' : 'ENGAGED' }));
    const birthdays=upcomingBirthdays(enrichedWomen.filter((woman)=>woman.active),clock.rows[0]!.today);
    await createBirthdayAlerts(pool,birthdays,team.rows);
    const ageBands = Object.fromEntries(['UNDER_18','18_25','26_39','40_59','60_PLUS','UNSPECIFIED'].map((band) => [band, enrichedWomen.filter((woman) => woman.ageBand === band && woman.active).length]));
    const budgetsByCurrency = womenBudgetCurrencyTotals(activities.rows);
    return {
      access, department: ministryDepartment, team: team.rows, availableUsers: availableUsers.rows, women: enrichedWomen, birthdays, activities: activities.rows, retreats: retreats.rows, followUps: followUps.rows,
      metrics: {
        budgetsByCurrency, budgetAggregationComparable: budgetsByCurrency.length <= 1,
        roster: enrichedWomen.filter((item) => item.active).length,
        needsConnection: enrichedWomen.filter((item) => item.active && item.engagementStatus !== 'ENGAGED').length,
        upcomingActivities: activities.rows.filter((item) => !['COMPLETED','CANCELLED'].includes(item.status) && new Date(item.endsAt).getTime() >= now).length,
        completedActivities: activities.rows.filter((item) => item.status === 'COMPLETED').length,
        openFollowUps: followUps.rows.filter((item) => ['OPEN','IN_PROGRESS'].includes(item.status)).length,
        plannedBudget: activities.rows.reduce((sum, item) => sum + Number(item.plannedBudget), 0),
        spentBudget: activities.rows.reduce((sum, item) => sum + Number(item.spentBudget), 0), birthdaysNext30:birthdays.length,birthdaysThisWeek:birthdays.filter((item)=>item.daysUntil<=7).length,ageBands
      }
    };
  }

  @Post('women')
  @AtomicWrite
  async createWoman(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const { user, pool } = await this.authorized(request, 'canManage'); const input = rosterSchema.parse(body);
    if (input.userId) {
      const account = await pool.query<{ name: string; email: string; phone: string }>(`SELECT name,email,phone FROM identity.users WHERE id=$1 AND active`, [input.userId]);
      if (!account.rows[0]) throw Object.assign(new Error('El usuario seleccionado no está activo.'), { status: 400 });
    }
    const result = await pool.query<{ id: string }>(`INSERT INTO womens_ministry.women(user_id,name,email,phone,date_of_birth,membership_status,preferred_contact,interests,inclusion_notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,date_of_birth=EXCLUDED.date_of_birth,membership_status=EXCLUDED.membership_status,preferred_contact=EXCLUDED.preferred_contact,interests=EXCLUDED.interests,inclusion_notes=EXCLUDED.inclusion_notes,active=true,updated_at=now() RETURNING id`, [input.userId ?? null,input.name,input.email,input.phone,input.dateOfBirth ?? null,input.membershipStatus,input.preferredContact,input.interests,input.inclusionNotes,user.sub]);
    await audit(pool,user.sub,'womens_ministry.woman.saved','woman_profile',result.rows[0]!.id,{...input,email:input.email ? '[registered]' : '',phone:input.phone ? '[registered]' : ''}); return { id: result.rows[0]!.id };
  }

  @Post('activities')
  @AtomicWrite
  async createActivity(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const { user,pool,ministryDepartment }=await this.authorized(request,'canManage'); const input=activitySchema.parse(body);
    input.currency = input.currency.toUpperCase();
    if(!ministryDepartment) throw Object.assign(new Error('Primero debe crear o activar el departamento Ministerio de la Mujer.'),{status:400});
    return domainTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`women.activity:${input.calendarActivityId}`]);
      // Calendar ownership is read-only for this service. The modular FK itself
      // preserves the core reference; a row lock would require an unrelated UPDATE grant.
      const linked=await client.query(`SELECT 1 FROM calendar.activities WHERE id=$1 AND department_id=$2`,[input.calendarActivityId,ministryDepartment.id]);
      if(!linked.rowCount) throw Object.assign(new Error('La actividad debe estar enlazada al calendario del Ministerio de la Mujer.'),{status:400});
      if(input.responsibleId) await ensureAuthorizedAssignee(client,input.responsibleId,ministryDepartment.id);
      const existing = await client.query<{ id: string; original: unknown }>(
        `SELECT a.id,(SELECT ae.after_data FROM audit.audit_events ae WHERE ae.action='womens_ministry.activity.created'
          AND ae.resource_id=a.id::text ORDER BY ae.created_at LIMIT 1) original
          FROM womens_ministry.activities a WHERE a.calendar_activity_id=$1`, [input.calendarActivityId]
      );
      if (existing.rows[0]) {
        const original = activitySchema.safeParse(existing.rows[0].original);
        if (!original.success || sha256(JSON.stringify({ ...original.data, currency: original.data.currency.toUpperCase() })) !== sha256(JSON.stringify(input))) {
          throw Object.assign(new Error('La actividad del calendario ya está vinculada con otro contenido. Revise el registro existente.'), { status: 409, code: 'WOMEN_ACTIVITY_ALREADY_LINKED' });
        }
        return { id: existing.rows[0].id, replayed: true };
      }
      const result=await client.query<{id:string}>(`INSERT INTO womens_ministry.activities(calendar_activity_id,title,activity_type,objective,starts_at,ends_at,venue,responsible_id,target_age_bands,planned_budget,currency,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[input.calendarActivityId,input.title,input.activityType,input.objective,input.startsAt,input.endsAt,input.venue,input.responsibleId??null,input.targetAgeBands,input.plannedBudget,input.currency,input.status,user.sub]);
      await audit(client,user.sub,'womens_ministry.activity.created','women_activity',result.rows[0]!.id,input); return {id:result.rows[0]!.id};
    });
  }

  @Patch('activities/:id')
  @AtomicWrite
  async updateActivity(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=activityUpdateSchema.parse(body);const result=await pool.query(`UPDATE womens_ministry.activities SET status=COALESCE($2,status),outcome=COALESCE($3,outcome),updated_at=now() WHERE id=$1 RETURNING id,title,status,outcome`,[id,input.status??null,input.outcome??null]);if(!result.rows[0])throw Object.assign(new Error('La actividad no existe.'),{status:404});await audit(pool,user.sub,'womens_ministry.activity.updated','women_activity',id,result.rows[0]);return result.rows[0];}

  @Post('activities/:id/budget')
  @AtomicWrite
  async addBudget(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canFinance');const input=budgetSchema.parse(body);const result=await pool.query<{id:string}>(`INSERT INTO womens_ministry.activity_budget_entries(activity_id,entry_type,category,description,amount,occurred_on,receipt_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[id,input.entryType,input.category,input.description,input.amount,input.occurredOn,input.receiptReference,user.sub]);await audit(pool,user.sub,'womens_ministry.budget_entry.created','women_activity_budget',result.rows[0]!.id,input);return{id:result.rows[0]!.id};}

  @Post('activities/:id/participation')
  @AtomicWrite
  async saveParticipation(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=participationSchema.parse(body);await pool.query(`INSERT INTO womens_ministry.activity_participation(activity_id,woman_id,status,notes,recorded_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(activity_id,woman_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,recorded_by=EXCLUDED.recorded_by,updated_at=now()`,[id,input.womanId,input.status,input.notes,user.sub]);await audit(pool,user.sub,'womens_ministry.participation.saved','women_activity',id,input);return{updated:true};}

  @Post('retreats')
  @AtomicWrite
  async createRetreat(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=retreatSchema.parse(body);const result=await pool.query<{id:string}>(`INSERT INTO womens_ministry.retreats(title,year,resort,starts_on,ends_on,capacity,cost_per_person,total_budget,deposit_deadline,currency,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[input.title,input.year,input.resort,input.startsOn,input.endsOn,input.capacity,input.costPerPerson,input.totalBudget,input.depositDeadline??null,input.currency.toUpperCase(),input.status,input.notes,user.sub]);await audit(pool,user.sub,'womens_ministry.retreat.created','women_retreat',result.rows[0]!.id,input);return{id:result.rows[0]!.id};}

  @Post('retreats/:id/registrations')
  @AtomicWrite
  async register(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=registrationSchema.parse(body);const result=await pool.query<{id:string}>(`INSERT INTO womens_ministry.retreat_registrations(retreat_id,woman_id,attendance_status,amount_due,room_assignment,transport_required,dietary_notes,notes,registered_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(retreat_id,woman_id) DO UPDATE SET attendance_status=EXCLUDED.attendance_status,amount_due=EXCLUDED.amount_due,room_assignment=EXCLUDED.room_assignment,transport_required=EXCLUDED.transport_required,dietary_notes=EXCLUDED.dietary_notes,notes=EXCLUDED.notes,updated_at=now() RETURNING id`,[id,input.womanId,input.attendanceStatus,input.amountDue,input.roomAssignment,input.transportRequired,input.dietaryNotes,input.notes,user.sub]);await audit(pool,user.sub,'womens_ministry.retreat_registration.saved','women_retreat_registration',result.rows[0]!.id,input);return{id:result.rows[0]!.id};}

  @Patch('retreat-registrations/:id')
  @AtomicWrite
  async updateRegistration(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=registrationUpdateSchema.parse(body);const result=await pool.query(`UPDATE womens_ministry.retreat_registrations SET attendance_status=COALESCE($2,attendance_status),amount_due=COALESCE($3,amount_due),room_assignment=COALESCE($4,room_assignment),transport_required=COALESCE($5,transport_required),dietary_notes=COALESCE($6,dietary_notes),notes=COALESCE($7,notes),updated_at=now() WHERE id=$1 RETURNING id,attendance_status "attendanceStatus",amount_due::float8 "amountDue"`,[id,input.attendanceStatus??null,input.amountDue??null,input.roomAssignment??null,input.transportRequired??null,input.dietaryNotes??null,input.notes??null]);if(!result.rows[0])throw Object.assign(new Error('La inscripción no existe.'),{status:404});await audit(pool,user.sub,'womens_ministry.retreat_registration.updated','women_retreat_registration',id,result.rows[0]);return result.rows[0];}

  @Post('retreat-registrations/:id/payments')
  @AtomicWrite
  async payment(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const { user, pool } = await this.authorized(request, 'canFinance');
    const registrationId = z.uuid().parse(id);
    const input = paymentSchema.parse(body);
    if (key && !/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw Object.assign(new Error('Idempotency-Key no es válida.'), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
    const requestHash = sha256(JSON.stringify({ registrationId, ...input }));
    return domainTransaction(pool, async (client) => {
      if (key) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`women.payment:${user.sub}:${key}`]);
        const replay = await client.query<{ id: string; request_hash: string }>('SELECT id,request_hash FROM womens_ministry.retreat_payments WHERE recorded_by=$1 AND idempotency_key=$2', [user.sub, key]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash) throw Object.assign(new Error('La misma Idempotency-Key fue usada con otro contenido.'), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
          return { id: replay.rows[0].id, replayed: true };
        }
      }
      const registration = await client.query('SELECT 1 FROM womens_ministry.retreat_registrations WHERE id=$1 FOR KEY SHARE', [registrationId]);
      if (!registration.rowCount) throw Object.assign(new Error('La inscripción no existe.'), { status: 404 });
      const result = await client.query<{ id: string }>(
        `INSERT INTO womens_ministry.retreat_payments(registration_id,amount,paid_on,method,reference,recorded_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [registrationId, input.amount, input.paidOn, input.method, input.reference, user.sub, key ?? null, key ? requestHash : null],
      );
      await audit(client, user.sub, 'womens_ministry.retreat_payment.created', 'women_retreat_payment', result.rows[0]!.id, { ...input, registrationId });
      return { id: result.rows[0]!.id };
    });
  }

  @Post('follow-ups')
  @AtomicWrite
  async createFollowUp(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool,ministryDepartment}=await this.authorized(request,'canManage');const input=followUpSchema.parse(body);if(input.assignedTo)await ensureAuthorizedAssignee(pool,input.assignedTo,ministryDepartment?.id??null);const result=await pool.query<{id:string}>(`INSERT INTO womens_ministry.follow_ups(woman_id,activity_id,reason,due_on,assigned_to,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[input.womanId,input.activityId??null,input.reason,input.dueOn,input.assignedTo??null,input.notes,user.sub]);if(input.assignedTo)await notify(pool,[input.assignedTo],'Seguimiento del Ministerio de la Mujer',`${input.reason} · ${input.dueOn}`);await audit(pool,user.sub,'womens_ministry.follow_up.created','women_follow_up',result.rows[0]!.id,input);return{id:result.rows[0]!.id};}

  @Patch('follow-ups/:id')
  @AtomicWrite
  async updateFollowUp(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool,ministryDepartment}=await this.authorized(request,'canManage');const input=followUpUpdateSchema.parse(body);if(input.assignedTo)await ensureAuthorizedAssignee(pool,input.assignedTo,ministryDepartment?.id??null);const result=await pool.query(`UPDATE womens_ministry.follow_ups SET status=COALESCE($2,status),due_on=COALESCE($3,due_on),assigned_to=CASE WHEN $4::boolean THEN $5::uuid ELSE assigned_to END,notes=COALESCE($6,notes),completed_at=CASE WHEN $2='COMPLETED' THEN now() WHEN $2 IS NOT NULL THEN NULL ELSE completed_at END,updated_at=now() WHERE id=$1 RETURNING id,status,due_on "dueOn"`,[id,input.status??null,input.dueOn??null,Object.hasOwn(input,'assignedTo'),input.assignedTo??null,input.notes??null]);if(!result.rows[0])throw Object.assign(new Error('El seguimiento no existe.'),{status:404});await audit(pool,user.sub,'womens_ministry.follow_up.updated','women_follow_up',id,result.rows[0]);return result.rows[0];}
}

@Module({controllers:[HealthController,WomensMinistryController],providers:[{provide:APP_GUARD,useClass:JwtAuthGuard}]})
class WomensMinistryModule {}

await bootstrapNest(WomensMinistryModule,Number(process.env.WOMENS_MINISTRY_SERVICE_PORT??4019),'womens-ministry-service');
