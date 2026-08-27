-- 023_purchase_requests.sql — satinalma istekleri (v1'deki DB.satinalmaIstekleri,
-- ~29 kayit)
--
-- Ekip karari: malzeme artik LISTEDEN secilecek, serbest metin degil ->
-- material_code_id FK (product_codes) NOT NULL. Malzeme tanimi AYRI SUTUN
-- TUTULMAZ; product_codes.name'den JOIN ile gelir (tek kaynak, drift yok).
--
-- NOT: gercek veride 14 malzemenin 10'u kod yerine aciklama tasiyor; Melih
-- duzeltiyor, ETL oncesi temizlenmis olacak (bu yuzden NOT NULL guvenli).
--
-- product_code_id: istek hangi urun icin (opsiyonel). order_id: bagli siparis
-- (opsiyonel). Ikisi de FK.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS purchase_requests (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id        INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id        VARCHAR(64)     NULL,
  material_code_id BIGINT UNSIGNED NOT NULL,
  product_code_id  BIGINT UNSIGNED NULL,
  quantity         DECIMAL(12,3)   NULL,
  unit             VARCHAR(32)     NULL,
  supplier         VARCHAR(255)    NULL,
  request_date     DATE            NULL,
  expected_date    DATE            NULL,
  order_id         BIGINT UNSIGNED NULL,
  note             TEXT            NULL,
  created_at       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by       INT UNSIGNED    NULL,
  updated_by       INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_preq_tenant_legacy (tenant_id, legacy_id),
  KEY idx_preq_tenant   (tenant_id),
  KEY idx_preq_material (material_code_id),
  KEY idx_preq_product  (product_code_id),
  KEY idx_preq_order    (order_id),
  CONSTRAINT fk_preq_tenant   FOREIGN KEY (tenant_id)        REFERENCES tenants          (id),
  CONSTRAINT fk_preq_material  FOREIGN KEY (material_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_preq_product   FOREIGN KEY (product_code_id)  REFERENCES product_codes (id),
  -- Bagli siparis silinirse istek kalir, bag kopar.
  CONSTRAINT fk_preq_order     FOREIGN KEY (order_id)         REFERENCES orders        (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('023_purchase_requests');
