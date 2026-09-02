-- 034_route_unique.sql — rota adiminda (urun, sira, is merkezi, OPERASYON) tekilligi.
--
-- Ayni urun + ayni sira + ayni is merkezinde ayni operasyon iki kez tanimlanamaz.
-- operation_id ANAHTARA DAHIL: ayni makinede ayni sirada FARKLI operasyonlar mesru
-- (or. CNC OPERASYON 1 / CNC OPERASYON 2) — kapasitelerde de ayni durum yasandi
-- (migration 032). Dortlu (urun, sira, is merkezi) anahtar bu mesru kayitlari
-- reddederdi; bu yuzden beşli anahtar.
--
-- Dogrulama: ETL yeniden calistirildi (siralar 1.0/1.1/1.2 duzeldi); mevcut veride
-- bu bešli uzerinde cakisma YOK. operation_id NOT NULL (010) oldugundan NULL-carpismasi
-- sorunu yok. Onceki tekil kisit yalnizca legacy_id uzerindeydi; korunur.

ALTER TABLE routes
  ADD UNIQUE KEY uniq_route_tenant_prod_seq_wc_op
    (tenant_id, product_code_id, sequence, work_center_id, operation_id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('034_route_unique');
