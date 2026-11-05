DROP FUNCTION IF EXISTS cook_auth_update_profile(text, text, text, text);
DROP FUNCTION IF EXISTS cook_auth_get_user(text);

ALTER TABLE app_users
  DROP COLUMN IF EXISTS agreed_agreement_version,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS avatar_url,
  DROP COLUMN IF EXISTS nickname;
