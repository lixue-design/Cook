REVOKE ALL ON FUNCTION cook_recipe_generation_job_cancel(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_get(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_complete(text, uuid, text, jsonb, jsonb, jsonb, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_create(text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_recipe_generation_job_to_json(recipe_generation_jobs) FROM PUBLIC;

DROP FUNCTION IF EXISTS cook_recipe_generation_job_cancel(text, uuid);
DROP FUNCTION IF EXISTS cook_recipe_generation_job_get(text, uuid);
DROP FUNCTION IF EXISTS cook_recipe_generation_job_complete(text, uuid, text, jsonb, jsonb, jsonb, text, text, integer);
DROP FUNCTION IF EXISTS cook_recipe_generation_job_create(text, uuid, text, text, jsonb, text);
DROP FUNCTION IF EXISTS cook_recipe_generation_job_to_json(recipe_generation_jobs);

DROP TRIGGER IF EXISTS recipe_generation_jobs_set_updated_at ON recipe_generation_jobs;
DROP TABLE IF EXISTS recipe_generation_jobs;
