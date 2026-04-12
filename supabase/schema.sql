-- ============================================================
-- 課税移出簿 Supabase スキーマ定義
-- ============================================================

-- ----------------------------------------
-- 1. partners（取引先）
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS partners (
  no              SERIAL          PRIMARY KEY,           -- 取引先番号（自動採番）
  name            TEXT            NOT NULL,              -- 取引先名
  country         TEXT,                                  -- 国
  prefecture      TEXT,                                  -- 都道府県
  address         TEXT,                                  -- 住所
  phone           TEXT,                                  -- 電話番号
  person          TEXT,                                  -- 担当者名
  remarks         TEXT,                                  -- 備考
  claims          TEXT,                                  -- クレーム内容
  lost            BOOLEAN         NOT NULL DEFAULT FALSE, -- 取引終了フラグ
  partner_type    TEXT,                                  -- 取引先区分
  export_country  TEXT,                                  -- 輸出先国
  map_condition_released BOOLEAN NOT NULL DEFAULT FALSE, -- 地図条件解除済みフラグ
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- updated_at を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------
-- 2. products（商品）
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS products (
  product_id      TEXT            PRIMARY KEY,           -- 商品ID
  product_name    TEXT            NOT NULL,              -- 商品名
  json            JSONB,                                 -- 商品詳細（JSONB）
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
