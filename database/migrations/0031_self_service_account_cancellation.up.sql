-- Self-service account cancellation: a user gets a seven-day withdrawal
-- window, then a timer-triggered server job performs the irreversible cleanup.
-- The timer never receives a user supplied owner id; it claims only due rows.

ALTER TABLE account_cancel_requests
  ADD COLUMN IF NOT EXISTS scheduled_delete_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

ALTER TABLE account_cancel_requests
  DROP CONSTRAINT IF EXISTS account_cancel_requests_status_check;

UPDATE account_cancel_requests
SET status = 'cooling_off',
    scheduled_delete_at = coalesce(scheduled_delete_at, clock_timestamp() + interval '7 days'),
    retry_after = null,
    last_error_code = null,
    last_error_at = null
WHERE status IN ('submitted', 'reviewing', 'approved');

UPDATE account_cancel_requests
SET status = 'retrying',
    scheduled_delete_at = coalesce(scheduled_delete_at, clock_timestamp() + interval '7 days'),
    retry_after = coalesce(retry_after, clock_timestamp())
WHERE status IN ('processing', 'failed');

-- Earlier versions could already contain completed records without this
-- timestamp. Backfill them before adding the consistency constraint.
UPDATE account_cancel_requests
SET completed_at = coalesce(completed_at, updated_at, submitted_at, clock_timestamp())
WHERE status = 'completed';

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_status_check
  CHECK (status IN ('cooling_off', 'processing', 'retrying', 'completed', 'rejected', 'cancelled_by_user'));

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_cooling_off_schedule_ck
  CHECK (
    (status = 'cooling_off' AND scheduled_delete_at IS NOT NULL)
    OR status <> 'cooling_off'
  );

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_completed_at_ck
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR status <> 'completed'
  );

DROP INDEX IF EXISTS account_cancel_requests_one_active_owner_uq;
CREATE UNIQUE INDEX account_cancel_requests_one_active_owner_uq
  ON account_cancel_requests(owner_id)
  WHERE status IN ('cooling_off', 'processing', 'retrying');

CREATE INDEX account_cancel_requests_due_cleanup_idx
  ON account_cancel_requests(status, scheduled_delete_at, retry_after, submitted_at)
  WHERE status IN ('cooling_off', 'retrying');

-- This is deliberately not linked to app_users. It is a minimal, non-content
-- record that a deletion job completed after the original account is gone.
CREATE TABLE account_cancel_tombstones (
  request_id uuid PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deletion_summary jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(deletion_summary) = 'object')
);

CREATE OR REPLACE FUNCTION cook_account_cancel_request_json(request account_cancel_requests)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'id', request.id,
    'status', request.status,
    'submittedAt', request.submitted_at,
    'scheduledDeleteAt', request.scheduled_delete_at,
    'deletionStartedAt', request.deletion_started_at,
    'completedAt', request.completed_at,
    'retryCount', request.retry_count,
    'updatedAt', request.updated_at
  );
$$;

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
    AND request.status IN ('cooling_off', 'processing', 'retrying')
  ORDER BY request.submitted_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN cook_account_cancel_request_json(existing);
  END IF;

  INSERT INTO account_cancel_requests (
    id, owner_id, reason, status, scheduled_delete_at
  ) VALUES (
    p_request_id,
    p_owner_id,
    btrim(coalesce(p_reason, '')),
    'cooling_off',
    clock_timestamp() + interval '7 days'
  )
  RETURNING * INTO created;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(), created.id, p_owner_id, 'user', p_owner_id, null, 'cooling_off',
    'user confirmed self-service account cancellation'
  );

  RETURN cook_account_cancel_request_json(created);
END;
$$;

