CREATE FUNCTION cook_plan_generation_candidates(p_owner_id text)
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

CREATE FUNCTION cook_plan_generate_week(
  p_owner_id text,
  p_week_start_date date,
  p_overwrite boolean,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  entry jsonb;
  entry_date date;
  entry_meal_type text;
  entry_id uuid;
  entry_recipe_id uuid;
  target_plan_id uuid;
  selected_recipe recipes%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF extract(isodow FROM p_week_start_date) <> 1 THEN
    RAISE EXCEPTION 'week start date must be Monday' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_entries, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'week entries must be an array' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id || ':' || p_week_start_date::text, 0));
  IF EXISTS (
    SELECT 1 FROM meal_plans
    WHERE owner_id = p_owner_id
      AND plan_date BETWEEN p_week_start_date AND p_week_start_date + 6
  ) AND NOT p_overwrite THEN
    RETURN jsonb_build_object('conflict', true);
  END IF;

  IF p_overwrite THEN
    DELETE FROM meal_plans
    WHERE owner_id = p_owner_id
      AND plan_date BETWEEN p_week_start_date AND p_week_start_date + 6;
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    entry_date := (entry->>'date')::date;
    entry_meal_type := entry->>'mealType';
    entry_id := (entry->>'id')::uuid;
    IF entry_date < p_week_start_date OR entry_date > p_week_start_date + 6 THEN
      RAISE EXCEPTION 'entry date is outside requested week' USING ERRCODE = '22023';
    END IF;
    IF entry_meal_type NOT IN ('breakfast', 'lunch', 'dinner') THEN
      RAISE EXCEPTION 'invalid meal type' USING ERRCODE = '22023';
    END IF;

    entry_recipe_id := nullif(entry->>'recipeId', '')::uuid;
    IF entry_recipe_id IS NOT NULL THEN
      SELECT * INTO selected_recipe
      FROM recipes
      WHERE id = entry_recipe_id AND owner_id = p_owner_id AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'recipe is unavailable' USING ERRCODE = '22023';
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
    ELSE
      snapshot := entry->'builtinSnapshot';
      IF jsonb_typeof(snapshot) <> 'object'
         OR coalesce((snapshot->>'builtin')::boolean, false) IS NOT TRUE
         OR length(btrim(coalesce(snapshot->>'name', ''))) = 0 THEN
        RAISE EXCEPTION 'invalid builtin snapshot' USING ERRCODE = '22023';
      END IF;
    END IF;

    INSERT INTO meal_plans(id, owner_id, plan_date, week_start_date, meal_type)
    VALUES (gen_random_uuid(), p_owner_id, entry_date, p_week_start_date, entry_meal_type)
    ON CONFLICT (owner_id, plan_date, meal_type)
    DO UPDATE SET updated_at = clock_timestamp()
    RETURNING id INTO target_plan_id;

    INSERT INTO meal_plan_recipes(
      id, meal_plan_id, recipe_id, recipe_snapshot, sort_order, source
    ) VALUES (
      entry_id,
      target_plan_id,
      entry_recipe_id,
      snapshot,
      coalesce((entry->>'sortOrder')::integer, 0),
      'generated'
    );
  END LOOP;

  RETURN jsonb_build_object('conflict', false, 'written', jsonb_array_length(p_entries));
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_generation_candidates(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_plan_generate_week(text, date, boolean, jsonb) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_generation_candidates(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_plan_generate_week(text, date, boolean, jsonb) TO service_role;
  END IF;
END
$migration$;
