-- 020_incoming_inspections.sql — giris kalite kontrolleri (v1'deki
-- DB.girisKaliteKontrolleri, ~10 kayit) + IKI SEVIYE ic ice cocuk tablo
--
-- v1'de girisKaliteKontrolleri {satinalmaGirisIdleri[], tedarikci, malzeme, cizimNo,
-- gozlemNedeni, ilaveBilgi, kontrolEden, malzemeGelisTarihi, kontrolTarihi, gelenAdet,
-- ornekAdedi, karakteristikler[], genelSonuc} idi. Iki seviyeli ic ice yapi:
--   kayit -> karakteristik[] -> degerler[]
--
-- karakteristikler[] cocuk tabloya (v2_incoming_characteristics), her karakteristigin
-- degerler[] dizisi de bir alt cocuga (v2_incoming_values; sequence sirayi korur).
--
-- legacy_purchase_receipt_id: v1'de satinalmaGirisIdleri satinalma girislerine
-- referanstir; o tablo (satinalmaGirisleri) Faz 7'de gelecek. Simdilik referans
-- CHAR(16) METIN olarak saklanir (FK degil); Faz 7'de gercek FK'ye donusecek.
--
-- malzeme -> material_code_id FK (v2_product_codes), NULL kabul.
--
-- Ortak sutunlar (uc tabloda): id, tenant_id, legacy_id, created_at, updated_at,
-- created_by, updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS v2_incoming_inspections (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id            INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id            VARCHAR(64)     NULL,
  legacy_purchase_receipt_id CHAR(16)  NULL,
  supplier             VARCHAR(255)    NULL,
  material_code_id     BIGINT UNSIGNED NULL,
  drawing_no           VARCHAR(128)    NULL,
  reason               VARCHAR(255)    NULL,
  arrival_date         DATE            NULL,
  inspection_date      DATE            NULL,
  received_qty         DECIMAL(12,3)   NULL,
  sample_qty           INT             NULL,
  inspector_name       VARCHAR(255)    NULL,
  overall_result       VARCHAR(32)     NULL,
  created_at           DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by           INT UNSIGNED    NULL,
  updated_by           INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ii_tenant_legacy (tenant_id, legacy_id),
  KEY idx_ii_tenant   (tenant_id),
  KEY idx_ii_material (material_code_id),
  CONSTRAINT fk_ii_tenant   FOREIGN KEY (tenant_id)        REFERENCES tenants          (id),
  CONSTRAINT fk_ii_material FOREIGN KEY (material_code_id) REFERENCES v2_product_codes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seviye 1: karakteristikler.
CREATE TABLE IF NOT EXISTS v2_incoming_characteristics (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id     VARCHAR(64)     NULL,
  inspection_id BIGINT UNSIGNED NOT NULL,
  char_no       INT             NOT NULL,
  name          VARCHAR(255)    NOT NULL,
  spec_text     VARCHAR(255)    NULL,
  type          ENUM('olcusel','nitel') NOT NULL,
  nominal       DECIMAL(12,4)   NULL,
  lower_limit   DECIMAL(12,4)   NULL,
  upper_limit   DECIMAL(12,4)   NULL,
  unit          VARCHAR(32)     NULL,
  created_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by    INT UNSIGNED    NULL,
  updated_by    INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ic_tenant_inspection_no (tenant_id, inspection_id, char_no),
  UNIQUE KEY uniq_ic_tenant_legacy        (tenant_id, legacy_id),
  KEY idx_ic_tenant     (tenant_id),
  KEY idx_ic_inspection (inspection_id),
  CONSTRAINT fk_ic_tenant     FOREIGN KEY (tenant_id)     REFERENCES tenants                 (id),
  CONSTRAINT fk_ic_inspection FOREIGN KEY (inspection_id) REFERENCES v2_incoming_inspections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seviye 2: karakteristik degerleri. Degisken sayida; sequence sirayi korur.
-- v1'de degerler dizisi float VEYA 'Uygun'/'Uygun Değil' metni tasiyabiliyordu:
--   olcusel karakteristik -> value dolu, result NULL
--   nitel karakteristik   -> value NULL, result metni ('Uygun'/'Uygun Değil')
-- (first-off olcumlerindeki value+result deseniyle tutarli.)
CREATE TABLE IF NOT EXISTS v2_incoming_values (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id         VARCHAR(64)     NULL,
  characteristic_id BIGINT UNSIGNED NOT NULL,
  sequence          INT             NOT NULL,
  value             DECIMAL(12,4)   NULL,
  result            VARCHAR(24)     NULL,
  created_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by        INT UNSIGNED    NULL,
  updated_by        INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_iv_tenant_char_seq (tenant_id, characteristic_id, sequence),
  UNIQUE KEY uniq_iv_tenant_legacy   (tenant_id, legacy_id),
  KEY idx_iv_tenant (tenant_id),
  KEY idx_iv_char   (characteristic_id),
  CONSTRAINT fk_iv_tenant FOREIGN KEY (tenant_id)         REFERENCES tenants                     (id),
  CONSTRAINT fk_iv_char   FOREIGN KEY (characteristic_id) REFERENCES v2_incoming_characteristics (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('020_incoming_inspections');
