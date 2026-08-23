-- 021_audits.sql — denetim soru bankasi (v1'deki DB.audits, ~561 kayit; en buyuk tablo)
--
-- v1'de audit {form, section, question, score, evidence} idi. Seed semasinda
-- parca/tedarikci baglantisi YOK — bagimsiz denetim soru bankasi, bu yuzden FK yok.
-- score v1'de float|null ('' -> null) idi; burada DECIMAL(12,4) NULL.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS v2_audits (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  form       VARCHAR(64)     NOT NULL DEFAULT 'TQS',
  section    VARCHAR(255)    NOT NULL,
  question   TEXT            NOT NULL,
  score      DECIMAL(12,4)   NULL,
  evidence   TEXT            NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_audit_tenant_legacy (tenant_id, legacy_id),
  KEY idx_audit_tenant (tenant_id),
  KEY idx_audit_form   (tenant_id, form),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('021_audits');
