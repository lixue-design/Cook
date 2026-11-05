CREATE FUNCTION cook_basket_add_recipe_items(
  p_owner_id text,
  p_week_start_date date,
  p_basket_id uuid,
  p_recipe_id uuid,
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

  IF EXISTS (
    SELECT 1 FROM shopping_basket_items existing
    WHERE existing.basket_id = target_basket_id
      AND existing.source_refs @> jsonb_build_array(jsonb_build_object(
        'recipeId', p_recipe_id::text,
        'source', 'recipe_detail'
      ))
  ) THEN
    RETURN false;
  END IF;

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
      'manual',
      coalesce(item->'sourceRefs', '[]'::jsonb),
      false,
      coalesce((item->>'sortOrder')::integer, 0)
    );
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION cook_basket_add_recipe_items(text, date, uuid, uuid, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_basket_add_recipe_items(text, date, uuid, uuid, jsonb) TO service_role;
  END IF;
END
$$;
