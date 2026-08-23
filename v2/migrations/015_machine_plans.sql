-- 015_machine_plans.sql — makine planlari (v1'deki DB.makinePlani, ~82 kayit)
--
-- v1'de makinePlani {tarih, isMerkezi, urun, workOrderId?, hedefMiktar?, not} idi;
-- isMerkezi/urun/workOrderId SERBEST METIN idi. Burada hepsi id ile FK.
--
-- work_order_id ON DELETE SET NULL: plan kaydi tarih/is merkezi/urun'e baglidir,
-- is emrine degil. Is emri (dolayisiyla siparis kaskadi) silinince plan KALIR,
-- yalnizca work_order_id NULL olur — plan gecmisi kaybolmasin.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS v2_machine_plans (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  `date`          DATE            NOT NULL,
  work_center_id  BIGINT UNSIGNED NOT NULL,
  product_code_id BIGINT UNSIGNED NOT NULL,
  work_order_id   BIGINT UNSIGNED NULL,
  target_quantity DECIMAL(12,3)   NULL,
  note            TEXT            NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_mplan_tenant_legacy (tenant_id, legacy_id),
  KEY idx_mplan_tenant    (tenant_id),
  KEY idx_mplan_wc        (work_center_id),
  KEY idx_mplan_product   (product_code_id),
  KEY idx_mplan_workorder (work_order_id),
  CONSTRAINT fk_mplan_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_mplan_wc        FOREIGN KEY (work_center_id)  REFERENCES v2_work_centers  (id),
  CONSTRAINT fk_mplan_product   FOREIGN KEY (product_code_id) REFERENCES v2_product_codes (id),
  -- Is emri silinince plan kalir, baglanti kopar.
  CONSTRAINT fk_mplan_workorder FOREIGN KEY (work_order_id)  REFERENCES v2_work_orders   (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('015_machine_plans');
