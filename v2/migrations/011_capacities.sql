-- 011_capacities.sql — kapasiteler (v1'deki DB.capacity, ~148 kayit)
--
-- v1'de her kayit {urun, isMerkezi, kapasite, dakika} idi; urun/isMerkezi SERBEST
-- METIN olarak tekrarlaniyordu. Burada ikisi de id ile FK:
--   urun      -> product_code_id (product_codes)
--   isMerkezi -> work_center_id  (work_centers)
--   kapasite  -> capacity_per_shift (vardiya basi)
--   dakika    -> minutes (opsiyonel)
--
-- Bir urun-is merkezi ciftinin tek kapasite kaydi olur: UNIQUE(tenant_id,
-- product_code_id, work_center_id).
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS capacities (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id          VARCHAR(64)     NULL,
  product_code_id    BIGINT UNSIGNED NOT NULL,
  work_center_id     BIGINT UNSIGNED NOT NULL,
  capacity_per_shift DECIMAL(12,3)   NOT NULL,
  minutes            DECIMAL(12,3)   NULL,
  created_at         DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at         DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by         INT UNSIGNED    NULL,
  updated_by         INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Bir urun-is merkezi cifti icin tek kapasite.
  UNIQUE KEY uniq_cap_tenant_product_wc (tenant_id, product_code_id, work_center_id),
  UNIQUE KEY uniq_cap_tenant_legacy     (tenant_id, legacy_id),
  KEY idx_cap_tenant  (tenant_id),
  KEY idx_cap_product (product_code_id),
  KEY idx_cap_wc      (work_center_id),
  CONSTRAINT fk_cap_tenant  FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_cap_product FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_cap_wc      FOREIGN KEY (work_center_id)  REFERENCES work_centers  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('011_capacities');
