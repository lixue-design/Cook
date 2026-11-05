REVOKE ALL ON FUNCTION ai_dish_library_list_recipes(text, text, integer, integer) FROM PUBLIC;
DROP FUNCTION IF EXISTS ai_dish_library_list_recipes(text, text, integer, integer);
DROP INDEX IF EXISTS recipes_owner_category_active_updated_idx;
