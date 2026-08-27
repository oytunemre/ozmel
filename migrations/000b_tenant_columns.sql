-- 000b — mevcut users/sessions tablolarina tenant baglantisi.
-- ALTER ... ADD COLUMN IF NOT EXISTS her MariaDB surumunde yok; hata verirse
-- sutun zaten var demektir, gecebilirsiniz.

ALTER TABLE users    ADD COLUMN tenant_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE sessions ADD COLUMN tenant_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER user_id;

INSERT IGNORE INTO schema_migrations (version) VALUES ('000_core');
