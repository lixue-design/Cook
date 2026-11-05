CREATE FUNCTION ai_dish_library_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE canonical_dishes (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PROVISIONAL', 'MERGED')),
  merged_into_id uuid REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  ingredient_signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  method_signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  form_signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT canonical_dishes_merge_state_ck CHECK (
    (status = 'MERGED' AND merged_into_id IS NOT NULL)
    OR (status <> 'MERGED' AND merged_into_id IS NULL)
  ),
  CONSTRAINT canonical_dishes_no_self_merge_ck CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE UNIQUE INDEX canonical_dishes_active_name_uq
  ON canonical_dishes(normalized_name)
  WHERE status = 'ACTIVE';
CREATE INDEX canonical_dishes_status_idx ON canonical_dishes(status, updated_at DESC);
CREATE INDEX canonical_dishes_merged_into_idx ON canonical_dishes(merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE FUNCTION ai_dish_library_validate_merge_redirect()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_status text;
BEGIN
  IF NEW.status = 'MERGED' THEN
    SELECT status INTO target_status
    FROM canonical_dishes
    WHERE id = NEW.merged_into_id
    FOR SHARE;

    IF target_status IS NULL THEN
      RAISE foreign_key_violation USING MESSAGE = 'merge target does not exist';
    END IF;
    IF target_status = 'MERGED' THEN
      RAISE check_violation USING MESSAGE = 'merge target must not be merged';
    END IF;
    IF EXISTS (
      SELECT 1 FROM canonical_dishes
      WHERE merged_into_id = NEW.id AND id <> NEW.id
    ) THEN
      RAISE check_violation USING MESSAGE = 'a merge target cannot itself be redirected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER canonical_dishes_validate_merge_redirect
BEFORE INSERT OR UPDATE OF status, merged_into_id ON canonical_dishes
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_validate_merge_redirect();

CREATE TRIGGER canonical_dishes_set_updated_at
BEFORE UPDATE ON canonical_dishes
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE dish_aliases (
  id uuid PRIMARY KEY,
  canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  raw_name text NOT NULL CHECK (length(btrim(raw_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  locale text NOT NULL DEFAULT 'zh-CN' CHECK (length(btrim(locale)) > 0),
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX dish_aliases_canonical_name_locale_uq
  ON dish_aliases(canonical_dish_id, normalized_name, locale);
CREATE INDEX dish_aliases_lookup_idx ON dish_aliases(normalized_name, locale);

CREATE TABLE dish_assets (
  id uuid PRIMARY KEY,
  canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PENDING', 'READY', 'FAILED', 'RETIRED')),
  provider text NOT NULL DEFAULT 'DOUBAO_SEEDREAM',
  provider_model text,
  storage_key text,
  mime_type text,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  content_digest text,
  prompt_version text,
  prompt_digest text,
  is_current boolean NOT NULL DEFAULT false,
  failure_code text,
  failure_summary text,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT dish_assets_id_canonical_uq UNIQUE (id, canonical_dish_id),
  CONSTRAINT dish_assets_ready_metadata_ck CHECK (
    status <> 'READY'
    OR (
      storage_key IS NOT NULL
      AND length(btrim(storage_key)) > 0
      AND mime_type IS NOT NULL
      AND width IS NOT NULL
      AND height IS NOT NULL
    )
  ),
  CONSTRAINT dish_assets_current_ready_ck CHECK (NOT is_current OR status = 'READY')
);

CREATE UNIQUE INDEX dish_assets_storage_key_uq ON dish_assets(storage_key) WHERE storage_key IS NOT NULL;
CREATE UNIQUE INDEX dish_assets_one_current_uq ON dish_assets(canonical_dish_id) WHERE is_current;
CREATE INDEX dish_assets_dish_status_idx ON dish_assets(canonical_dish_id, status, created_at DESC);

CREATE TRIGGER dish_assets_set_updated_at
BEFORE UPDATE ON dish_assets
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE recipes (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL CHECK (length(btrim(owner_id)) > 0),
  raw_name text NOT NULL CHECK (length(btrim(raw_name)) > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  cover_mode text NOT NULL DEFAULT 'FOLLOW_LIBRARY'
    CHECK (cover_mode IN ('FOLLOW_LIBRARY', 'PINNED_ASSET', 'CUSTOM')),
  pinned_asset_id uuid,
  custom_cover_storage_key text,
  category_id text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  calories_kcal integer CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
  main_ingredients text NOT NULL DEFAULT '',
  side_ingredients text NOT NULL DEFAULT '',
  seasonings text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CONSTRAINT recipes_pinned_asset_fk
    FOREIGN KEY (pinned_asset_id, canonical_dish_id)
    REFERENCES dish_assets(id, canonical_dish_id)
    ON DELETE RESTRICT,
  CONSTRAINT recipes_cover_mode_ck CHECK (
    (cover_mode = 'FOLLOW_LIBRARY' AND pinned_asset_id IS NULL AND custom_cover_storage_key IS NULL)
    OR (cover_mode = 'PINNED_ASSET' AND pinned_asset_id IS NOT NULL AND custom_cover_storage_key IS NULL)
    OR (
      cover_mode = 'CUSTOM'
      AND pinned_asset_id IS NULL
      AND custom_cover_storage_key IS NOT NULL
      AND length(btrim(custom_cover_storage_key)) > 0
    )
  )
);

CREATE INDEX recipes_owner_updated_idx ON recipes(owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX recipes_owner_name_idx ON recipes(owner_id, normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX recipes_canonical_idx ON recipes(canonical_dish_id) WHERE deleted_at IS NULL;
CREATE INDEX recipes_pinned_asset_idx ON recipes(pinned_asset_id) WHERE pinned_asset_id IS NOT NULL;

CREATE TRIGGER recipes_set_updated_at
BEFORE UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE normalization_decisions (
  id uuid PRIMARY KEY,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  raw_name text NOT NULL CHECK (length(btrim(raw_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  decision text NOT NULL CHECK (
    decision IN ('REUSED', 'PROVISIONAL_CREATED', 'ADMIN_ASSIGNED', 'MERGED_REDIRECT')
  ),
  selected_canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  top_candidate_id uuid REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  runner_up_candidate_id uuid REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  top_confidence numeric(6,5) CHECK (top_confidence IS NULL OR top_confidence BETWEEN 0 AND 1),
  runner_up_confidence numeric(6,5) CHECK (runner_up_confidence IS NULL OR runner_up_confidence BETWEEN 0 AND 1),
  score_margin numeric(6,5) CHECK (score_margin IS NULL OR score_margin BETWEEN 0 AND 1),
  ingredient_conflict boolean NOT NULL DEFAULT false,
  method_conflict boolean NOT NULL DEFAULT false,
  form_conflict boolean NOT NULL DEFAULT false,
  rule_version text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT normalization_candidates_distinct_ck CHECK (
    runner_up_candidate_id IS NULL OR runner_up_candidate_id IS DISTINCT FROM top_candidate_id
  )
);

CREATE INDEX normalization_decisions_recipe_idx ON normalization_decisions(recipe_id, created_at DESC);
CREATE INDEX normalization_decisions_selected_idx
  ON normalization_decisions(selected_canonical_dish_id, created_at DESC);
CREATE INDEX normalization_decisions_provisional_idx
  ON normalization_decisions(created_at DESC)
  WHERE decision = 'PROVISIONAL_CREATED';

CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY,
  canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  job_key text NOT NULL CHECK (length(btrim(job_key)) > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  prompt_version text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  asset_id uuid,
  last_error_code text,
  last_error_summary text,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT generation_jobs_asset_fk
    FOREIGN KEY (asset_id, canonical_dish_id)
    REFERENCES dish_assets(id, canonical_dish_id)
    ON DELETE RESTRICT,
  CONSTRAINT generation_jobs_attempts_ck CHECK (attempt_count <= max_attempts),
  CONSTRAINT generation_jobs_lease_ck CHECK (
    status <> 'RUNNING' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT generation_jobs_success_asset_ck CHECK (status <> 'SUCCEEDED' OR asset_id IS NOT NULL)
);

CREATE UNIQUE INDEX generation_jobs_active_key_uq
  ON generation_jobs(job_key)
  WHERE status IN ('PENDING', 'RUNNING');
CREATE INDEX generation_jobs_claim_idx
  ON generation_jobs(priority, available_at, created_at)
  WHERE status = 'PENDING';
CREATE INDEX generation_jobs_dish_idx ON generation_jobs(canonical_dish_id, created_at DESC);

CREATE TRIGGER generation_jobs_set_updated_at
BEFORE UPDATE ON generation_jobs
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE generation_attempts (
  id uuid PRIMARY KEY,
  generation_job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED', 'ABANDONED')),
  provider text NOT NULL DEFAULT 'DOUBAO_SEEDREAM',
  provider_request_id text,
  request_digest text,
  response_digest text,
  error_code text,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT generation_attempts_job_number_uq UNIQUE (generation_job_id, attempt_number),
  CONSTRAINT generation_attempts_finished_ck CHECK (
    (status = 'STARTED' AND finished_at IS NULL)
    OR (status <> 'STARTED' AND finished_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX generation_attempts_provider_request_uq
  ON generation_attempts(provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX generation_attempts_job_started_idx
  ON generation_attempts(generation_job_id, started_at DESC);

CREATE TABLE asset_usage_events (
  id uuid PRIMARY KEY,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  canonical_dish_id uuid NOT NULL REFERENCES canonical_dishes(id) ON DELETE RESTRICT,
  asset_id uuid,
  event_type text NOT NULL CHECK (
    event_type IN ('RESOLVED', 'PINNED', 'UNPINNED', 'CUSTOM_SELECTED', 'LIBRARY_UPDATED')
  ),
  cover_mode text NOT NULL CHECK (cover_mode IN ('FOLLOW_LIBRARY', 'PINNED_ASSET', 'CUSTOM')),
  storage_key_snapshot text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT asset_usage_events_asset_fk
    FOREIGN KEY (asset_id, canonical_dish_id)
    REFERENCES dish_assets(id, canonical_dish_id)
    ON DELETE RESTRICT,
  CONSTRAINT asset_usage_events_mode_asset_ck CHECK (
    cover_mode <> 'PINNED_ASSET' OR asset_id IS NOT NULL
  )
);

CREATE INDEX asset_usage_events_recipe_idx ON asset_usage_events(recipe_id, created_at DESC);
CREATE INDEX asset_usage_events_asset_idx ON asset_usage_events(asset_id, created_at DESC) WHERE asset_id IS NOT NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  aggregate_type text NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  published_at timestamptz,
  last_error_summary text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT outbox_events_lease_ck CHECK (
    status <> 'PROCESSING' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT outbox_events_published_ck CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);

CREATE INDEX outbox_events_claim_idx
  ON outbox_events(available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TRIGGER outbox_events_set_updated_at
BEFORE UPDATE ON outbox_events
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE admin_audit_logs (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id uuid,
  request_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX admin_audit_logs_entity_idx
  ON admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX admin_audit_logs_actor_idx ON admin_audit_logs(actor_id, created_at DESC);
