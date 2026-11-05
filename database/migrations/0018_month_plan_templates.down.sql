DROP FUNCTION IF EXISTS cook_month_plan_template_apply(text, uuid, text, text);
DROP FUNCTION IF EXISTS cook_month_plan_template_delete(text, uuid);
DROP FUNCTION IF EXISTS cook_month_plan_template_list(text);
DROP FUNCTION IF EXISTS cook_month_plan_template_create(text, uuid, text, text);

DROP TABLE IF EXISTS month_plan_template_items;
DROP TABLE IF EXISTS month_plan_templates;
