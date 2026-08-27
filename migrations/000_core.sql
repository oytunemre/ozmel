-- 000_core.sql — cekirdek: migration takibi, tenant, kullanici baglantisi
-- Bir kez calisir. Uygulama acilisinda hicbir veri duzeltme kodu calismaz.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(64) NOT NULL,
  applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenants (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(128) NOT NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_tenant_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tenants (id, name) VALUES (1, 'Ozmel Dis Ticaret');
