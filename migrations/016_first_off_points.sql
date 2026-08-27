-- 016_first_off_points.sql — ilk parca (first-off) noktalari (v1'deki
-- DB.firstOffNoktalari, ~155 kayit)
--
-- v1'de firstOffNoktalari {urun, operasyon, no, karakteristik, tip, nominal,
-- altLimit, ustLimit, birim} idi; urun/operasyon SERBEST METIN idi. Burada ikisi
-- de id ile FK. firstOffKayitlari.degerler bu noktalarin id'sine anahtarlanir
-- (bkz. 017_first_off_records).
--
-- Kalite limitleri DECIMAL(12,4): olcum hassasiyeti icin 4 ondalik. NULL kabul —
-- nitel karakteristikte limit olmayabilir.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS first_off_points (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  product_code_id BIGINT UNSIGNED NOT NULL,
  operation_id    BIGINT UNSIGNED NOT NULL,
  point_no        INT             NOT NULL,
  characteristic  VARCHAR(255)    NOT NULL,
  type            ENUM('olcusel','nitel') NOT NULL,
  nominal         DECIMAL(12,4)   NULL,
  lower_limit     DECIMAL(12,4)   NULL,
  upper_limit     DECIMAL(12,4)   NULL,
  unit            VARCHAR(32)     NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_fop_tenant_legacy (tenant_id, legacy_id),
  KEY idx_fop_tenant    (tenant_id),
  KEY idx_fop_product   (product_code_id),
  KEY idx_fop_operation (operation_id),
  CONSTRAINT fk_fop_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_fop_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_fop_operation FOREIGN KEY (operation_id)    REFERENCES operations    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('016_first_off_points');
