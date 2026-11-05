DO $migration$
DECLARE
  target_schema name := current_schema();
  routine record;
  role_name text;
BEGIN
  FOR routine IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = target_schema
      AND p.prosecdef
      AND p.proname LIKE 'ai_dish_library_%'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',
          target_schema,
          routine.proname,
          routine.arguments,
          role_name
        );
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
