-- 044_purchase_request_material_description.sql — satınalma isteğine serbest malzeme adı.
--
-- Kaynak veride iki alan var: urun (gerçek kod → material_code_id) ve malzeme (serbest
-- açıklama, ör. "13,28*2.24*2650 Cu-ETP BAKIR BORU"). Açıklama artık AYRI sütunda tutulur;
-- ETL önce yanlışlıkla malzeme'yi koda çözmeye çalışıp material_code_id'yi NULL bırakıyordu
-- (bkz. tools/etl.php düzeltmesi). material_code_id'den sonra, nullable.
--
-- IDEMPOTENT (041 deseni): sütun varsa hiçbir şey yapmaz; yoksa ekler.

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_requests'
    AND COLUMN_NAME = 'material_description'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE purchase_requests ADD COLUMN material_description VARCHAR(255) NULL AFTER material_code_id',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_migrations (version) VALUES ('044_purchase_request_material_description');
