-- 030_order_status_backfill.sql — eski tek durum 'Aktif' -> 'Üretimde'
--
-- orders.status v1'de anlamsizca hep 'Aktif'ti; artik 9 asamali akis var (kod
-- tarafinda dogrulanir, sutun VARCHAR(32) kalir — DB enum'a cevrilmez). Mevcut
-- 'Aktif' kayitlari akistaki en yakin anlamli duruma (Üretimde) tasinir; boylece
-- OrderValidator'in enum dogrulamasindan gecerler.

UPDATE orders SET status = 'Üretimde' WHERE status = 'Aktif';

INSERT IGNORE INTO schema_migrations (version) VALUES ('030_order_status_backfill');
