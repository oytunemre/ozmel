-- 026_relax_order_keys.sql — order_no / wo_no benzersizligini bilesik anahtara gevset
--
-- Gercek veri gosterdi ki order_no bir MUSTERI SIPARIS NUMARASI ve altinda birden
-- fazla urun kalemi olabiliyor (or. SP-2026-50486 -> 4 farkli urun). wo_no de ayni
-- sekilde. 012/013'teki UNIQUE(tenant_id, order_no) / UNIQUE(tenant_id, wo_no) bu veri
-- icin fazla kati; ETL'de ~7 siparis + bagli is emirleri/uretim zincirleme atlaniyordu.
--
-- Cozum: benzersizligi product_code_id ile bilesik anahtara cevir — ayni siparis no
-- altinda FARKLI urunler olabilir, ama AYNI urun iki kez girilemez. Aramalar icin
-- (tenant_id, no) uzerine ayrica (unique OLMAYAN) indeks eklenir.

ALTER TABLE v2_orders
  DROP INDEX uniq_order_tenant_no,
  ADD UNIQUE KEY uniq_order_tenant_no_product (tenant_id, order_no, product_code_id),
  ADD KEY idx_order_no (tenant_id, order_no);

ALTER TABLE v2_work_orders
  DROP INDEX uniq_wo_tenant_no,
  ADD UNIQUE KEY uniq_wo_tenant_no_product (tenant_id, wo_no, product_code_id),
  ADD KEY idx_wo_no (tenant_id, wo_no);

INSERT IGNORE INTO schema_migrations (version) VALUES ('026_relax_order_keys');
