-- 系统标签是菜谱的派生数据：由菜名、食材、步骤、分类和耗时确定，
-- 不接受客户端写入，也不要求用户手动维护。
ALTER TABLE recipes
  ADD COLUMN system_tags jsonb NOT NULL DEFAULT '{
    "tagVersion": 1,
    "mealTypes": [],
    "roles": [],
    "proteinTypes": [],
    "vegetables": [],
    "cookMethods": [],
    "timeLevel": null,
    "isOneDishMeal": false
  }'::jsonb,
  ADD CONSTRAINT recipes_system_tags_object_ck CHECK (jsonb_typeof(system_tags) = 'object');

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
  v_title text := lower(btrim(coalesce(p_title, '')));
  v_ingredients text := lower(concat_ws(' ', p_main_ingredients, p_side_ingredients, p_seasonings));
  v_steps text := lower(coalesce(p_steps::text, ''));
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_meal_types jsonb := jsonb_build_array(
    jsonb_build_object('value', 'lunch', 'source', 'default_rule', 'confidence', 'low'),
    jsonb_build_object('value', 'dinner', 'source', 'default_rule', 'confidence', 'low')
  );
  v_roles jsonb := '[]'::jsonb;
  v_protein_types jsonb := '[]'::jsonb;
  v_vegetables jsonb := '[]'::jsonb;
  v_cook_methods jsonb := '[]'::jsonb;
  v_time_level jsonb;
  v_is_one_dish_meal boolean := false;
