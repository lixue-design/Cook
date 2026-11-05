DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF to_regclass('storage.objects') IS NULL THEN
      EXECUTE 'DELETE FROM storage.buckets WHERE id = ''recipe-covers''';
    ELSE
      EXECUTE $delete_bucket$
        DELETE FROM storage.buckets
        WHERE id = 'recipe-covers'
          AND NOT EXISTS (
            SELECT 1 FROM storage.objects WHERE bucket_id = 'recipe-covers'
          )
      $delete_bucket$;
    END IF;
  END IF;
END;
$$;

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
