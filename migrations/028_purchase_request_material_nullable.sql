-- 028_purchase_request_material_nullable.sql — satinalma istegi malzemesi opsiyonel
--
-- 023'te material_code_id NOT NULL idi (malzeme listeden secilecek varsayimiyla).
-- Gercek veride bir kisim istek malzemeyi kod yerine SERBEST METIN tasiyor; bunlar
-- artik NULL material_code_id ile ice alinir, orijinal metin note'a yazilir (ETL).
-- Kolon nullable yapilir; FK (fk_preq_material -> product_codes) korunur — NULL
-- degerler FK'yi ihlal etmez.

ALTER TABLE purchase_requests
  MODIFY material_code_id BIGINT UNSIGNED NULL;

INSERT IGNORE INTO schema_migrations (version) VALUES ('028_purchase_request_material_nullable');
