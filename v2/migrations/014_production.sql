-- 014_production.sql — uretim kayitlari (v1'deki DB.production, ~98 kayit)
--
-- v1'de production {workOrderId, tarih, vardiya, gercekAdet, fireAdet, hedefAdet,
-- not, operator?, durusBaslangic?, durusBitis?} idi. workOrderId/urun SERBEST
-- METIN idi; burada work_order_id / operator_id ile FK.
--
-- vardiya v1'de IKI tutarsiz deger seti kullaniyordu ('1'/'2'/'3' vs 'Sabah'/
-- 'Öğleden Sonra'/'Mesai'). Gercek veride yalnizca Sabah/Öğleden Sonra var; ENUM'a
-- 'Mesai' de eklenir (kod destekliyor) — ileride kullanilirsa reddedilmesin.
--
-- Silme kaskadi: is emri silinince uretim kayitlari da gider (ON DELETE CASCADE).
-- Operator silinirse kayit kalir ama operator_id NULL olur (SET NULL).
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS production (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  work_order_id   BIGINT UNSIGNED NOT NULL,
  `date`          DATE            NOT NULL,
  shift           ENUM('Sabah','Öğleden Sonra','Mesai') NOT NULL,
  target_quantity DECIMAL(12,3)   NULL,
  actual_quantity DECIMAL(12,3)   NOT NULL,
  scrap_quantity  DECIMAL(12,3)   NOT NULL,
  operator_id     BIGINT UNSIGNED NULL,
  downtime_start  TIME            NULL,
  downtime_end    TIME            NULL,
  note            TEXT            NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_prod_tenant_legacy (tenant_id, legacy_id),
  KEY idx_prod_tenant    (tenant_id),
  KEY idx_prod_workorder (work_order_id),
  KEY idx_prod_operator  (operator_id),
  CONSTRAINT fk_prod_tenant    FOREIGN KEY (tenant_id)     REFERENCES tenants         (id),
  -- Is emri silinince uretim kayitlari da gider.
  CONSTRAINT fk_prod_workorder FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE,
  -- Operator silinirse kayit kalir, baglanti kopar.
  CONSTRAINT fk_prod_operator  FOREIGN KEY (operator_id)   REFERENCES operators    (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('014_production');
