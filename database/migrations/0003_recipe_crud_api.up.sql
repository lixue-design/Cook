CREATE FUNCTION ai_dish_library_normalize_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT lower(regexp_replace(btrim(value), '\s+', '', 'g'));
$$;

CREATE FUNCTION ai_dish_library_ensure_user(
  p_user_id text,
  p_wx_appid text,
  p_wx_openid text,
  p_wx_unionid text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  resolved_user_id text;
BEGIN
  IF length(btrim(coalesce(p_user_id, ''))) = 0
     OR length(btrim(coalesce(p_wx_appid, ''))) = 0
     OR length(btrim(coalesce(p_wx_openid, ''))) = 0 THEN
    RAISE EXCEPTION 'verified WeChat identity is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app_users (id, wx_appid, wx_openid, wx_unionid)
  VALUES (p_user_id, p_wx_appid, p_wx_openid, nullif(btrim(p_wx_unionid), ''))
  ON CONFLICT (wx_appid, wx_openid) DO UPDATE
    SET wx_unionid = coalesce(EXCLUDED.wx_unionid, app_users.wx_unionid)
  RETURNING id INTO resolved_user_id;

  INSERT INTO recipe_categories (id, owner_id, name, normalized_name, sort_order)
  SELECT
    resolved_user_id || ':' || seed.slug,
    resolved_user_id,
    seed.name,
    ai_dish_library_normalize_name(seed.name),
    seed.sort_order
  FROM (VALUES
    ('cold', '爽口凉菜', 10),
    ('stir_fry', '家常小炒', 20),
    ('meat', '大口吃肉', 30),
    ('soup', '一碗鲜汤', 40),
    ('staple', '饱腹主食', 50)
  ) AS seed(slug, name, sort_order)
  ON CONFLICT (owner_id, normalized_name) DO NOTHING;

  RETURN resolved_user_id;
END;
$$;

CREATE FUNCTION ai_dish_library_list_recipes(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT coalesce(jsonb_agg(category_row ORDER BY category_row->>'sortOrder', category_row->>'id'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', category.id,
      'name', category.name,
      'sortOrder', category.sort_order,
      'recipes', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recipe.id,
          'rawName', recipe.raw_name,
          'displayName', recipe.display_name,
          'canonicalDishId', recipe.canonical_dish_id,
          'coverMode', recipe.cover_mode,
          'customCoverStorageKey', recipe.custom_cover_storage_key,
          'durationMinutes', recipe.duration_minutes,
          'caloriesKcal', recipe.calories_kcal,
          'mainIngredients', recipe.main_ingredients,
          'sideIngredients', recipe.side_ingredients,
          'seasonings', recipe.seasonings,
          'steps', recipe.steps,
          'updatedAt', recipe.updated_at
        ) ORDER BY recipe.updated_at DESC, recipe.id)
        FROM recipes recipe
        WHERE recipe.owner_id = p_owner_id
          AND recipe.category_id = category.id
          AND recipe.deleted_at IS NULL
      ), '[]'::jsonb)
    ) AS category_row
    FROM recipe_categories category
    WHERE category.owner_id = p_owner_id

    UNION ALL

    SELECT jsonb_build_object(
      'id', p_owner_id || ':uncategorized',
      'name', '未分类',
      'sortOrder', 2147483647,
      'recipes', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recipe.id,
          'rawName', recipe.raw_name,
          'displayName', recipe.display_name,
          'canonicalDishId', recipe.canonical_dish_id,
          'coverMode', recipe.cover_mode,
          'customCoverStorageKey', recipe.custom_cover_storage_key,
          'durationMinutes', recipe.duration_minutes,
          'caloriesKcal', recipe.calories_kcal,
          'mainIngredients', recipe.main_ingredients,
          'sideIngredients', recipe.side_ingredients,
          'seasonings', recipe.seasonings,
          'steps', recipe.steps,
          'updatedAt', recipe.updated_at
        ) ORDER BY recipe.updated_at DESC, recipe.id)
        FROM recipes recipe
        WHERE recipe.owner_id = p_owner_id
          AND recipe.category_id IS NULL
          AND recipe.deleted_at IS NULL
      ), '[]'::jsonb)
    )
    WHERE EXISTS (
      SELECT 1 FROM recipes recipe
      WHERE recipe.owner_id = p_owner_id
        AND recipe.category_id IS NULL
        AND recipe.deleted_at IS NULL
    )
  ) grouped;
