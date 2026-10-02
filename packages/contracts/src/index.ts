import { z } from 'zod';

export const roles = [
  'GLOBAL_ADMIN',
  'TENANT_ADMIN',
  'PASTOR',
  'BOARD_SECRETARY',
  'FIRST_ELDER',
  'ELDER',
  'REVIEWER',
  'DEPARTMENT_LEADER',
  'DEPARTMENT_PLANNER',
  'NOMINATIONS_USER',
  'NOMINATIONS_COMMISSION_MEMBER',
  'NOMINATIONS_BALLOT_CUSTODIAN',
  'VIEWER',
  'AUDITOR'
] as const;

export type Role = (typeof roles)[number];

export type AuthPrincipal = {
  sub: string;
  email: string;
  name: string;
  roles: Role[];
  permissions: string[];
  tenantId?: string;
  tenantSlug?: string;
  scope: 'global' | 'tenant';
  sessionId: string;
};

export const loginSchema = z.object({
  tenant: z.string().trim().min(2).max(80),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

export const globalLoginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

export const sessionSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  setupMinutes: z.number().int().min(0).max(1440).default(0),
  teardownMinutes: z.number().int().min(0).max(1440).default(0)
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  message: 'La hora de finalización debe ser posterior al inicio.',
  path: ['endsAt']
});

export const scheduleOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  preference: z.number().int().min(1).max(10),
  sessions: z.array(sessionSchema).min(1).max(20)
});

export const createActivitySchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(5000),
  objective: z.string().trim().max(2000).default(''),
  departmentId: z.uuid(),
  venueId: z.uuid().nullable().optional(),
  responsibleName: z.string().trim().min(2).max(160),
  audience: z.string().trim().max(160).default('Congregación'),
  estimatedAttendance: z.number().int().min(0).max(100000).default(0),
  category: z.string().trim().min(1).max(100).default('General'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  collaboratorDepartmentIds: z.array(z.uuid()).max(20).default([]),
  secondaryResponsibles: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    contact: z.string().trim().max(160).optional()
  })).max(20).default([]),
  contactInfo: z.string().trim().max(300).optional(),
  modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).default('PRESENTIAL'),
  visibility: z.enum(['INTERNAL', 'LEADERSHIP', 'PUBLIC']).default('INTERNAL'),
  resourceIds: z.array(z.uuid()).max(30).default([]),
  priority: z.number().int().min(0).max(10).default(0),
  internalNotes: z.string().trim().max(5000).default(''),
  customData: z.record(
    z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()])
  ).superRefine((value, context) => {
    if (Object.keys(value).length > 40) context.addIssue({ code: 'custom', message: 'No puede enviar más de 40 campos personalizados.' });
  }).default({}),
  timezone: z.string().trim().min(3).max(80).default('America/La_Paz'),
  recurrence: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    interval: z.number().int().min(1).max(52).default(1),
    count: z.number().int().min(1).max(100).optional(),
    until: z.iso.datetime().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([])
  }).refine((value) => value.count !== undefined || value.until !== undefined, 'La recurrencia requiere cantidad o fecha final.').optional(),
  options: z.array(scheduleOptionSchema).min(1).max(5)
});

export const reviewRequestSchema = z.object({
  reason: z.string().trim().min(10).max(3000),
  impact: z.string().trim().max(3000).default(''),
  coexistencePlan: z.string().trim().min(10).max(3000),
  resourcePlan: z.string().trim().max(3000).default(''),
  alternative: z.string().trim().max(2000).default('')
});

