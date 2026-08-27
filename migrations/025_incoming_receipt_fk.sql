-- 025_incoming_receipt_fk.sql — giris kontrolu -> satinalma girisi bagini kapat
--
-- 020'de incoming_inspections satinalma girisini legacy_purchase_receipt_id
-- (CHAR(16) METIN) olarak tutuyordu, cunku satinalma girisleri tablosu henuz yoktu.
-- 024 ile purchase_receipts geldi; artik gercek FK verilebilir.
--
-- purchase_receipt_id BIGINT eklenir ve purchase_receipts(id)'ye FK (ON DELETE
-- SET NULL) olur. legacy_purchase_receipt_id SILINMEZ — ETL sirasinda eski id ile
-- yeni id'yi eslestirmek icin gerekli; Faz 8 sonrasi temizlenecek.
--
-- (Modul numarasi: 024 satinalma girisleri tablosuna gitti; bu bag kapama ondan
--  sonra calismali, bu yuzden 025.)

ALTER TABLE incoming_inspections
  ADD COLUMN purchase_receipt_id BIGINT UNSIGNED NULL AFTER legacy_purchase_receipt_id,
  ADD KEY idx_ii_receipt (purchase_receipt_id),
  ADD CONSTRAINT fk_ii_receipt FOREIGN KEY (purchase_receipt_id)
      REFERENCES purchase_receipts (id) ON DELETE SET NULL;

INSERT IGNORE INTO schema_migrations (version) VALUES ('025_incoming_receipt_fk');
