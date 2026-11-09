-- The `recipe-covers` bucket is managed by CloudBase storage. CloudBase blocks
-- direct SQL deletion from storage.buckets, so rollback only removes the recipe
-- RPCs. Storage bucket lifecycle must be handled through the Storage API.

DROP FUNCTION ai_dish_library_reorder_categories(text, jsonb);
DROP FUNCTION ai_dish_library_delete_category(text, text);
DROP FUNCTION ai_dish_library_rename_category(text, text, text);
DROP FUNCTION ai_dish_library_create_category(text, text, text);
DROP FUNCTION ai_dish_library_delete_recipe(text, uuid);
DROP FUNCTION ai_dish_library_update_recipe(text, uuid, uuid, jsonb);
DROP FUNCTION ai_dish_library_create_recipe(text, uuid, uuid, uuid, uuid, jsonb);
DROP FUNCTION ai_dish_library_get_recipe(text, uuid);
DROP FUNCTION ai_dish_library_list_recipes(text);
DROP FUNCTION ai_dish_library_ensure_user(text, text, text, text);
DROP FUNCTION ai_dish_library_normalize_name(text);