$$;

CREATE FUNCTION ai_dish_library_get_recipe(p_owner_id text, p_recipe_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT jsonb_build_object(
    'id', recipe.id,
    'rawName', recipe.raw_name,
    'displayName', recipe.display_name,
    'canonicalDishId', recipe.canonical_dish_id,
    'coverMode', recipe.cover_mode,
    'customCoverStorageKey', recipe.custom_cover_storage_key,
    'categoryId', recipe.category_id,
    'categoryName', coalesce(category.name, '未分类'),
    'durationMinutes', recipe.duration_minutes,
    'caloriesKcal', recipe.calories_kcal,
    'mainIngredients', recipe.main_ingredients,
    'sideIngredients', recipe.side_ingredients,
    'seasonings', recipe.seasonings,
    'steps', recipe.steps,
    'createdAt', recipe.created_at,
    'updatedAt', recipe.updated_at
  )
  FROM recipes recipe
  LEFT JOIN recipe_categories category
    ON category.id = recipe.category_id AND category.owner_id = recipe.owner_id
  WHERE recipe.id = p_recipe_id
    AND recipe.owner_id = p_owner_id
    AND recipe.deleted_at IS NULL;
$$;

CREATE FUNCTION ai_dish_library_create_recipe(
  p_owner_id text,
  p_recipe_id uuid,
  p_canonical_dish_id uuid,
  p_decision_id uuid,
  p_alias_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  v_raw_name text := btrim(coalesce(p_payload->>'rawName', ''));
  v_display_name text := btrim(coalesce(p_payload->>'displayName', p_payload->>'rawName', ''));
  v_normalized_name text;
  v_category_id text;
  requested_category text := btrim(coalesce(p_payload->>'category', ''));
  v_cover_mode text := coalesce(nullif(p_payload->>'coverMode', ''), 'FOLLOW_LIBRARY');
  v_custom_cover_key text := nullif(btrim(coalesce(p_payload->>'customCoverStorageKey', '')), '');
BEGIN
  IF length(v_raw_name) = 0 OR length(v_display_name) = 0 THEN
    RAISE EXCEPTION 'recipe name is required' USING ERRCODE = '22023';
  END IF;
  IF v_cover_mode NOT IN ('FOLLOW_LIBRARY', 'CUSTOM') THEN
    RAISE EXCEPTION 'phase 2 only supports FOLLOW_LIBRARY or CUSTOM cover mode' USING ERRCODE = '22023';
  END IF;
  IF (v_cover_mode = 'CUSTOM') <> (v_custom_cover_key IS NOT NULL) THEN
    RAISE EXCEPTION 'CUSTOM cover mode requires a storage key' USING ERRCODE = '22023';
  END IF;

  v_normalized_name := ai_dish_library_normalize_name(v_display_name);

  IF length(requested_category) > 0 AND requested_category <> '未分类' THEN
    SELECT id INTO v_category_id
    FROM recipe_categories
    WHERE owner_id = p_owner_id
      AND normalized_name = ai_dish_library_normalize_name(requested_category);

    IF v_category_id IS NULL THEN
      v_category_id := p_owner_id || ':category:' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO recipe_categories (id, owner_id, name, normalized_name, sort_order)
      VALUES (
        v_category_id,
        p_owner_id,
        requested_category,
        ai_dish_library_normalize_name(requested_category),
        coalesce((SELECT max(sort_order) + 10 FROM recipe_categories WHERE owner_id = p_owner_id), 10)
      );
    END IF;
  END IF;

  INSERT INTO canonical_dishes (
    id, display_name, normalized_name, status, created_by, updated_by
  ) VALUES (
    p_canonical_dish_id, v_display_name, v_normalized_name, 'PROVISIONAL', p_owner_id, p_owner_id
  );

  INSERT INTO dish_aliases (
    id, canonical_dish_id, raw_name, normalized_name, created_by
  ) VALUES (
    p_alias_id, p_canonical_dish_id, v_raw_name, v_normalized_name, p_owner_id
  );

  INSERT INTO recipes (
    id, owner_id, raw_name, display_name, normalized_name, canonical_dish_id,
    cover_mode, custom_cover_storage_key, category_id, duration_minutes,
    calories_kcal, main_ingredients, side_ingredients, seasonings, steps,
    created_by, updated_by
  ) VALUES (
    p_recipe_id,
    p_owner_id,
    v_raw_name,
    v_display_name,
    v_normalized_name,
    p_canonical_dish_id,
    v_cover_mode,
    v_custom_cover_key,
    v_category_id,
    nullif(p_payload->>'durationMinutes', '')::integer,
    nullif(p_payload->>'caloriesKcal', '')::integer,
    coalesce(p_payload->>'mainIngredients', ''),
    coalesce(p_payload->>'sideIngredients', ''),
    coalesce(p_payload->>'seasonings', ''),
    coalesce(p_payload->'steps', '[]'::jsonb),
    p_owner_id,
    p_owner_id
  );

  INSERT INTO normalization_decisions (
    id, recipe_id, raw_name, normalized_name, decision,
    selected_canonical_dish_id, rule_version, evidence, decided_by
  ) VALUES (
    p_decision_id,
    p_recipe_id,
    v_raw_name,
    v_normalized_name,
    'PROVISIONAL_CREATED',
    p_canonical_dish_id,
    'phase2-no-automatic-normalization-v1',
    jsonb_build_object('reason', 'automatic normalization is intentionally disabled in phase 2'),
    p_owner_id
  );

  RETURN ai_dish_library_get_recipe(p_owner_id, p_recipe_id);
END;
$$;

CREATE FUNCTION ai_dish_library_update_recipe(
  p_owner_id text,
  p_recipe_id uuid,
  p_alias_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  existing recipes%ROWTYPE;
  v_raw_name text := btrim(coalesce(p_payload->>'rawName', ''));
  v_display_name text := btrim(coalesce(p_payload->>'displayName', p_payload->>'rawName', ''));
  v_normalized_name text;
  v_category_id text;
  requested_category text := btrim(coalesce(p_payload->>'category', ''));
  v_cover_mode text := coalesce(nullif(p_payload->>'coverMode', ''), 'FOLLOW_LIBRARY');
  v_custom_cover_key text := nullif(btrim(coalesce(p_payload->>'customCoverStorageKey', '')), '');
BEGIN
  SELECT * INTO existing
  FROM recipes
  WHERE id = p_recipe_id AND owner_id = p_owner_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF length(v_raw_name) = 0 OR length(v_display_name) = 0 THEN
    RAISE EXCEPTION 'recipe name is required' USING ERRCODE = '22023';
  END IF;
  IF v_cover_mode NOT IN ('FOLLOW_LIBRARY', 'CUSTOM') THEN
    RAISE EXCEPTION 'phase 2 only supports FOLLOW_LIBRARY or CUSTOM cover mode' USING ERRCODE = '22023';
  END IF;
  IF (v_cover_mode = 'CUSTOM') <> (v_custom_cover_key IS NOT NULL) THEN
    RAISE EXCEPTION 'CUSTOM cover mode requires a storage key' USING ERRCODE = '22023';
  END IF;

  v_normalized_name := ai_dish_library_normalize_name(v_display_name);
  IF length(requested_category) > 0 AND requested_category <> '未分类' THEN
    SELECT id INTO v_category_id
    FROM recipe_categories
    WHERE owner_id = p_owner_id
      AND normalized_name = ai_dish_library_normalize_name(requested_category);

    IF v_category_id IS NULL THEN
      v_category_id := p_owner_id || ':category:' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO recipe_categories (id, owner_id, name, normalized_name, sort_order)
      VALUES (
        v_category_id,
        p_owner_id,
        requested_category,
        ai_dish_library_normalize_name(requested_category),
        coalesce((SELECT max(sort_order) + 10 FROM recipe_categories WHERE owner_id = p_owner_id), 10)
      );
    END IF;
  END IF;

  UPDATE recipes
  SET raw_name = v_raw_name,
      display_name = v_display_name,
      normalized_name = v_normalized_name,
      cover_mode = v_cover_mode,
      pinned_asset_id = NULL,
      custom_cover_storage_key = v_custom_cover_key,
      category_id = v_category_id,
      duration_minutes = nullif(p_payload->>'durationMinutes', '')::integer,
      calories_kcal = nullif(p_payload->>'caloriesKcal', '')::integer,
      main_ingredients = coalesce(p_payload->>'mainIngredients', ''),
      side_ingredients = coalesce(p_payload->>'sideIngredients', ''),
      seasonings = coalesce(p_payload->>'seasonings', ''),
      steps = coalesce(p_payload->'steps', '[]'::jsonb),
      updated_by = p_owner_id
  WHERE id = p_recipe_id AND owner_id = p_owner_id;

  INSERT INTO dish_aliases (
    id, canonical_dish_id, raw_name, normalized_name, created_by
  ) VALUES (
    p_alias_id, existing.canonical_dish_id, v_raw_name, v_normalized_name, p_owner_id
  ) ON CONFLICT (canonical_dish_id, normalized_name, locale) DO NOTHING;

  RETURN ai_dish_library_get_recipe(p_owner_id, p_recipe_id);
END;
$$;

CREATE FUNCTION ai_dish_library_delete_recipe(p_owner_id text, p_recipe_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
BEGIN
  UPDATE recipes
  SET deleted_at = clock_timestamp(), updated_by = p_owner_id
  WHERE id = p_recipe_id AND owner_id = p_owner_id AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION ai_dish_library_create_category(p_owner_id text, p_category_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  clean_name text := btrim(coalesce(p_name, ''));
  result jsonb;
BEGIN
  IF length(clean_name) = 0 THEN
    RAISE EXCEPTION 'category name is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO recipe_categories (id, owner_id, name, normalized_name, sort_order)
  VALUES (
    p_category_id,
    p_owner_id,
    clean_name,
    ai_dish_library_normalize_name(clean_name),
    coalesce((SELECT max(sort_order) + 10 FROM recipe_categories WHERE owner_id = p_owner_id), 10)
  )
  RETURNING jsonb_build_object('id', id, 'name', name, 'sortOrder', sort_order) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION ai_dish_library_rename_category(p_owner_id text, p_category_id text, p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  clean_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF length(clean_name) = 0 THEN
    RAISE EXCEPTION 'category name is required' USING ERRCODE = '22023';
  END IF;
  UPDATE recipe_categories
  SET name = clean_name, normalized_name = ai_dish_library_normalize_name(clean_name)
  WHERE id = p_category_id AND owner_id = p_owner_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION ai_dish_library_delete_category(p_owner_id text, p_category_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipe_categories WHERE id = p_category_id AND owner_id = p_owner_id
  ) THEN
    RETURN false;
  END IF;
  UPDATE recipes
  SET category_id = NULL, updated_by = p_owner_id
  WHERE owner_id = p_owner_id AND category_id = p_category_id AND deleted_at IS NULL;
  DELETE FROM recipe_categories WHERE id = p_category_id AND owner_id = p_owner_id;
  RETURN true;
END;
$$;

CREATE FUNCTION ai_dish_library_reorder_categories(p_owner_id text, p_ordered_ids jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
BEGIN
  IF jsonb_typeof(coalesce(p_ordered_ids, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'ordered category ids must be an array' USING ERRCODE = '22023';
  END IF;
  UPDATE recipe_categories category
  SET sort_order = ordering.position * 10
  FROM (
    SELECT value AS id, ordinality::integer AS position
    FROM jsonb_array_elements_text(p_ordered_ids) WITH ORDINALITY
  ) ordering
  WHERE category.id = ordering.id AND category.owner_id = p_owner_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION ai_dish_library_ensure_user(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_list_recipes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_get_recipe(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_create_recipe(text, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_update_recipe(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_delete_recipe(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_create_category(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_rename_category(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_delete_category(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_dish_library_reorder_categories(text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ai_dish_library_ensure_user(text, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_list_recipes(text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_get_recipe(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_create_recipe(text, uuid, uuid, uuid, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_update_recipe(text, uuid, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_delete_recipe(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_create_category(text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_rename_category(text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_delete_category(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_dish_library_reorder_categories(text, jsonb) TO service_role;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (
      id, name, public, file_size_limit, allowed_mime_types
    ) VALUES (
      'recipe-covers',
      'recipe-covers',
      false,
      4194304,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ) ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;
