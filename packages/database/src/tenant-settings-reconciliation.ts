/** Additive control-only schema; never applies configuration, roles or credentials. */
export const tenantSettingsReconciliationSchemaSql = `
CREATE TABLE IF NOT EXISTS control.tenant_settings_updates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES control.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version>0),
  actor_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  database_name text NOT NULL,
  before_name text NOT NULL,
  before_timezone text NOT NULL,
  source_tenant_timezone text NOT NULL,
  desired_name text NOT NULL CHECK(length(desired_name) BETWEEN 3 AND 180),
  desired_timezone text NOT NULL CHECK(length(desired_timezone) BETWEEN 3 AND 80),
  changes_timezone boolean NOT NULL,
  correlation_id text CHECK(length(correlation_id)<=200),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','COMPLETED','CONFLICT','SUPERSEDED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text CHECK(last_error_code ~ '^[A-Z0-9_]{3,80}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(tenant_id,version),
  CHECK((lease_token IS NULL)=(lease_until IS NULL)),
  CHECK(state='PENDING' OR (lease_token IS NULL AND lease_until IS NULL)),
  CHECK((state='COMPLETED')=(completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_settings_updates_one_open_idx
  ON control.tenant_settings_updates(tenant_id) WHERE state IN ('PENDING','CONFLICT');
CREATE INDEX IF NOT EXISTS tenant_settings_updates_due_idx
  ON control.tenant_settings_updates(next_attempt_at,created_at) WHERE state='PENDING';
REVOKE ALL ON control.tenant_settings_updates FROM PUBLIC;
`;
