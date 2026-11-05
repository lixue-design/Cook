CREATE TABLE plan_preferences (
  owner_id text PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  has_breakfast boolean NOT NULL DEFAULT true,
  breakfast_preference text NOT NULL DEFAULT 'quick',
  lunch_preference text NOT NULL DEFAULT 'quick',
  dinner_preference text NOT NULL DEFAULT 'balanced',
  staple_foods jsonb NOT NULL DEFAULT '["米饭"]'::jsonb
    CHECK (jsonb_typeof(staple_foods) = 'array' AND jsonb_array_length(staple_foods) <= 12),
  disliked_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(disliked_ingredients) = 'array' AND jsonb_array_length(disliked_ingredients) <= 30),
  servings integer NOT NULL DEFAULT 2 CHECK (servings BETWEEN 1 AND 12),
  weekday_max_cook_time_minutes integer NOT NULL DEFAULT 45 CHECK (weekday_max_cook_time_minutes BETWEEN 5 AND 240),
  weekend_max_cook_time_minutes integer NOT NULL DEFAULT 90 CHECK (weekend_max_cook_time_minutes BETWEEN 5 AND 360),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER plan_preferences_set_updated_at
BEFORE UPDATE ON plan_preferences
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE FUNCTION cook_plan_preferences_get(p_owner_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'hasBreakfast', has_breakfast,
    'breakfastPreference', breakfast_preference,
    'lunchPreference', lunch_preference,
    'dinnerPreference', dinner_preference,
    'stapleFoods', staple_foods,
    'dislikedIngredients', disliked_ingredients,
    'servings', servings,
    'weekdayMaxCookTimeMinutes', weekday_max_cook_time_minutes,
    'weekendMaxCookTimeMinutes', weekend_max_cook_time_minutes,
    'configured', true,
    'updatedAt', updated_at
  ) INTO result
  FROM plan_preferences
  WHERE owner_id = p_owner_id;

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  RETURN jsonb_build_object(
    'hasBreakfast', true,
    'breakfastPreference', 'quick',
    'lunchPreference', 'quick',
    'dinnerPreference', 'balanced',
    'stapleFoods', jsonb_build_array('米饭'),
    'dislikedIngredients', '[]'::jsonb,
    'servings', 2,
    'weekdayMaxCookTimeMinutes', 45,
    'weekendMaxCookTimeMinutes', 90,
    'configured', false,
    'updatedAt', null
  );
END;
$$;

CREATE FUNCTION cook_plan_preferences_upsert(
  p_owner_id text,
  p_has_breakfast boolean,
  p_breakfast_preference text,
  p_lunch_preference text,
  p_dinner_preference text,
  p_staple_foods jsonb,
  p_disliked_ingredients jsonb,
  p_servings integer,
  p_weekday_max_cook_time_minutes integer,
  p_weekend_max_cook_time_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF p_has_breakfast IS NULL THEN
    RAISE EXCEPTION 'has breakfast is required' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_breakfast_preference, ''))) = 0
     OR length(btrim(p_breakfast_preference)) > 40
     OR length(btrim(coalesce(p_lunch_preference, ''))) = 0
     OR length(btrim(p_lunch_preference)) > 40
     OR length(btrim(coalesce(p_dinner_preference, ''))) = 0
     OR length(btrim(p_dinner_preference)) > 40 THEN
    RAISE EXCEPTION 'meal preference is invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_staple_foods, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_staple_foods) = 0
     OR jsonb_array_length(p_staple_foods) > 12 THEN
    RAISE EXCEPTION 'staple foods are invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_disliked_ingredients, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_disliked_ingredients) > 30 THEN
    RAISE EXCEPTION 'disliked ingredients are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_servings < 1 OR p_servings > 12
     OR p_weekday_max_cook_time_minutes < 5 OR p_weekday_max_cook_time_minutes > 240
     OR p_weekend_max_cook_time_minutes < 5 OR p_weekend_max_cook_time_minutes > 360 THEN
    RAISE EXCEPTION 'numeric preference is invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO plan_preferences (
    owner_id,
    has_breakfast,
    breakfast_preference,
    lunch_preference,
    dinner_preference,
    staple_foods,
    disliked_ingredients,
    servings,
    weekday_max_cook_time_minutes,
    weekend_max_cook_time_minutes
  ) VALUES (
    p_owner_id,
    p_has_breakfast,
    btrim(p_breakfast_preference),
    btrim(p_lunch_preference),
    btrim(p_dinner_preference),
    p_staple_foods,
    p_disliked_ingredients,
    p_servings,
    p_weekday_max_cook_time_minutes,
    p_weekend_max_cook_time_minutes
  )
  ON CONFLICT (owner_id)
  DO UPDATE SET
    has_breakfast = excluded.has_breakfast,
    breakfast_preference = excluded.breakfast_preference,
    lunch_preference = excluded.lunch_preference,
    dinner_preference = excluded.dinner_preference,
    staple_foods = excluded.staple_foods,
    disliked_ingredients = excluded.disliked_ingredients,
    servings = excluded.servings,
    weekday_max_cook_time_minutes = excluded.weekday_max_cook_time_minutes,
    weekend_max_cook_time_minutes = excluded.weekend_max_cook_time_minutes,
    updated_at = clock_timestamp();

  RETURN cook_plan_preferences_get(p_owner_id);
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_preferences_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_plan_preferences_upsert(text, boolean, text, text, text, jsonb, jsonb, integer, integer, integer) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_preferences_get(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_plan_preferences_upsert(text, boolean, text, text, text, jsonb, jsonb, integer, integer, integer) TO service_role;
  END IF;
END
$migration$;
