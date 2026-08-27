-- 027_users_admin.sql — Kullanici Yonetimi: paylasilan v1 `users` tablosuna hesap
-- yonetimi icin ek sutunlar. YENI tablo (v2_users) KURULMAZ.
--
-- Karar: v1 ile TEK kimlik kaynagi paylasilir (users + sessions; login.php ortak).
-- v1 cutover'a kadar canli oldugundan ayri bir v2_users kimligi ikiye boler
-- (bir yerde acilan hesap digerinde yok, sifreler ayrisir) — overlap doneminin en
-- buyuk riski budur. Bu yuzden paylasim korunur; temiz v2_users'a gecis, v1
-- kapandiginda AYRI bir adim olarak yapilir.
--
-- Sutunlar additive: mevcut satirlar aktif sayilir. v1 login.php ek sutunlardan
-- etkilenmez; yalnizca "pasif hesap giremez" guard'i eklenir (bkz. login.php).

ALTER TABLE users
  ADD COLUMN is_active  TINYINT(1) NOT NULL DEFAULT 1 AFTER role;

ALTER TABLE users
  ADD COLUMN updated_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

INSERT IGNORE INTO schema_migrations (version) VALUES ('027_users_admin');
