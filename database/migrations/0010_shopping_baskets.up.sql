CREATE TABLE shopping_baskets (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  week_start_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT shopping_baskets_owner_week_uq UNIQUE (owner_id, week_start_date)
);

CREATE INDEX shopping_baskets_owner_week_idx
  ON shopping_baskets(owner_id, week_start_date DESC);

CREATE TRIGGER shopping_baskets_set_updated_at
BEFORE UPDATE ON shopping_baskets
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE shopping_basket_items (
  id uuid PRIMARY KEY,
  basket_id uuid NOT NULL REFERENCES shopping_baskets(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL DEFAULT '其他' CHECK (category IN ('主料', '辅料', '调料', '其他')),
  amount numeric,
  amount_text text NOT NULL DEFAULT '',
  unit text,
  source text NOT NULL CHECK (source IN ('plan', 'manual')),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  checked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX shopping_basket_items_basket_sort_idx
  ON shopping_basket_items(basket_id, category, checked, sort_order, created_at, id);

CREATE TRIGGER shopping_basket_items_set_updated_at
BEFORE UPDATE ON shopping_basket_items
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE FUNCTION cook_basket_get_week(p_owner_id text, p_week_start_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT jsonb_build_object(
    'id', basket.id,
    'weekStartDate', p_week_start_date,
    'lastSyncedAt', basket.last_synced_at,
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'category', item.category,
        'amount', item.amount,
        'amountText', item.amount_text,
        'unit', item.unit,
        'source', item.source,
        'sourceRefs', item.source_refs,
        'checked', item.checked,
        'sortOrder', item.sort_order
      ) ORDER BY item.category, item.checked, item.sort_order, item.created_at, item.id)
      FROM shopping_basket_items item WHERE item.basket_id = basket.id
    ), '[]'::jsonb)
  )
  FROM shopping_baskets basket
  WHERE basket.owner_id = p_owner_id AND basket.week_start_date = p_week_start_date
  UNION ALL
  SELECT jsonb_build_object(
    'id', NULL,
    'weekStartDate', p_week_start_date,
    'lastSyncedAt', NULL,
    'items', '[]'::jsonb
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM shopping_baskets
    WHERE owner_id = p_owner_id AND week_start_date = p_week_start_date
  )
  LIMIT 1;
$$;

CREATE FUNCTION cook_basket_plan_snapshots(p_owner_id text, p_week_start_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'planRecipeId', item.id,
    'date', plan.plan_date,
    'mealType', plan.meal_type,
    'recipeSnapshot', item.recipe_snapshot
  ) ORDER BY plan.plan_date, plan.meal_type, item.sort_order, item.id), '[]'::jsonb)
  FROM meal_plans plan
  JOIN meal_plan_recipes item ON item.meal_plan_id = plan.id
  WHERE plan.owner_id = p_owner_id
    AND plan.plan_date BETWEEN p_week_start_date AND p_week_start_date + 6;
$$;

CREATE FUNCTION cook_basket_replace_plan_items(
  p_owner_id text,
  p_week_start_date date,
  p_basket_id uuid,
  p_items jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  target_basket_id uuid;
  item jsonb;
BEGIN
  IF jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'basket items must be an array' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id || ':basket:' || p_week_start_date::text, 0));
  INSERT INTO shopping_baskets(id, owner_id, week_start_date)
  VALUES (p_basket_id, p_owner_id, p_week_start_date)
  ON CONFLICT (owner_id, week_start_date)
  DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_basket_id;

  DELETE FROM shopping_basket_items
  WHERE basket_id = target_basket_id AND source = 'plan';

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO shopping_basket_items(
      id, basket_id, name, category, amount, amount_text, unit,
      source, source_refs, checked, sort_order
    ) VALUES (
      (item->>'id')::uuid,
      target_basket_id,
      btrim(item->>'name'),
      coalesce(nullif(item->>'category', ''), '其他'),
      nullif(item->>'amount', '')::numeric,
      coalesce(item->>'amountText', ''),
      nullif(item->>'unit', ''),
      'plan',
      coalesce(item->'sourceRefs', '[]'::jsonb),
      false,
      coalesce((item->>'sortOrder')::integer, 0)
    );
  END LOOP;
  UPDATE shopping_baskets SET last_synced_at = clock_timestamp() WHERE id = target_basket_id;
  RETURN true;
