-- Detail-page additions must retain all recipe sources in the same week. When
-- one same-name source omits its amount and the other has a numeric unit, show
-- the combined display text without inventing a quantity for the omitted one.
UPDATE shopping_basket_items
SET normalized_name = lower(regexp_replace(btrim(name), '[[:space:]　]+', ' ', 'g'))
WHERE normalized_name = '';

CREATE OR REPLACE FUNCTION cook_basket_add_recipe_items(
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
  entry jsonb;
  existing shopping_basket_items%ROWTYPE;
  entry_name text;
  entry_normalized_name text;
  entry_amount numeric;
  entry_amount_text text;
  entry_unit text;
  entry_is_unmeasured boolean;
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
    SELECT 1 FROM shopping_basket_items item
    WHERE item.basket_id = target_basket_id
      AND item.source_refs @> jsonb_build_array(jsonb_build_object(
        'recipeId', p_recipe_id::text,
        'source', 'recipe_detail'
      ))
  ) THEN
    RETURN false;
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    entry_name := btrim(entry->>'name');
    entry_normalized_name := lower(regexp_replace(entry_name, '[[:space:]　]+', ' ', 'g'));
    entry_amount := nullif(entry->>'amount', '')::numeric;
    entry_amount_text := coalesce(entry->>'amountText', '');
    entry_unit := nullif(btrim(entry->>'unit'), '');
    entry_is_unmeasured := entry_amount IS NULL AND entry_unit IS NULL AND entry_amount_text = '';

    SELECT item.* INTO existing
    FROM shopping_basket_items item
    WHERE item.basket_id = target_basket_id
      AND item.normalized_name = entry_normalized_name
      AND (
        (entry_amount IS NOT NULL AND item.amount IS NOT NULL AND item.unit = entry_unit)
        OR (entry_amount IS NOT NULL AND item.amount IS NULL AND coalesce(item.amount_text, '') IN ('', '无用量'))
        OR (entry_is_unmeasured AND item.amount IS NOT NULL)
        OR (entry_is_unmeasured AND item.amount IS NULL AND coalesce(item.amount_text, '') IN ('', '无用量'))
      )
    ORDER BY item.created_at, item.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO shopping_basket_items(
        id, basket_id, name, normalized_name, category, amount, amount_text, unit,
        source, source_refs, checked, sort_order
      ) VALUES (
        (entry->>'id')::uuid, target_basket_id, entry_name, entry_normalized_name,
        coalesce(nullif(entry->>'category', ''), '其他'), entry_amount,
        CASE WHEN entry_is_unmeasured THEN '无用量' ELSE entry_amount_text END,
        entry_unit, 'manual', coalesce(entry->'sourceRefs', '[]'::jsonb), false,
        coalesce((entry->>'sortOrder')::integer, 0)
      );
    ELSIF entry_amount IS NOT NULL AND existing.amount IS NOT NULL THEN
      UPDATE shopping_basket_items
      SET amount = existing.amount + entry_amount,
          amount_text = CASE
            WHEN existing.amount_text LIKE '无用量+%' THEN '无用量+' || (existing.amount + entry_amount)::text || existing.unit
            ELSE (existing.amount + entry_amount)::text || existing.unit
          END,
          source_refs = existing.source_refs || coalesce(entry->'sourceRefs', '[]'::jsonb)
      WHERE id = existing.id;
    ELSIF entry_amount IS NOT NULL THEN
      UPDATE shopping_basket_items
      SET amount = entry_amount,
          unit = entry_unit,
          amount_text = '无用量+' || entry_amount::text || entry_unit,
          source_refs = existing.source_refs || coalesce(entry->'sourceRefs', '[]'::jsonb)
      WHERE id = existing.id;
    ELSIF existing.amount IS NOT NULL THEN
      UPDATE shopping_basket_items
      SET amount_text = '无用量+' || existing.amount::text || existing.unit,
          source_refs = existing.source_refs || coalesce(entry->'sourceRefs', '[]'::jsonb)
      WHERE id = existing.id;
    ELSE
      UPDATE shopping_basket_items
      SET amount_text = '无用量',
          source_refs = existing.source_refs || coalesce(entry->'sourceRefs', '[]'::jsonb)
      WHERE id = existing.id;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION cook_basket_add_recipe_items(text, date, uuid, uuid, jsonb) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_basket_add_recipe_items(text, date, uuid, uuid, jsonb) TO service_role;
  END IF;
END
$migration$;
