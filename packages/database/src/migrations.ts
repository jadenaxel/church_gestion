import { Client, Pool } from 'pg';
import { attachmentSecuritySql } from './attachment-security.js';
import { departmentNotificationOutboxSchemaSql } from './department-notification-outbox.js';
import { tenantSettingsReconciliationSchemaSql } from './tenant-settings-reconciliation.js';
import { passwordResetOutboxSchemaSql } from './password-reset-outbox.js';
import { databaseNameForTenant } from './index.js';

/** Reviewed additive grants only; no credentials, data writes or other service memberships. */
export const tenantServiceRuntimeGrantsSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_tenant_service') THEN
    CREATE ROLE gc_tenant_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname='gc_tenant_service'
      AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls
        OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))
  ) THEN
    RAISE EXCEPTION 'TENANT_SERVICE_ROLE_BOUNDARY_INVALID';
  END IF;
END $$;
GRANT USAGE ON SCHEMA identity,calendar,audit TO gc_tenant_service;
GRANT SELECT(id,email,name,roles,active) ON identity.users TO gc_tenant_service;
GRANT SELECT(id,user_id,expires_at,revoked_at) ON identity.sessions TO gc_tenant_service;
GRANT SELECT ON calendar.tenant_calendar_settings TO gc_tenant_service;
GRANT UPDATE(timezone,updated_at) ON calendar.tenant_calendar_settings TO gc_tenant_service;
GRANT SELECT,INSERT ON audit.audit_events TO gc_tenant_service;
GRANT USAGE ON SEQUENCE audit.audit_events_id_seq TO gc_tenant_service;
`;

// Additive schema only: safe to apply without rerunning legacy data migrations,
// seeds or federation synchronization. Existing rows/permissions are unchanged.
export const premiumReliabilitySchemaSql = `
ALTER TABLE calendar.review_session_reminders ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE calendar.review_session_reminders ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE notifications.deliveries ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE notifications.deliveries ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE notifications.deliveries ADD COLUMN IF NOT EXISTS recipient_data jsonb;
ALTER TABLE notifications.inbox_events ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE notifications.scheduled_reminders ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE notifications.scheduled_reminders ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE womens_ministry.retreat_payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE womens_ministry.retreat_payments ADD COLUMN IF NOT EXISTS request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS womens_ministry_retreat_payment_idempotency_idx
  ON womens_ministry.retreat_payments(recorded_by,idempotency_key) WHERE idempotency_key IS NOT NULL;
`;

export const controlMigrationSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE IF NOT EXISTS control.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/La_Paz',
  database_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROVISIONING','ACTIVE','SUSPENDED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.global_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY['GLOBAL_ADMIN']::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.global_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES control.global_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.global_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES control.global_users(id) ON DELETE CASCADE,
  ui_locale text NOT NULL DEFAULT 'es' CHECK(ui_locale IN ('es','en','fr')),
  accessibility_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES control.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.tenant_database_registry (
  tenant_id uuid PRIMARY KEY REFERENCES control.tenants(id) ON DELETE CASCADE,
  database_name text NOT NULL UNIQUE,
  key_version integer NOT NULL DEFAULT 1,
  last_backup_at timestamptz,
  last_restore_test_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.tenant_provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES control.tenants(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS control_audit_log_created_idx ON control.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS control_audit_log_actor_created_idx ON control.audit_log(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS control_audit_log_action_created_idx ON control.audit_log(action,created_at DESC);

CREATE OR REPLACE FUNCTION control.prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los eventos de auditoría global son inmutables';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS control_audit_immutable_update ON control.audit_log;
CREATE TRIGGER control_audit_immutable_update BEFORE UPDATE OR DELETE ON control.audit_log
FOR EACH ROW EXECUTE FUNCTION control.prevent_audit_mutation();

CREATE TABLE IF NOT EXISTS control.module_launch_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (length(code_hash)=64),
  module text NOT NULL CHECK (module IN ('nominations')),
  tenant_id uuid NOT NULL REFERENCES control.tenants(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  subject_scope text NOT NULL CHECK (subject_scope IN ('global','tenant')),
  subject_email text NOT NULL,
  subject_name text NOT NULL,
  subject_roles text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_launch_codes_active_idx
  ON control.module_launch_codes(expires_at)
  WHERE consumed_at IS NULL;
ALTER TABLE control.module_launch_codes ADD COLUMN IF NOT EXISTS subject_session_id uuid;
${tenantSettingsReconciliationSchemaSql}
`;

export const tenantMigrationSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS calendar;
CREATE SCHEMA IF NOT EXISTS files;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS elders;
CREATE SCHEMA IF NOT EXISTS personal_ministries;
CREATE SCHEMA IF NOT EXISTS womens_ministry;
CREATE SCHEMA IF NOT EXISTS department_operations;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY['VIEWER']::text[],
  department_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS identity.church_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code text NOT NULL UNIQUE,
  first_name text NOT NULL,
  middle_name text NOT NULL DEFAULT '',
  last_name text NOT NULL,
  display_name text NOT NULL,
  sex text NOT NULL CHECK(sex IN ('FEMALE','MALE','UNSPECIFIED')),
  date_of_birth date,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  marital_status text NOT NULL DEFAULT 'UNSPECIFIED' CHECK(marital_status IN ('SINGLE','MARRIED','WIDOWED','DIVORCED','SEPARATED','UNSPECIFIED')),
  membership_status text NOT NULL DEFAULT 'MEMBER' CHECK(membership_status IN ('MEMBER','VISITOR','INACTIVE','TRANSFERRED')),
  baptism_date date,
  joined_on date,
  address text NOT NULL DEFAULT '',
  emergency_contact text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS church_members_directory_idx ON identity.church_members(active,last_name,first_name);
CREATE INDEX IF NOT EXISTS church_members_birthdays_idx ON identity.church_members(date_of_birth) WHERE active AND date_of_birth IS NOT NULL;
CREATE INDEX IF NOT EXISTS church_members_women_idx ON identity.church_members(last_name,first_name) WHERE active AND sex='FEMALE';

CREATE TABLE IF NOT EXISTS identity.roster_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name text NOT NULL,
  file_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'PREVIEWED' CHECK(status IN ('PREVIEWED','COMPLETED','CANCELLED','FAILED')),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  warning_rows integer NOT NULL DEFAULT 0,
  committed_rows integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
CREATE INDEX IF NOT EXISTS roster_imports_status_idx ON identity.roster_imports(status,created_at DESC);

CREATE TABLE IF NOT EXISTS identity.roster_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES identity.roster_imports(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK(status IN ('VALID','INVALID','IMPORTED')),
  errors text[] NOT NULL DEFAULT '{}',
  warnings text[] NOT NULL DEFAULT '{}',
  member_id uuid REFERENCES identity.church_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id,row_number)
);
CREATE INDEX IF NOT EXISTS roster_import_rows_status_idx ON identity.roster_import_rows(import_id,status,row_number);

CREATE TABLE IF NOT EXISTS identity.credentials (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
INSERT INTO identity.credentials(user_id,password_hash)
SELECT id,password_hash FROM identity.users ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS identity.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_active_idx ON identity.password_reset_tokens(expires_at) WHERE used_at IS NULL;

${passwordResetOutboxSchemaSql}

CREATE TABLE IF NOT EXISTS identity.department_memberships (
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'CONTRIBUTOR',
  PRIMARY KEY(user_id,department_id)
);
ALTER TABLE identity.department_memberships ADD COLUMN IF NOT EXISTS assigned_by uuid;
ALTER TABLE identity.department_memberships ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE identity.department_memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS identity.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0f766e',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);
ALTER TABLE calendar.departments ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE calendar.departments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE identity.department_memberships SET role='DIRECTOR' WHERE role='LEADER';
UPDATE identity.department_memberships SET role='CONTRIBUTOR' WHERE role='MEMBER';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='department_memberships_department_fk') THEN
    ALTER TABLE identity.department_memberships
      ADD CONSTRAINT department_memberships_department_fk FOREIGN KEY(department_id) REFERENCES calendar.departments(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='department_memberships_role_check') THEN
    ALTER TABLE identity.department_memberships
      ADD CONSTRAINT department_memberships_role_check CHECK(role IN ('DIRECTOR','ASSISTANT_DIRECTOR','DEPARTMENT_SECRETARY','PLANNER','CONTRIBUTOR','VIEWER'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS identity.department_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES calendar.departments(id) ON DELETE CASCADE,
  title text NOT NULL,
  source text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,department_id,title)
);
CREATE INDEX IF NOT EXISTS department_appointments_department_idx
  ON identity.department_appointments(department_id,active,title);
