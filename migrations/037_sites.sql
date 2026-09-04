-- 037_sites.sql — Tedarikçi & Site Yönetimi (v1'deki DB.sites)
--
-- Basit CRUD referans/kayit tablosu. Tekil anahtar yalnizca (tenant_id, legacy_id);
-- site_code'da tekillik YOK — veride "1" gibi cakisabilir degerler var.
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by, updated_by.
-- legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository whitelist disi).

CREATE TABLE IF NOT EXISTS sites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id   VARCHAR(64)     NULL,
  supplier    VARCHAR(255)    NOT NULL,
  trigo_re    VARCHAR(128)    NULL,
  sqe         VARCHAR(128)    NULL,
  sqe_email   VARCHAR(255)    NULL,
  sqm         VARCHAR(128)    NULL,
  sqm_email   VARCHAR(255)    NULL,
  country     VARCHAR(128)    NULL,
  city        VARCHAR(128)    NULL,
  site_code   VARCHAR(64)     NULL,
  created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by  INT UNSIGNED    NULL,
  updated_by  INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_site_tenant_legacy (tenant_id, legacy_id),
  KEY idx_site_tenant (tenant_id),
  CONSTRAINT fk_site_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('037_sites');