export const reviewAlternativeSchema = z.object({
  label: z.string().trim().min(3).max(120),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  setupMinutes: z.number().int().min(0).max(1440).default(0),
  teardownMinutes: z.number().int().min(0).max(1440).default(0)
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  path: ['endsAt'],
  message: 'El final debe ser posterior al inicio.'
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(['APPROVE_COEXISTENCE', 'APPROVE_ALTERNATIVE', 'REQUEST_CHANGES', 'REJECT', 'POSTPONE']),
  notes: z.string().trim().min(10).max(3000),
  optionId: z.uuid().optional(),
  postponedUntil: z.iso.datetime().optional(),
  participants: z.array(z.uuid()).max(50).default([])
}).superRefine((value, context) => {
  if (value.decision === 'APPROVE_ALTERNATIVE' && !value.optionId) {
    context.addIssue({ code: 'custom', path: ['optionId'], message: 'Debe seleccionar una alternativa.' });
  }
  if (value.decision === 'POSTPONE' && !value.postponedUntil) {
    context.addIssue({ code: 'custom', path: ['postponedUntil'], message: 'Debe indicar la fecha de reconsideración.' });
  }
});

export const updateActivitySchema = createActivitySchema.partial().extend({
  // Zod 4 applies defaults even inside optional properties. A PATCH must not
  // erase omitted values, resources or visibility, or reopen an approval.
  objective: createActivitySchema.shape.objective.removeDefault().optional(),
  audience: createActivitySchema.shape.audience.removeDefault().optional(),
  estimatedAttendance: createActivitySchema.shape.estimatedAttendance.removeDefault().optional(),
  category: createActivitySchema.shape.category.removeDefault().optional(),
  tags: createActivitySchema.shape.tags.removeDefault().optional(),
  collaboratorDepartmentIds: createActivitySchema.shape.collaboratorDepartmentIds.removeDefault().optional(),
  secondaryResponsibles: createActivitySchema.shape.secondaryResponsibles.removeDefault().optional(),
  modality: createActivitySchema.shape.modality.removeDefault().optional(),
  visibility: createActivitySchema.shape.visibility.removeDefault().optional(),
  resourceIds: createActivitySchema.shape.resourceIds.removeDefault().optional(),
  priority: createActivitySchema.shape.priority.removeDefault().optional(),
  internalNotes: createActivitySchema.shape.internalNotes.removeDefault().optional(),
  customData: createActivitySchema.shape.customData.removeDefault().optional(),
  timezone: createActivitySchema.shape.timezone.removeDefault().optional(),
  // Creation accepts at most 20 seeds per option, each expanding to at most
  // 100 occurrences. Updates must accept that existing bounded expansion.
  options: z.array(scheduleOptionSchema.extend({
    sessions: z.array(sessionSchema).min(1).max(2000)
  })).min(1).max(5).optional(),
  expectedVersion: z.number().int().min(1),
  changeReason: z.string().trim().min(5).max(500)
});

export const recommendationSchema = z.object({
  recommendation: z.enum(['APPROVE', 'CHANGES', 'REJECT', 'ABSTAIN']),
  notes: z.string().trim().min(5).max(3000)
});

export const reviewSessionSchema = z.object({
  title: z.string().trim().min(3).max(180),
  scheduledAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  location: z.string().trim().max(300).optional(),
  agenda: z.string().trim().min(10).max(5000),
  participantIds: z.array(z.uuid()).min(1).max(100),
  reviewRequestIds: z.array(z.uuid()).max(100).default([]),
  reminderMinutes: z.array(z.number().int().refine((value) => [15, 30, 60, 120, 1440].includes(value), 'Recordatorio no permitido.')).min(1).max(5).default([1440, 60])
}).refine((value) => new Date(value.endsAt) > new Date(value.scheduledAt), {
  path: ['endsAt'],
  message: 'La finalización debe ser posterior al inicio.'
});

export const notificationPreferenceSchema = z.object({
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  optionalUpdatesEnabled: z.boolean().optional(),
  consent: z.boolean().optional(),
  uiLocale: z.enum(['es', 'en', 'fr']).optional(),
  accessibilitySettings: z.object({
    fontScale: z.enum(['normal', 'large', 'xlarge']).optional(),
    highContrast: z.boolean().optional(),
    reduceMotion: z.boolean().optional(),
    enhancedFocus: z.boolean().optional(),
    readableFont: z.boolean().optional(),
    comfortableSpacing: z.boolean().optional()
  }).strict().optional()
}).refine((value) => Object.keys(value).length > 0, 'Indica al menos una preferencia.');

