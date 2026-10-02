export const attachmentSecuritySql = `
-- Serialize attachment writes with activity approval without calendar UPDATE grants.
CREATE OR REPLACE FUNCTION files.lock_activity_for_attachment(activity_id uuid)
RETURNS TABLE(department_id uuid,status text,created_by uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT a.department_id,a.status,a.created_by FROM calendar.activities a
  WHERE a.id=activity_id FOR UPDATE OF a
$$;
REVOKE ALL ON FUNCTION files.lock_activity_for_attachment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION files.lock_activity_for_attachment(uuid) TO gc_file_service;
`;
