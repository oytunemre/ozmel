-- 033_machine_plan_unique.sql — makine planlarinda (tarih, is merkezi) tekilligi.
--
-- Bir gun/is merkezi hucresi icin tek plan kaydi tutulur. Bu, Uretim Plani
-- ekranindaki upsert davranisiyla eslesir: ayni (tarih, is merkezi) icin kayit
-- varsa GUNCELLENIR, yoksa OLUSTURULUR (MachinePlanRepository).
--
-- Dogrulama: mevcut 101 kayitta (tarih, is merkezi) cakismasi YOK; kisit temiz
-- eklenir. Onceki tekil kisit yalnizca legacy_id uzerindeydi (v1 tasima izi) —
-- o korunur.

ALTER TABLE machine_plans
  ADD UNIQUE KEY uniq_mplan_tenant_date_wc (tenant_id, `date`, work_center_id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('033_machine_plan_unique');
