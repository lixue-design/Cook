ALTER TABLE app_users
  ADD COLUMN nickname text NOT NULL DEFAULT '',
  ADD COLUMN avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancel_requested', 'cancelled', 'blocked')),
  ADD COLUMN agreed_agreement_version text NOT NULL DEFAULT '';

CREATE FUNCTION cook_auth_get_user(p_user_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'nickName', nickname,
    'avatarUrl', avatar_url,
    'status', status,
    'agreedAgreementVersion', agreed_agreement_version
  )
  FROM app_users
  WHERE id = p_user_id;
$$;

CREATE FUNCTION cook_auth_update_profile(
  p_user_id text,
  p_nickname text,
  p_avatar_url text,
  p_agreement_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path FROM CURRENT
AS $$
DECLARE
  user_status text;
BEGIN
  IF length(btrim(coalesce(p_agreement_version, ''))) = 0 THEN
    RAISE EXCEPTION 'agreement version is required' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO user_status FROM app_users WHERE id = p_user_id FOR UPDATE;
  IF user_status IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  IF user_status <> 'active' THEN
    RAISE EXCEPTION 'account is not active' USING ERRCODE = '42501';
  END IF;

  UPDATE app_users
  SET nickname = left(btrim(coalesce(p_nickname, '')), 80),
      avatar_url = left(btrim(coalesce(p_avatar_url, '')), 2048),
      agreed_agreement_version = btrim(p_agreement_version)
  WHERE id = p_user_id;

  RETURN cook_auth_get_user(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION cook_auth_get_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_auth_update_profile(text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_auth_get_user(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_auth_update_profile(text, text, text, text) TO service_role;
  END IF;
END
$$;
