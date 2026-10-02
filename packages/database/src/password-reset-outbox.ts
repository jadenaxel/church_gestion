/** Additive identity-owned DDL. No business data, grants, credentials or synchronization. */
export const passwordResetOutboxSchemaSql = `
CREATE TABLE IF NOT EXISTS identity.password_reset_outbox (
  id uuid PRIMARY KEY,
  reset_token_id uuid NOT NULL UNIQUE REFERENCES identity.password_reset_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  payload_ciphertext text,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token uuid,
  accepted_at timestamptz,
  retired_at timestamptz,
  terminal_reason text CHECK(terminal_reason IN ('TOKEN_EXPIRED','TOKEN_USED','ACCOUNT_INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(payload_ciphertext IS NOT NULL OR accepted_at IS NOT NULL OR retired_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS password_reset_outbox_pending_idx
  ON identity.password_reset_outbox(next_attempt_at,created_at)
  WHERE accepted_at IS NULL AND retired_at IS NULL;
`;
