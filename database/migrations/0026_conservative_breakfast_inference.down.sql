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
