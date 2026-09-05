-- 042_production_unique.sql — uretim kayitlarinda dogal anahtar tekilligi.
--
-- Sorun: production.js her kayitta api.create cagiriyordu; ayni (is emri, tarih,
-- vardiya, operator) icin ikinci giris MUKERRER satir uretiyordu → uretim toplamlari
-- cift sayiliyor (is emri %, verimlilik, uretim raporu, pano, genel bakis, stok...).
--
-- Cozum: dogal anahtari tekil yap. operator_id ANAHTARA DAHIL — ayni is emri/tarih/
-- vardiyada FARKLI operatorler kendi hedef/gerceklesen degerleriyle ayri kayit tutar
-- (gercek is durumu, mukerrer degil). operator_id NULL olan kayitlar MySQL'de UNIQUE'i
-- tetiklemez (NULL'lar carpismaz) → operatorsuz kayitlar serbest kalir; kabul edildi.
--
-- IDEMPOTENT (migration 041 deseni): kisit varsa DO 0 no-op, yoksa ekler. Boylece
-- taze cutover DB'sinde ve dev DB'de ayni davranir.
--
-- ONKOSUL: eklenmeden once mevcut cakismalar temizlenmis olmali (ayni besli anahtarla
-- >1 satir). Cakisma varken ADD UNIQUE 1062 verir; migration calismaz.

SET @has_key := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production'
    AND INDEX_NAME = 'uniq_prod_tenant_wo_date_shift_op'
);
SET @ddl := IF(@has_key = 0,
  'ALTER TABLE production ADD UNIQUE KEY uniq_prod_tenant_wo_date_shift_op (tenant_id, work_order_id, `date`, shift, operator_id)',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_migrations (version) VALUES ('042_production_unique');
