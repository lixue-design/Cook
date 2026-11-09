ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_one_recipe_per_meal_uq;

CREATE OR REPLACE FUNCTION cook_plan_add_recipe(
  p_owner_id text,
  p_date date,
  p_meal_type text,
  p_recipe_id uuid,
  p_plan_recipe_id uuid,
  p_sort_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  selected_recipe recipes%ROWTYPE;
  target_plan_id uuid;
  resolved_sort_order integer;
  snapshot jsonb;
BEGIN
  IF p_meal_type NOT IN ('breakfast', 'lunch', 'dinner') THEN
    RAISE EXCEPTION 'invalid meal type' USING ERRCODE = '22023';
  END IF;
  IF p_sort_order IS NOT NULL AND p_sort_order < 0 THEN
    RAISE EXCEPTION 'sort order must not be negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO selected_recipe
  FROM recipes
  WHERE id = p_recipe_id AND owner_id = p_owner_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO meal_plans (
    id, owner_id, plan_date, week_start_date, meal_type
  ) VALUES (
    gen_random_uuid(),
    p_owner_id,
    p_date,
    p_date - (extract(isodow FROM p_date)::integer - 1),
    p_meal_type
  )
  ON CONFLICT (owner_id, plan_date, meal_type)
  DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_plan_id;

  IF p_sort_order IS NULL THEN
    SELECT coalesce(max(sort_order) + 1, 0) INTO resolved_sort_order
    FROM meal_plan_recipes WHERE meal_plan_id = target_plan_id;
  ELSE
    resolved_sort_order := p_sort_order;
  END IF;

  snapshot := jsonb_build_object(
    'originalRecipeId', selected_recipe.id,
    'name', selected_recipe.display_name,
    'coverStorageKey', selected_recipe.custom_cover_storage_key,
    'cookTimeMinutes', selected_recipe.duration_minutes,
    'caloriesKcal', selected_recipe.calories_kcal,
    'ingredients', jsonb_build_array(
      jsonb_build_object('group', 'main', 'display', selected_recipe.main_ingredients),
      jsonb_build_object('group', 'side', 'display', selected_recipe.side_ingredients),
      jsonb_build_object('group', 'seasoning', 'display', selected_recipe.seasonings)
    ),
    'steps', selected_recipe.steps
  );

  INSERT INTO meal_plan_recipes (
    id, meal_plan_id, recipe_id, recipe_snapshot, sort_order, source
  ) VALUES (
    p_plan_recipe_id, target_plan_id, p_recipe_id, snapshot, resolved_sort_order, 'manual'
  );

  RETURN jsonb_build_object(
    'id', p_plan_recipe_id,
    'recipeId', p_recipe_id,
    'source', 'manual',
    'sortOrder', resolved_sort_order,
    'recipeSnapshot', snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_add_recipe(text, date, text, uuid, uuid, integer) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_add_recipe(text, date, text, uuid, uuid, integer) TO service_role;
  END IF;
END
$migration$;
