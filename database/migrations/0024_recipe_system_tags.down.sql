CREATE OR REPLACE FUNCTION cook_plan_generation_candidates(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', recipe.id,
    'name', recipe.display_name,
    'durationMinutes', recipe.duration_minutes,
    'caloriesKcal', recipe.calories_kcal,
    'coverStorageKey', recipe.custom_cover_storage_key,
    'mainIngredients', recipe.main_ingredients,
    'sideIngredients', recipe.side_ingredients,
    'seasonings', recipe.seasonings,
    'steps', recipe.steps
  ) ORDER BY recipe.updated_at DESC, recipe.id), '[]'::jsonb)
  FROM recipes recipe
  WHERE recipe.owner_id = p_owner_id AND recipe.deleted_at IS NULL;
$$;

DROP TRIGGER IF EXISTS recipes_assign_system_tags ON recipes;
DROP FUNCTION IF EXISTS cook_recipe_assign_system_tags();
DROP FUNCTION IF EXISTS cook_recipe_build_system_tags(text, text, text, text, jsonb, text, integer);
ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_system_tags_object_ck,
  DROP COLUMN IF EXISTS system_tags;

REVOKE ALL ON FUNCTION cook_plan_generation_candidates(text) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_generation_candidates(text) TO service_role;
  END IF;
END
$migration$;
