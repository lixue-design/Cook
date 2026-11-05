CREATE TABLE app_users (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  wx_appid text NOT NULL CHECK (length(btrim(wx_appid)) > 0),
  wx_openid text NOT NULL CHECK (length(btrim(wx_openid)) > 0),
  wx_unionid text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT app_users_wx_identity_uq UNIQUE (wx_appid, wx_openid)
);

CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

CREATE TABLE recipe_categories (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  owner_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT recipe_categories_owner_name_uq UNIQUE (owner_id, normalized_name)
);

CREATE INDEX recipe_categories_owner_sort_idx
  ON recipe_categories(owner_id, sort_order, created_at);

CREATE TRIGGER recipe_categories_set_updated_at
BEFORE UPDATE ON recipe_categories
FOR EACH ROW EXECUTE FUNCTION ai_dish_library_set_updated_at();

ALTER TABLE recipes
  ADD CONSTRAINT recipes_owner_fk
  FOREIGN KEY (owner_id) REFERENCES app_users(id) ON DELETE RESTRICT;
