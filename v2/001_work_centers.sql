-- 001_work_centers.sql — is merkezleri (v1'deki DB.isMerkezleri)
--
-- v1'de {id, ad} listesiydi ve routes/capacity/workorders icinde SERBEST METIN
-- olarak tekrarlaniyordu; ad degisince digerleri drift ediyordu. Burada master
-- tabloya donusuyor, diger tablolar id ile referans verecek.

CREATE TABLE IF NOT EXISTS work_centers (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  name       VARCHAR(128)    NOT NULL,
  is_active  TINYINT(1)      NOT NULL DEFAULT 1,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wc_tenant_name (tenant_id, name),
  KEY idx_wc_tenant (tenant_id),
  CONSTRAINT fk_wc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001_work_centers');
