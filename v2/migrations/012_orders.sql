-- 012_orders.sql — siparisler (v1'deki DB.orders, ~25 kayit)
--
-- v1'de order {orderNo, kaynak, urun, hedefMiktar, durum, ...} idi; urun SERBEST
-- METIN (-> routes.urun) idi. Burada urun product_code_id ile FK.
--
-- source ENUM('satis','uretim','stok'): gercek veride yalnizca 'satis' var ama v1
-- kodu 'uretim' de uretiyor, 'stok' de sozlesmede geciyor. ETL'de hangi degerin
-- gelecegini bilmedigimizden ucunu de kabul ederiz — dar ENUM kayit reddine yol acar.
-- status ENUM DEGIL, VARCHAR(32): durum degerleri kod tarafinda uretiliyor ve tam
-- listesini bilmiyoruz (gercek veride su an yalnizca 'Aktif').
--
-- Silme kaskadi: siparis silinince is emirleri (013) ve onlarin uretim kayitlari
-- (014) da gider — FK ON DELETE CASCADE zinciriyle, tek atomik DELETE'te.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS orders (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id               INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id               VARCHAR(64)     NULL,
  order_no                VARCHAR(64)     NOT NULL,
  source                  ENUM('satis','uretim','stok') NOT NULL,
  status                  VARCHAR(32)     NOT NULL,
  customer                VARCHAR(255)    NULL,
  sales_order_no          VARCHAR(64)     NULL,
  product_code_id         BIGINT UNSIGNED NOT NULL,
  target_quantity         DECIMAL(12,3)   NOT NULL,
  start_date              DATE            NULL,
  requested_delivery_date DATE            NULL,
  note                    TEXT            NULL,
  created_at              DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at              DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by              INT UNSIGNED    NULL,
  updated_by              INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_order_tenant_no     (tenant_id, order_no),
  UNIQUE KEY uniq_order_tenant_legacy (tenant_id, legacy_id),
  KEY idx_order_tenant  (tenant_id),
  KEY idx_order_product (product_code_id),
  CONSTRAINT fk_order_tenant  FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_order_product FOREIGN KEY (product_code_id) REFERENCES product_codes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('012_orders');
