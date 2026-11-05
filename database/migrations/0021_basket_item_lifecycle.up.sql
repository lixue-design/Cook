-- Basket items are now merged by a normalized ingredient name. Amount text remains
-- descriptive only: this migration intentionally performs no numeric aggregation.
ALTER TABLE shopping_basket_items
  ADD COLUMN normalized_name text,
  ADD COLUMN pending_sort_order integer;

UPDATE shopping_basket_items
SET normalized_name = lower(regexp_replace(btrim(name), '[[:space:]　]+', ' ', 'g'))
WHERE normalized_name IS NULL;

ALTER TABLE shopping_basket_items
  ALTER COLUMN normalized_name SET NOT NULL;

ALTER TABLE shopping_basket_items
  ALTER COLUMN normalized_name SET DEFAULT '';

CREATE INDEX shopping_basket_items_basket_normalized_name_idx
  ON shopping_basket_items(basket_id, normalized_name);

CREATE OR REPLACE FUNCTION cook_basket_create_manual_item(
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
  existing_id uuid;
  result jsonb;
BEGIN
  IF length(btrim(coalesce(p_payload->>'name', ''))) = 0
    OR length(btrim(coalesce(p_payload->>'normalizedName', ''))) = 0 THEN
    RAISE EXCEPTION 'ingredient name is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id || ':basket:' || p_week_start_date::text, 0));
  INSERT INTO shopping_baskets(id, owner_id, week_start_date)
  VALUES (p_basket_id, p_owner_id, p_week_start_date)
  ON CONFLICT (owner_id, week_start_date) DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_basket_id;

  SELECT id INTO existing_id FROM shopping_basket_items
  WHERE basket_id = target_basket_id AND normalized_name = p_payload->>'normalizedName'
  ORDER BY created_at, id LIMIT 1 FOR UPDATE;

  IF existing_id IS NOT NULL THEN
    UPDATE shopping_basket_items SET sort_order = sort_order + 1
    WHERE basket_id = target_basket_id AND checked = false;
    UPDATE shopping_basket_items
    SET name = btrim(p_payload->>'name'), checked = false, sort_order = 0, pending_sort_order = NULL
    WHERE id = existing_id
    RETURNING jsonb_build_object('id', id, 'name', name, 'checked', checked, 'sortOrder', sort_order) INTO result;
    RETURN result;
  END IF;

  UPDATE shopping_basket_items SET sort_order = sort_order + 1
  WHERE basket_id = target_basket_id AND checked = false;
  INSERT INTO shopping_basket_items(
    id, basket_id, name, normalized_name, category, amount, amount_text, unit, source, sort_order
  ) VALUES (
    p_item_id, target_basket_id, btrim(p_payload->>'name'), p_payload->>'normalizedName', '其他',
    NULL, '', NULL, 'manual', 0
  )
  RETURNING jsonb_build_object('id', id, 'name', name, 'checked', checked, 'sortOrder', sort_order) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION cook_basket_toggle_item(p_owner_id text, p_item_id uuid, p_checked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE current_item shopping_basket_items%ROWTYPE; result jsonb; restore_order integer;
BEGIN
  SELECT item.* INTO current_item FROM shopping_basket_items item
  JOIN shopping_baskets basket ON basket.id = item.basket_id
  WHERE item.id = p_item_id AND basket.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF current_item.checked = p_checked THEN
    RETURN jsonb_build_object('id', current_item.id, 'name', current_item.name, 'checked', current_item.checked, 'sortOrder', current_item.sort_order);
  END IF;
  IF p_checked THEN
    UPDATE shopping_basket_items SET sort_order = sort_order + 1
    WHERE basket_id = current_item.basket_id AND checked = true;
    UPDATE shopping_basket_items SET checked = true, pending_sort_order = current_item.sort_order, sort_order = 0
    WHERE id = current_item.id;
  ELSE
    restore_order := coalesce(current_item.pending_sort_order, 0);
    UPDATE shopping_basket_items SET sort_order = sort_order + 1
    WHERE basket_id = current_item.basket_id AND checked = false AND sort_order >= restore_order;
    UPDATE shopping_basket_items SET checked = false, sort_order = restore_order, pending_sort_order = NULL
    WHERE id = current_item.id;
  END IF;
  SELECT jsonb_build_object('id', id, 'name', name, 'checked', checked, 'sortOrder', sort_order)
  INTO result FROM shopping_basket_items WHERE id = current_item.id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION cook_basket_update_item(p_owner_id text, p_item_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE current_item shopping_basket_items%ROWTYPE; duplicate_id uuid; result jsonb; next_name text; next_normalized text;
BEGIN
  SELECT item.* INTO current_item FROM shopping_basket_items item
  JOIN shopping_baskets basket ON basket.id = item.basket_id
  WHERE item.id = p_item_id AND basket.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  next_name := CASE WHEN p_payload ? 'name' THEN btrim(p_payload->>'name') ELSE current_item.name END;
  next_normalized := CASE WHEN p_payload ? 'normalizedName' THEN p_payload->>'normalizedName' ELSE current_item.normalized_name END;
  IF length(next_name) = 0 OR length(next_normalized) = 0 THEN
    RAISE EXCEPTION 'ingredient name is required' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO duplicate_id FROM shopping_basket_items
  WHERE basket_id = current_item.basket_id AND normalized_name = next_normalized AND id <> p_item_id
  ORDER BY created_at, id LIMIT 1 FOR UPDATE;
  IF duplicate_id IS NOT NULL THEN
    UPDATE shopping_basket_items
    SET source_refs = source_refs || current_item.source_refs,
        checked = CASE WHEN p_payload ? 'checked' THEN (p_payload->>'checked')::boolean ELSE checked END
    WHERE id = duplicate_id
    RETURNING jsonb_build_object('id', id, 'name', name, 'checked', checked, 'sortOrder', sort_order) INTO result;
    DELETE FROM shopping_basket_items WHERE id = p_item_id;
    RETURN result;
  END IF;
  UPDATE shopping_basket_items item
  SET name = next_name,
      normalized_name = next_normalized,
      checked = CASE WHEN p_payload ? 'checked' THEN (p_payload->>'checked')::boolean ELSE item.checked END,
      sort_order = CASE WHEN p_payload ? 'sortOrder' THEN (p_payload->>'sortOrder')::integer ELSE item.sort_order END
  WHERE item.id = p_item_id
  RETURNING jsonb_build_object('id', id, 'name', name, 'checked', checked, 'sortOrder', sort_order) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION cook_basket_replace_plan_items(
  p_owner_id text, p_week_start_date date, p_basket_id uuid, p_items jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE target_basket_id uuid; entry jsonb; duplicate_id uuid;
BEGIN
  IF jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'basket items must be an array' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id || ':basket:' || p_week_start_date::text, 0));
  INSERT INTO shopping_baskets(id, owner_id, week_start_date) VALUES (p_basket_id, p_owner_id, p_week_start_date)
  ON CONFLICT (owner_id, week_start_date) DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO target_basket_id;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT id INTO duplicate_id FROM shopping_basket_items
    WHERE basket_id = target_basket_id AND normalized_name = coalesce(entry->>'normalizedName', lower(btrim(entry->>'name')))
    ORDER BY created_at, id LIMIT 1 FOR UPDATE;
    IF duplicate_id IS NULL THEN
      INSERT INTO shopping_basket_items(id, basket_id, name, normalized_name, category, amount, amount_text, unit, source, source_refs, checked, sort_order)
      VALUES ((entry->>'id')::uuid, target_basket_id, btrim(entry->>'name'), coalesce(entry->>'normalizedName', lower(btrim(entry->>'name'))),
        '其他', NULL, coalesce(entry->>'amountText', ''), NULL, 'plan', coalesce(entry->'sourceRefs', '[]'::jsonb), false, coalesce((entry->>'sortOrder')::integer, 0));
    ELSE
      UPDATE shopping_basket_items SET source_refs = source_refs || coalesce(entry->'sourceRefs', '[]'::jsonb)
      WHERE id = duplicate_id;
    END IF;
  END LOOP;
  UPDATE shopping_baskets SET last_synced_at = clock_timestamp() WHERE id = target_basket_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION cook_basket_clear_items(p_owner_id text, p_week_start_date date, p_completed_only boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE affected integer;
BEGIN
  DELETE FROM shopping_basket_items item USING shopping_baskets basket
  WHERE item.basket_id = basket.id
    AND basket.owner_id = p_owner_id
    AND basket.week_start_date = p_week_start_date
    AND (NOT p_completed_only OR item.checked = true);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION cook_basket_create_manual_item(text, date, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_toggle_item(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_clear_items(text, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_update_item(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_basket_replace_plan_items(text, date, uuid, jsonb) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_basket_create_manual_item(text, date, uuid, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_basket_toggle_item(text, uuid, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_basket_clear_items(text, date, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_basket_update_item(text, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_basket_replace_plan_items(text, date, uuid, jsonb) TO service_role;
  END IF;
END
$migration$;
