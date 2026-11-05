REVOKE ALL ON FUNCTION cook_plan_preferences_upsert(text, boolean, text, text, text, jsonb, jsonb, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_plan_preferences_get(text) FROM PUBLIC;

DROP FUNCTION IF EXISTS cook_plan_preferences_upsert(text, boolean, text, text, text, jsonb, jsonb, integer, integer, integer);
DROP FUNCTION IF EXISTS cook_plan_preferences_get(text);

DROP TRIGGER IF EXISTS plan_preferences_set_updated_at ON plan_preferences;
DROP TABLE IF EXISTS plan_preferences;