CREATE OR REPLACE FUNCTION cook_account_cancel_request_get(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT cook_account_cancel_request_json(request)
  FROM account_cancel_requests request
  WHERE request.owner_id = p_owner_id
  ORDER BY request.submitted_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION cook_account_cancel_request_cancel(
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
    AND request.status = 'cooling_off'
  ORDER BY request.submitted_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE account_cancel_requests
  SET status = 'cancelled_by_user',
      scheduled_delete_at = null,
      retry_after = null
  WHERE id = target.id
  RETURNING * INTO updated;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(), updated.id, updated.owner_id, 'user', updated.owner_id,
    target.status, updated.status, 'user withdrew self-service cancellation'
  );

  RETURN cook_account_cancel_request_json(updated);
END;
$$;

-- Atomically claim a bounded batch. A failed worker may safely claim a
-- retrying request again after its backoff time.
CREATE FUNCTION cook_account_cancel_claim_due(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH due AS (
    SELECT request.id
    FROM account_cancel_requests request
    WHERE (
      request.status = 'cooling_off'
      AND request.scheduled_delete_at <= clock_timestamp()
    ) OR (
      request.status = 'retrying'
      AND request.retry_after <= clock_timestamp()
    )
    ORDER BY request.scheduled_delete_at, request.submitted_at
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  ), claimed AS (
    UPDATE account_cancel_requests request
    SET status = 'processing',
        deletion_started_at = coalesce(request.deletion_started_at, clock_timestamp()),
        retry_after = null
    FROM due
    WHERE request.id = due.id
    RETURNING request.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'requestId', claimed.id,
    'ownerId', claimed.owner_id,
    'coverStorageKeys', coalesce((
      SELECT jsonb_agg(recipe.custom_cover_storage_key)
      FROM recipes recipe
      WHERE recipe.owner_id = claimed.owner_id
        AND recipe.custom_cover_storage_key IS NOT NULL
    ), '[]'::jsonb)
  ) ORDER BY claimed.submitted_at), '[]'::jsonb)
  INTO result
  FROM claimed;

  RETURN result;
END;
$$;

