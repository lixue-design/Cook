-- Restore the former list payload if this optimisation needs to be rolled back.
CREATE OR REPLACE FUNCTION ai_dish_library_list_recipes(p_owner_id text)
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

REVOKE ALL ON FUNCTION ai_dish_library_list_recipes(text) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ai_dish_library_list_recipes(text) TO service_role;
  END IF;
END
$migration$;
