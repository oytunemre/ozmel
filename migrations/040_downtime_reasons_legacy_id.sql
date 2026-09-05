-- 040_downtime_reasons_legacy_id.sql — downtime_reasons'a ETL kimlik esleme sutunu.
--
-- 035 bu tabloyu ETK diger tablolardaki ortak "legacy_id" sutunu OLMADAN olusturdu
-- (o an yalnizca uygulama-ici referans tablosuydu). Artik ETL durusNedenleri
-- koleksiyonunu (v1) buraya tasiyor; etlUpsert/etlMapBy/etlFindByLegacy legacy_id'ye
-- dayanir. Sutun yoksa bu yardimcilar "Unknown column 'legacy_id'" hatasi verir —
-- web sarmalayicisinda (ob_start callback'i) fatal ciktiyi yutar, ekran BOS kalir.
--
-- Ortak sutun deseni: legacy_id VARCHAR(64) NULL + UNIQUE (tenant_id, legacy_id).
-- legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository whitelist disi).
-- NULL degerler UNIQUE kisitini tetiklemez → uygulamadan eklenen nedenler etkilenmez.

ALTER TABLE downtime_reasons
  ADD COLUMN legacy_id VARCHAR(64) NULL AFTER tenant_id,
  ADD UNIQUE KEY uniq_dtr_tenant_legacy (tenant_id, legacy_id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('040_downtime_reasons_legacy_id');
