-- Keep the legacy one-argument function for complete catalog consumers.
-- The list page uses this bounded overload so cards are never read unboundedly.
CREATE INDEX IF NOT EXISTS recipes_owner_category_active_updated_idx
  ON recipes (owner_id, category_id, updated_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE FUNCTION ai_dish_library_list_recipes(
  p_owner_id text,
  p_category_id text,
  p_offset integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  WITH params AS (
    SELECT greatest(coalesce(p_offset, 0), 0) AS page_offset,
           least(greatest(coalesce(p_limit, 20), 1), 50) AS page_limit
  ), category_rows AS (
    SELECT category.id, category.name, category.sort_order
    FROM recipe_categories category
    WHERE category.owner_id = p_owner_id

    UNION ALL

    SELECT p_owner_id || ':uncategorized', '未分类', 2147483647
    WHERE EXISTS (
      SELECT 1 FROM recipes recipe
      WHERE recipe.owner_id = p_owner_id
        AND recipe.category_id IS NULL
        AND recipe.deleted_at IS NULL
    )
  ), selected_categories AS (
    SELECT *
    FROM category_rows
    WHERE p_category_id IS NULL OR id = p_category_id
  )
  SELECT coalesce(jsonb_agg(category_row ORDER BY sort_order, id), '[]'::jsonb)
  FROM (
    SELECT category.id, category.sort_order,
      jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'sortOrder', category.sort_order,
        'recipeCount', counts.recipe_count,
        'hasMore', counts.recipe_count > params.page_offset + params.page_limit,
        'nextOffset', CASE
          WHEN counts.recipe_count > params.page_offset + params.page_limit
          THEN params.page_offset + params.page_limit
          ELSE NULL
        END,
        'recipes', coalesce(page.recipes, '[]'::jsonb)
      ) AS category_row
    FROM selected_categories category
    CROSS JOIN params
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS recipe_count
      FROM recipes recipe
      WHERE recipe.owner_id = p_owner_id
        AND recipe.deleted_at IS NULL
        AND (
          (category.id = p_owner_id || ':uncategorized' AND recipe.category_id IS NULL)
          OR recipe.category_id = category.id
        )
    ) counts
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', recipe.id,
        'rawName', recipe.raw_name,
        'displayName', recipe.display_name,
        'canonicalDishId', recipe.canonical_dish_id,
        'coverMode', recipe.cover_mode,
        'customCoverStorageKey', recipe.custom_cover_storage_key,
        'durationMinutes', recipe.duration_minutes,
        'caloriesKcal', recipe.calories_kcal,
        'updatedAt', recipe.updated_at
      ) ORDER BY recipe.updated_at DESC, recipe.id) AS recipes
      FROM (
        SELECT recipe.*
        FROM recipes recipe
        WHERE recipe.owner_id = p_owner_id
          AND recipe.deleted_at IS NULL
          AND (
            (category.id = p_owner_id || ':uncategorized' AND recipe.category_id IS NULL)
            OR recipe.category_id = category.id
          )
        ORDER BY recipe.updated_at DESC, recipe.id
        OFFSET params.page_offset
        LIMIT params.page_limit
      ) recipe
    ) page
  ) grouped;
$$;

REVOKE ALL ON FUNCTION ai_dish_library_list_recipes(text, text, integer, integer) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ai_dish_library_list_recipes(text, text, integer, integer) TO service_role;
  END IF;
END
$migration$;
