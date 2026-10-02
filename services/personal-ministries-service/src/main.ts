import 'reflect-metadata';
import type { Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { tenantPoolFromId } from '@gc/database';
import { activityReadPredicate, bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public } from '@gc/platform';
import { activeDomainClient, atomicDomainMutation, domainTransaction } from '../../shared/atomic-domain-mutation.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_personal_ministries_service';

const dateRange = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() });
const planSchema = z.object({
  title: z.string().trim().min(3).max(180), periodStart: z.iso.date(), periodEnd: z.iso.date(),
  vision: z.string().trim().max(5000).default(''), objectives: z.array(z.string().trim().min(2).max(500)).max(30).default([]),
  ownerId: z.uuid().nullable().optional(), status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('DRAFT')
}).refine((value) => value.periodEnd >= value.periodStart, { path: ['periodEnd'], message: 'El período final debe ser igual o posterior al inicial.' });
const initiativeSchema = z.object({
  strategicPlanId: z.uuid().nullable().optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).default(''),
  scope: z.enum(['GLOBAL', 'UNION', 'CONFERENCE', 'LOCAL']).default('LOCAL'),
  initiativeType: z.enum(['MISSIONARY', 'EVANGELISM', 'TRAINING', 'OUTREACH', 'CHURCH']).default('MISSIONARY'),
  startsOn: z.iso.date(), endsOn: z.iso.date(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  targetCount: z.number().int().min(0).max(1_000_000).default(0), assigneeId: z.uuid().nullable().optional(),
  responsibility: z.string().trim().max(500).default(''), workloadPercent: z.number().int().min(0).max(100).default(0),
  plannedBudget: z.number().min(0).max(999_999_999_999).default(0), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('DOP')
}).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'La fecha final debe ser igual o posterior a la inicial.' });
const initiativeUpdateSchema = z.object({
  status: z.enum(['PLANNED', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED']).optional(),
  progress: z.number().int().min(0).max(100).optional(), actualCount: z.number().int().min(0).max(1_000_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  plannedBudget: z.number().min(0).max(999_999_999_999).optional(), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional()
}).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.');
const budgetEntrySchema = z.object({
  entryType: z.enum(['COMMITMENT', 'EXPENSE', 'INCOME']), category: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500), amount: z.number().positive().max(999_999_999_999), occurredOn: z.iso.date(),
  vendor: z.string().trim().max(180).default(''), reference: z.string().trim().max(180).default(''), notes: z.string().trim().max(3000).default(''),
  status: z.enum(['PLANNED', 'APPROVED', 'PAID']).default('PLANNED')
});
const budgetEntryUpdateSchema = z.object({ status: z.enum(['PLANNED', 'APPROVED', 'PAID', 'VOID']) });
const assignmentSchema = z.object({
  userId: z.uuid(), responsibility: z.string().trim().min(2).max(500), workloadPercent: z.number().int().min(0).max(100),
  status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).default('ASSIGNED')
});
const contactSchema = z.object({
  name: z.string().trim().min(2).max(180), phone: z.string().trim().max(40).default(''), email: z.union([z.literal(''), z.email()]).default(''),
  stage: z.enum(['INTERESTED', 'BIBLE_STUDY', 'BAPTISM_CANDIDATE', 'BAPTIZED', 'INACTIVE']).default('INTERESTED'),
  source: z.string().trim().max(180).default(''), assignedTo: z.uuid().nullable().optional(), nextFollowUpAt: z.iso.datetime().nullable().optional(),
  notes: z.string().trim().max(5000).default(''), consent: z.boolean().default(false)
});
const contactUpdateSchema = z.object({
  stage: z.enum(['INTERESTED', 'BIBLE_STUDY', 'BAPTISM_CANDIDATE', 'BAPTIZED', 'INACTIVE']).optional(),
  assignedTo: z.uuid().nullable().optional(), nextFollowUpAt: z.iso.datetime().nullable().optional(), notes: z.string().trim().max(5000).optional(), consent: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.');
const studySchema = z.object({
  contactId: z.uuid(), instructorId: z.uuid(), studiedAt: z.iso.datetime(), lesson: z.string().trim().min(2).max(300),
  outcome: z.string().trim().max(3000).default(''), nextStudyAt: z.iso.datetime().nullable().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED']).default('SCHEDULED'), notes: z.string().trim().max(5000).default('')
});
const studyUpdateSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED']).optional(), outcome: z.string().trim().max(3000).optional(),
  nextStudyAt: z.iso.datetime().nullable().optional(), notes: z.string().trim().max(5000).optional()
}).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.');
const groupSchema = z.object({
  name: z.string().trim().min(3).max(180), leaderId: z.uuid(), assistantId: z.uuid().nullable().optional(), meetingDay: z.number().int().min(0).max(6),
  meetingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), location: z.string().trim().max(300).default(''),
  status: z.enum(['PLANNING', 'ACTIVE', 'PAUSED', 'CLOSED']).default('ACTIVE'), goal: z.number().int().min(0).max(100_000).default(0),
  currentMembers: z.number().int().min(0).max(100_000).default(0)
});
const groupUpdateSchema = z.object({ status: z.enum(['PLANNING', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(), currentMembers: z.number().int().min(0).max(100_000).optional() }).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.');
const minuteSchema = z.object({
  title: z.string().trim().min(3).max(180), scheduledAt: z.iso.datetime(), endsAt: z.iso.datetime(), presenterId: z.uuid(),
  theme: z.string().trim().max(500).default(''), material: z.string().trim().max(1000).default(''),
  status: z.enum(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).default('SCHEDULED')
}).refine((value) => new Date(value.endsAt) > new Date(value.scheduledAt), { path: ['endsAt'], message: 'La finalización debe ser posterior al inicio.' });
const minuteUpdateSchema = z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED']) });
const campaignSchema = z.object({
  initiativeId: z.uuid().nullable().optional(), title: z.string().trim().min(3).max(180), theme: z.string().trim().max(500).default(''),
  startsOn: z.iso.date(), endsOn: z.iso.date(), venue: z.string().trim().max(300).default(''), evangelist: z.string().trim().max(180).default(''),
  goal: z.number().int().min(0).max(1_000_000).default(0), status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('PLANNING')
}).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'La fecha final debe ser igual o posterior a la inicial.' });
const campaignUpdateSchema = z.object({
  status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(), decisionCount: z.number().int().min(0).max(1_000_000).optional(),
  baptismCount: z.number().int().min(0).max(1_000_000).optional()
}).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.');

