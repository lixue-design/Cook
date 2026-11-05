-- Refine a broad legacy breakfast tag without changing user-entered recipes.
-- “鸡蛋” alone is not enough to classify a dish as breakfast.
ALTER FUNCTION cook_recipe_build_system_tags(text, text, text, text, jsonb, text, integer)
  RENAME TO cook_recipe_build_system_tags_base;

CREATE FUNCTION cook_recipe_build_system_tags(
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
  IF v_title !~ '粥|包子|吐司|燕麦|豆浆|三明治|面包|牛奶|玉米'
    AND v_category !~ '早餐' THEN
    SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
    INTO v_meal_types
    FROM jsonb_array_elements(v_tags->'mealTypes') AS item
    WHERE item->>'value' <> 'breakfast';
    v_tags := jsonb_set(v_tags, '{mealTypes}', v_meal_types, true);
  END IF;
  RETURN v_tags;
END;
$$;

CREATE OR REPLACE FUNCTION cook_recipe_assign_system_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  category_name text;
BEGIN
  SELECT name INTO category_name FROM recipe_categories WHERE id = NEW.category_id;
  NEW.system_tags := cook_recipe_build_system_tags(
    NEW.display_name,
    NEW.main_ingredients,
    NEW.side_ingredients,
    NEW.seasonings,
    NEW.steps,
    category_name,
    NEW.duration_minutes
  );
  RETURN NEW;
END;
$$;

-- Recompute existing tags without changing the recipe list's updated-time order.
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
