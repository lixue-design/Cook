ALTER TABLE account_cancel_requests
  DROP CONSTRAINT IF EXISTS account_cancel_requests_status_check;

UPDATE account_cancel_requests
SET status = 'cancelled_by_user'
WHERE status = 'cancelled';

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_status_check
  CHECK (status IN (
    'submitted',
    'reviewing',
    'approved',
    'processing',
    'completed',
    'rejected',
    'cancelled_by_user',
    'failed'
  ));

DROP INDEX IF EXISTS account_cancel_requests_one_active_owner_uq;
CREATE UNIQUE INDEX account_cancel_requests_one_active_owner_uq
  ON account_cancel_requests(owner_id)
  WHERE status IN ('submitted', 'reviewing', 'approved', 'processing');

CREATE TABLE account_cancel_audit_logs (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES account_cancel_requests(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_id text NOT NULL DEFAULT '',
  from_status text,
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX account_cancel_audit_logs_request_created_idx
  ON account_cancel_audit_logs(request_id, created_at, id);

CREATE OR REPLACE FUNCTION cook_account_cancel_request_create(
  p_owner_id text,
  p_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  existing account_cancel_requests%ROWTYPE;
  created account_cancel_requests%ROWTYPE;
BEGIN
  IF length(coalesce(p_reason, '')) > 500 THEN
    RAISE EXCEPTION 'reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM account_cancel_requests request
  WHERE request.owner_id = p_owner_id
    AND request.status IN ('submitted', 'reviewing', 'approved', 'processing')
  ORDER BY request.submitted_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', existing.id,
      'status', existing.status,
      'submittedAt', existing.submitted_at,
      'updatedAt', existing.updated_at
    );
  END IF;

  INSERT INTO account_cancel_requests (id, owner_id, reason, status)
  VALUES (p_request_id, p_owner_id, btrim(coalesce(p_reason, '')), 'submitted')
  RETURNING * INTO created;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(), created.id, p_owner_id, 'user', p_owner_id, null, 'submitted', 'user submitted cancel request'
  );

  RETURN jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'submittedAt', created.submitted_at,
    'updatedAt', created.updated_at
  );
END;
$$;

CREATE FUNCTION cook_account_cancel_request_get(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'id', request.id,
    'status', request.status,
    'reason', request.reason,
    'submittedAt', request.submitted_at,
    'updatedAt', request.updated_at
  )
  FROM account_cancel_requests request
  WHERE request.owner_id = p_owner_id
  ORDER BY request.submitted_at DESC
  LIMIT 1;
$$;

CREATE FUNCTION cook_account_cancel_request_cancel(
  p_owner_id text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target account_cancel_requests%ROWTYPE;
  updated account_cancel_requests%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM account_cancel_requests request
  WHERE request.owner_id = p_owner_id
    AND (p_request_id IS NULL OR request.id = p_request_id)
    AND request.status IN ('submitted', 'reviewing', 'approved', 'processing')
  ORDER BY request.submitted_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF target.status NOT IN ('submitted', 'reviewing') THEN
    RAISE EXCEPTION 'cancel request cannot be cancelled by user in current state' USING ERRCODE = '22023';
  END IF;

  UPDATE account_cancel_requests
  SET status = 'cancelled_by_user'
  WHERE id = target.id
  RETURNING * INTO updated;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(), updated.id, p_owner_id, 'user', p_owner_id, target.status, 'cancelled_by_user', 'user cancelled request'
  );

  RETURN jsonb_build_object(
    'id', updated.id,
    'status', updated.status,
    'submittedAt', updated.submitted_at,
    'updatedAt', updated.updated_at
  );
END;
$$;

CREATE FUNCTION cook_account_cancel_request_transition(
  p_request_id uuid,
  p_actor_id text,
  p_to_status text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target account_cancel_requests%ROWTYPE;
  updated account_cancel_requests%ROWTYPE;
BEGIN
  IF p_to_status NOT IN ('reviewing', 'approved', 'processing', 'completed', 'rejected', 'failed') THEN
    RAISE EXCEPTION 'invalid target status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target
  FROM account_cancel_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    (target.status = 'submitted' AND p_to_status IN ('reviewing', 'rejected'))
    OR (target.status = 'reviewing' AND p_to_status IN ('approved', 'rejected'))
    OR (target.status = 'approved' AND p_to_status IN ('processing', 'rejected'))
    OR (target.status = 'processing' AND p_to_status IN ('completed', 'failed'))
    OR (target.status = 'failed' AND p_to_status = 'processing')
  ) THEN
    RAISE EXCEPTION 'invalid cancel request state transition' USING ERRCODE = '22023';
  END IF;

  UPDATE account_cancel_requests
  SET status = p_to_status
  WHERE id = target.id
  RETURNING * INTO updated;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(),
    updated.id,
    updated.owner_id,
    'admin',
    btrim(coalesce(p_actor_id, 'admin-api')),
    target.status,
    p_to_status,
    left(coalesce(p_note, ''), 1000)
  );

  RETURN jsonb_build_object(
    'id', updated.id,
    'ownerId', updated.owner_id,
    'status', updated.status,
    'submittedAt', updated.submitted_at,
    'updatedAt', updated.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION cook_account_cancel_request_create(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_cancel(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_transition(uuid, text, text, text) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_create(text, uuid, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_get(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_cancel(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_transition(uuid, text, text, text) TO service_role;
  END IF;
END
$migration$;
