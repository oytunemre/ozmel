-- 043_drop_audits.sql — Denetim Soruları modülü kaldırıldı (müşteri kararı, Eylül 2026).
--
-- audits tablosu v78 referansında yoktu; v2'ye taşınmış ama kullanılmıyordu (~561 kayıt
-- yedeklerde duruyor). Başka tablodan audits'e FK YOK (yalnız kendi fk_audit_tenant →
-- tenants giden bağı var; DROP ile kaldırılır) → doğrudan düşürmek güvenli.
--
-- IDEMPOTENT: tablo yoksa no-op. Geri istenirse migration 021 + ETL bloğu geri alınır.

DROP TABLE IF EXISTS audits;

INSERT IGNORE INTO schema_migrations (version) VALUES ('043_drop_audits');
