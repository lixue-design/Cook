DROP FUNCTION IF EXISTS cook_basket_clear_items(text, date, boolean);
DROP FUNCTION IF EXISTS cook_basket_toggle_item(text, uuid, boolean);
DROP INDEX IF EXISTS shopping_basket_items_basket_normalized_name_idx;
ALTER TABLE shopping_basket_items DROP COLUMN IF EXISTS pending_sort_order;
ALTER TABLE shopping_basket_items DROP COLUMN IF EXISTS normalized_name;
