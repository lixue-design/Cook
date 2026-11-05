DROP FUNCTION IF EXISTS cook_plan_remove_recipe(text, date, text, uuid);
DROP FUNCTION IF EXISTS cook_plan_add_recipe(text, date, text, uuid, uuid, integer);
DROP FUNCTION IF EXISTS cook_plan_get_day(text, date);
DROP TABLE IF EXISTS meal_plan_recipes;
DROP TABLE IF EXISTS meal_plans;