-- The storage worker calls this only after cover files have been removed.
-- The SQL body is one transaction, so business rows are never half-deleted.
CREATE FUNCTION cook_account_cancel_finalize_deletion(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target account_cancel_requests%ROWTYPE;
  removed_recipes integer := 0;
  removed_plans integer := 0;
  removed_baskets integer := 0;
BEGIN
  SELECT * INTO target
  FROM account_cancel_requests request
  WHERE request.id = p_request_id
    AND request.status = 'processing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN EXISTS (SELECT 1 FROM account_cancel_tombstones WHERE request_id = p_request_id);
  END IF;

  SELECT count(*) INTO removed_recipes FROM recipes WHERE owner_id = target.owner_id;
  SELECT count(*) INTO removed_plans FROM meal_plans WHERE owner_id = target.owner_id;
  SELECT count(*) INTO removed_baskets FROM shopping_baskets WHERE owner_id = target.owner_id;

  INSERT INTO account_cancel_tombstones (request_id, completed_at, deletion_summary)
  VALUES (
    target.id,
    clock_timestamp(),
    jsonb_build_object(
      'recipeCount', removed_recipes,
      'mealPlanCount', removed_plans,
      'basketCount', removed_baskets,
      'accountDataDeleted', true
    )
  )
  ON CONFLICT (request_id) DO NOTHING;

  DELETE FROM asset_usage_events usage
  USING recipes recipe
  WHERE usage.recipe_id = recipe.id
    AND recipe.owner_id = target.owner_id;
  DELETE FROM normalization_decisions decision
  USING recipes recipe
  WHERE decision.recipe_id = recipe.id
    AND recipe.owner_id = target.owner_id;
  DELETE FROM recipes WHERE owner_id = target.owner_id;
  DELETE FROM meal_plans WHERE owner_id = target.owner_id;
  DELETE FROM shopping_baskets WHERE owner_id = target.owner_id;
  DELETE FROM recipe_categories WHERE owner_id = target.owner_id;

  -- These shared library records may be referenced by other recipes. Keep the
  -- shared content but remove the deleted account from provenance fields.
  UPDATE canonical_dishes
  SET created_by = CASE WHEN created_by = target.owner_id THEN 'deleted_user' ELSE created_by END,
      updated_by = CASE WHEN updated_by = target.owner_id THEN 'deleted_user' ELSE updated_by END
  WHERE created_by = target.owner_id OR updated_by = target.owner_id;
  UPDATE dish_aliases
  SET created_by = 'deleted_user'
  WHERE created_by = target.owner_id;
  UPDATE dish_assets
  SET created_by = CASE WHEN created_by = target.owner_id THEN 'deleted_user' ELSE created_by END,
      updated_by = CASE WHEN updated_by = target.owner_id THEN 'deleted_user' ELSE updated_by END
  WHERE created_by = target.owner_id OR updated_by = target.owner_id;
  UPDATE generation_jobs
  SET created_by = CASE WHEN created_by = target.owner_id THEN 'deleted_user' ELSE created_by END,
      updated_by = CASE WHEN updated_by = target.owner_id THEN 'deleted_user' ELSE updated_by END
  WHERE created_by = target.owner_id OR updated_by = target.owner_id;

  DELETE FROM account_cancel_requests WHERE id = target.id;
  DELETE FROM app_users WHERE id = target.owner_id;
  RETURN true;
END;
$$;

CREATE FUNCTION cook_account_cancel_mark_retry(
  p_request_id uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target account_cancel_requests%ROWTYPE;
  next_retry timestamptz;
BEGIN
  SELECT * INTO target
  FROM account_cancel_requests request
  WHERE request.id = p_request_id
    AND request.status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  next_retry := clock_timestamp() + CASE
    WHEN target.retry_count < 1 THEN interval '15 minutes'
    WHEN target.retry_count < 3 THEN interval '1 hour'
    ELSE interval '24 hours'
  END;

  UPDATE account_cancel_requests
  SET status = 'retrying',
      retry_count = retry_count + 1,
      retry_after = next_retry,
      last_error_code = left(btrim(coalesce(p_error_code, 'UNKNOWN')), 80),
      last_error_at = clock_timestamp()
  WHERE id = target.id;

  INSERT INTO account_cancel_audit_logs (
    id, request_id, owner_id, actor_type, actor_id, from_status, to_status, note
  ) VALUES (
    gen_random_uuid(), target.id, target.owner_id, 'system', 'account-cancel-timer',
    'processing', 'retrying', 'automatic deletion retry scheduled'
  );
  RETURN true;
END;
$$;

-- Existing callers now pass p_create=false. Only an explicit, confirmed login
-- can create a fresh account after a completed cancellation.
CREATE FUNCTION ai_dish_library_ensure_user(
  p_user_id text,
  p_wx_appid text,
  p_wx_openid text,
  p_wx_unionid text,
  p_create boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  resolved app_users%ROWTYPE;
BEGIN
  SELECT * INTO resolved
  FROM app_users
  WHERE wx_appid = p_wx_appid AND wx_openid = p_wx_openid
  FOR UPDATE;

  IF FOUND THEN
    IF resolved.status <> 'active' THEN
      RAISE EXCEPTION 'account is not active' USING ERRCODE = '42501';
    END IF;
    IF nullif(btrim(coalesce(p_wx_unionid, '')), '') IS NOT NULL
       AND resolved.wx_unionid IS DISTINCT FROM btrim(p_wx_unionid) THEN
      UPDATE app_users SET wx_unionid = btrim(p_wx_unionid) WHERE id = resolved.id;
    END IF;
    RETURN resolved.id;
  END IF;

  IF NOT coalesce(p_create, false) THEN
    RETURN NULL;
  END IF;

  INSERT INTO app_users (id, wx_appid, wx_openid, wx_unionid)
  VALUES (
    p_user_id,
    btrim(p_wx_appid),
    btrim(p_wx_openid),
    nullif(btrim(coalesce(p_wx_unionid, '')), '')
  )
  RETURNING * INTO resolved;
  RETURN resolved.id;
END;
$$;

REVOKE ALL ON FUNCTION cook_account_cancel_request_json(account_cancel_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_create(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_request_cancel(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_claim_due(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_finalize_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_account_cancel_mark_retry(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_ensure_user(text, text, text, text, boolean) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_create(text, uuid, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_get(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_request_cancel(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_claim_due(integer) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_finalize_deletion(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_account_cancel_mark_retry(uuid, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_ensure_user(text, text, text, text, boolean) TO service_role;
  END IF;
END
$migration$;
