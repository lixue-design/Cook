CREATE TABLE agreement_versions (
  version text PRIMARY KEY CHECK (length(btrim(version)) BETWEEN 1 AND 40),
  required boolean NOT NULL DEFAULT false,
  service_title text NOT NULL DEFAULT '用户服务协议',
  service_content text NOT NULL CHECK (length(service_content) > 0),
  privacy_title text NOT NULL DEFAULT '隐私政策',
  privacy_content text NOT NULL CHECK (length(privacy_content) > 0),
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX agreement_versions_one_required_uq
  ON agreement_versions(required)
  WHERE required;

CREATE TRIGGER agreement_versions_set_updated_at
BEFORE UPDATE ON agreement_versions
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

INSERT INTO agreement_versions (
  version, required, service_title, service_content, privacy_title, privacy_content, effective_at
) VALUES (
  '2026-07-31',
  true,
  '用户服务协议',
  '半勺提供菜谱、用餐计划与采购清单管理服务。用户应合法使用服务并对自行录入的内容负责。',
  '隐私政策',
  '半勺处理微信用户标识及经授权的昵称、头像，用于账户识别和用户数据隔离；不获取手机号。',
  '2026-07-31T00:00:00Z'
);

CREATE TABLE user_agreement_confirmations (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  agreement_version text NOT NULL REFERENCES agreement_versions(version) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'login' CHECK (source IN ('login', 'settings', 'forced')),
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_id, agreement_version)
);

CREATE INDEX user_agreement_confirmations_owner_confirmed_idx
  ON user_agreement_confirmations(owner_id, confirmed_at DESC);

CREATE FUNCTION cook_agreement_latest()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'serviceAgreementVersion', version,
    'privacyPolicyVersion', version,
    'requiredAgreementVersion', version,
    'effectiveAt', effective_at
  )
  FROM agreement_versions
  WHERE required
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;
$$;

CREATE FUNCTION cook_agreement_get(
  p_type text,
  p_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  target agreement_versions%ROWTYPE;
BEGIN
  IF p_type NOT IN ('service', 'privacy') THEN
    RAISE EXCEPTION 'invalid agreement type' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_version, ''))) = 0 THEN
    SELECT * INTO target
    FROM agreement_versions
    WHERE required
    ORDER BY effective_at DESC, version DESC
    LIMIT 1;
  ELSE
    SELECT * INTO target
    FROM agreement_versions
    WHERE version = btrim(p_version);
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_type = 'service' THEN
    RETURN jsonb_build_object(
      'type', 'service',
      'version', target.version,
      'title', target.service_title,
      'content', target.service_content,
      'effectiveAt', target.effective_at
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'privacy',
    'version', target.version,
    'title', target.privacy_title,
    'content', target.privacy_content,
    'effectiveAt', target.effective_at
  );
END;
$$;

CREATE FUNCTION cook_agreement_status(p_owner_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  WITH required_version AS (
    SELECT version
    FROM agreement_versions
    WHERE required
    ORDER BY effective_at DESC, version DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'agreedAgreementVersion', coalesce(app_user.agreed_agreement_version, ''),
    'requiredAgreementVersion', required_version.version,
    'requiresAgreementConfirm', coalesce(app_user.agreed_agreement_version, '') <> required_version.version,
    'confirmedAt', confirmation.confirmed_at
  )
  FROM app_users app_user
  CROSS JOIN required_version
  LEFT JOIN user_agreement_confirmations confirmation
    ON confirmation.owner_id = app_user.id
   AND confirmation.agreement_version = required_version.version
  WHERE app_user.id = p_owner_id;
$$;

CREATE FUNCTION cook_agreement_confirm(
  p_owner_id text,
  p_version text,
  p_source text DEFAULT 'forced'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  required_version text;
  source_value text;
BEGIN
  SELECT version INTO required_version
  FROM agreement_versions
  WHERE required
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;

  IF required_version IS NULL THEN
    RAISE EXCEPTION 'required agreement version is missing' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_version, '')) <> required_version THEN
    RAISE EXCEPTION 'invalid agreement version' USING ERRCODE = '22023';
  END IF;

  source_value := coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'forced');
  IF source_value NOT IN ('login', 'settings', 'forced') THEN
    RAISE EXCEPTION 'invalid agreement source' USING ERRCODE = '22023';
  END IF;

  UPDATE app_users
  SET agreed_agreement_version = required_version
  WHERE id = p_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO user_agreement_confirmations (
    id, owner_id, agreement_version, source, confirmed_at
  ) VALUES (
    gen_random_uuid(), p_owner_id, required_version, source_value, clock_timestamp()
  )
  ON CONFLICT (owner_id, agreement_version)
  DO UPDATE SET
    source = excluded.source,
    confirmed_at = clock_timestamp();

  RETURN cook_agreement_status(p_owner_id);
END;
$$;

CREATE OR REPLACE FUNCTION cook_auth_get_user(p_user_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  WITH required_version AS (
    SELECT version
    FROM agreement_versions
    WHERE required
    ORDER BY effective_at DESC, version DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'id', app_user.id,
    'nickName', app_user.nickname,
    'avatarUrl', app_user.avatar_url,
    'status', app_user.status,
    'agreedAgreementVersion', app_user.agreed_agreement_version,
    'requiredAgreementVersion', required_version.version,
    'requiresAgreementConfirm', app_user.agreed_agreement_version <> required_version.version
  )
  FROM app_users app_user
  CROSS JOIN required_version
  WHERE app_user.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION cook_auth_update_profile(
  p_user_id text,
  p_nickname text,
  p_avatar_url text,
  p_agreement_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  user_status text;
  required_version text;
BEGIN
  IF length(btrim(coalesce(p_agreement_version, ''))) = 0 THEN
    RAISE EXCEPTION 'agreement version is required' USING ERRCODE = '22023';
  END IF;

  SELECT version INTO required_version
  FROM agreement_versions
  WHERE required
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;

  IF required_version IS NULL OR btrim(p_agreement_version) <> required_version THEN
    RAISE EXCEPTION 'invalid agreement version' USING ERRCODE = '22023';
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
      agreed_agreement_version = required_version
  WHERE id = p_user_id;

  INSERT INTO user_agreement_confirmations (
    id, owner_id, agreement_version, source, confirmed_at
  ) VALUES (
    gen_random_uuid(), p_user_id, required_version, 'login', clock_timestamp()
  )
  ON CONFLICT (owner_id, agreement_version)
  DO UPDATE SET
    source = excluded.source,
    confirmed_at = clock_timestamp();

  RETURN cook_auth_get_user(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION cook_agreement_latest() FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_agreement_get(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_agreement_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_agreement_confirm(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_auth_get_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cook_auth_update_profile(text, text, text, text) FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION cook_agreement_latest() TO service_role;
    GRANT EXECUTE ON FUNCTION cook_agreement_get(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_agreement_status(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_agreement_confirm(text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_auth_get_user(text) TO service_role;
    GRANT EXECUTE ON FUNCTION cook_auth_update_profile(text, text, text, text) TO service_role;
  END IF;
END
$migration$;
