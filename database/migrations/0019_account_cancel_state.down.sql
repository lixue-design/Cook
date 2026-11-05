DROP FUNCTION IF EXISTS cook_account_cancel_request_transition(uuid, text, text, text);
DROP FUNCTION IF EXISTS cook_account_cancel_request_cancel(text, uuid);
DROP FUNCTION IF EXISTS cook_account_cancel_request_get(text);

DROP TABLE IF EXISTS account_cancel_audit_logs;

ALTER TABLE account_cancel_requests
  DROP CONSTRAINT IF EXISTS account_cancel_requests_status_check;

UPDATE account_cancel_requests
SET status = 'cancelled'
WHERE status = 'cancelled_by_user';

UPDATE account_cancel_requests
SET status = 'processing'
WHERE status IN ('reviewing', 'approved', 'failed');

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_status_check
  CHECK (status IN ('submitted', 'processing', 'completed', 'rejected', 'cancelled'));

DROP INDEX IF EXISTS account_cancel_requests_one_active_owner_uq;
CREATE UNIQUE INDEX account_cancel_requests_one_active_owner_uq
  ON account_cancel_requests(owner_id)
  WHERE status IN ('submitted', 'processing');

CREATE OR REPLACE FUNCTION cook_account_cancel_request_create(
  p_owner_id text,
  p_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  result jsonb;
BEGIN
  IF length(coalesce(p_reason, '')) > 500 THEN
    RAISE EXCEPTION 'reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', request.id,
    'status', request.status,
    'submittedAt', request.submitted_at
  ) INTO result
  FROM account_cancel_requests request
  WHERE request.owner_id = p_owner_id
    AND request.status IN ('submitted', 'processing')
  ORDER BY request.submitted_at DESC
  LIMIT 1;

  IF result IS NOT NULL THEN RETURN result; END IF;

  INSERT INTO account_cancel_requests (id, owner_id, reason)
  VALUES (p_request_id, p_owner_id, btrim(coalesce(p_reason, '')))
  RETURNING jsonb_build_object(
    'id', id,
    'status', status,
    'submittedAt', submitted_at
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION cook_account_cancel_request_create(text, uuid, text) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_create(text, uuid, text) TO service_role;
  END IF;
END
$migration$;
