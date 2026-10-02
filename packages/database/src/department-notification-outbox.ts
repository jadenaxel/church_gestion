/** Additive domain-owned schema only. Uses the existing department schema ACL;
 * contains no data synchronization, grants, credentials or cross-domain writes. */
export const departmentNotificationOutboxSchemaSql = `
CREATE TABLE IF NOT EXISTS department_operations.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token uuid,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_notification_outbox_pending_idx
  ON department_operations.notification_outbox(next_attempt_at,created_at)
  WHERE delivered_at IS NULL;
`;
