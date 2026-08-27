-- 013_work_orders.sql — is emirleri (v1'deki DB.workorders, ~41 kayit)
--
-- v1'de workorder {urun, hedefMiktar, durum, orderId?, sira?, operasyon?,
-- isMerkezi?, varyant?, splitEtiket?} idi; urun/operasyon/isMerkezi SERBEST
-- METIN idi. Burada hepsi id ile FK. v1'de manuel-modal ve rota-kaynakli is
-- emirleri AYRIK alan setine sahipti; ancak gercek veride tum kayitlar ayni alan
-- setinde — bu yuzden tip ayirt edici sutun YOK.
--
-- Nullability: v1'de operasyon/isMerkezi/sira OPSIYONEL; ETL'de hangisinin gelecegini
-- bilmedigimizden bu FK'ler NULL kabul eder (dar sema kayit reddine yol acar).
-- urun/hedefMiktar/durum zorunlu. order_id de NOT NULL: gercek veride 41 is emrinin
-- hepsinde dolu, ayrica ON DELETE CASCADE bagli bir FK'nin NULL olabilmesi oksuz
-- kayit yaratir (siparisi olmayan is emri kaskad disinda kalir).
--
-- Silme kaskadi: is emri silinince uretim kayitlari (014) da gider (ON DELETE
-- CASCADE). Siparis silinince de order_id kaskadiyla is emirleri gider.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS work_orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  wo_no           VARCHAR(64)     NOT NULL,
  order_id        BIGINT UNSIGNED NOT NULL,
  product_code_id BIGINT UNSIGNED NOT NULL,
  operation_id    BIGINT UNSIGNED NULL,
  work_center_id  BIGINT UNSIGNED NULL,
  sequence        INT             NULL,
  target_quantity DECIMAL(12,3)   NOT NULL,
  status          VARCHAR(32)     NOT NULL,
  split_label     VARCHAR(128)    NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wo_tenant_no     (tenant_id, wo_no),
  UNIQUE KEY uniq_wo_tenant_legacy (tenant_id, legacy_id),
  KEY idx_wo_tenant    (tenant_id),
  KEY idx_wo_order     (order_id),
  KEY idx_wo_product   (product_code_id),
  KEY idx_wo_operation (operation_id),
  KEY idx_wo_wc        (work_center_id),
  CONSTRAINT fk_wo_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  -- Siparis silinince is emirleri de gider.
  CONSTRAINT fk_wo_order     FOREIGN KEY (order_id)        REFERENCES orders        (id) ON DELETE CASCADE,
  CONSTRAINT fk_wo_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_wo_operation FOREIGN KEY (operation_id)    REFERENCES operations    (id),
  CONSTRAINT fk_wo_wc        FOREIGN KEY (work_center_id)  REFERENCES work_centers  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('013_work_orders');
