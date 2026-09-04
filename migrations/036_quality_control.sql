-- 036_quality_control.sql — Kalite Kontrol (v1'deki DB.kontrolPlani + DB.kaliteOlcumleri)
--
-- Iki tablo:
--   control_plans        (124 kayit) — sipariş ürününe bağlı kontrol planı maddeleri
--   quality_measurements ( 60 kayit) — (sipariş, plan maddesi) için APPEND-ONLY ölçüm günlüğü
--
-- v1'de kontrolPlani.sira METIN idi ("G"=Girdi/Hammadde Kabul, "S", "1".."5") — routes.sequence
-- (DECIMAL(5,1)) ile KARISTIRILMAZ; burada sequence_label VARCHAR(8).
--
-- v1 numuneAdedi cogunlukla SERBEST METIN ("FR-09 Ölçüm Frekans Tablosu", "Tümü", "Her koli";
-- 124 kayittan yalnizca 4'u sayi) → sample_size INT DEGIL, VARCHAR(128). Veri kaybetme.
--
-- operation_id / work_center_id nullable: veride isMerkezi cogu kayitta bos, operasyon
-- "Hammadde Kabul" gibi rota disi degerler icerebilir — ETL eslesmezse NULL birakir, atmaz.
--
-- quality_measurements APPEND-ONLY: ekranda gosterilen (siparis, madde) icin EN SON olcum;
-- yeni giris ustune yazmaz, yeni satir ekler. Optimistic locking gerekmez.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by, updated_by.
-- legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository whitelist disinda).

CREATE TABLE IF NOT EXISTS control_plans (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id         VARCHAR(64)     NULL,
  product_code_id   BIGINT UNSIGNED NOT NULL,
  sequence_label    VARCHAR(8)      NULL,          -- "G", "S", "1".."5" — metin
  operation_id      BIGINT UNSIGNED NULL,          -- eslesirse operations.id, yoksa NULL
  operation_label   VARCHAR(128)    NULL,          -- v1 operasyon HAM metni ("Hammadde Kabul" gibi rota disi
                                                   -- degerler operation_id'ye eslesmez; grup basligi icin saklanir)
  work_center_id    BIGINT UNSIGNED NULL,
  characteristic    VARCHAR(255)    NOT NULL,
  specification_raw TEXT            NULL,
  type              VARCHAR(16)     NOT NULL,       -- olcusel | nitel
  lower_limit       DECIMAL(12,4)   NULL,
  upper_limit       DECIMAL(12,4)   NULL,
  nominal           DECIMAL(12,4)   NULL,
  unit              VARCHAR(32)     NULL,
  measure_method    VARCHAR(128)    NULL,
  sample_size       VARCHAR(128)    NULL,           -- v1 numuneAdedi (cogunlukla serbest metin)
  check_frequency   VARCHAR(128)    NULL,
  record_form       VARCHAR(128)    NULL,
  action_on_fail    TEXT            NULL,
  created_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by        INT UNSIGNED    NULL,
  updated_by        INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_cp_tenant_legacy (tenant_id, legacy_id),
  KEY idx_cp_tenant    (tenant_id),
  KEY idx_cp_product   (product_code_id),
  KEY idx_cp_operation (operation_id),
  KEY idx_cp_wc        (work_center_id),
  CONSTRAINT fk_cp_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants       (id),
  CONSTRAINT fk_cp_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_cp_operation FOREIGN KEY (operation_id)    REFERENCES operations    (id) ON DELETE SET NULL,
  CONSTRAINT fk_cp_wc        FOREIGN KEY (work_center_id)  REFERENCES work_centers  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_measurements (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  order_id        BIGINT UNSIGNED NOT NULL,
  control_plan_id BIGINT UNSIGNED NOT NULL,
  measured_at     DATE            NULL,
  shift           VARCHAR(16)     NULL,
  value           DECIMAL(12,4)   NULL,            -- nitel maddede NULL olabilir
  result          VARCHAR(32)     NULL,            -- Uygun | Uygun Değil
  operator        VARCHAR(128)    NULL,
  note            TEXT            NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_qm_tenant_legacy (tenant_id, legacy_id),
  KEY idx_qm_tenant (tenant_id),
  KEY idx_qm_order  (order_id),
  KEY idx_qm_plan   (control_plan_id),
  CONSTRAINT fk_qm_tenant FOREIGN KEY (tenant_id)       REFERENCES tenants       (id),
  CONSTRAINT fk_qm_order  FOREIGN KEY (order_id)        REFERENCES orders        (id),
  CONSTRAINT fk_qm_plan   FOREIGN KEY (control_plan_id) REFERENCES control_plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('036_quality_control');
