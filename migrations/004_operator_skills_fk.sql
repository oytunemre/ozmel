-- 004_operator_skills_fk.sql — yetkinlikleri operasyon adindan operasyon id'sine tasi
--
-- 002'de operator_skills.operation_name SERBEST METIN idi (v1 mirasi). Artik
-- operasyonlar master tabloda (003_operations), yani yetkinlik o tabloya id ile
-- referans vermeli. Boylece operasyon adi degisince yetkinlikler drift etmez ve
-- var olmayan bir operasyona yetkinlik yazilamaz (FK engeller).
--
-- NOT: Bu migration operation_name'i kaldirir. Uzerinde veri varsa once
-- adlardan operations(id) eslemesi yapip operation_id'yi doldurmak gerekir;
-- v2 tablolari henuz bos oldugu icin dogrudan yeniden yaziyoruz.

ALTER TABLE operator_skills
  DROP KEY uniq_opskill_tenant_op_name,
  DROP COLUMN operation_name,
  ADD COLUMN operation_id BIGINT UNSIGNED NOT NULL AFTER operator_id,
  ADD KEY idx_opskill_operation (operation_id),
  ADD UNIQUE KEY uniq_opskill_tenant_op_operation (tenant_id, operator_id, operation_id),
  ADD CONSTRAINT fk_opskill_operation FOREIGN KEY (operation_id) REFERENCES operations (id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('004_operator_skills_fk');
