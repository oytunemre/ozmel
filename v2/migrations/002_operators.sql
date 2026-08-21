-- 002_operators.sql — operatorler (v1'deki DB.operatorler)
--
-- v1'de her kayit {id, adSoyad, sicilNo, durum, yetkinOperasyonlar[]} idi;
-- yetkinOperasyonlar bir SERBEST METIN dizisiydi (operasyon adlari). Burada
-- operatorun kendisi ana tabloya, yetkinlikler v2_operator_skills cocuk
-- tablosuna ayrilir — bir satir bir yetkinlik. production.operator ileride
-- bu tabloya id ile referans verecek.
--
-- Ortak sutunlar (her iki tabloda): id, tenant_id, legacy_id, created_at,
-- updated_at, created_by, updated_by. legacy_id yalnizca v1 tasima icin;
-- API'den yazilmaz (Repository whitelist'inde yoktur).

CREATE TABLE IF NOT EXISTS v2_operators (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  full_name  VARCHAR(128)    NOT NULL,
  badge_no   VARCHAR(64)     NOT NULL,
  is_active  TINYINT(1)      NOT NULL DEFAULT 1,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_op_tenant_badge  (tenant_id, badge_no),
  UNIQUE KEY uniq_op_tenant_legacy (tenant_id, legacy_id),
  KEY idx_op_tenant (tenant_id),
  CONSTRAINT fk_op_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_operator_skills (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id      VARCHAR(64)     NULL,
  operator_id    BIGINT UNSIGNED NOT NULL,
  operation_name VARCHAR(128)    NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by     INT UNSIGNED    NULL,
  updated_by     INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Ayni operatorde ayni operasyon iki kez olamaz.
  UNIQUE KEY uniq_opskill_tenant_op_name (tenant_id, operator_id, operation_name),
  UNIQUE KEY uniq_opskill_tenant_legacy  (tenant_id, legacy_id),
  KEY idx_opskill_tenant   (tenant_id),
  KEY idx_opskill_operator (operator_id),
  CONSTRAINT fk_opskill_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants     (id),
  -- Operator silinince yetkinlikleri de gider.
  CONSTRAINT fk_opskill_operator FOREIGN KEY (operator_id) REFERENCES v2_operators (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('002_operators');
