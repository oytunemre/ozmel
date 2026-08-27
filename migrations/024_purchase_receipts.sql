-- 024_purchase_receipts.sql — satinalma girisleri (v1'deki DB.satinalmaGirisleri,
-- ~19 kayit)
--
-- v1'de bu tablo malzeme kodunu KENDISI TUTMAZDI; istege bagliydi. O desen korunur:
-- malzeme bilgisi purchase_request_id -> purchase_requests uzerinden JOIN ile
-- gelir (tek kaynak, drift yok). Giris bir istege baglidir; istek silinince
-- girisleri de gider (ON DELETE CASCADE).
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id           VARCHAR(64)     NULL,
  purchase_request_id BIGINT UNSIGNED NOT NULL,
  `date`              DATE            NULL,
  quantity            DECIMAL(12,3)   NULL,
  note                TEXT            NULL,
  created_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by          INT UNSIGNED    NULL,
  updated_by          INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_prec_tenant_legacy (tenant_id, legacy_id),
  KEY idx_prec_tenant  (tenant_id),
  KEY idx_prec_request (purchase_request_id),
  CONSTRAINT fk_prec_tenant  FOREIGN KEY (tenant_id)           REFERENCES tenants               (id),
  -- Istek silinince girisleri de gider.
  CONSTRAINT fk_prec_request FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('024_purchase_receipts');
