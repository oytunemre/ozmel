-- 041_control_plans_operation_label_guard.sql — control_plans.operation_label güvencesi.
--
-- 036 bu sütunu CREATE TABLE içinde tanımlar (v1 operasyon HAM metni). Ancak bazı
-- ortamlarda 036 sütun eklenmeden ÖNCEki bir sürümüyle uygulanmış, schema_migrations'a
-- '036' kayıtlanmış ve sonraki düzeltme bir daha çalışmamıştır (drift). Bu yüzden ETL
-- kontrolPlani → control_plans yazarken "Unknown column 'operation_label'" ile patlar.
--
-- Bu migration IDEMPOTENT: sütun varsa (taze DB'de 036 zaten oluşturmuştur) hiçbir şey
-- yapmaz; yoksa (drift olmuş DB) ekler. Böylece hem taze cutover hem eski DB güvenli.
-- 036 deseniyle aynı: VARCHAR(128) NULL, operation_id'den sonra. legacy_id gibi
-- API'den yazılmaz; v1 rota dışı değerlerde grup başlığı için saklanır.

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'control_plans'
    AND COLUMN_NAME = 'operation_label'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE control_plans ADD COLUMN operation_label VARCHAR(128) NULL AFTER operation_id',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_migrations (version) VALUES ('041_control_plans_operation_label_guard');
