CREATE OR REPLACE FUNCTION cook_recipe_assign_system_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  category_name text;
BEGIN
  SELECT name INTO category_name FROM recipe_categories WHERE id = NEW.category_id;
  NEW.system_tags := cook_recipe_build_system_tags_base(
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

DROP FUNCTION IF EXISTS cook_recipe_build_system_tags(text, text, text, text, jsonb, text, integer);
ALTER FUNCTION cook_recipe_build_system_tags_base(text, text, text, text, jsonb, text, integer)
  RENAME TO cook_recipe_build_system_tags;

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
