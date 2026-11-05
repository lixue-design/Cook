CREATE FUNCTION cook_plan_clone_day(
  p_owner_id text,
  p_source_date date,
  p_target_date date,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  source_item record;
  target_plan_id uuid;
  next_sort_order integer;
  source_count integer := 0;
  cloned_count integer := 0;
BEGIN
  IF p_mode NOT IN ('replace', 'merge') THEN
    RAISE EXCEPTION 'invalid clone mode' USING ERRCODE = '22023';
  END IF;
  IF p_source_date = p_target_date THEN
    RAISE EXCEPTION 'source and target dates must differ' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO source_count
  FROM meal_plans plan
  JOIN meal_plan_recipes item ON item.meal_plan_id = plan.id
  WHERE plan.owner_id = p_owner_id
    AND plan.plan_date = p_source_date;

  IF p_mode = 'replace' THEN
    DELETE FROM meal_plans
    WHERE owner_id = p_owner_id
      AND plan_date = p_target_date;
  END IF;

  FOR source_item IN
    SELECT
      plan.meal_type,
      item.recipe_id,
      item.recipe_snapshot,
      item.sort_order,
      item.source,
      item.created_at,
      item.id
    FROM meal_plans plan
    JOIN meal_plan_recipes item ON item.meal_plan_id = plan.id
    WHERE plan.owner_id = p_owner_id
      AND plan.plan_date = p_source_date
    ORDER BY
      CASE plan.meal_type
        WHEN 'breakfast' THEN 1
        WHEN 'lunch' THEN 2
        ELSE 3
      END,
      item.sort_order,
      item.created_at,
      item.id
  LOOP
    INSERT INTO meal_plans(id, owner_id, plan_date, week_start_date, meal_type)
    VALUES (
      gen_random_uuid(),
      p_owner_id,
      p_target_date,
      p_target_date - (extract(isodow FROM p_target_date)::integer - 1),
      source_item.meal_type
    )
    ON CONFLICT (owner_id, plan_date, meal_type)
    DO UPDATE SET updated_at = clock_timestamp()
    RETURNING id INTO target_plan_id;

    IF p_mode = 'merge' THEN
      SELECT coalesce(max(sort_order) + 1, 0) INTO next_sort_order
      FROM meal_plan_recipes
      WHERE meal_plan_id = target_plan_id;
    ELSE
      next_sort_order := source_item.sort_order;
    END IF;

    INSERT INTO meal_plan_recipes (
      id, meal_plan_id, recipe_id, recipe_snapshot, sort_order, source
    ) VALUES (
      gen_random_uuid(),
      target_plan_id,
      source_item.recipe_id,
      source_item.recipe_snapshot,
      next_sort_order,
      source_item.source
    );
    cloned_count := cloned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sourceDate', p_source_date,
    'targetDate', p_target_date,
    'mode', p_mode,
    'sourceCount', source_count,
    'clonedCount', cloned_count,
    'day', cook_plan_get_day(p_owner_id, p_target_date)
  );
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_clone_day(text, date, date, text) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_clone_day(text, date, date, text) TO service_role;
  END IF;
END
$migration$;
