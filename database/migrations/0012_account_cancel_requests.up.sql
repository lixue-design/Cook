CREATE TABLE account_cancel_requests (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'processing', 'completed', 'rejected', 'cancelled')),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX account_cancel_requests_one_active_owner_uq
  ON account_cancel_requests(owner_id)
  WHERE status IN ('submitted', 'processing');

CREATE TRIGGER account_cancel_requests_set_updated_at
BEFORE UPDATE ON account_cancel_requests
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE FUNCTION cook_account_cancel_request_create(
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
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_create(text, uuid, text) TO service_role;
  END IF;
END
$$;