BEGIN
  IF v_title ~ '粥|包子|吐司|燕麦|豆浆|三明治|面包|牛奶|鸡蛋|玉米' THEN
    v_meal_types := v_meal_types || jsonb_build_array(
      jsonb_build_object('value', 'breakfast', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_category ~ '早餐' THEN
    v_meal_types := v_meal_types || jsonb_build_array(
      jsonb_build_object('value', 'breakfast', 'source', 'category', 'confidence', 'medium')
    );
  END IF;

  IF v_title ~ '饭|面|粥|馒头|面包|饺子|馄饨|玉米|杂粮' THEN
    v_roles := v_roles || jsonb_build_array(
      jsonb_build_object('value', 'staple', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '米饭|大米|面条|面粉|燕麦|玉米' THEN
    v_roles := v_roles || jsonb_build_array(
      jsonb_build_object('value', 'staple', 'source', 'ingredients', 'confidence', 'medium')
    );
  END IF;

  IF v_title ~ '炒饭|盖饭|焖饭|面|饺子|馄饨|三明治' THEN
    v_is_one_dish_meal := true;
  END IF;

  IF v_title ~ '鸡蛋|鸭蛋|鹅蛋|鹌鹑蛋' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'egg', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '鸡蛋|鸭蛋|鹅蛋|鹌鹑蛋' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'egg', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '鸡肉|鸡腿|鸡胸|鸡翅|鸡排|黄焖鸡' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'chicken', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '鸡肉|鸡腿|鸡胸|鸡翅|鸡排' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'chicken', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '牛肉|牛腩|牛排' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'beef', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '牛肉|牛腩|牛排' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'beef', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '猪肉|五花肉|排骨|腊肠|肉末|肉' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'pork', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '猪肉|五花肉|排骨|腊肠|肉末|肉' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'pork', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '鱼|三文鱼|鲈鱼|鳕鱼' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'fish', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '鱼|三文鱼|鲈鱼|鳕鱼' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'fish', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '虾' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'shrimp', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '虾' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'shrimp', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '豆腐|豆干|豆皮' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'tofu', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '豆腐|豆干|豆皮' THEN
    v_protein_types := v_protein_types || jsonb_build_array(
      jsonb_build_object('value', 'tofu', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;

  IF v_title ~ '西红柿' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'tomato', 'source', 'title_alias', 'confidence', 'high')
    );
  ELSIF v_title ~ '番茄' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'tomato', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '西红柿' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'tomato', 'source', 'ingredients', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '番茄' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'tomato', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '西兰花' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'broccoli', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '西兰花' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'broccoli', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '包菜|卷心菜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'cabbage', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '包菜|卷心菜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'cabbage', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '黄瓜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'cucumber', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '黄瓜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'cucumber', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '豆角|四季豆' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'green_bean', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_ingredients ~ '豆角|四季豆' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'green_bean', 'source', 'ingredients', 'confidence', 'high')
    );
  END IF;
  IF v_title ~ '白菜|生菜|青菜|土豆|茄子|豆芽|金针菇|木耳|冬瓜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'vegetable', 'source', 'title', 'confidence', 'medium')
    );
  ELSIF v_ingredients ~ '白菜|生菜|青菜|土豆|茄子|豆芽|金针菇|木耳|冬瓜' THEN
    v_vegetables := v_vegetables || jsonb_build_array(
      jsonb_build_object('value', 'vegetable', 'source', 'ingredients', 'confidence', 'medium')
    );
  END IF;

  IF jsonb_array_length(v_protein_types) > 0 THEN
    v_roles := v_roles || jsonb_build_array(
      jsonb_build_object('value', 'protein_dish', 'source', 'default_rule', 'confidence', 'medium')
    );
  END IF;
  IF jsonb_array_length(v_vegetables) > 0 THEN
    v_roles := v_roles || jsonb_build_array(
      jsonb_build_object('value', 'vegetable_dish', 'source', 'default_rule', 'confidence', 'medium')
    );
  END IF;

  IF v_title ~ '炒|煸' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'stir_fry', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_steps ~ '炒|煸' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'stir_fry', 'source', 'steps', 'confidence', 'medium')
    );
  END IF;
  IF v_title ~ '蒸' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'steam', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_steps ~ '蒸' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'steam', 'source', 'steps', 'confidence', 'medium')
    );
  END IF;
  IF v_title ~ '炖|焖|煲' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'braise', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_steps ~ '炖|焖|煲' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'braise', 'source', 'steps', 'confidence', 'medium')
    );
  END IF;
  IF v_title ~ '凉拌|拌' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'mix', 'source', 'title', 'confidence', 'high')
    );
  ELSIF v_steps ~ '拌匀|翻拌' THEN
    v_cook_methods := v_cook_methods || jsonb_build_array(
      jsonb_build_object('value', 'mix', 'source', 'steps', 'confidence', 'medium')
    );
  END IF;

  IF p_duration_minutes IS NULL THEN
    v_time_level := jsonb_build_object('value', 'quick', 'source', 'default_rule', 'confidence', 'low');
  ELSIF p_duration_minutes <= 30 THEN
    v_time_level := jsonb_build_object('value', 'quick', 'source', 'duration', 'confidence', 'high');
  ELSIF p_duration_minutes < 45 THEN
    v_time_level := jsonb_build_object('value', 'regular', 'source', 'duration', 'confidence', 'high');
  ELSE
    v_time_level := jsonb_build_object('value', 'weekend', 'source', 'duration', 'confidence', 'high');
  END IF;

  RETURN jsonb_build_object(
    'tagVersion', 1,
    'mealTypes', v_meal_types,
    'roles', v_roles,
    'proteinTypes', v_protein_types,
    'vegetables', v_vegetables,
    'cookMethods', v_cook_methods,
    'timeLevel', v_time_level,
    'isOneDishMeal', v_is_one_dish_meal
  );
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

CREATE TRIGGER recipes_assign_system_tags
BEFORE INSERT OR UPDATE OF display_name, category_id, duration_minutes, main_ingredients, side_ingredients, seasonings, steps
ON recipes
FOR EACH ROW EXECUTE FUNCTION cook_recipe_assign_system_tags();

-- Historical backfill is metadata-only. Keep the existing list order stable by
-- avoiding the generic updated_at trigger while these rows are recomputed.
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

CREATE OR REPLACE FUNCTION cook_plan_generation_candidates(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', recipe.id,
    'name', recipe.display_name,
    'durationMinutes', recipe.duration_minutes,
    'caloriesKcal', recipe.calories_kcal,
    'coverStorageKey', recipe.custom_cover_storage_key,
    'mainIngredients', recipe.main_ingredients,
    'sideIngredients', recipe.side_ingredients,
    'seasonings', recipe.seasonings,
    'steps', recipe.steps,
    'systemTags', recipe.system_tags
  ) ORDER BY recipe.updated_at DESC, recipe.id), '[]'::jsonb)
  FROM recipes recipe
  WHERE recipe.owner_id = p_owner_id AND recipe.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION cook_plan_generation_candidates(text) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_generation_candidates(text) TO service_role;
  END IF;
END
$migration$;
