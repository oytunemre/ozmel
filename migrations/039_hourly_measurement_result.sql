-- 039_hourly_measurement_result.sql — Saatlik ölçüme nitel sonuç (OK/NOK)
--
-- Günlük Kalite Raporları v2 Saatlik Kontrol ızgarası nitel noktalarda OK/NOK giriyor.
-- hourly_measurements yalnızca value (DECIMAL) tutuyordu; nitel sonuç yazılamıyordu.
-- first_off_measurements ile aynı desen: result sütunu eklenir (numune ölçüsel ise
-- value, nitel ise result yazılır). Mevcut kayıtlar result=NULL kalır, veri korunur.

ALTER TABLE hourly_measurements
  ADD COLUMN result VARCHAR(32) NULL AFTER value;

INSERT IGNORE INTO schema_migrations (version) VALUES ('039_hourly_measurement_result');
