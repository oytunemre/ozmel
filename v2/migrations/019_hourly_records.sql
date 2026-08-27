-- 019_hourly_records.sql — saatlik kontrol kayitlari (v1'deki DB.saatlikKayitlari,
-- ~24 kayit) + cocuk tablo
--
-- v1'de saatlikKayitlari {urun, operasyon, tarih, vardiya, saat, personel, makina,
-- uretimAdedi, degerler{}} idi. degerler{} nesnesi nokta id'sine anahtarliydi ama
-- degeri DEGISKEN UZUNLUKTA DIZIYDI (6, 3, 3 elemanli) — first-off'tan farki bu:
-- bir nokta icin BIRDEN COK olcum. Her deger ayri satir; sequence diziyi (sirayi)
-- korur. UNIQUE(tenant, record, point, sequence).
--
-- vardiya VARCHAR(24) (ENUM degil; kalite '1' vs production Sabah/Öğleden Sonra).
-- personel/makina ISIM metnidir (FK degil). Ana kayit + cocuk tek transaction'da,
-- cocuk degisince touch().
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS hourly_records (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id        INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id        VARCHAR(64)     NULL,
  product_code_id  BIGINT UNSIGNED NOT NULL,
  operation_id     BIGINT UNSIGNED NOT NULL,
  `date`           DATE            NOT NULL,
  shift            VARCHAR(24)     NOT NULL,
  hour             TIME            NULL,
  personnel_name   VARCHAR(255)    NULL,
  machine_name     VARCHAR(255)    NULL,
  production_count INT             NULL,
  created_at       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by       INT UNSIGNED    NULL,
  updated_by       INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_hr_tenant_legacy (tenant_id, legacy_id),
  KEY idx_hr_tenant    (tenant_id),
  KEY idx_hr_product   (product_code_id),
  KEY idx_hr_operation (operation_id),
  CONSTRAINT fk_hr_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_hr_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_hr_operation FOREIGN KEY (operation_id)    REFERENCES operations    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cocuk: olcumler. Bir nokta icin degisken sayida deger; sequence sirayi korur.
CREATE TABLE IF NOT EXISTS hourly_measurements (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  record_id  BIGINT UNSIGNED NOT NULL,
  point_id   BIGINT UNSIGNED NOT NULL,
  sequence   INT             NOT NULL,
  value      DECIMAL(12,4)   NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Bir kayitta bir noktanin belli sirasi (sequence) tek olabilir.
  UNIQUE KEY uniq_hm_tenant_record_point_seq (tenant_id, record_id, point_id, sequence),
  UNIQUE KEY uniq_hm_tenant_legacy           (tenant_id, legacy_id),
  KEY idx_hm_tenant (tenant_id),
  KEY idx_hm_record (record_id),
  KEY idx_hm_point  (point_id),
  CONSTRAINT fk_hm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants            (id),
  CONSTRAINT fk_hm_record FOREIGN KEY (record_id) REFERENCES hourly_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_hm_point  FOREIGN KEY (point_id)  REFERENCES hourly_points  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('019_hourly_records');
