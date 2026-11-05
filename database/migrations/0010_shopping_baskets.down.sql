DROP FUNCTION IF EXISTS cook_basket_check_all(text, date, boolean);
DROP FUNCTION IF EXISTS cook_basket_delete_item(text, uuid);
DROP FUNCTION IF EXISTS cook_basket_update_item(text, uuid, jsonb);
DROP FUNCTION IF EXISTS cook_basket_create_manual_item(text, date, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS cook_basket_replace_plan_items(text, date, uuid, jsonb);
DROP FUNCTION IF EXISTS cook_basket_plan_snapshots(text, date);
DROP FUNCTION IF EXISTS cook_basket_get_week(text, date);
DROP TABLE IF EXISTS shopping_basket_items;
DROP TABLE IF EXISTS shopping_baskets;
