-- 017_first_off_records.sql — ilk parca (first-off) kayitlari (v1'deki
-- DB.firstOffKayitlari, ~55 kayit) + iki cocuk tablo
--
-- v1'de firstOffKayitlari {urun, operasyon, tarih, vardiya, operator(isim),
-- isEmriNo, numuneAdedi, kontrolSaati, gerekce[], degerler{}, not, genelKarar} idi.
-- Iki ic ice koleksiyon vardi:
--   degerler{} : firstOffNoktalari.id -> olcum (her nokta icin tek olcum)
--   gerekce[]  : duz string dizisi
-- Ikisi de cocuk tabloya ayrilir. Operator ISIM metnidir (v1'de id degil) —
-- FK degil, operator_name olarak saklanir.
--
-- vardiya: VARCHAR(24), ENUM DEGIL. production'da Sabah/Öğleden Sonra kullaniliyor
-- ama kalite kayitlarinda '1' var; iki deger seti birlesene kadar ENUM erken olur.
--
-- Ana kayit + iki cocuk TEK transaction'da yazilir; cocuk degisince touch().
--
-- Ortak sutunlar (uc tabloda): id, tenant_id, legacy_id, created_at, updated_at,
-- created_by, updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS v2_first_off_records (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  product_code_id BIGINT UNSIGNED NOT NULL,
  operation_id    BIGINT UNSIGNED NOT NULL,
  `date`          DATE            NOT NULL,
  shift           VARCHAR(24)     NOT NULL,
  operator_name   VARCHAR(255)    NULL,
  wo_no           VARCHAR(64)     NULL,
  sample_count    INT             NULL,
  check_time      TIME            NULL,
  overall_result  VARCHAR(32)     NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_for_tenant_legacy (tenant_id, legacy_id),
  KEY idx_for_tenant    (tenant_id),
  KEY idx_for_product   (product_code_id),
  KEY idx_for_operation (operation_id),
  CONSTRAINT fk_for_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_for_product   FOREIGN KEY (product_code_id) REFERENCES v2_product_codes (id),
  CONSTRAINT fk_for_operation FOREIGN KEY (operation_id)    REFERENCES v2_operations    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cocuk 1: olcumler. v1'de degerler{} nesnesi nokta id'sine anahtarliydi —
-- her nokta icin tek olcum (UNIQUE tenant+record+point).
CREATE TABLE IF NOT EXISTS v2_first_off_measurements (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  record_id  BIGINT UNSIGNED NOT NULL,
  point_id   BIGINT UNSIGNED NOT NULL,
  value      DECIMAL(12,4)   NULL,
  result     VARCHAR(32)     NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_fom_tenant_record_point (tenant_id, record_id, point_id),
  UNIQUE KEY uniq_fom_tenant_legacy       (tenant_id, legacy_id),
  KEY idx_fom_tenant (tenant_id),
  KEY idx_fom_record (record_id),
  KEY idx_fom_point  (point_id),
  CONSTRAINT fk_fom_tenant FOREIGN KEY (tenant_id) REFERENCES tenants               (id),
  CONSTRAINT fk_fom_record FOREIGN KEY (record_id) REFERENCES v2_first_off_records  (id) ON DELETE CASCADE,
  CONSTRAINT fk_fom_point  FOREIGN KEY (point_id)  REFERENCES v2_first_off_points   (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cocuk 2: gerekceler. v1'de gerekce[] duz string diziydi.
CREATE TABLE IF NOT EXISTS v2_first_off_reasons (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  record_id  BIGINT UNSIGNED NOT NULL,
  reason     VARCHAR(255)    NOT NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_fr_tenant_record_reason (tenant_id, record_id, reason),
  UNIQUE KEY uniq_fr_tenant_legacy        (tenant_id, legacy_id),
  KEY idx_fr_tenant (tenant_id),
  KEY idx_fr_record (record_id),
  CONSTRAINT fk_fr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants              (id),
  CONSTRAINT fk_fr_record FOREIGN KEY (record_id) REFERENCES v2_first_off_records (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('017_first_off_records');
