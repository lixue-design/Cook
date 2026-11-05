DO $migration$
DECLARE
  target_schema name := current_schema();
  routine record;
BEGIN
  FOR routine IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = target_schema
      AND p.prosecdef
      AND (p.proname LIKE 'ai_dish_library_%' OR p.proname LIKE 'cook_%')
  LOOP
    IF routine.proname LIKE 'ai_dish_library_%' THEN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = %I, %I, %I',
        target_schema, routine.proname, routine.arguments,
        target_schema, 'pg_catalog', 'extensions'
      );
    ELSE
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = %I, %I, %I',
        target_schema, routine.proname, routine.arguments,
        '$user', target_schema, 'extensions'
      );
    END IF;
  END LOOP;
END
$migration$;
