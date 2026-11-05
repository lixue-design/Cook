\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  required_table text;
  target_schema text := current_schema();
  required_tables text[] := ARRAY[
    'recipes', 'canonical_dishes', 'dish_aliases', 'normalization_decisions', 'dish_assets',
    'generation_jobs', 'generation_attempts', 'asset_usage_events', 'outbox_events', 'admin_audit_logs',
    'app_users', 'recipe_categories'
  ];
BEGIN
  FOREACH required_table IN ARRAY required_tables LOOP
    IF to_regclass(format('%I.%I', target_schema, required_table)) IS NULL THEN
      RAISE EXCEPTION 'missing required table: %', required_table;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = 'generation_jobs_active_key_uq'
  ) THEN
    RAISE EXCEPTION 'missing active generation job unique index';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = 'dish_assets_one_current_uq'
  ) THEN
    RAISE EXCEPTION 'missing current asset unique index';
  END IF;
END;
$$;

ROLLBACK;
