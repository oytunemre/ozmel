-- 032_capacity_operation.sql — kapasite (urun, is merkezi, OPERASYON) uclusunde
--
-- 011'de kapasite (urun, is merkezi) ciftinde tekildi. Ama ayni makinede farkli
-- operasyonlarin farkli kapasitesi olabiliyor (or. CNC OPERASYON 1 vs 2, ya da
-- dakika/adet bazli alt operasyonlar). 011'in tekil anahtari bunlari "mukerrer"
-- sayip birini tutup otekini atiyordu — ustelik tutulan eski/kaba, atilan guncel
-- (dakika bazli) kayitti. Cozum: operasyonu kayda ve tekil anahtara ekle.
--
-- operation_id NULL kalabilir (operasyonsuz eski kayitlar). MySQL'de UNIQUE
-- icindeki NULL'lar birbiriyle CAKISMAZ — bu kayitlar sorunsuz durur; yeni
-- kapasiteler ise (urun, is merkezi, operasyon) uclusunde tekil olur.
--
-- NOT: Bu migration sonrasi kapasite ETL'i (operation_id eslemesi + minutes ->
-- dakikaPerAdet duzeltmesi) yeniden calistirilir; tablo temizlenip taze yuklenir.

ALTER TABLE capacities
  ADD COLUMN operation_id BIGINT UNSIGNED NULL AFTER work_center_id,
  ADD CONSTRAINT fk_cap_operation FOREIGN KEY (operation_id) REFERENCES operations (id);

ALTER TABLE capacities
  DROP INDEX uniq_cap_tenant_product_wc,
  ADD UNIQUE KEY uniq_cap_tenant_product_wc_op
    (tenant_id, product_code_id, work_center_id, operation_id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('032_capacity_operation');
