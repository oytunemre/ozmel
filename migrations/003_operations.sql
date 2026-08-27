-- 003_operations.sql — operasyonlar (v1'deki DB.operasyonlarListesi)
--
-- v1'de {id, ad} listesiydi ve routes/capacity/workorders/noktalar/operator
-- yetkinlikleri icinde SERBEST METIN (operasyon adi) olarak tekrarlaniyordu;
-- ad degisince digerleri drift ediyordu. Burada master tabloya donusuyor, diger
-- tablolar id ile referans verecek (bkz. 004_operator_skills_fk.sql).
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository
-- whitelist'inde yoktur).

CREATE TABLE IF NOT EXISTS operations (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  name       VARCHAR(128)    NOT NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_operation_tenant_name   (tenant_id, name),
  UNIQUE KEY uniq_operation_tenant_legacy (tenant_id, legacy_id),
  KEY idx_operation_tenant (tenant_id),
  CONSTRAINT fk_operation_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('003_operations');