CREATE INDEX IF NOT EXISTS department_appointments_user_idx
  ON identity.department_appointments(user_id,active);

CREATE TABLE IF NOT EXISTS calendar.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  capacity integer NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  color text NOT NULL DEFAULT '#c49a45',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  exclusive boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS calendar.tenant_calendar_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  timezone text NOT NULL DEFAULT 'America/La_Paz',
  business_day_start time NOT NULL DEFAULT '06:00',
  business_day_end time NOT NULL DEFAULT '23:00',
  max_options integer NOT NULL DEFAULT 5 CHECK(max_options BETWEEN 1 AND 10),
  suggestion_horizon_days integer NOT NULL DEFAULT 60 CHECK(suggestion_horizon_days BETWEEN 7 AND 365),
  provisional_hold_hours integer NOT NULL DEFAULT 72 CHECK(provisional_hold_hours BETWEEN 1 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO calendar.tenant_calendar_settings(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS calendar.activity_form_templates (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  draft_schema jsonb NOT NULL,
  published_schema jsonb NOT NULL,
  draft_version integer NOT NULL DEFAULT 1 CHECK(draft_version > 0),
  published_version integer NOT NULL DEFAULT 1 CHECK(published_version > 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS calendar.activity_code_seq START 1001;

CREATE TABLE IF NOT EXISTS calendar.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('ACT-' || nextval('calendar.activity_code_seq')),
  title text NOT NULL,
  description text NOT NULL,
  objective text NOT NULL DEFAULT '',
  department_id uuid NOT NULL REFERENCES calendar.departments(id),
  venue_id uuid REFERENCES calendar.venues(id),
  responsible_name text NOT NULL,
  responsible_user_id uuid NOT NULL,
  audience text NOT NULL DEFAULT 'Congregación',
  estimated_attendance integer NOT NULL DEFAULT 0 CHECK (estimated_attendance >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED','COMPLETED','ARCHIVED')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS secondary_responsibles jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS contact_info text;
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'PRESENTIAL' CHECK(modality IN ('PRESENTIAL','VIRTUAL','HYBRID'));
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('INTERNAL','LEADERSHIP','PUBLIC'));
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 10);
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '';
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/La_Paz';
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS custom_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS form_schema_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calendar.activities ADD COLUMN IF NOT EXISTS form_template_version integer NOT NULL DEFAULT 1;
UPDATE calendar.activities SET created_by=responsible_user_id WHERE created_by IS NULL;

CREATE TABLE IF NOT EXISTS calendar.activity_collaborators (
  activity_id uuid NOT NULL REFERENCES calendar.activities(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES calendar.departments(id),
  PRIMARY KEY(activity_id,department_id)
);

CREATE TABLE IF NOT EXISTS calendar.activity_resources (
  activity_id uuid NOT NULL REFERENCES calendar.activities(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES calendar.resources(id),
  quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0),
  PRIMARY KEY(activity_id,resource_id)
);

CREATE TABLE IF NOT EXISTS calendar.recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL UNIQUE REFERENCES calendar.activities(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK(frequency IN ('DAILY','WEEKLY','MONTHLY')),
  interval_count integer NOT NULL DEFAULT 1 CHECK(interval_count BETWEEN 1 AND 52),
  count integer CHECK(count BETWEEN 1 AND 100),
  until_at timestamptz,
  weekdays integer[] NOT NULL DEFAULT '{}'::integer[],
  original_rule text NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(count IS NOT NULL OR until_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS calendar.schedule_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES calendar.activities(id) ON DELETE CASCADE,
  label text NOT NULL,
  preference integer NOT NULL CHECK (preference > 0),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','PROVISIONAL_HOLD','CONFLICTED','EXCEPTION_REQUESTED','CONFIRMED','REJECTED','RELEASED')),
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id, preference)
);

CREATE TABLE IF NOT EXISTS calendar.schedule_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id uuid NOT NULL REFERENCES calendar.schedule_options(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  setup_minutes integer NOT NULL DEFAULT 0 CHECK (setup_minutes BETWEEN 0 AND 1440),
  teardown_minutes integer NOT NULL DEFAULT 0 CHECK (teardown_minutes BETWEEN 0 AND 1440),
  effective_range tstzrange NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS schedule_sessions_range_gist ON calendar.schedule_sessions USING gist (effective_range);

CREATE TABLE IF NOT EXISTS calendar.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES calendar.activities(id),
  option_id uuid NOT NULL REFERENCES calendar.schedule_options(id),
  session_id uuid NOT NULL REFERENCES calendar.schedule_sessions(id),
  venue_id uuid REFERENCES calendar.venues(id),
  reserved_range tstzrange NOT NULL,
  status text NOT NULL CHECK (status IN ('PROVISIONAL','CONFIRMED','RELEASED')),
  waiver_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_range_gist ON calendar.reservations USING gist (reserved_range);
CREATE INDEX IF NOT EXISTS reservations_active_idx ON calendar.reservations(status) WHERE status IN ('PROVISIONAL','CONFIRMED');

CREATE TABLE IF NOT EXISTS calendar.conflict_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES calendar.activities(id),
  requested_option_id uuid NOT NULL REFERENCES calendar.schedule_options(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEW_REQUESTED','RESOLVED','DISMISSED')),
  severity text NOT NULL CHECK (severity IN ('WARNING','HIGH','CRITICAL')),
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE calendar.conflict_cases ADD COLUMN IF NOT EXISTS submitted_by uuid;
ALTER TABLE calendar.conflict_cases ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

CREATE TABLE IF NOT EXISTS calendar.conflict_links (
  conflict_case_id uuid NOT NULL REFERENCES calendar.conflict_cases(id) ON DELETE CASCADE,
  conflicting_activity_id uuid NOT NULL REFERENCES calendar.activities(id),
  conflict_type text NOT NULL,
  session_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(conflict_case_id,conflicting_activity_id,conflict_type)
);

CREATE TABLE IF NOT EXISTS calendar.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_case_id uuid NOT NULL UNIQUE REFERENCES calendar.conflict_cases(id),
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  coexistence_plan text NOT NULL,
  alternative text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar.review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL REFERENCES calendar.review_requests(id),
  decision text NOT NULL,
  notes text NOT NULL,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar.review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','CLOSED','CANCELLED')),
  minutes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE calendar.review_sessions ADD COLUMN IF NOT EXISTS ends_at timestamptz;
UPDATE calendar.review_sessions SET ends_at=scheduled_at+interval '90 minutes' WHERE ends_at IS NULL;
ALTER TABLE calendar.review_sessions ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE calendar.review_sessions ADD COLUMN IF NOT EXISTS agenda text NOT NULL DEFAULT '';
ALTER TABLE calendar.review_sessions ADD COLUMN IF NOT EXISTS reminder_minutes integer[] NOT NULL DEFAULT ARRAY[1440,60]::integer[];

CREATE TABLE IF NOT EXISTS calendar.review_session_participants (
  review_session_id uuid NOT NULL REFERENCES calendar.review_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'MEMBER',
  attended boolean NOT NULL DEFAULT false,
  PRIMARY KEY(review_session_id,user_id)
);
ALTER TABLE calendar.review_session_participants ADD COLUMN IF NOT EXISTS invitation_status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE calendar.review_session_participants ADD COLUMN IF NOT EXISTS responded_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='review_session_participants_invitation_status_check') THEN
    ALTER TABLE calendar.review_session_participants
      ADD CONSTRAINT review_session_participants_invitation_status_check
      CHECK(invitation_status IN ('PENDING','CONFIRMED','DECLINED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar.review_session_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_session_id uuid NOT NULL REFERENCES calendar.review_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  remind_at timestamptz NOT NULL,
  kind text NOT NULL CHECK(kind IN ('24_HOURS','2_HOURS','1_HOUR','30_MINUTES','15_MINUTES')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_session_id,user_id,kind)
);
CREATE INDEX IF NOT EXISTS review_session_reminders_due_idx
  ON calendar.review_session_reminders(remind_at) WHERE status='PENDING';

ALTER TABLE calendar.review_requests ADD COLUMN IF NOT EXISTS review_session_id uuid REFERENCES calendar.review_sessions(id);
ALTER TABLE calendar.review_requests ADD COLUMN IF NOT EXISTS impact text NOT NULL DEFAULT '';
ALTER TABLE calendar.review_requests ADD COLUMN IF NOT EXISTS resource_plan text NOT NULL DEFAULT '';
ALTER TABLE calendar.review_requests ADD COLUMN IF NOT EXISTS postponed_until timestamptz;
ALTER TABLE calendar.review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check;
ALTER TABLE calendar.review_requests ADD CONSTRAINT review_requests_status_check CHECK(status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED','POSTPONED'));
ALTER TABLE calendar.review_decisions ADD COLUMN IF NOT EXISTS participants uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE calendar.review_decisions ADD COLUMN IF NOT EXISTS postponed_until timestamptz;

CREATE TABLE IF NOT EXISTS calendar.review_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL REFERENCES calendar.review_requests(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  recommendation text NOT NULL CHECK(recommendation IN ('APPROVE','CHANGES','REJECT','ABSTAIN')),
  notes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_request_id,reviewer_id)
);

CREATE TABLE IF NOT EXISTS calendar.conflict_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL REFERENCES calendar.review_requests(id),
  activity_id uuid NOT NULL REFERENCES calendar.activities(id),
  option_id uuid NOT NULL REFERENCES calendar.schedule_options(id),
  notes text NOT NULL,
  authorized_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON calendar.outbox_events(created_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS calendar.activity_revisions (
  id bigserial PRIMARY KEY,
  activity_id uuid NOT NULL REFERENCES calendar.activities(id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid NOT NULL,
  change_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id,version)
);

CREATE TABLE IF NOT EXISTS calendar.activity_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES calendar.activities(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  proposed_changes jsonb NOT NULL,
  reason text NOT NULL,
  expected_version integer NOT NULL CHECK(expected_version > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPLIED','REJECTED')),
  decided_by uuid,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS activity_change_requests_review_idx
  ON calendar.activity_change_requests(status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS activity_change_requests_one_pending_idx
  ON calendar.activity_change_requests(activity_id,requested_by) WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS calendar.idempotency_keys (
  idempotency_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE TABLE IF NOT EXISTS files.file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  original_name text NOT NULL,
  stored_name text NOT NULL UNIQUE,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('UPLOADING','SCANNING','AVAILABLE','QUARANTINED','REJECTED')),
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE files.file_objects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE files.file_objects ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'LOCAL';
ALTER TABLE files.file_objects ADD COLUMN IF NOT EXISTS scan_engine text;
ALTER TABLE files.file_objects ADD COLUMN IF NOT EXISTS scan_signature text;
ALTER TABLE files.file_objects ALTER COLUMN activity_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS file_activity_idx ON files.file_objects(activity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS file_activity_name_version_idx ON files.file_objects(activity_id,original_name,version);

CREATE TABLE IF NOT EXISTS files.member_photos (
  member_id uuid PRIMARY KEY REFERENCES identity.church_members(id) ON DELETE CASCADE,
  file_id uuid NOT NULL UNIQUE REFERENCES files.file_objects(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files.department_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL UNIQUE REFERENCES files.file_objects(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES calendar.departments(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  document_type text NOT NULL CHECK(document_type IN ('PROGRAM','GUIDE','MINUTES','BUDGET','REPORT','TEMPLATE','OTHER')),
  ministry_year integer NOT NULL CHECK(ministry_year BETWEEN 2000 AND 2100),
  alignment_basis text NOT NULL CHECK(alignment_basis IN ('ANNUAL_CHURCH_PLAN','ADVENTIST_MANUAL','DEPARTMENTAL_GUIDE','LOCAL_STRATEGIC_PLAN','OTHER')),
  alignment_reference text NOT NULL,
  alignment_notes text NOT NULL DEFAULT '',
  alignment_status text NOT NULL DEFAULT 'DECLARED' CHECK(alignment_status IN ('DECLARED','VERIFIED','NEEDS_CHANGES')),
  visibility text NOT NULL DEFAULT 'DEPARTMENT' CHECK(visibility IN ('DEPARTMENT','LEADERSHIP','TENANT')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  reviewed_by uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_documents_library_idx
  ON files.department_documents(department_id,ministry_year,document_type,created_at DESC);
CREATE INDEX IF NOT EXISTS department_documents_alignment_idx
  ON files.department_documents(alignment_status,created_at DESC);

CREATE TABLE IF NOT EXISTS files.scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files.file_objects(id) ON DELETE CASCADE,
  engine text NOT NULL,
  engine_version text,
  status text NOT NULL CHECK(status IN ('CLEAN','INFECTED','ERROR','SKIPPED')),
  signature text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files.file_access_tokens (
  token_hash text PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES files.file_objects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  user_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications.notifications ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'legacy.event';
ALTER TABLE notifications.notifications ADD COLUMN IF NOT EXISTS optional boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS notifications.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP')),
  status text NOT NULL CHECK (status IN ('PENDING','SENT','DELIVERED','SIMULATED','FAILED')),
  provider_message_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, channel)
);
ALTER TABLE notifications.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE notifications.deliveries ADD CONSTRAINT deliveries_status_check CHECK(status IN ('PENDING','SENT','DELIVERED','READ','SIMULATED','FAILED','DEAD_LETTER'));
ALTER TABLE notifications.deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE notifications.deliveries ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE TABLE IF NOT EXISTS notifications.preferences (
  user_id uuid PRIMARY KEY,
  email_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  reminders_enabled boolean NOT NULL DEFAULT true,
  optional_updates_enabled boolean NOT NULL DEFAULT true,
  consented_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications.preferences ADD COLUMN IF NOT EXISTS ui_locale text NOT NULL DEFAULT 'es';
ALTER TABLE notifications.preferences ADD COLUMN IF NOT EXISTS accessibility_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notifications.preferences DROP CONSTRAINT IF EXISTS preferences_ui_locale_check;
ALTER TABLE notifications.preferences ADD CONSTRAINT preferences_ui_locale_check CHECK(ui_locale IN ('es','en','fr'));

CREATE TABLE IF NOT EXISTS notifications.channel_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  managed boolean NOT NULL DEFAULT false,
  smtp_host text,
  smtp_port integer CHECK(smtp_port BETWEEN 1 AND 65535),
  smtp_secure boolean NOT NULL DEFAULT false,
  smtp_require_tls boolean NOT NULL DEFAULT false,
  smtp_user text,
  smtp_password_encrypted text,
  smtp_from_name text,
  smtp_from_email text,
  whatsapp_mode text NOT NULL DEFAULT 'simulated' CHECK(whatsapp_mode IN ('simulated','live')),
  whatsapp_phone_number_id text,
  whatsapp_access_token_encrypted text,
  whatsapp_verify_token_encrypted text,
  whatsapp_app_secret_encrypted text,
  whatsapp_template_name text,
  whatsapp_template_language text NOT NULL DEFAULT 'es',
  meta_graph_version text NOT NULL DEFAULT 'v23.0',
  email_last_test_status text CHECK(email_last_test_status IN ('SENT','FAILED')),
  email_last_test_message text,
  email_last_test_at timestamptz,
  whatsapp_last_test_status text CHECK(whatsapp_last_test_status IN ('SENT','DELIVERED','READ','SIMULATED','FAILED')),
  whatsapp_last_test_message text,
  whatsapp_last_test_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS smtp_last_verified_status text;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS smtp_last_verified_message text;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS smtp_last_verified_at timestamptz;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS whatsapp_last_verified_status text;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS whatsapp_last_verified_message text;
ALTER TABLE notifications.channel_settings ADD COLUMN IF NOT EXISTS whatsapp_last_verified_at timestamptz;
ALTER TABLE notifications.channel_settings DROP CONSTRAINT IF EXISTS channel_settings_smtp_last_verified_status_check;
ALTER TABLE notifications.channel_settings ADD CONSTRAINT channel_settings_smtp_last_verified_status_check CHECK(smtp_last_verified_status IN ('VERIFIED','FAILED'));
ALTER TABLE notifications.channel_settings DROP CONSTRAINT IF EXISTS channel_settings_whatsapp_last_verified_status_check;
ALTER TABLE notifications.channel_settings ADD CONSTRAINT channel_settings_whatsapp_last_verified_status_check CHECK(whatsapp_last_verified_status IN ('VERIFIED','FAILED'));
INSERT INTO notifications.channel_settings(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications.templates (
  event_type text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('IN_APP','EMAIL','WHATSAPP')),
  version integer NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_type,channel,version)
);

CREATE TABLE IF NOT EXISTS notifications.inbox_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE TABLE IF NOT EXISTS notifications.provider_webhook_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,provider_event_id)
);

CREATE TABLE IF NOT EXISTS notifications.scheduled_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  user_id uuid,
  remind_at timestamptz NOT NULL,
  kind text NOT NULL CHECK(kind IN ('7_DAYS','24_HOURS','CUSTOM')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','CANCELLED','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id,user_id,remind_at,kind)
);
CREATE INDEX IF NOT EXISTS scheduled_reminders_due_idx ON notifications.scheduled_reminders(remind_at) WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS elders.rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Ancianos responsables',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS elder_rotations_range_idx ON elders.rotations(starts_on,ends_on) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS elders.rotation_members (
  rotation_id uuid NOT NULL REFERENCES elders.rotations(id) ON DELETE CASCADE,
  elder_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(rotation_id,elder_id)
);
CREATE INDEX IF NOT EXISTS elder_rotation_members_elder_idx ON elders.rotation_members(elder_id);

CREATE TABLE IF NOT EXISTS elders.department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id uuid NOT NULL REFERENCES identity.users(id),
  department_id uuid NOT NULL REFERENCES calendar.departments(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on),
  UNIQUE(elder_id,department_id,starts_on,ends_on)
);
CREATE INDEX IF NOT EXISTS elder_department_assignments_range_idx
  ON elders.department_assignments(department_id,starts_on,ends_on) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS elder_department_assignments_elder_idx
  ON elders.department_assignments(elder_id,starts_on,ends_on) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS elders.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id uuid REFERENCES elders.rotations(id) ON DELETE SET NULL,
  elder_id uuid NOT NULL REFERENCES identity.users(id),
  service_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  service_type text NOT NULL CHECK(service_type IN ('WEDNESDAY','SABBATH','OTHER')),
  title text NOT NULL,
  preacher_name text NOT NULL DEFAULT '',
  singer_name text NOT NULL DEFAULT '',
  hymn text NOT NULL DEFAULT '',
  bible_reading text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','COMPLETED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > service_at)
);
CREATE INDEX IF NOT EXISTS elder_programs_agenda_idx ON elders.programs(service_at,status);
CREATE INDEX IF NOT EXISTS elder_programs_owner_idx ON elders.programs(elder_id,service_at);

CREATE TABLE IF NOT EXISTS elders.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES elders.programs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('PREACHER','ARTIST')),
  original_name text NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  content bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id,kind)
);

CREATE TABLE IF NOT EXISTS elders.service_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL CHECK(service_type IN ('WEDNESDAY','SABBATH','OTHER')),
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS elder_service_templates_type_idx ON elders.service_templates(service_type,active,name);

CREATE TABLE IF NOT EXISTS elders.service_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES elders.service_templates(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
  title text NOT NULL,
  participation_type text NOT NULL DEFAULT 'CUSTOM' CHECK(participation_type IN ('PLATFORM','WELCOME','INVOCATION','PRAISE','HYMN','PRAYER','SCRIPTURE','MISSION_STORY','OFFERING','SPECIAL_MUSIC','SERMON','ANNOUNCEMENTS','BENEDICTION','CUSTOM')),
  default_duration_minutes integer NOT NULL CHECK(default_duration_minutes BETWEEN 1 AND 180),
  instructions text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT true,
  UNIQUE(template_id,sequence)
);

CREATE TABLE IF NOT EXISTS elders.program_platform_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES elders.programs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  role_label text NOT NULL DEFAULT 'Plataforma',
  is_lead boolean NOT NULL DEFAULT false,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
  added_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id,sequence)
);
CREATE INDEX IF NOT EXISTS elder_platform_members_program_idx ON elders.program_platform_members(program_id,sequence);

CREATE TABLE IF NOT EXISTS elders.program_service_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES elders.programs(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES elders.service_template_items(id) ON DELETE SET NULL,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
  title text NOT NULL,
  participation_type text NOT NULL DEFAULT 'CUSTOM' CHECK(participation_type IN ('PLATFORM','WELCOME','INVOCATION','PRAISE','HYMN','PRAYER','SCRIPTURE','MISSION_STORY','OFFERING','SPECIAL_MUSIC','SERMON','ANNOUNCEMENTS','BENEDICTION','CUSTOM')),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 180),
  assignee_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  assignee_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY','COMPLETED','SKIPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id,sequence)
);
CREATE INDEX IF NOT EXISTS elder_program_service_items_timeline_idx ON elders.program_service_items(program_id,starts_at,sequence);

INSERT INTO elders.service_templates(id,name,service_type,description,is_system)
VALUES
  ('00000000-0000-4000-8000-000000000701','Culto divino del sábado','SABBATH','Plantilla base adaptable para coordinar el culto divino del sábado.',true),
  ('00000000-0000-4000-8000-000000000702','Culto de oración del miércoles','WEDNESDAY','Plantilla base adaptable para coordinar el culto de oración del miércoles.',true)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,service_type=EXCLUDED.service_type,description=EXCLUDED.description,is_system=true,active=true;

INSERT INTO elders.service_template_items(template_id,sequence,title,participation_type,default_duration_minutes,instructions,required)
SELECT '00000000-0000-4000-8000-000000000701'::uuid,item.sequence,item.title,item.kind,item.minutes,item.instructions,item.required
FROM (VALUES
 (1,'Preludio y ambientación','PRAISE',10,'Preparar un ambiente de reverencia antes del inicio.',true),
 (2,'Bienvenida y anuncios esenciales','WELCOME',5,'Recibir a la congregación y comunicar solo avisos prioritarios.',true),
 (3,'Entrada de la plataforma','PLATFORM',3,'Coordinar entrada, ubicación y transición de la plataforma.',true),
 (4,'Invocación','INVOCATION',3,'Oración breve de apertura.',true),
 (5,'Himno de apertura','HYMN',5,'Confirmar himno, tonalidad y acompañamiento.',true),
 (6,'Oración pastoral','PRAYER',5,'Oración congregacional y necesidades de la iglesia.',true),
 (7,'Lectura bíblica','SCRIPTURE',4,'Validar cita y versión bíblica con antelación.',true),
 (8,'Ofrendas y música','OFFERING',8,'Coordinar diáconos, lectura y música de fondo.',true),
 (9,'Participación infantil','CUSTOM',8,'Espacio opcional según la planificación local.',false),
 (10,'Música especial','SPECIAL_MUSIC',7,'Confirmar participante, pista y prueba de sonido.',false),
 (11,'Mensaje central','SERMON',35,'Presentación del mensaje y llamado.',true),
 (12,'Himno final','HYMN',5,'Seleccionar himno en armonía con el mensaje.',true),
 (13,'Bendición','BENEDICTION',3,'Cierre espiritual del servicio.',true),
 (14,'Salida de la plataforma','PLATFORM',2,'Salida ordenada y transición final.',true)
) AS item(sequence,title,kind,minutes,instructions,required)
WHERE NOT EXISTS (SELECT 1 FROM elders.service_template_items WHERE template_id='00000000-0000-4000-8000-000000000701');

INSERT INTO elders.service_template_items(template_id,sequence,title,participation_type,default_duration_minutes,instructions,required)
SELECT '00000000-0000-4000-8000-000000000702'::uuid,item.sequence,item.title,item.kind,item.minutes,item.instructions,item.required
FROM (VALUES
 (1,'Preludio','PRAISE',5,'Música de ambientación y preparación.',true),
 (2,'Bienvenida','WELCOME',4,'Saludo, propósito y orientación del culto.',true),
 (3,'Himno de apertura','HYMN',5,'Confirmar himno y acompañamiento.',true),
 (4,'Oración inicial','PRAYER',8,'Oración de apertura y gratitud.',true),
 (5,'Reflexión bíblica','SERMON',20,'Meditación breve centrada en la Biblia.',true),
 (6,'Testimonios y pedidos','CUSTOM',15,'Facilitar testimonios y registrar pedidos de oración.',true),
 (7,'Oración intercesora','PRAYER',15,'Tiempo central de oración congregacional.',true),
 (8,'Anuncios','ANNOUNCEMENTS',3,'Comunicar avisos esenciales.',false),
 (9,'Himno final','HYMN',5,'Canto de cierre.',true),
 (10,'Bendición','BENEDICTION',3,'Oración final.',true)
) AS item(sequence,title,kind,minutes,instructions,required)
WHERE NOT EXISTS (SELECT 1 FROM elders.service_template_items WHERE template_id='00000000-0000-4000-8000-000000000702');

CREATE TABLE IF NOT EXISTS personal_ministries.strategic_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  vision text NOT NULL DEFAULT '',
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  owner_id uuid REFERENCES identity.users(id),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS pm_strategic_plans_period_idx ON personal_ministries.strategic_plans(period_start,period_end,status);

CREATE TABLE IF NOT EXISTS personal_ministries.initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategic_plan_id uuid REFERENCES personal_ministries.strategic_plans(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'LOCAL' CHECK(scope IN ('GLOBAL','UNION','CONFERENCE','LOCAL')),
  initiative_type text NOT NULL DEFAULT 'MISSIONARY' CHECK(initiative_type IN ('MISSIONARY','EVANGELISM','TRAINING','OUTREACH','CHURCH')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ACTIVE','AT_RISK','COMPLETED','CANCELLED')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  target_count integer NOT NULL DEFAULT 0 CHECK(target_count >= 0),
  actual_count integer NOT NULL DEFAULT 0 CHECK(actual_count >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS pm_initiatives_schedule_idx ON personal_ministries.initiatives(starts_on,ends_on,status);
ALTER TABLE personal_ministries.initiatives ADD COLUMN IF NOT EXISTS planned_budget numeric(14,2) NOT NULL DEFAULT 0 CHECK(planned_budget >= 0);
ALTER TABLE personal_ministries.initiatives ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'DOP';

CREATE TABLE IF NOT EXISTS personal_ministries.budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES personal_ministries.initiatives(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK(entry_type IN ('COMMITMENT','EXPENSE','INCOME','ADJUSTMENT')),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount > 0),
  occurred_on date NOT NULL,
  vendor text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','APPROVED','PAID','VOID')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_budget_initiative_idx ON personal_ministries.budget_entries(initiative_id,status,occurred_on DESC);
CREATE INDEX IF NOT EXISTS pm_budget_period_idx ON personal_ministries.budget_entries(occurred_on,entry_type,status);

CREATE TABLE IF NOT EXISTS personal_ministries.initiative_assignments (
  initiative_id uuid NOT NULL REFERENCES personal_ministries.initiatives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  responsibility text NOT NULL DEFAULT '',
  workload_percent integer NOT NULL DEFAULT 0 CHECK(workload_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','IN_PROGRESS','COMPLETED','BLOCKED')),
  assigned_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(initiative_id,user_id)
);
CREATE INDEX IF NOT EXISTS pm_assignments_user_idx ON personal_ministries.initiative_assignments(user_id,status);

CREATE TABLE IF NOT EXISTS personal_ministries.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'INTERESTED' CHECK(stage IN ('INTERESTED','BIBLE_STUDY','BAPTISM_CANDIDATE','BAPTIZED','INACTIVE')),
  source text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES identity.users(id),
  next_follow_up_at timestamptz,
  notes text NOT NULL DEFAULT '',
  consent boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_contacts_pipeline_idx ON personal_ministries.contacts(stage,next_follow_up_at);
CREATE INDEX IF NOT EXISTS pm_contacts_assignee_idx ON personal_ministries.contacts(assigned_to,stage);

CREATE TABLE IF NOT EXISTS personal_ministries.bible_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES personal_ministries.contacts(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES identity.users(id),
  studied_at timestamptz NOT NULL,
  lesson text NOT NULL,
  outcome text NOT NULL DEFAULT '',
  next_study_at timestamptz,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','COMPLETED','MISSED','CANCELLED')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_bible_studies_agenda_idx ON personal_ministries.bible_studies(studied_at,status);
CREATE INDEX IF NOT EXISTS pm_bible_studies_contact_idx ON personal_ministries.bible_studies(contact_id,studied_at DESC);

CREATE TABLE IF NOT EXISTS personal_ministries.small_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_id uuid NOT NULL REFERENCES identity.users(id),
  assistant_id uuid REFERENCES identity.users(id),
  meeting_day integer NOT NULL CHECK(meeting_day BETWEEN 0 AND 6),
  meeting_time time NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('PLANNING','ACTIVE','PAUSED','CLOSED')),
  goal integer NOT NULL DEFAULT 0 CHECK(goal >= 0),
  current_members integer NOT NULL DEFAULT 0 CHECK(current_members >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_small_groups_status_idx ON personal_ministries.small_groups(status,meeting_day);

CREATE TABLE IF NOT EXISTS personal_ministries.missionary_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  presenter_id uuid NOT NULL REFERENCES identity.users(id),
  theme text NOT NULL DEFAULT '',
  material text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > scheduled_at)
);
CREATE INDEX IF NOT EXISTS pm_missionary_minutes_agenda_idx ON personal_ministries.missionary_minutes(scheduled_at,status);

CREATE TABLE IF NOT EXISTS personal_ministries.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid REFERENCES personal_ministries.initiatives(id) ON DELETE SET NULL,
  title text NOT NULL,
  theme text NOT NULL DEFAULT '',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  venue text NOT NULL DEFAULT '',
  evangelist text NOT NULL DEFAULT '',
  goal integer NOT NULL DEFAULT 0 CHECK(goal >= 0),
  status text NOT NULL DEFAULT 'PLANNING' CHECK(status IN ('PLANNING','ACTIVE','COMPLETED','CANCELLED')),
  decision_count integer NOT NULL DEFAULT 0 CHECK(decision_count >= 0),
  baptism_count integer NOT NULL DEFAULT 0 CHECK(baptism_count >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS pm_campaigns_schedule_idx ON personal_ministries.campaigns(starts_on,ends_on,status);

CREATE TABLE IF NOT EXISTS womens_ministry.women (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES identity.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  date_of_birth date,
  membership_status text NOT NULL DEFAULT 'MEMBER' CHECK(membership_status IN ('MEMBER','VISITOR','INACTIVE')),
  preferred_contact text NOT NULL DEFAULT 'WHATSAPP' CHECK(preferred_contact IN ('WHATSAPP','EMAIL','PHONE','NONE')),
  interests text[] NOT NULL DEFAULT '{}',
  inclusion_notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS womens_ministry_women_active_idx ON womens_ministry.women(active,name);
CREATE INDEX IF NOT EXISTS womens_ministry_women_birth_idx ON womens_ministry.women(date_of_birth) WHERE active;
ALTER TABLE womens_ministry.women ADD COLUMN IF NOT EXISTS church_member_id uuid REFERENCES identity.church_members(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS womens_ministry_women_church_member_idx ON womens_ministry.women(church_member_id);

CREATE OR REPLACE FUNCTION identity.sync_church_member_to_womens_roster()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE womens_ministry.women SET active=false,updated_at=now() WHERE church_member_id=OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.sex='FEMALE' THEN
    INSERT INTO womens_ministry.women(
      church_member_id,user_id,name,email,phone,date_of_birth,membership_status,
      preferred_contact,interests,inclusion_notes,active,created_by
    ) VALUES(
      NEW.id,NULL,NEW.display_name,NEW.email,COALESCE(NULLIF(NEW.whatsapp,''),NEW.phone),NEW.date_of_birth,
      CASE NEW.membership_status WHEN 'VISITOR' THEN 'VISITOR' WHEN 'MEMBER' THEN 'MEMBER' ELSE 'INACTIVE' END,
      CASE WHEN NEW.whatsapp<>'' THEN 'WHATSAPP' WHEN NEW.email<>'' THEN 'EMAIL' WHEN NEW.phone<>'' THEN 'PHONE' ELSE 'NONE' END,
      '{}'::text[],'Sincronizado desde el padrón maestro.',
      NEW.active AND NEW.membership_status IN ('MEMBER','VISITOR'),NEW.created_by
    )
    ON CONFLICT(church_member_id) DO UPDATE SET
      name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,date_of_birth=EXCLUDED.date_of_birth,
      membership_status=EXCLUDED.membership_status,preferred_contact=EXCLUDED.preferred_contact,
      active=EXCLUDED.active,updated_at=now();
  ELSE
    UPDATE womens_ministry.women SET active=false,updated_at=now() WHERE church_member_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS church_member_womens_roster_sync ON identity.church_members;
CREATE TRIGGER church_member_womens_roster_sync
AFTER INSERT OR UPDATE OF first_name,middle_name,last_name,display_name,sex,date_of_birth,email,phone,whatsapp,membership_status,active
ON identity.church_members FOR EACH ROW EXECUTE FUNCTION identity.sync_church_member_to_womens_roster();

CREATE TABLE IF NOT EXISTS womens_ministry.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_activity_id uuid UNIQUE REFERENCES calendar.activities(id) ON DELETE SET NULL,
  title text NOT NULL,
  activity_type text NOT NULL DEFAULT 'FELLOWSHIP' CHECK(activity_type IN ('SPIRITUAL','FELLOWSHIP','SERVICE','TRAINING','HEALTH','EVANGELISM','OTHER')),
  objective text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  venue text NOT NULL DEFAULT '',
  responsible_id uuid REFERENCES identity.users(id),
  target_age_bands text[] NOT NULL DEFAULT '{}',
  planned_budget numeric(12,2) NOT NULL DEFAULT 0 CHECK(planned_budget >= 0),
  currency char(3) NOT NULL DEFAULT 'DOP',
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  outcome text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS womens_ministry_activities_schedule_idx ON womens_ministry.activities(starts_at,status);

CREATE TABLE IF NOT EXISTS womens_ministry.activity_budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES womens_ministry.activities(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK(entry_type IN ('PLANNED_EXPENSE','EXPENSE','INCOME')),
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  receipt_reference text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS womens_ministry_budget_activity_idx ON womens_ministry.activity_budget_entries(activity_id,entry_type,occurred_on);

CREATE TABLE IF NOT EXISTS womens_ministry.activity_participation (
  activity_id uuid NOT NULL REFERENCES womens_ministry.activities(id) ON DELETE CASCADE,
  woman_id uuid NOT NULL REFERENCES womens_ministry.women(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'INVITED' CHECK(status IN ('INVITED','CONFIRMED','ATTENDED','DECLINED','NO_SHOW')),
  notes text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(activity_id,woman_id)
);
CREATE INDEX IF NOT EXISTS womens_ministry_participation_woman_idx ON womens_ministry.activity_participation(woman_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS womens_ministry.retreats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  year integer NOT NULL CHECK(year BETWEEN 2020 AND 2100),
  resort text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 10000),
  cost_per_person numeric(12,2) NOT NULL DEFAULT 0 CHECK(cost_per_person >= 0),
  total_budget numeric(12,2) NOT NULL DEFAULT 0 CHECK(total_budget >= 0),
  deposit_deadline date,
  currency char(3) NOT NULL DEFAULT 'DOP',
  status text NOT NULL DEFAULT 'PLANNING' CHECK(status IN ('PLANNING','REGISTRATION_OPEN','REGISTRATION_CLOSED','COMPLETED','CANCELLED')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on),
  UNIQUE(year,title)
);
CREATE INDEX IF NOT EXISTS womens_ministry_retreats_year_idx ON womens_ministry.retreats(year,status);

CREATE TABLE IF NOT EXISTS womens_ministry.retreat_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES womens_ministry.retreats(id) ON DELETE CASCADE,
  woman_id uuid NOT NULL REFERENCES womens_ministry.women(id) ON DELETE CASCADE,
  attendance_status text NOT NULL DEFAULT 'INTERESTED' CHECK(attendance_status IN ('INTERESTED','CONFIRMED','DECLINED','WAITLIST','ATTENDED','NO_SHOW')),
  amount_due numeric(12,2) NOT NULL DEFAULT 0 CHECK(amount_due >= 0),
  room_assignment text NOT NULL DEFAULT '',
  transport_required boolean NOT NULL DEFAULT false,
  dietary_notes text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  registered_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(retreat_id,woman_id)
);
CREATE INDEX IF NOT EXISTS womens_ministry_retreat_registration_idx ON womens_ministry.retreat_registrations(retreat_id,attendance_status);

CREATE TABLE IF NOT EXISTS womens_ministry.retreat_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES womens_ministry.retreat_registrations(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'CASH' CHECK(method IN ('CASH','TRANSFER','CARD','OTHER')),
  reference text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS womens_ministry_retreat_payments_registration_idx ON womens_ministry.retreat_payments(registration_id,paid_on);

CREATE TABLE IF NOT EXISTS womens_ministry.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woman_id uuid NOT NULL REFERENCES womens_ministry.women(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES womens_ministry.activities(id) ON DELETE SET NULL,
  reason text NOT NULL,
  due_on date NOT NULL,
  assigned_to uuid REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS womens_ministry_followups_due_idx ON womens_ministry.follow_ups(status,due_on);

CREATE TABLE IF NOT EXISTS womens_ministry.birthday_alerts (
  woman_id uuid NOT NULL REFERENCES womens_ministry.women(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  birthday_year integer NOT NULL CHECK(birthday_year BETWEEN 2020 AND 2200),
  alert_stage text NOT NULL DEFAULT 'UPCOMING' CHECK(alert_stage IN ('UPCOMING','TODAY')),
  next_birthday date NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(woman_id,recipient_id,birthday_year,alert_stage)
);
ALTER TABLE womens_ministry.birthday_alerts ADD COLUMN IF NOT EXISTS alert_stage text NOT NULL DEFAULT 'UPCOMING';
ALTER TABLE womens_ministry.birthday_alerts DROP CONSTRAINT IF EXISTS birthday_alerts_alert_stage_check;
ALTER TABLE womens_ministry.birthday_alerts ADD CONSTRAINT birthday_alerts_alert_stage_check CHECK(alert_stage IN ('UPCOMING','TODAY'));
ALTER TABLE womens_ministry.birthday_alerts DROP CONSTRAINT IF EXISTS birthday_alerts_pkey;
ALTER TABLE womens_ministry.birthday_alerts ADD CONSTRAINT birthday_alerts_pkey PRIMARY KEY(woman_id,recipient_id,birthday_year,alert_stage);
CREATE INDEX IF NOT EXISTS womens_ministry_birthday_alerts_recipient_idx ON womens_ministry.birthday_alerts(recipient_id,alerted_at DESC);

-- Shared departmental operating system. Specialized ministries keep their own
-- bounded contexts while every department receives a first-class workspace.
CREATE TABLE IF NOT EXISTS department_operations.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL UNIQUE REFERENCES calendar.departments(id) ON DELETE CASCADE,
  ministry_key text NOT NULL DEFAULT 'GENERAL',
  mission_statement text NOT NULL DEFAULT '',
  governance_reference text NOT NULL DEFAULT 'Seventh-day Adventist Church Manual, 21st edition, revised 2025',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_workspaces_department_idx ON department_operations.workspaces(department_id,active);

CREATE TABLE IF NOT EXISTS department_operations.annual_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  year integer NOT NULL CHECK(year BETWEEN 2020 AND 2200),
  vision text NOT NULL DEFAULT '',
  mission text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  owner_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,year,title)
);
CREATE INDEX IF NOT EXISTS department_annual_plans_year_idx ON department_operations.annual_plans(workspace_id,year,status);

CREATE TABLE IF NOT EXISTS department_operations.objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES department_operations.annual_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_value numeric(14,2) NOT NULL DEFAULT 0,
  current_value numeric(14,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '%',
  due_on date,
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','AT_RISK','COMPLETED','CANCELLED')),
  owner_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_objectives_plan_idx ON department_operations.objectives(plan_id,status,due_on);

CREATE TABLE IF NOT EXISTS department_operations.initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES department_operations.annual_plans(id) ON DELETE SET NULL,
  calendar_activity_id uuid REFERENCES calendar.activities(id) ON DELETE SET NULL,
  initiative_type text NOT NULL DEFAULT 'PROGRAM' CHECK(initiative_type IN ('ACTIVITY','PROGRAM','CAMPAIGN','PROJECT','TRAINING','SERVICE')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('DRAFT','PLANNED','IN_PROGRESS','AT_RISK','COMPLETED','CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  planned_budget numeric(14,2) NOT NULL DEFAULT 0 CHECK(planned_budget >= 0),
  currency char(3) NOT NULL DEFAULT 'DOP',
  outcome text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS department_initiatives_schedule_idx ON department_operations.initiatives(workspace_id,starts_on,ends_on,status);
CREATE INDEX IF NOT EXISTS department_initiatives_calendar_idx ON department_operations.initiatives(calendar_activity_id) WHERE calendar_activity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS department_operations.initiative_assignments (
  initiative_id uuid NOT NULL REFERENCES department_operations.initiatives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  responsibility text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','IN_PROGRESS','COMPLETED','BLOCKED')),
  assigned_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(initiative_id,user_id)
);

CREATE TABLE IF NOT EXISTS department_operations.budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  initiative_id uuid REFERENCES department_operations.initiatives(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK(entry_type IN ('ALLOCATION','COMMITMENT','EXPENSE','INCOME','ADJUSTMENT')),
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL CHECK(amount > 0),
  occurred_on date NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','SUBMITTED','APPROVED','PAID','REJECTED','VOID')),
  vendor text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  approved_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_budget_workspace_idx ON department_operations.budget_entries(workspace_id,occurred_on,status);

CREATE TABLE IF NOT EXISTS department_operations.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  initiative_id uuid REFERENCES department_operations.initiatives(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_tasks_due_idx ON department_operations.tasks(workspace_id,status,due_at);

CREATE TABLE IF NOT EXISTS department_operations.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '',
  agenda text NOT NULL DEFAULT '',
  minutes text NOT NULL DEFAULT '',
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','CLOSED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > scheduled_at)
);
CREATE INDEX IF NOT EXISTS department_meetings_schedule_idx ON department_operations.meetings(workspace_id,scheduled_at,status);

CREATE TABLE IF NOT EXISTS department_operations.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES department_operations.meetings(id) ON DELETE SET NULL,
  initiative_id uuid REFERENCES department_operations.initiatives(id) ON DELETE SET NULL,
  title text NOT NULL,
  decision_text text NOT NULL,
  authority_type text NOT NULL DEFAULT 'DEPARTMENT' CHECK(authority_type IN ('DEPARTMENT','CHURCH_BOARD','BUSINESS_MEETING','PASTORAL','CONFERENCE')),
  decided_on date NOT NULL,
  effective_on date,
  evidence_reference text NOT NULL DEFAULT '',
  approved_by uuid NOT NULL REFERENCES identity.users(id),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_decisions_workspace_idx ON department_operations.decisions(workspace_id,decided_on DESC);

CREATE TABLE IF NOT EXISTS department_operations.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK(resource_type IN ('PLAN','OBJECTIVE','INITIATIVE','TASK','MEETING','DECISION','RECORD')),
  resource_id uuid NOT NULL,
  body text NOT NULL,
  mention_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_comments_resource_idx ON department_operations.comments(resource_type,resource_id,created_at);

CREATE TABLE IF NOT EXISTS department_operations.kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_value numeric(14,2) NOT NULL DEFAULT 0,
  current_value numeric(14,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'ON_TRACK' CHECK(status IN ('ON_TRACK','AT_RISK','OFF_TRACK','ACHIEVED')),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS department_kpis_period_idx ON department_operations.kpis(workspace_id,period_start,period_end);

CREATE TABLE IF NOT EXISTS department_operations.ministry_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES department_operations.workspaces(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  title text NOT NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  visibility text NOT NULL DEFAULT 'TEAM' CHECK(visibility IN ('TEAM','LEADERSHIP','RESTRICTED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_records_type_idx ON department_operations.ministry_records(workspace_id,record_type,status,record_date DESC);

${departmentNotificationOutboxSchemaSql}

INSERT INTO department_operations.workspaces(department_id,ministry_key)
SELECT d.id,
  CASE
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) LIKE '%ancianos%' THEN 'ELDERS_OPERATIONS'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerios personales|personal ministries)' THEN 'PERSONAL_MINISTRIES'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerio(s)? de la mujer|women.?s ministr)' THEN 'WOMENS_MINISTRY'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) LIKE '%escuela sabatica%' THEN 'SABBATH_SCHOOL'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(musica|adoracion)' THEN 'WORSHIP_MUSIC'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(diacono|diaconisa)' THEN 'DEACONRY'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(infantil|adolescente|joven)' THEN 'CHILDREN_YOUTH'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) LIKE '%familia%' THEN 'FAMILY'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(comunicacion|publicidad)' THEN 'COMMUNICATION'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) LIKE '%salud%' THEN 'HEALTH'
    WHEN lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(tesoreria|mayordomia)' THEN 'STEWARDSHIP_FINANCE'
    ELSE 'GENERAL'
  END
FROM calendar.departments d
ON CONFLICT(department_id) DO UPDATE SET
  ministry_key=EXCLUDED.ministry_key,
  active=true,
  updated_at=now();

UPDATE department_operations.workspaces w
   SET active=d.active,updated_at=now()
  FROM calendar.departments d
 WHERE d.id=w.department_id AND w.active IS DISTINCT FROM d.active;

CREATE TABLE IF NOT EXISTS audit.audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit.audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit.audit_events(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_created_idx ON audit.audit_events(action,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_created_idx ON audit.audit_events(resource_type,resource_id,created_at DESC);

CREATE OR REPLACE FUNCTION audit.prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los eventos de auditoría son inmutables';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_immutable_update ON audit.audit_events;
CREATE TRIGGER audit_immutable_update BEFORE UPDATE OR DELETE ON audit.audit_events
FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_identity_service') THEN CREATE ROLE gc_identity_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_calendar_service') THEN CREATE ROLE gc_calendar_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_file_service') THEN CREATE ROLE gc_file_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_notification_service') THEN CREATE ROLE gc_notification_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_reports_service') THEN CREATE ROLE gc_reports_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_elders_service') THEN CREATE ROLE gc_elders_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_personal_ministries_service') THEN CREATE ROLE gc_personal_ministries_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_womens_ministry_service') THEN CREATE ROLE gc_womens_ministry_service NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_department_operations_service') THEN CREATE ROLE gc_department_operations_service NOLOGIN; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA identity TO gc_identity_service,gc_calendar_service,gc_file_service,gc_notification_service,gc_reports_service,gc_elders_service,gc_personal_ministries_service;
GRANT USAGE ON SCHEMA calendar TO gc_identity_service,gc_calendar_service,gc_file_service,gc_notification_service,gc_reports_service,gc_elders_service,gc_personal_ministries_service;
GRANT USAGE ON SCHEMA files TO gc_file_service,gc_identity_service;
GRANT USAGE ON SCHEMA notifications TO gc_calendar_service,gc_notification_service,gc_elders_service,gc_personal_ministries_service;
GRANT USAGE ON SCHEMA elders TO gc_elders_service;
GRANT USAGE ON SCHEMA personal_ministries TO gc_personal_ministries_service;
GRANT USAGE ON SCHEMA womens_ministry TO gc_womens_ministry_service;
GRANT USAGE ON SCHEMA department_operations TO gc_department_operations_service;
GRANT USAGE ON SCHEMA identity,calendar,notifications,audit TO gc_womens_ministry_service;
GRANT USAGE ON SCHEMA identity,calendar,files,notifications,audit TO gc_department_operations_service;
GRANT USAGE ON SCHEMA audit TO gc_identity_service,gc_calendar_service,gc_file_service,gc_notification_service,gc_reports_service,gc_elders_service,gc_personal_ministries_service;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO gc_identity_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA identity TO gc_identity_service;
GRANT SELECT ON calendar.departments TO gc_identity_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships TO gc_calendar_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships TO gc_reports_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships TO gc_elders_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships,identity.department_appointments TO gc_personal_ministries_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships,identity.department_appointments TO gc_womens_ministry_service;
GRANT SELECT ON identity.users,identity.sessions,identity.department_memberships,identity.department_appointments TO gc_department_operations_service;
GRANT SELECT ON identity.users,identity.sessions TO gc_file_service,gc_notification_service;
GRANT SELECT ON identity.department_memberships TO gc_file_service;
GRANT SELECT ON identity.church_members TO gc_file_service,gc_womens_ministry_service;
GRANT SELECT ON files.member_photos TO gc_identity_service;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA calendar TO gc_calendar_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA calendar TO gc_calendar_service;
GRANT SELECT ON calendar.activities,calendar.departments TO gc_file_service;
GRANT SELECT ON calendar.activities,calendar.schedule_options,calendar.schedule_sessions TO gc_notification_service;
GRANT SELECT ON ALL TABLES IN SCHEMA calendar TO gc_reports_service;
GRANT SELECT ON calendar.activities,calendar.departments,calendar.schedule_options,calendar.schedule_sessions TO gc_elders_service;
GRANT SELECT ON calendar.activities,calendar.departments,calendar.schedule_options,calendar.schedule_sessions TO gc_personal_ministries_service;
GRANT SELECT ON calendar.activities,calendar.departments,calendar.schedule_options,calendar.schedule_sessions TO gc_womens_ministry_service;
GRANT SELECT ON calendar.activities,calendar.departments,calendar.schedule_options,calendar.schedule_sessions TO gc_department_operations_service;
GRANT SELECT ON files.department_documents,files.file_objects TO gc_department_operations_service;
GRANT SELECT,INSERT ON audit.audit_events TO gc_reports_service;
GRANT SELECT,UPDATE ON calendar.review_sessions,calendar.review_session_participants,calendar.review_session_reminders TO gc_notification_service;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA files TO gc_file_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA files TO gc_file_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA notifications TO gc_notification_service;
GRANT SELECT,INSERT ON notifications.notifications TO gc_elders_service;
GRANT SELECT,INSERT ON notifications.notifications TO gc_personal_ministries_service;
GRANT SELECT,INSERT ON notifications.notifications TO gc_womens_ministry_service;
GRANT SELECT,INSERT ON notifications.notifications TO gc_department_operations_service;
GRANT SELECT ON notifications.notifications,notifications.deliveries,notifications.preferences TO gc_calendar_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA notifications TO gc_notification_service;
GRANT SELECT,INSERT ON audit.audit_events TO gc_identity_service,gc_calendar_service,gc_file_service,gc_notification_service,gc_elders_service,gc_personal_ministries_service;
GRANT SELECT,INSERT ON audit.audit_events TO gc_womens_ministry_service;
GRANT SELECT,INSERT ON audit.audit_events TO gc_department_operations_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA audit TO gc_identity_service,gc_calendar_service,gc_file_service,gc_notification_service,gc_reports_service,gc_elders_service,gc_personal_ministries_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA audit TO gc_womens_ministry_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA audit TO gc_department_operations_service;

ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_identity_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA calendar GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_calendar_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA files GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_file_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_notification_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA elders TO gc_elders_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA elders TO gc_elders_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA elders GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_elders_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA personal_ministries TO gc_personal_ministries_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA personal_ministries TO gc_personal_ministries_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA personal_ministries GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_personal_ministries_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA womens_ministry TO gc_womens_ministry_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA womens_ministry TO gc_womens_ministry_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA womens_ministry GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_womens_ministry_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA department_operations TO gc_department_operations_service;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA department_operations TO gc_department_operations_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA department_operations GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gc_department_operations_service;

${premiumReliabilitySchemaSql}
${attachmentSecuritySql}
${tenantServiceRuntimeGrantsSql}
`;

export async function ensureControlDatabase(adminUrl: string, controlDatabase = 'gestionchurch_control'): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [controlDatabase]);
    if (exists.rowCount === 0) {
      if (!/^[a-z0-9_]+$/.test(controlDatabase)) throw new Error('Nombre de base de control inválido.');
      await admin.query(`CREATE DATABASE ${controlDatabase}`);
    }
  } finally {
    await admin.end();
  }
}

export async function migrateControl(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(controlMigrationSql);
  } finally {
    await pool.end();
  }
}

export async function provisionTenantDatabase(adminUrl: string, tenantId: string, options: { requireNew?: boolean } = {}): Promise<string> {
  if (options.requireNew && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenantId)) {
    throw new Error('Fresh provisioning requires an exact canonical tenant UUID.');
  }
  const databaseName = databaseNameForTenant(tenantId);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (options.requireNew && exists.rowCount !== 0) throw new Error('Fresh tenant database already exists; provisioning refused.');
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  const tenantPool = new Pool({ connectionString: url.toString() });
  try {
    await tenantPool.query(tenantMigrationSql);
  } finally {
    await tenantPool.end();
  }
  return databaseName;
}

/** Never used for runtime routing: only the exact fresh database returned by provisioning. */
export function openTenantBootstrapPool(adminUrl: string, tenantId: string, provisionedDatabaseName: string): Pool {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenantId)
    || provisionedDatabaseName !== databaseNameForTenant(tenantId)) {
    throw new Error('Fresh bootstrap database identity mismatch.');
  }
  const url = new URL(adminUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Fresh bootstrap database URL is invalid.');
  url.pathname = `/${provisionedDatabaseName}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, application_name: 'gestionchurch-fresh-tenant-bootstrap' });
  pool.on('error', () => console.error(JSON.stringify({ level: 'error', event: 'tenant.bootstrap_idle_connection_error' })));
  return pool;
}
