-- 007_working_hours.sql — calisma saatleri (v1'deki DB.calismaSaatleri)
--
-- v1'de calismaSaatleri bir DIZIYDI ama her zaman tek eleman (index [0]) kullanilirdi;
-- `ensureCalismaSaatleri` acilista 1 kayit tohumlardi. Aslinda TEK-SATIR KONFIG:
-- firma basina bir vardiya-saatleri kaydi. Burada dizi degil, UNIQUE(tenant_id) ile
-- firma basina tek satir olarak durur.
--
-- 8 zaman alani (v1: sabah/ogledenSonra x baslangic/molaBaslangic/molaBitis/bitis):
--   morning_start / morning_break_start / morning_break_end / morning_end
--   afternoon_start / afternoon_break_start / afternoon_break_end / afternoon_end
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS v2_working_hours (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id             VARCHAR(64)     NULL,
  morning_start         TIME            NOT NULL,
  morning_break_start   TIME            NOT NULL,
  morning_break_end     TIME            NOT NULL,
  morning_end           TIME            NOT NULL,
  afternoon_start       TIME            NOT NULL,
  afternoon_break_start TIME            NOT NULL,
  afternoon_break_end   TIME            NOT NULL,
  afternoon_end         TIME            NOT NULL,
  created_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by           INT UNSIGNED    NULL,
  updated_by           INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Tekil konfig: firma basina TEK satir. Bu benzersizlik "yoksa olustur" ihtiyacini kaldirir.
  UNIQUE KEY uniq_wh_tenant        (tenant_id),
  UNIQUE KEY uniq_wh_tenant_legacy (tenant_id, legacy_id),
  CONSTRAINT fk_wh_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Konfig HEP var olsun: her mevcut firma icin makul bir varsayilan vardiya tohumlanir.
-- Boylece GET api/working-hours asla bos donmez ve controller'da "yoksa olustur" olmaz.
-- INSERT IGNORE + UNIQUE(tenant_id): migration yeniden calissa da cift satir olusmaz.
INSERT IGNORE INTO v2_working_hours
  (tenant_id, morning_start, morning_break_start, morning_break_end, morning_end,
   afternoon_start, afternoon_break_start, afternoon_break_end, afternoon_end)
SELECT id, '08:00:00', '10:00:00', '10:15:00', '12:00:00',
           '13:00:00', '15:00:00', '15:15:00', '18:00:00'
  FROM tenants;

INSERT IGNORE INTO schema_migrations (version) VALUES ('007_working_hours');