type Access = { canRead: boolean; canManage: boolean; canAssign: boolean; canManageRecords: boolean; departmentId: string | null; membershipRole: string | null };

async function poolFor(user: AuthPrincipal): Promise<Pool | PoolClient> {
  if (user.scope !== 'tenant' || !user.tenantId) throw Object.assign(new Error('Se requiere una iglesia.'), { status: 403, code: 'TENANT_REQUIRED' });
  const active = activeDomainClient(user.tenantId);
  if (active) return active;
  return (await tenantPoolFromId(user.tenantId)).pool;
}
const AtomicWrite = atomicDomainMutation(async (request: Request & { user?: AuthPrincipal }) => {
  const user = currentUser(request);
  return { pool: await poolFor(user), tenantId: user.tenantId ?? '' };
});

async function accessFor(pool: Pool | PoolClient, user: AuthPrincipal): Promise<Access> {
  const membership = await pool.query<{ department_id: string; role: string }>(
    `SELECT m.department_id,m.role FROM identity.department_memberships m
       JOIN calendar.departments d ON d.id=m.department_id
      WHERE m.user_id=$1 AND d.active
        AND lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerios personales|personal ministries)'
      ORDER BY CASE m.role WHEN 'DIRECTOR' THEN 0 WHEN 'ASSISTANT_DIRECTOR' THEN 1 WHEN 'DEPARTMENT_SECRETARY' THEN 2 ELSE 3 END LIMIT 1`, [user.sub]
  );
  const item = membership.rows[0];
  const administrator = user.roles.includes('TENANT_ADMIN');
  const oversight = user.roles.includes('PASTOR') || user.roles.includes('BOARD_SECRETARY');
  const managerRoles = ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER'];
  return {
    canRead: administrator || oversight || Boolean(item),
    canManage: administrator || Boolean(item && managerRoles.includes(item.role)),
    canAssign: administrator || Boolean(item && ['DIRECTOR', 'ASSISTANT_DIRECTOR'].includes(item.role)),
    canManageRecords: administrator || Boolean(item && item.role !== 'VIEWER'),
    departmentId: item?.department_id ?? null,
    membershipRole: item?.role ?? null
  };
}

function requireRight(access: Access, right: keyof Pick<Access, 'canRead' | 'canManage' | 'canAssign' | 'canManageRecords'>): void {
  if (!access[right]) throw Object.assign(new Error('No tiene autorización para esta función de Ministerios Personales.'), { status: 403, code: 'PERSONAL_MINISTRIES_ACCESS_DENIED' });
}

async function ensureTeamMember(pool: Pool | PoolClient, userId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM identity.users u JOIN identity.department_memberships m ON m.user_id=u.id
       JOIN calendar.departments d ON d.id=m.department_id
      WHERE u.id=$1 AND u.active AND d.active AND lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerios personales|personal ministries)'`, [userId]
  );
  if (!result.rows[0]) throw Object.assign(new Error('La persona seleccionada no pertenece al equipo de Ministerios Personales.'), { status: 400, code: 'TEAM_MEMBER_REQUIRED' });
}

