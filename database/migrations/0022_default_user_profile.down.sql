DROP FUNCTION IF EXISTS cook_auth_assign_default_profile(text);
DROP INDEX IF EXISTS app_users_default_profile_code_uq;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_default_avatar_preset_ck;
ALTER TABLE app_users
  DROP COLUMN IF EXISTS profile_initialized_at,
  DROP COLUMN IF EXISTS default_avatar_preset,
  DROP COLUMN IF EXISTS default_profile_code;
