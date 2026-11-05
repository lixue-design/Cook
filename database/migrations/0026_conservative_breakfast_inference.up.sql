-- Keep breakfast inference conservative: ingredient names alone do not decide a meal.
-- “鸡蛋、玉米”等食材名不能单独判断早餐；带正餐烹饪语义时不推断为早餐。
CREATE OR REPLACE FUNCTION cook_recipe_build_system_tags(
  p_title text,
  p_main_ingredients text,
  p_side_ingredients text,
  p_seasonings text,
  p_steps jsonb,
  p_category text,
  p_duration_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
DECLARE
  v_tags jsonb := cook_recipe_build_system_tags_base(
    p_title,
    p_main_ingredients,
    p_side_ingredients,
    p_seasonings,
    p_steps,
    p_category,
    p_duration_minutes
  );
  v_title text := lower(btrim(coalesce(p_title, '')));
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_meal_types jsonb;
BEGIN
  IF v_category !~ '早餐'
    AND (
      v_title !~ '早餐|早饭|早茶|粥|包子|馒头|花卷|吐司|三明治|煎饼|蛋饼|油条|烧麦|隔夜燕麦|燕麦粥|燕麦片|豆浆|牛奶'
      OR v_title ~ '炒|炖|烧|焖|煲|烩|汤|鸡肉|鸡腿|鸡胸|鸡翅|鸡排|牛肉|牛腩|牛排|猪肉|五花肉|排骨|鱼|虾|豆腐'
    ) THEN
    SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
    INTO v_meal_types
    FROM jsonb_array_elements(v_tags->'mealTypes') AS item
    WHERE item->>'value' <> 'breakfast';
    v_tags := jsonb_set(v_tags, '{mealTypes}', v_meal_types, true);
  END IF;
  RETURN v_tags;
END;
$$;

-- Backfill the derived tag without rewriting user-authored recipe data or list order.
ALTER TABLE recipes DISABLE TRIGGER recipes_set_updated_at;

UPDATE recipes recipe
SET system_tags = cook_recipe_build_system_tags(
  recipe.display_name,
  recipe.main_ingredients,
  recipe.side_ingredients,
  recipe.seasonings,
  recipe.steps,
  category.name,
  recipe.duration_minutes
)
FROM recipe_categories category
WHERE category.id = recipe.category_id
  AND category.owner_id = recipe.owner_id;

UPDATE recipes recipe
SET system_tags = cook_recipe_build_system_tags(
  recipe.display_name,
  recipe.main_ingredients,
  recipe.side_ingredients,
  recipe.seasonings,
  recipe.steps,
  NULL,
  recipe.duration_minutes
)
WHERE recipe.category_id IS NULL;

ALTER TABLE recipes ENABLE TRIGGER recipes_set_updated_at;
