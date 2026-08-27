-- 029_work_order_split_unique.sql — is emri benzersizligine split_label eklenir
--
-- Gerekce: v1'de bir is emri birden cok tezgaha BOLUNEBILIYOR (splitEtiket A/B).
-- 026'daki UNIQUE(tenant_id, wo_no, product_code_id) bu bolmeyi cakisma sayip ikinci
-- kaydi reddediyordu. split_label anahtara eklenerek ayni wo_no + urunun farkli
-- bolmeleri birlikte var olabilir.
--
-- Not: split_label NULL olabilir; MySQL UNIQUE'te NULL'lar birbirinden farkli sayilir,
-- yani bolunmemis (split_label NULL) kayitlar bu anahtarla tekillestirilmez.

ALTER TABLE work_orders
  DROP INDEX uniq_wo_tenant_no_product,
  ADD UNIQUE KEY uniq_wo_tenant_no_product_split
    (tenant_id, wo_no, product_code_id, split_label);

INSERT IGNORE INTO schema_migrations (version) VALUES ('029_work_order_split_unique');
