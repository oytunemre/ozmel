-- 035_downtime_reasons.sql — durus nedeni referans tablosu + uretim kaydina baglanti.
--
-- Uretim Raporu'ndaki Pareto analizi durus NEDENI'ne dayanir. production'da
-- durus SAATLERI (downtime_start/end) vardi ama NEDEN alani yoktu — ne semada
-- ne yedek veride. Bu migration nedeni ekler.
--
-- downtime_reason_id NULL: durus olmayan (ya da nedeni girilmemis) kayitlar bos
-- kalir. FK: neden silinmeye calisilirsa kullanan kayit varsa engellenir (RESTRICT,
-- varsayilan) — nedenler is_active=0 ile pasife alinir, silinmez.
--
-- Ortak sutunlar deseni (id, tenant_id, created_at, updated_at, created_by, updated_by).

CREATE TABLE IF NOT EXISTS downtime_reasons (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED    NOT NULL DEFAULT 1,
  name        VARCHAR(128)    NOT NULL,
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by  INT UNSIGNED    NULL,
  updated_by  INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_dtr_tenant_name (tenant_id, name),
  KEY idx_dtr_tenant (tenant_id),
  CONSTRAINT fk_dtr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE production
  ADD COLUMN downtime_reason_id BIGINT UNSIGNED NULL AFTER downtime_end,
  ADD KEY idx_prod_downtime_reason (downtime_reason_id),
  ADD CONSTRAINT fk_prod_downtime_reason
    FOREIGN KEY (downtime_reason_id) REFERENCES downtime_reasons (id);

-- Baslangic nedenleri (tasarimdaki liste). Yeniden calistirmada ikilenmez.
INSERT IGNORE INTO downtime_reasons (tenant_id, name) VALUES
  (1, 'Malzeme bekleme'),
  (1, 'Kalıp değişimi'),
  (1, 'Mekanik arıza'),
  (1, 'Ölçü ayarı'),
  (1, 'Vardiya devri');

INSERT IGNORE INTO schema_migrations (version) VALUES ('035_downtime_reasons');
