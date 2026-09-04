-- 038_first_off_measurement_sequence.sql — First Off ölçümüne numune sırası
--
-- Günlük Kalite Raporları v2 First Off formu nokta başına ÇOK NUMUNE ("İlk 6 Parça")
-- giriyor. first_off_measurements şimdiye dek nokta başına TEK değer tutuyordu
-- (UNIQUE record+point). hourly_measurements deseniyle uyumlu hale getirilir:
-- sequence sütunu (numune indeksi) eklenir, tekil anahtar (record,point,sequence) olur.
-- value/result korunur: numune ölçüsel ise value, nitel (OK/NOK) ise result yazılır.
-- Mevcut kayıtlar sequence=0 alır (varsayılan), veri korunur.

ALTER TABLE first_off_measurements
  ADD COLUMN sequence INT NOT NULL DEFAULT 0 AFTER point_id,
  DROP INDEX uniq_fom_tenant_record_point,
  ADD UNIQUE KEY uniq_fom_tenant_record_point_seq (tenant_id, record_id, point_id, sequence);

-- First Off formunda "Not" alani var; first_off_records'ta karsiligi yoktu — eklenir.
ALTER TABLE first_off_records
  ADD COLUMN note TEXT NULL AFTER overall_result;

INSERT IGNORE INTO schema_migrations (version) VALUES ('038_first_off_measurement_sequence');
