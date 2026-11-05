-- First-login profile defaults. The server, rather than the mini-program client,
-- owns assignment so users cannot forge or collide with a default identity.
ALTER TABLE app_users
  ADD COLUMN default_profile_code char(4),
  ADD COLUMN default_avatar_preset smallint,
  ADD COLUMN profile_initialized_at timestamptz;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_default_avatar_preset_ck
  CHECK (default_avatar_preset IS NULL OR default_avatar_preset BETWEEN 1 AND 6);

CREATE UNIQUE INDEX app_users_default_profile_code_uq
  ON app_users(default_profile_code)
  WHERE default_profile_code IS NOT NULL;

CREATE OR REPLACE FUNCTION cook_auth_assign_default_profile(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  account app_users%ROWTYPE;
  candidate_code text;
  avatar_preset smallint;
  position integer;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  SELECT * INTO account FROM app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF account.default_profile_code IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('cook_default_profile_code'));
    LOOP
      candidate_code := '';
      FOR position IN 1..4 LOOP
        candidate_code := candidate_code || substr(
          alphabet,
          floor(random() * length(alphabet))::integer + 1,
          1
        );
      END LOOP;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM app_users WHERE default_profile_code = candidate_code
      );
    END LOOP;
  ELSE
    candidate_code := account.default_profile_code;
  END IF;

  avatar_preset := coalesce(account.default_avatar_preset, floor(random() * 6)::smallint + 1);

  UPDATE app_users
  SET default_profile_code = candidate_code,
      default_avatar_preset = avatar_preset,
      nickname = CASE
        WHEN length(btrim(coalesce(nickname, ''))) = 0 THEN '食光旅人 ' || candidate_code
        ELSE nickname
      END,
      avatar_url = CASE
        WHEN length(btrim(coalesce(avatar_url, ''))) = 0 THEN '/assets/profile/preset-avatar-' || avatar_preset::text || '.png'
        ELSE avatar_url
      END,
      profile_initialized_at = coalesce(profile_initialized_at, clock_timestamp())
  WHERE id = p_user_id;

  RETURN cook_auth_get_user(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION cook_auth_assign_default_profile(text) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_auth_assign_default_profile(text) TO service_role;
  END IF;
END
$migration$;
