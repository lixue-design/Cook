-- Delete plan headers rather than only their child rows. This prevents empty
-- headers from being treated as an existing weekly plan during regeneration.
CREATE FUNCTION cook_plan_clear_range(
  p_owner_id text,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  removed_count integer;
BEGIN
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'plan clear range is invalid' USING ERRCODE = '22023';
  END IF;

  DELETE FROM meal_plans
  WHERE owner_id = p_owner_id
    AND plan_date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count;
END;
$$;

REVOKE ALL ON FUNCTION cook_plan_clear_range(text, date, date) FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_plan_clear_range(text, date, date) TO service_role;
  END IF;
END
$migration$;