END;
$$;

CREATE FUNCTION cook_basket_create_manual_item(
  p_owner_id text,
  p_week_start_date date,
  p_basket_id uuid,
  p_item_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  target_basket_id uuid;
  result jsonb;
BEGIN
  INSERT INTO shopping_baskets(id, owner_id, week_start_date)
  VALUES (p_basket_id, p_owner_id, p_week_start_date)
  ON CONFLICT (owner_id, week_start_date)
  DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_basket_id;
  INSERT INTO shopping_basket_items(
    id, basket_id, name, category, amount, amount_text, unit, source, sort_order
  ) VALUES (
    p_item_id,
    target_basket_id,
    btrim(p_payload->>'name'),
    coalesce(nullif(p_payload->>'category', ''), '其他'),
    nullif(p_payload->>'amount', '')::numeric,
    coalesce(p_payload->>'amountText', ''),
    nullif(p_payload->>'unit', ''),
    'manual',
    coalesce((p_payload->>'sortOrder')::integer, 0)
  )
  RETURNING jsonb_build_object(
    'id', id, 'name', name, 'category', category, 'amount', amount,
    'amountText', amount_text, 'unit', unit, 'source', source,
    'sourceRefs', source_refs, 'checked', checked, 'sortOrder', sort_order
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION cook_basket_update_item(p_owner_id text, p_item_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE result jsonb;
BEGIN
  UPDATE shopping_basket_items item
  SET name = CASE WHEN p_payload ? 'name' THEN btrim(p_payload->>'name') ELSE item.name END,
      category = CASE WHEN p_payload ? 'category' THEN p_payload->>'category' ELSE item.category END,
      amount = CASE WHEN p_payload ? 'amount' THEN nullif(p_payload->>'amount', '')::numeric ELSE item.amount END,
      amount_text = CASE WHEN p_payload ? 'amountText' THEN coalesce(p_payload->>'amountText', '') ELSE item.amount_text END,
      unit = CASE WHEN p_payload ? 'unit' THEN nullif(p_payload->>'unit', '') ELSE item.unit END,
      checked = CASE WHEN p_payload ? 'checked' THEN (p_payload->>'checked')::boolean ELSE item.checked END,
      sort_order = CASE WHEN p_payload ? 'sortOrder' THEN (p_payload->>'sortOrder')::integer ELSE item.sort_order END
  FROM shopping_baskets basket
  WHERE item.id = p_item_id AND item.basket_id = basket.id AND basket.owner_id = p_owner_id
  RETURNING jsonb_build_object(
    'id', item.id, 'name', item.name, 'category', item.category, 'amount', item.amount,
    'amountText', item.amount_text, 'unit', item.unit, 'source', item.source,
    'sourceRefs', item.source_refs, 'checked', item.checked, 'sortOrder', item.sort_order
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION cook_basket_delete_item(p_owner_id text, p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
BEGIN
  DELETE FROM shopping_basket_items item
  USING shopping_baskets basket
  WHERE item.id = p_item_id AND item.basket_id = basket.id AND basket.owner_id = p_owner_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION cook_basket_check_all(
  p_owner_id text,
  p_week_start_date date,
  p_checked boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE affected integer;
BEGIN
  UPDATE shopping_basket_items item SET checked = p_checked
  FROM shopping_baskets basket
  WHERE item.basket_id = basket.id
    AND basket.owner_id = p_owner_id
    AND basket.week_start_date = p_week_start_date;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION cook_basket_get_week(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_plan_snapshots(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_replace_plan_items(text, date, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_create_manual_item(text, date, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_update_item(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_delete_item(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_check_all(text, date, boolean) FROM PUBLIC;

DO $migration$
DECLARE routine record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOR routine IN
      SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = current_schema() AND p.proname LIKE 'cook_basket_%'
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', routine.signature);
    END LOOP;
  END IF;
END
$migration$;
