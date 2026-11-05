CREATE TABLE meal_plans (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  plan_date date NOT NULL,
  week_start_date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT meal_plans_owner_date_meal_uq UNIQUE (owner_id, plan_date, meal_type)
);

CREATE INDEX meal_plans_owner_week_idx
  ON meal_plans(owner_id, week_start_date, plan_date, meal_type);

CREATE TRIGGER meal_plans_set_updated_at
BEFORE UPDATE ON meal_plans
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE meal_plan_recipes (
  id uuid PRIMARY KEY,
  meal_plan_id uuid NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_snapshot jsonb NOT NULL CHECK (jsonb_typeof(recipe_snapshot) = 'object'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'generated')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX meal_plan_recipes_plan_sort_idx
  ON meal_plan_recipes(meal_plan_id, sort_order, created_at, id);

CREATE TRIGGER meal_plan_recipes_set_updated_at
BEFORE UPDATE ON meal_plan_recipes
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE FUNCTION cook_plan_get_day(p_owner_id text, p_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'id', meal.meal_type,
    'name', meal.meal_name,
    'recipes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'recipeId', item.recipe_id,
        'source', item.source,
        'sortOrder', item.sort_order,
        'recipeSnapshot', item.recipe_snapshot
      ) ORDER BY item.sort_order, item.created_at, item.id)
      FROM meal_plans plan
      JOIN meal_plan_recipes item ON item.meal_plan_id = plan.id
      WHERE plan.owner_id = p_owner_id
        AND plan.plan_date = p_date
        AND plan.meal_type = meal.meal_type
    ), '[]'::jsonb)
  ) ORDER BY meal.ordinal)
  FROM (VALUES
    ('breakfast', '早餐', 1),
    ('lunch', '午餐', 2),
    ('dinner', '晚餐', 3)
  ) AS meal(meal_type, meal_name, ordinal);
$$;

CREATE FUNCTION cook_plan_add_recipe(
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

CREATE FUNCTION cook_plan_remove_recipe(
  p_owner_id text,
  p_date date,
  p_meal_type text,
  p_plan_recipe_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
BEGIN
  DELETE FROM meal_plan_recipes item
  USING meal_plans plan
  WHERE item.id = p_plan_recipe_id
    AND item.meal_plan_id = plan.id
    AND plan.owner_id = p_owner_id
    AND plan.plan_date = p_date
    AND plan.meal_type = p_meal_type;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_get_day(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_plan_add_recipe(text, date, text, uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_plan_remove_recipe(text, date, text, uuid) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_get_day(text, date) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_plan_add_recipe(text, date, text, uuid, uuid, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_plan_remove_recipe(text, date, text, uuid) TO service_role;
  END IF;
END
$migration$;
