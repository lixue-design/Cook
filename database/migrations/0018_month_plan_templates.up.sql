CREATE TABLE month_plan_templates (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  source_month text NOT NULL CHECK (source_month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX month_plan_templates_owner_created_idx
  ON month_plan_templates(owner_id, created_at DESC, id);

CREATE TRIGGER month_plan_templates_set_updated_at
BEFORE UPDATE ON month_plan_templates
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE month_plan_template_items (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES month_plan_templates(id) ON DELETE CASCADE,
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid,
  recipe_snapshot jsonb NOT NULL CHECK (jsonb_typeof(recipe_snapshot) = 'object'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'generated')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX month_plan_template_items_template_day_idx
  ON month_plan_template_items(template_id, day_of_month, meal_type, sort_order, created_at, id);

CREATE FUNCTION cook_month_plan_template_create(
  p_owner_id text,
  p_template_id uuid,
  p_name text,
  p_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  month_start date;
  next_month date;
  item_count integer;
  template_row month_plan_templates%ROWTYPE;
BEGIN
  IF p_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid month' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) = 0 OR length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'invalid template name' USING ERRCODE = '22023';
  END IF;

  month_start := (p_month || '-01')::date;
  next_month := month_start + interval '1 month';

  INSERT INTO month_plan_templates(id, owner_id, name, source_month)
  VALUES (p_template_id, p_owner_id, btrim(p_name), p_month)
  RETURNING * INTO template_row;

  INSERT INTO month_plan_template_items (
    id, template_id, day_of_month, meal_type, recipe_id, recipe_snapshot, sort_order, source
  )
  SELECT
    gen_random_uuid(),
    p_template_id,
    extract(day FROM plan.plan_date)::integer,
    plan.meal_type,
    item.recipe_id,
    item.recipe_snapshot,
    item.sort_order,
    item.source
  FROM meal_plans plan
  JOIN meal_plan_recipes item ON item.meal_plan_id = plan.id
  WHERE plan.owner_id = p_owner_id
    AND plan.plan_date >= month_start
    AND plan.plan_date < next_month
  ORDER BY plan.plan_date, plan.meal_type, item.sort_order, item.created_at, item.id;

  GET DIAGNOSTICS item_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', template_row.id,
    'name', template_row.name,
    'sourceMonth', template_row.source_month,
    'itemCount', item_count,
    'createdAt', template_row.created_at,
    'updatedAt', template_row.updated_at
  );
END;
$$;

CREATE FUNCTION cook_month_plan_template_list(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', template.id,
    'name', template.name,
    'sourceMonth', template.source_month,
    'itemCount', (
      SELECT count(*) FROM month_plan_template_items item
      WHERE item.template_id = template.id
    ),
    'createdAt', template.created_at,
    'updatedAt', template.updated_at
  ) ORDER BY template.created_at DESC, template.id), '[]'::jsonb)
  FROM month_plan_templates template
  WHERE template.owner_id = p_owner_id;
$$;

CREATE FUNCTION cook_month_plan_template_delete(
  p_owner_id text,
  p_template_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  DELETE FROM month_plan_templates
  WHERE id = p_template_id
    AND owner_id = p_owner_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION cook_month_plan_template_apply(
  p_owner_id text,
  p_template_id uuid,
  p_target_month text,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  template_row month_plan_templates%ROWTYPE;
  template_item record;
  target_month_start date;
  next_month date;
  days_in_target_month integer;
  target_date date;
  target_plan_id uuid;
  next_sort_order integer;
  copied_recipe_id uuid;
  source_item_count integer := 0;
  applied_count integer := 0;
BEGIN
  IF p_target_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid target month' USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('replace', 'merge') THEN
    RAISE EXCEPTION 'invalid template apply mode' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO template_row
  FROM month_plan_templates
  WHERE id = p_template_id
    AND owner_id = p_owner_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  target_month_start := (p_target_month || '-01')::date;
  next_month := target_month_start + interval '1 month';
  days_in_target_month := extract(day FROM (next_month - interval '1 day'))::integer;

  SELECT count(*) INTO source_item_count
  FROM month_plan_template_items
  WHERE template_id = p_template_id;

  IF p_mode = 'replace' THEN
    DELETE FROM meal_plans
    WHERE owner_id = p_owner_id
      AND plan_date >= target_month_start
      AND plan_date < next_month;
  END IF;

  FOR template_item IN
    SELECT *
    FROM month_plan_template_items
    WHERE template_id = p_template_id
      AND day_of_month <= days_in_target_month
    ORDER BY day_of_month, meal_type, sort_order, created_at, id
  LOOP
    target_date := target_month_start + (template_item.day_of_month - 1);

    INSERT INTO meal_plans(id, owner_id, plan_date, week_start_date, meal_type)
    VALUES (
      gen_random_uuid(),
      p_owner_id,
      target_date,
      target_date - (extract(isodow FROM target_date)::integer - 1),
      template_item.meal_type
    )
    ON CONFLICT (owner_id, plan_date, meal_type)
    DO UPDATE SET updated_at = clock_timestamp()
    RETURNING id INTO target_plan_id;

    IF p_mode = 'merge' THEN
      SELECT coalesce(max(sort_order) + 1, 0) INTO next_sort_order
      FROM meal_plan_recipes
      WHERE meal_plan_id = target_plan_id;
    ELSE
      next_sort_order := template_item.sort_order;
    END IF;

    SELECT recipe.id INTO copied_recipe_id
    FROM recipes recipe
    WHERE recipe.id = template_item.recipe_id
      AND recipe.owner_id = p_owner_id
      AND recipe.deleted_at IS NULL;

    INSERT INTO meal_plan_recipes (
      id, meal_plan_id, recipe_id, recipe_snapshot, sort_order, source
    ) VALUES (
      gen_random_uuid(),
      target_plan_id,
      copied_recipe_id,
      template_item.recipe_snapshot,
      next_sort_order,
      template_item.source
    );
    applied_count := applied_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'templateId', template_row.id,
    'targetMonth', p_target_month,
    'mode', p_mode,
    'sourceItemCount', source_item_count,
    'appliedCount', applied_count
  );
END;
$$;

REVOKE ALL ON FUNCTION cook_month_plan_template_create(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_month_plan_template_list(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_month_plan_template_delete(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_month_plan_template_apply(text, uuid, text, text) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_month_plan_template_create(text, uuid, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_month_plan_template_list(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_month_plan_template_delete(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_month_plan_template_apply(text, uuid, text, text) TO service_role;
  END IF;
END
$migration$;
