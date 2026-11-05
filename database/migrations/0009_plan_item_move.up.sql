CREATE FUNCTION cook_plan_move_recipe(
  p_owner_id text,
  p_plan_recipe_id uuid,
  p_target_date date,
  p_target_meal_type text,
  p_target_sort_order integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  source_item meal_plan_recipes%ROWTYPE;
  target_plan_id uuid;
BEGIN
  IF p_target_meal_type NOT IN ('breakfast', 'lunch', 'dinner')
     OR p_target_sort_order < 0 THEN
    RAISE EXCEPTION 'invalid move target' USING ERRCODE = '22023';
  END IF;

  SELECT item.* INTO source_item
  FROM meal_plan_recipes item
  JOIN meal_plans plan ON plan.id = item.meal_plan_id
  WHERE item.id = p_plan_recipe_id AND plan.owner_id = p_owner_id
  FOR UPDATE OF item;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO meal_plans(id, owner_id, plan_date, week_start_date, meal_type)
  VALUES (
    gen_random_uuid(),
    p_owner_id,
    p_target_date,
    p_target_date - (extract(isodow FROM p_target_date)::integer - 1),
    p_target_meal_type
  )
  ON CONFLICT (owner_id, plan_date, meal_type)
  DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_plan_id;

  UPDATE meal_plan_recipes
  SET sort_order = sort_order + 1
  WHERE meal_plan_id = target_plan_id
    AND id <> p_plan_recipe_id
    AND sort_order >= p_target_sort_order;

  UPDATE meal_plan_recipes
  SET meal_plan_id = target_plan_id,
      sort_order = p_target_sort_order
  WHERE id = p_plan_recipe_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_move_recipe(text, uuid, date, text, integer) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_move_recipe(text, uuid, date, text, integer) TO service_role;
  END IF;
END
$migration$;
