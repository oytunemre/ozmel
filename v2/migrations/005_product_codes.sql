-- 005_product_codes.sql — kod tanimlari (v1'deki DB.kodTanimlari)
--
-- v1'de kodTanimlari {kod, ad, tip, ...} idi ve `kod` DOGAL ANAHTAR olarak
-- routes/orders/workorders/production/urunAgaclari icinde serbest metin
-- tekrarlaniyordu. Bu yuzden hammadde/yari mamul/urun UC AYRI tabloya
-- BOLUNMEZ — FK veren tablolar tek hedef gostermeli. Tip tek tabloda ENUM.
--
-- v1'de disCap/icCap/... alanlari "float VEYA '' (bos string)" karisik tipti;
-- burada DECIMAL(12,3) NULL — deger yoksa bos string degil NULL yazilir.
-- Tip'e gore bazi alanlar anlamsiz (sparse); kural Validator'da (yalnizca
-- Hammadde'de olcu alanlari kabul edilir).
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository
-- whitelist'inde yoktur).

CREATE TABLE IF NOT EXISTS v2_product_codes (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id             VARCHAR(64)     NULL,
  code                  VARCHAR(64)     NOT NULL,
  name                  VARCHAR(255)    NOT NULL,
  type                  ENUM('Hammadde','Yarı Mamül','Ürün') NOT NULL,
  unit                  VARCHAR(32)     NULL,
  status                VARCHAR(32)     NULL,
  category              VARCHAR(128)    NULL,
  drawing_no            VARCHAR(128)    NULL,
  revision              VARCHAR(32)     NULL,
  revision_date         DATE            NULL,
  note                  TEXT            NULL,
  suppliers             TEXT            NULL,
  customer              VARCHAR(255)    NULL,
  outgoing_operation_id BIGINT UNSIGNED NULL,
  parent_product_code   VARCHAR(64)     NULL,
  -- v1'de float veya '' karisik tipti; burada gercek sayi ya da NULL.
  outer_diameter        DECIMAL(12,3)   NULL,
  inner_diameter        DECIMAL(12,3)   NULL,
  material_length       DECIMAL(12,3)   NULL,
  material_weight       DECIMAL(12,3)   NULL,
  min_stock_level       DECIMAL(12,3)   NULL,
  supply_days           DECIMAL(12,3)   NULL,
  box_quantity          DECIMAL(12,3)   NULL,
  created_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by            INT UNSIGNED    NULL,
  updated_by            INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- `kod` firma kapsaminda benzersiz — FK veren tablolarin dogal anahtari.
  UNIQUE KEY uniq_prodcode_tenant_code   (tenant_id, code),
  UNIQUE KEY uniq_prodcode_tenant_legacy (tenant_id, legacy_id),
  KEY idx_prodcode_tenant    (tenant_id),
  KEY idx_prodcode_operation (outgoing_operation_id),
  CONSTRAINT fk_prodcode_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  -- Cikan operasyon master tablodan id ile gelir; operasyon silinirse baglanti kopar (NULL).
  CONSTRAINT fk_prodcode_operation FOREIGN KEY (outgoing_operation_id) REFERENCES v2_operations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('005_product_codes');
