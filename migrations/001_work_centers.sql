-- 001_work_centers.sql — is merkezleri (v1'deki DB.isMerkezleri)
--
-- v1'de {id, ad} listesiydi ve routes/capacity/workorders icinde SERBEST METIN
-- olarak tekrarlaniyordu; ad degisince digerleri drift ediyordu. Burada master
-- tabloya donusuyor, diger tablolar id ile referans verecek (Faz 4: routes,
-- capacity -> work_center_id).
--
-- Tablo adi work_centers (sade ad; onceki gecici tablo oneki DB yeniden
-- adlandirilinca kaldirildi — tum tablolar artik oneksiz).
-- legacy_id CHAR(16): v1 ETL id'leri bu bicimde; tasima sirasinda eslesme icin.

CREATE TABLE IF NOT EXISTS work_centers (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  CHAR(16)        NULL,
  name       VARCHAR(128)    NOT NULL,
  is_active  TINYINT(1)      NOT NULL DEFAULT 1,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wc_tenant_name (tenant_id, name),
  KEY idx_wc_tenant (tenant_id),
  KEY idx_wc_legacy (legacy_id),
  CONSTRAINT fk_wc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001_work_centers');