export const createTenantSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  name: z.string().trim().min(3).max(180),
  timezone: z.string().trim().min(3).max(80).default('America/La_Paz'),
  adminName: z.string().trim().min(2).max(160),
  adminEmail: z.email().transform((value) => value.toLowerCase()),
  adminPassword: z.string().min(10).max(200)
});

export type CreateActivity = z.infer<typeof createActivitySchema>;

export const rolePermissions: Record<Role, string[]> = {
  GLOBAL_ADMIN: ['global.tenants.manage', 'global.audit.read', 'nominations.access'],
  TENANT_ADMIN: ['tenant.settings.manage', 'users.manage', 'calendar.manage', 'calendar.read', 'calendar.create', 'calendar.review', 'dashboard.read', 'reports.read', 'reports.export', 'elders.read', 'elders.manage', 'elders.program.manage', 'personal_ministries.read', 'personal_ministries.manage', 'personal_ministries.assign', 'personal_ministries.records.manage', 'womens_ministry.read', 'womens_ministry.manage', 'womens_ministry.finance', 'department_operations.read', 'department_operations.manage', 'department_operations.finance', 'department_operations.approve', 'documents.read', 'documents.manage', 'documents.review', 'nominations.access', 'audit.read'],
  PASTOR: ['calendar.read', 'calendar.review', 'dashboard.read', 'reports.read', 'reports.export', 'elders.read', 'personal_ministries.read', 'womens_ministry.read', 'department_operations.read', 'department_operations.approve', 'documents.read', 'documents.review'],
  BOARD_SECRETARY: ['calendar.read', 'calendar.review', 'calendar.conflict.resolve', 'dashboard.read', 'reports.read', 'reports.export', 'elders.read', 'elders.manage', 'elders.program.manage', 'personal_ministries.read', 'womens_ministry.read', 'womens_ministry.manage', 'womens_ministry.finance', 'department_operations.read', 'department_operations.manage', 'department_operations.finance', 'department_operations.approve', 'documents.read', 'documents.manage', 'documents.review', 'nominations.access'],
  FIRST_ELDER: ['calendar.read', 'calendar.create', 'dashboard.read', 'reports.read', 'reports.export', 'elders.read', 'elders.manage', 'elders.program.manage', 'documents.read'],
  ELDER: ['calendar.read', 'dashboard.read', 'reports.read', 'elders.read', 'elders.program.manage', 'documents.read'],
  REVIEWER: ['calendar.read', 'calendar.review', 'dashboard.read', 'reports.read', 'documents.read'],
  DEPARTMENT_LEADER: ['calendar.read', 'calendar.create', 'calendar.department.manage', 'dashboard.read', 'reports.read', 'reports.export', 'personal_ministries.read', 'personal_ministries.manage', 'personal_ministries.assign', 'personal_ministries.records.manage', 'womens_ministry.read', 'womens_ministry.manage', 'womens_ministry.finance', 'department_operations.read', 'department_operations.manage', 'department_operations.finance', 'documents.read'],
  DEPARTMENT_PLANNER: ['calendar.read', 'calendar.create', 'dashboard.read', 'reports.read', 'personal_ministries.read', 'personal_ministries.manage', 'personal_ministries.records.manage', 'womens_ministry.read', 'womens_ministry.manage', 'department_operations.read', 'department_operations.manage', 'documents.read'],
  NOMINATIONS_USER: ['dashboard.read', 'nominations.access'],
  // These are explicit tenant assignments, not entitlements inherited from
  // an administrator or secretary role. Nom verifies the current source roles.
  NOMINATIONS_COMMISSION_MEMBER: ['dashboard.read', 'nominations.access'],
  NOMINATIONS_BALLOT_CUSTODIAN: ['dashboard.read', 'nominations.access'],
  VIEWER: ['calendar.read', 'dashboard.read', 'reports.read', 'documents.read'],
  AUDITOR: ['calendar.read', 'audit.read', 'dashboard.read', 'reports.read', 'reports.export', 'documents.read']
};

export function permissionsFor(assignedRoles: Role[]): string[] {
  return [...new Set(assignedRoles.flatMap((role) => rolePermissions[role]))];
}