async function audit(pool: Pool | PoolClient, actorId: string, action: string, resourceType: string, resourceId: string, after: unknown): Promise<void> {
  await pool.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data) VALUES($1,$2,$3,$4,$5::jsonb)`, [actorId, action, resourceType, resourceId, JSON.stringify(after)]);
}

async function notify(pool: Pool | PoolClient, userIds: string[], title: string, body: string): Promise<void> {
  if (!userIds.length) return;
  await pool.query(
    `INSERT INTO notifications.notifications(event_id,event_type,user_id,title,body,link)
     SELECT gen_random_uuid(),'personal_ministries.assignment',id,$2,$3,'/personal-ministries' FROM unnest($1::uuid[]) id`, [userIds, title, body]
  );
}

const plansSql = `SELECT p.id,p.title,p.period_start "periodStart",p.period_end "periodEnd",p.vision,p.objectives,p.status,p.progress,
  p.owner_id "ownerId",o.name "ownerName",p.created_at "createdAt",p.updated_at "updatedAt" FROM personal_ministries.strategic_plans p
  LEFT JOIN identity.users o ON o.id=p.owner_id ORDER BY p.period_start DESC,p.created_at DESC`;
const initiativesSql = `SELECT i.id,i.strategic_plan_id "strategicPlanId",p.title "strategicPlanTitle",i.title,i.description,i.scope,i.initiative_type "initiativeType",
  i.starts_on "startsOn",i.ends_on "endsOn",i.status,i.priority,i.progress,i.target_count "targetCount",i.actual_count "actualCount",
  i.planned_budget::float "plannedBudget",i.currency,
  COALESCE(max(b.spent),0)::float "spentBudget",COALESCE(max(b.committed),0)::float "committedBudget",COALESCE(max(b.income),0)::float "incomeBudget",
  (COALESCE(i.planned_budget,0)+COALESCE(max(b.income),0)-COALESCE(max(b.spent),0)-COALESCE(max(b.committed),0))::float "availableBudget",
  (COALESCE(max(b.spent),0)+COALESCE(max(b.committed),0))::float "forecastBudget",
  i.created_at "createdAt",COALESCE(jsonb_agg(jsonb_build_object('userId',a.user_id,'name',u.name,'responsibility',a.responsibility,'workloadPercent',a.workload_percent,'status',a.status)
  ORDER BY u.name) FILTER(WHERE a.user_id IS NOT NULL),'[]'::jsonb) assignments
  FROM personal_ministries.initiatives i LEFT JOIN personal_ministries.strategic_plans p ON p.id=i.strategic_plan_id
  LEFT JOIN personal_ministries.initiative_assignments a ON a.initiative_id=i.id LEFT JOIN identity.users u ON u.id=a.user_id
  LEFT JOIN LATERAL (SELECT
    COALESCE(sum(amount) FILTER(WHERE entry_type='EXPENSE' AND status='PAID'),0) spent,
    COALESCE(sum(amount) FILTER(WHERE (entry_type='COMMITMENT' AND status IN ('PLANNED','APPROVED')) OR (entry_type='EXPENSE' AND status='APPROVED')),0) committed,
    COALESCE(sum(amount) FILTER(WHERE entry_type='INCOME' AND status='PAID'),0) income
    FROM personal_ministries.budget_entries WHERE initiative_id=i.id AND status<>'VOID') b ON true
  GROUP BY i.id,p.title ORDER BY i.starts_on DESC,i.created_at DESC`;
const budgetEntriesSql = `SELECT b.id,b.initiative_id "initiativeId",i.title "initiativeTitle",b.entry_type "entryType",b.category,b.description,b.amount::float,
  b.occurred_on "occurredOn",b.vendor,b.reference,b.notes,b.status,b.created_at "createdAt",creator.name "createdByName",approver.name "approvedByName"
  FROM personal_ministries.budget_entries b JOIN personal_ministries.initiatives i ON i.id=b.initiative_id
  JOIN identity.users creator ON creator.id=b.created_by LEFT JOIN identity.users approver ON approver.id=b.approved_by
  ORDER BY b.occurred_on DESC,b.created_at DESC`;
const contactsSql = `SELECT c.id,c.name,c.phone,c.email,c.stage,c.source,c.assigned_to "assignedTo",u.name "assignedToName",c.next_follow_up_at "nextFollowUpAt",
  c.notes,c.consent,c.created_at "createdAt",count(s.id)::int "studyCount",max(s.studied_at) "lastStudyAt"
  FROM personal_ministries.contacts c LEFT JOIN identity.users u ON u.id=c.assigned_to LEFT JOIN personal_ministries.bible_studies s ON s.contact_id=c.id
  GROUP BY c.id,u.name ORDER BY CASE c.stage WHEN 'BAPTISM_CANDIDATE' THEN 0 WHEN 'BIBLE_STUDY' THEN 1 WHEN 'INTERESTED' THEN 2 ELSE 3 END,c.next_follow_up_at NULLS LAST,c.name`;
const studiesSql = `SELECT s.id,s.contact_id "contactId",c.name "contactName",s.instructor_id "instructorId",u.name "instructorName",s.studied_at "studiedAt",
  s.lesson,s.outcome,s.next_study_at "nextStudyAt",s.status,s.notes,s.created_at "createdAt" FROM personal_ministries.bible_studies s
  JOIN personal_ministries.contacts c ON c.id=s.contact_id JOIN identity.users u ON u.id=s.instructor_id ORDER BY s.studied_at DESC`;
const groupsSql = `SELECT g.id,g.name,g.leader_id "leaderId",l.name "leaderName",g.assistant_id "assistantId",a.name "assistantName",g.meeting_day "meetingDay",
  to_char(g.meeting_time,'HH24:MI') "meetingTime",g.location,g.status,g.goal,g.current_members "currentMembers",g.created_at "createdAt"
  FROM personal_ministries.small_groups g JOIN identity.users l ON l.id=g.leader_id LEFT JOIN identity.users a ON a.id=g.assistant_id ORDER BY g.status,g.name`;
const minutesSql = `SELECT m.id,m.title,m.scheduled_at "scheduledAt",m.ends_at "endsAt",m.presenter_id "presenterId",u.name "presenterName",m.theme,m.material,m.status,m.created_at "createdAt"
  FROM personal_ministries.missionary_minutes m JOIN identity.users u ON u.id=m.presenter_id ORDER BY m.scheduled_at DESC`;
const campaignsSql = `SELECT c.id,c.initiative_id "initiativeId",i.title "initiativeTitle",c.title,c.theme,c.starts_on "startsOn",c.ends_on "endsOn",c.venue,c.evangelist,c.goal,c.status,
  c.decision_count "decisionCount",c.baptism_count "baptismCount",c.created_at "createdAt" FROM personal_ministries.campaigns c
  LEFT JOIN personal_ministries.initiatives i ON i.id=c.initiative_id ORDER BY c.starts_on DESC,c.created_at DESC`;

@Controller()
class HealthController { @Public() @Get('health/live') health() { return HEALTH_RESPONSE; } }

@Controller('personal-ministries')
class PersonalMinistriesController {
  private async authorized(request: Request & { user?: AuthPrincipal }, right: keyof Pick<Access, 'canRead' | 'canManage' | 'canAssign' | 'canManageRecords'> = 'canRead') {
    const user = currentUser(request); const pool = await poolFor(user); const access = await accessFor(pool, user); requireRight(access, right); return { user, pool, access };
  }

  @Get('context')
  async context(@Req() request: Request & { user?: AuthPrincipal }) {
    const { user, pool, access } = await this.authorized(request);
    const [team, plans, initiatives, contacts, studies, groups, minutes, campaigns, localActivities, budgetEntries] = await Promise.all([
      pool.query(`SELECT u.id,u.name,u.email,u.phone,m.role,COALESCE(a.titles,'[]'::jsonb) appointments FROM identity.users u
        JOIN identity.department_memberships m ON m.user_id=u.id JOIN calendar.departments d ON d.id=m.department_id
        LEFT JOIN LATERAL (SELECT jsonb_agg(da.title ORDER BY da.title) titles FROM identity.department_appointments da WHERE da.user_id=u.id AND da.department_id=d.id AND da.active) a ON true
        WHERE u.active AND d.active AND lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerios personales|personal ministries)'
        ORDER BY CASE m.role WHEN 'DIRECTOR' THEN 0 WHEN 'ASSISTANT_DIRECTOR' THEN 1 WHEN 'DEPARTMENT_SECRETARY' THEN 2 ELSE 3 END,u.name`),
      pool.query(plansSql), pool.query(initiativesSql), pool.query(contactsSql), pool.query(studiesSql), pool.query(groupsSql), pool.query(minutesSql), pool.query(campaignsSql),
      pool.query(`SELECT a.id,a.code,a.title,a.status,d.name department,min(s.starts_at) "startsAt",max(s.ends_at) "endsAt"
        FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id AND (o.is_selected OR o.status IN ('PROVISIONAL_HOLD','CONFIRMED'))
        LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id WHERE a.status NOT IN ('CANCELLED','REJECTED') AND s.ends_at >= now() AND ${activityReadPredicate(user)} GROUP BY a.id,d.name ORDER BY min(s.starts_at) LIMIT 12`),
      pool.query(budgetEntriesSql)
    ]);
    const stageCounts = Object.fromEntries(['INTERESTED','BIBLE_STUDY','BAPTISM_CANDIDATE','BAPTIZED','INACTIVE'].map((stage) => [stage, contacts.rows.filter((item) => item.stage === stage).length]));
    const now = Date.now();
    const budgetTotals = initiatives.rows.filter((item) => item.currency === 'DOP').reduce((totals,item) => ({
      planned: totals.planned + Number(item.plannedBudget), spent: totals.spent + Number(item.spentBudget), committed: totals.committed + Number(item.committedBudget),
      income: totals.income + Number(item.incomeBudget), forecast: totals.forecast + Number(item.forecastBudget)
    }), { planned: 0, spent: 0, committed: 0, income: 0, forecast: 0 });
    return { access, team: team.rows, plans: plans.rows, initiatives: initiatives.rows, budgetEntries: budgetEntries.rows, contacts: contacts.rows, studies: studies.rows, groups: groups.rows, missionaryMinutes: minutes.rows, campaigns: campaigns.rows, localChurchActivities: localActivities.rows,
      metrics: { activeInitiatives: initiatives.rows.filter((item) => ['PLANNED','ACTIVE','AT_RISK'].includes(item.status)).length, atRisk: initiatives.rows.filter((item) => item.status === 'AT_RISK' || (new Date(item.endsOn).getTime() < now && item.status !== 'COMPLETED')).length,
        openContacts: contacts.rows.filter((item) => !['BAPTIZED','INACTIVE'].includes(item.stage)).length, scheduledStudies: studies.rows.filter((item) => item.status === 'SCHEDULED').length,
        activeGroups: groups.rows.filter((item) => item.status === 'ACTIVE').length, baptisms: contacts.rows.filter((item) => item.stage === 'BAPTIZED').length, stageCounts,
        budget: { ...budgetTotals, currency: 'DOP', available: budgetTotals.planned + budgetTotals.income - budgetTotals.spent - budgetTotals.committed,
          utilization: budgetTotals.planned > 0 ? Math.round((budgetTotals.forecast / budgetTotals.planned) * 1000) / 10 : 0,
          overBudget: initiatives.rows.filter((item) => Number(item.forecastBudget) > Number(item.plannedBudget)).length }
      }
    };
  }

  @Get('calendar')
  async calendar(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const { pool } = await this.authorized(request); const range = dateRange.parse(query);
    const from = range.from ?? new Date(Date.now() - 31 * 86_400_000).toISOString(); const to = range.to ?? new Date(Date.now() + 366 * 86_400_000).toISOString();
    const [minutes, initiatives, campaigns] = await Promise.all([
      pool.query(`${minutesSql} LIMIT 500`), pool.query(initiativesSql), pool.query(campaignsSql)
    ]);
    const between = (start: unknown, end: unknown) => new Date(String(end)).toISOString() >= from && new Date(String(start)).toISOString() <= to;
    return { items: [
      ...minutes.rows.filter((item) => item.status !== 'CANCELLED' && between(item.scheduledAt,item.endsAt)).map((item) => ({ id: item.id,title: item.title,status: 'MISSIONARY_MINUTE',department: 'Ministerios Personales',department_color:'#2563eb',venue:null,kind:'MISSIONARY_MINUTE',informational:true,sessions:[{id:`pm-minute-${item.id}`,startsAt:item.scheduledAt,endsAt:item.endsAt}]})),
      ...initiatives.rows.filter((item) => item.status !== 'CANCELLED' && between(item.startsOn,item.endsOn)).map((item) => ({ id:item.id,title:item.title,status:item.status,department:`Ministerios Personales · ${item.scope}`,department_color:'#0f766e',venue:null,kind:'MISSIONARY_INITIATIVE',informational:true,sessions:[{id:`pm-initiative-${item.id}`,startsAt:`${item.startsOn}T00:00:00.000Z`,endsAt:`${item.endsOn}T23:59:59.000Z`}]})),
      ...campaigns.rows.filter((item) => item.status !== 'CANCELLED' && between(item.startsOn,item.endsOn)).map((item) => ({ id:item.id,title:item.title,status:item.status,department:'Ministerios Personales · Campaña',department_color:'#c0841a',venue:item.venue || null,kind:'EVANGELISTIC_CAMPAIGN',informational:true,sessions:[{id:`pm-campaign-${item.id}`,startsAt:`${item.startsOn}T00:00:00.000Z`,endsAt:`${item.endsOn}T23:59:59.000Z`}]}))
    ]};
  }

  @Post('strategic-plans')
  @AtomicWrite
  async createPlan(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const { user, pool } = await this.authorized(request, 'canManage'); const input = planSchema.parse(body);
    if (input.ownerId) await ensureTeamMember(pool, input.ownerId);
    const result = await pool.query(`INSERT INTO personal_ministries.strategic_plans(title,period_start,period_end,vision,objectives,status,owner_id,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id,title,status`, [input.title,input.periodStart,input.periodEnd,input.vision,JSON.stringify(input.objectives),input.status,input.ownerId ?? null,user.sub]);
    const item=result.rows[0]!; await audit(pool,user.sub,'personal_ministries.plan.created','strategic_plan',item.id,item); return item;
  }

  @Post('initiatives')
  @AtomicWrite
  async createInitiative(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const { user,pool,access }=await this.authorized(request,'canManage'); const input=initiativeSchema.parse(body); if(input.assigneeId){requireRight(access,'canAssign');await ensureTeamMember(pool,input.assigneeId);}
    return domainTransaction(pool,async(client)=>{const result=await client.query(`INSERT INTO personal_ministries.initiatives(strategic_plan_id,title,description,scope,initiative_type,starts_on,ends_on,priority,target_count,planned_budget,currency,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,title,status,planned_budget::float "plannedBudget",currency`,[input.strategicPlanId??null,input.title,input.description,input.scope,input.initiativeType,input.startsOn,input.endsOn,input.priority,input.targetCount,input.plannedBudget,input.currency,user.sub]);const item=result.rows[0]!;if(input.assigneeId){await client.query(`INSERT INTO personal_ministries.initiative_assignments(initiative_id,user_id,responsibility,workload_percent,assigned_by) VALUES($1,$2,$3,$4,$5)`,[item.id,input.assigneeId,input.responsibility,input.workloadPercent,user.sub]);await notify(client,[input.assigneeId],'Nueva responsabilidad misionera',`${input.title}: ${input.responsibility || 'consulta tu asignación'}.`);}await audit(client,user.sub,'personal_ministries.initiative.created','initiative',item.id,item);return item;});
  }

  @Patch('initiatives/:id')
  @AtomicWrite
  async updateInitiative(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id:string,@Body() body:unknown){
    const{user,pool}=await this.authorized(request,'canManage');const input=initiativeUpdateSchema.parse(body);
    if(input.currency){const currencyState=await pool.query<{currency:string;entries:number}>(`SELECT i.currency,count(b.id)::int entries FROM personal_ministries.initiatives i LEFT JOIN personal_ministries.budget_entries b ON b.initiative_id=i.id WHERE i.id=$1 GROUP BY i.id`,[id]);const state=currencyState.rows[0];if(!state)throw Object.assign(new Error('La iniciativa no existe.'),{status:404});if(state.entries>0&&state.currency!==input.currency)throw Object.assign(new Error('La moneda queda bloqueada después del primer movimiento presupuestario.'),{status:409,code:'BUDGET_CURRENCY_LOCKED'});}
    const result=await pool.query(`UPDATE personal_ministries.initiatives SET status=COALESCE($2,status),progress=COALESCE($3,progress),actual_count=COALESCE($4,actual_count),priority=COALESCE($5,priority),planned_budget=COALESCE($6,planned_budget),currency=COALESCE($7,currency),updated_at=now() WHERE id=$1 RETURNING id,title,status,progress,actual_count "actualCount",planned_budget::float "plannedBudget",currency`,[id,input.status??null,input.progress??null,input.actualCount??null,input.priority??null,input.plannedBudget??null,input.currency??null]);const item=result.rows[0];if(!item)throw Object.assign(new Error('La iniciativa no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.initiative.updated','initiative',id,item);return item;
  }

  @Post('initiatives/:id/budget-entries')
  @AtomicWrite
  async createBudgetEntry(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=budgetEntrySchema.parse(body);const exists=await pool.query(`SELECT id FROM personal_ministries.initiatives WHERE id=$1`,[id]);if(!exists.rows[0])throw Object.assign(new Error('La iniciativa no existe.'),{status:404});const approved=input.status==='APPROVED'||input.status==='PAID';const result=await pool.query(`INSERT INTO personal_ministries.budget_entries(initiative_id,entry_type,category,description,amount,occurred_on,vendor,reference,notes,status,created_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $12::uuid IS NULL THEN NULL ELSE now() END) RETURNING id,initiative_id "initiativeId",entry_type "entryType",category,description,amount::float,occurred_on "occurredOn",status`,[id,input.entryType,input.category,input.description,input.amount,input.occurredOn,input.vendor,input.reference,input.notes,input.status,user.sub,approved?user.sub:null]);const item=result.rows[0]!;await audit(pool,user.sub,'personal_ministries.budget_entry.created','initiative_budget_entry',item.id,item);return item;}

  @Patch('budget-entries/:id')
  @AtomicWrite
  async updateBudgetEntry(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=budgetEntryUpdateSchema.parse(body);const approved=input.status==='APPROVED'||input.status==='PAID';const result=await pool.query(`UPDATE personal_ministries.budget_entries SET status=$2,approved_by=CASE WHEN $3 THEN $4::uuid ELSE approved_by END,approved_at=CASE WHEN $3 THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1 RETURNING id,initiative_id "initiativeId",entry_type "entryType",amount::float,status`,[id,input.status,approved,user.sub]);const item=result.rows[0];if(!item)throw Object.assign(new Error('La partida presupuestaria no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.budget_entry.updated','initiative_budget_entry',id,item);return item;}

  @Post('initiatives/:id/assignments')
  @AtomicWrite
  async assign(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canAssign');const input=assignmentSchema.parse(body);await ensureTeamMember(pool,input.userId);const result=await pool.query(`INSERT INTO personal_ministries.initiative_assignments(initiative_id,user_id,responsibility,workload_percent,status,assigned_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(initiative_id,user_id) DO UPDATE SET responsibility=EXCLUDED.responsibility,workload_percent=EXCLUDED.workload_percent,status=EXCLUDED.status,assigned_by=EXCLUDED.assigned_by,updated_at=now() RETURNING initiative_id "initiativeId",user_id "userId",responsibility,workload_percent "workloadPercent",status`,[id,input.userId,input.responsibility,input.workloadPercent,input.status,user.sub]);const item=result.rows[0]!;await notify(pool,[input.userId],'Asignación misionera actualizada',input.responsibility);await audit(pool,user.sub,'personal_ministries.assignment.saved','initiative_assignment',`${id}:${input.userId}`,item);return item;}

  @Post('contacts')
  @AtomicWrite
  async createContact(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManageRecords');const input=contactSchema.parse(body);if(input.assignedTo)await ensureTeamMember(pool,input.assignedTo);const result=await pool.query(`INSERT INTO personal_ministries.contacts(name,phone,email,stage,source,assigned_to,next_follow_up_at,notes,consent,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,stage`,[input.name,input.phone,input.email,input.stage,input.source,input.assignedTo??null,input.nextFollowUpAt??null,input.notes,input.consent,user.sub]);const item=result.rows[0]!;await audit(pool,user.sub,'personal_ministries.contact.created','mission_contact',item.id,{...item,hasPhone:Boolean(input.phone),hasEmail:Boolean(input.email)});return item;}

  @Patch('contacts/:id')
  @AtomicWrite
  async updateContact(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManageRecords');const input=contactUpdateSchema.parse(body);if(input.assignedTo)await ensureTeamMember(pool,input.assignedTo);const result=await pool.query(`UPDATE personal_ministries.contacts SET stage=COALESCE($2,stage),assigned_to=CASE WHEN $3::boolean THEN $4::uuid ELSE assigned_to END,next_follow_up_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE next_follow_up_at END,notes=COALESCE($7,notes),consent=COALESCE($8,consent),updated_at=now() WHERE id=$1 RETURNING id,name,stage,assigned_to "assignedTo",next_follow_up_at "nextFollowUpAt"`,[id,input.stage??null,Object.hasOwn(input,'assignedTo'),input.assignedTo??null,Object.hasOwn(input,'nextFollowUpAt'),input.nextFollowUpAt??null,input.notes??null,input.consent??null]);const item=result.rows[0];if(!item)throw Object.assign(new Error('El interesado no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.contact.updated','mission_contact',id,item);return item;}

  @Post('bible-studies')
  @AtomicWrite
  async createStudy(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManageRecords');const input=studySchema.parse(body);await ensureTeamMember(pool,input.instructorId);const result=await pool.query(`INSERT INTO personal_ministries.bible_studies(contact_id,instructor_id,studied_at,lesson,outcome,next_study_at,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,contact_id "contactId",status,studied_at "studiedAt"`,[input.contactId,input.instructorId,input.studiedAt,input.lesson,input.outcome,input.nextStudyAt??null,input.status,input.notes,user.sub]);const item=result.rows[0]!;await pool.query(`UPDATE personal_ministries.contacts SET stage=CASE WHEN stage='INTERESTED' THEN 'BIBLE_STUDY' ELSE stage END,next_follow_up_at=COALESCE($2,next_follow_up_at),updated_at=now() WHERE id=$1`,[input.contactId,input.nextStudyAt??null]);await audit(pool,user.sub,'personal_ministries.study.created','bible_study',item.id,item);return item;}

  @Patch('bible-studies/:id')
  @AtomicWrite
  async updateStudy(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManageRecords');const input=studyUpdateSchema.parse(body);const result=await pool.query(`UPDATE personal_ministries.bible_studies SET status=COALESCE($2,status),outcome=COALESCE($3,outcome),next_study_at=CASE WHEN $4::boolean THEN $5::timestamptz ELSE next_study_at END,notes=COALESCE($6,notes),updated_at=now() WHERE id=$1 RETURNING id,contact_id "contactId",status,next_study_at "nextStudyAt"`,[id,input.status??null,input.outcome??null,Object.hasOwn(input,'nextStudyAt'),input.nextStudyAt??null,input.notes??null]);const item=result.rows[0];if(!item)throw Object.assign(new Error('El estudio no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.study.updated','bible_study',id,item);return item;}

  @Post('small-groups')
  @AtomicWrite
  async createGroup(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=groupSchema.parse(body);await ensureTeamMember(pool,input.leaderId);if(input.assistantId)await ensureTeamMember(pool,input.assistantId);const result=await pool.query(`INSERT INTO personal_ministries.small_groups(name,leader_id,assistant_id,meeting_day,meeting_time,location,status,goal,current_members,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,status`,[input.name,input.leaderId,input.assistantId??null,input.meetingDay,input.meetingTime,input.location,input.status,input.goal,input.currentMembers,user.sub]);const item=result.rows[0]!;await audit(pool,user.sub,'personal_ministries.group.created','small_group',item.id,item);return item;}

  @Patch('small-groups/:id')
  @AtomicWrite
  async updateGroup(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=groupUpdateSchema.parse(body);const result=await pool.query(`UPDATE personal_ministries.small_groups SET status=COALESCE($2,status),current_members=COALESCE($3,current_members),updated_at=now() WHERE id=$1 RETURNING id,name,status,current_members "currentMembers"`,[id,input.status??null,input.currentMembers??null]);const item=result.rows[0];if(!item)throw Object.assign(new Error('El grupo no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.group.updated','small_group',id,item);return item;}

  @Post('missionary-minutes')
  @AtomicWrite
  async createMinute(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=minuteSchema.parse(body);await ensureTeamMember(pool,input.presenterId);const result=await pool.query(`INSERT INTO personal_ministries.missionary_minutes(title,scheduled_at,ends_at,presenter_id,theme,material,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,title,status,scheduled_at "scheduledAt"`,[input.title,input.scheduledAt,input.endsAt,input.presenterId,input.theme,input.material,input.status,user.sub]);const item=result.rows[0]!;await notify(pool,[input.presenterId],'Minuto misionero asignado',`${input.title} · ${new Date(input.scheduledAt).toLocaleString('es')}`);await audit(pool,user.sub,'personal_ministries.minute.created','missionary_minute',item.id,item);return item;}

  @Patch('missionary-minutes/:id')
  @AtomicWrite
  async updateMinute(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=minuteUpdateSchema.parse(body);const result=await pool.query(`UPDATE personal_ministries.missionary_minutes SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,title,status`,[id,input.status]);const item=result.rows[0];if(!item)throw Object.assign(new Error('El minuto misionero no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.minute.updated','missionary_minute',id,item);return item;}

  @Post('campaigns')
  @AtomicWrite
  async createCampaign(@Req() request: Request & { user?: AuthPrincipal },@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=campaignSchema.parse(body);const result=await pool.query(`INSERT INTO personal_ministries.campaigns(initiative_id,title,theme,starts_on,ends_on,venue,evangelist,goal,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,title,status`,[input.initiativeId??null,input.title,input.theme,input.startsOn,input.endsOn,input.venue,input.evangelist,input.goal,input.status,user.sub]);const item=result.rows[0]!;await audit(pool,user.sub,'personal_ministries.campaign.created','evangelistic_campaign',item.id,item);return item;}

  @Patch('campaigns/:id')
  @AtomicWrite
  async updateCampaign(@Req() request: Request & { user?: AuthPrincipal },@Param('id') id:string,@Body() body:unknown){const{user,pool}=await this.authorized(request,'canManage');const input=campaignUpdateSchema.parse(body);const result=await pool.query(`UPDATE personal_ministries.campaigns SET status=COALESCE($2,status),decision_count=COALESCE($3,decision_count),baptism_count=COALESCE($4,baptism_count),updated_at=now() WHERE id=$1 RETURNING id,title,status,decision_count "decisionCount",baptism_count "baptismCount"`,[id,input.status??null,input.decisionCount??null,input.baptismCount??null]);const item=result.rows[0];if(!item)throw Object.assign(new Error('La campaña no existe.'),{status:404});await audit(pool,user.sub,'personal_ministries.campaign.updated','evangelistic_campaign',id,item);return item;}
}

@Module({controllers:[HealthController,PersonalMinistriesController],providers:[{provide:APP_GUARD,useClass:JwtAuthGuard}]})
class PersonalMinistriesModule {}

await bootstrapNest(PersonalMinistriesModule,Number(process.env.PERSONAL_MINISTRIES_SERVICE_PORT??4018),'personal-ministries-service');
