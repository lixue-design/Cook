CREATE TABLE recipe_generation_jobs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('link', 'image', 'text')),
  provider text NOT NULL CHECK (provider IN ('rules', 'ai')),
  input_payload jsonb NOT NULL CHECK (jsonb_typeof(input_payload) = 'object'),
  status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  result_draft jsonb CHECK (result_draft IS NULL OR jsonb_typeof(result_draft) = 'object'),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  explanations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(explanations) = 'array'),
  error_code text,
  error_message text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  cost_units integer NOT NULL DEFAULT 0 CHECK (cost_units >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT recipe_generation_jobs_completed_ck CHECK (
    (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    OR (status IN ('pending', 'running') AND completed_at IS NULL)
  ),
  CONSTRAINT recipe_generation_jobs_success_ck CHECK (
    status <> 'succeeded' OR (result_draft IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
  ),
  CONSTRAINT recipe_generation_jobs_failure_ck CHECK (
    status <> 'failed' OR (error_code IS NOT NULL AND error_message IS NOT NULL)
  )
);

CREATE INDEX recipe_generation_jobs_owner_created_idx
  ON recipe_generation_jobs(owner_id, created_at DESC);

CREATE INDEX recipe_generation_jobs_owner_status_idx
  ON recipe_generation_jobs(owner_id, status, created_at DESC);

CREATE UNIQUE INDEX recipe_generation_jobs_request_uq
  ON recipe_generation_jobs(request_id);

CREATE TRIGGER recipe_generation_jobs_set_updated_at
BEFORE UPDATE ON recipe_generation_jobs
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE FUNCTION cook_recipe_generation_job_to_json(p_job recipe_generation_jobs)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'jobId', p_job.id,
    'status', p_job.status,
    'sourceType', p_job.source_type,
    'provider', p_job.provider,
    'input', p_job.input_payload,
    'resultDraft', p_job.result_draft,
    'warnings', p_job.warnings,
    'explanations', p_job.explanations,
    'error', CASE
      WHEN p_job.error_code IS NULL THEN NULL
      ELSE jsonb_build_object('code', p_job.error_code, 'message', p_job.error_message)
    END,
    'requestId', p_job.request_id,
    'costUnits', p_job.cost_units,
    'createdAt', p_job.created_at,
    'updatedAt', p_job.updated_at,
    'completedAt', p_job.completed_at
  );
$$;

CREATE FUNCTION cook_recipe_generation_job_create(
  p_owner_id text,
  p_job_id uuid,
  p_source_type text,
  p_provider text,
  p_input_payload jsonb,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  created_job recipe_generation_jobs%ROWTYPE;
BEGIN
  IF p_source_type NOT IN ('link', 'image', 'text') OR p_provider NOT IN ('rules', 'ai') THEN
    RAISE EXCEPTION 'invalid generation job type' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_input_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid generation input' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_request_id, ''))) = 0 THEN
    RAISE EXCEPTION 'request id is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO recipe_generation_jobs (
    id,
    owner_id,
    source_type,
    provider,
    input_payload,
    status,
    request_id
  ) VALUES (
    p_job_id,
    p_owner_id,
    p_source_type,
    p_provider,
    p_input_payload,
    'running',
    btrim(p_request_id)
  )
  RETURNING * INTO created_job;

  RETURN cook_recipe_generation_job_to_json(created_job);
END;
$$;

CREATE FUNCTION cook_recipe_generation_job_complete(
  p_owner_id text,
  p_job_id uuid,
  p_status text,
  p_result_draft jsonb,
  p_warnings jsonb,
  p_explanations jsonb,
  p_error_code text,
  p_error_message text,
  p_cost_units integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  updated_job recipe_generation_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid completion status' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_warnings, 'null'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_explanations, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid generation metadata' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'succeeded' AND jsonb_typeof(coalesce(p_result_draft, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'result draft is required' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'failed'
     AND (length(btrim(coalesce(p_error_code, ''))) = 0 OR length(btrim(coalesce(p_error_message, ''))) = 0) THEN
    RAISE EXCEPTION 'generation error is required' USING ERRCODE = '22023';
  END IF;

  UPDATE recipe_generation_jobs
  SET status = p_status,
      result_draft = CASE WHEN p_status = 'succeeded' THEN p_result_draft ELSE NULL END,
      warnings = p_warnings,
      explanations = p_explanations,
      error_code = CASE WHEN p_status = 'failed' THEN btrim(p_error_code) ELSE NULL END,
      error_message = CASE WHEN p_status = 'failed' THEN btrim(p_error_message) ELSE NULL END,
      cost_units = coalesce(p_cost_units, 0),
      completed_at = clock_timestamp()
  WHERE owner_id = p_owner_id
    AND id = p_job_id
    AND status IN ('pending', 'running')
  RETURNING * INTO updated_job;

  IF updated_job.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN cook_recipe_generation_job_to_json(updated_job);
END;
$$;

CREATE FUNCTION cook_recipe_generation_job_get(p_owner_id text, p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT cook_recipe_generation_job_to_json(job)
  FROM recipe_generation_jobs job
  WHERE job.owner_id = p_owner_id
    AND job.id = p_job_id;
$$;

CREATE FUNCTION cook_recipe_generation_job_cancel(p_owner_id text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target_job recipe_generation_jobs%ROWTYPE;
BEGIN
  UPDATE recipe_generation_jobs
  SET status = 'cancelled',
      error_code = NULL,
      error_message = NULL,
      completed_at = clock_timestamp()
  WHERE owner_id = p_owner_id
    AND id = p_job_id
    AND status IN ('pending', 'running')
  RETURNING * INTO target_job;

  IF target_job.id IS NOT NULL THEN
    RETURN cook_recipe_generation_job_to_json(target_job);
  END IF;

  SELECT * INTO target_job
  FROM recipe_generation_jobs
  WHERE owner_id = p_owner_id
    AND id = p_job_id;

  IF target_job.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN cook_recipe_generation_job_to_json(target_job);
END;
$$;

REVOKE ALL ON FUNCTION cook_recipe_generation_job_to_json(recipe_generation_jobs) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_create(text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_complete(text, uuid, text, jsonb, jsonb, jsonb, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_get(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_cancel(text, uuid) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_to_json(recipe_generation_jobs) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_create(text, uuid, text, text, jsonb, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_complete(text, uuid, text, jsonb, jsonb, jsonb, text, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_get(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_cancel(text, uuid) TO service_role;
  END IF;
END
$migration$;
