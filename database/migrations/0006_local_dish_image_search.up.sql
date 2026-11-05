CREATE TABLE dish_asset_keywords (
  dish_asset_id uuid NOT NULL REFERENCES dish_assets(id) ON DELETE CASCADE,
  keyword text NOT NULL CHECK (length(btrim(keyword)) > 0),
  normalized_keyword text NOT NULL CHECK (length(btrim(normalized_keyword)) > 0),
  keyword_type text NOT NULL CHECK (keyword_type IN ('DISH_NAME', 'ALIAS', 'INGREDIENT', 'TAG')),
  weight smallint NOT NULL DEFAULT 50 CHECK (weight BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (dish_asset_id, normalized_keyword)
);

CREATE INDEX dish_asset_keywords_inverted_idx
  ON dish_asset_keywords(normalized_keyword text_pattern_ops, weight DESC, dish_asset_id);

CREATE INDEX dish_asset_keywords_asset_idx
  ON dish_asset_keywords(dish_asset_id, weight DESC);
