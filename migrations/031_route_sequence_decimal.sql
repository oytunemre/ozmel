-- 031_route_sequence_decimal.sql — rota sirasi ondalikli
--
-- 010'da sequence INT idi. Referans uygulamada alt operasyon (ayni makinede ikinci
-- bir ayar/operasyon) ondalikli sira ile ekleniyor: sira 1'in alt operasyonu 1.1,
-- doluysa 1.2 ... (or. urun 226181'de "CNC OPERASYON 1" sira 1, "CNC OPERASYON 2"
-- sira 1.1). INT'te 1.1 -> 1'e yuvarlanip alt operasyon ayri satir olamiyordu.
--
-- DECIMAL(5,1): 0.1 adimli, en fazla ###.# (999.9'a kadar sira). Mevcut tam sayi
-- degerler (1, 2, ...) 1.0, 2.0 olur; API float dondugu icin ekranda "1", "2"
-- gorunur (Number.isInteger). Varsayilan/NOT NULL 010 ile ayni kalir.

ALTER TABLE routes
  MODIFY sequence DECIMAL(5,1) NOT NULL DEFAULT 0;

INSERT IGNORE INTO schema_migrations (version) VALUES ('031_route_sequence_decimal');
