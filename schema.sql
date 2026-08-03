-- QFW Program — veritabanı şeması
-- Plesk > Databases > (veritabanınız) > phpMyAdmin > SQL sekmesine yapıştırıp çalıştırın.
-- Sadece BİR KEZ çalıştırılması yeterlidir (tekrar çalıştırmak zarar vermez).

SET NAMES utf8mb4;

-- Giriş yapabilecek kullanıcılar. Şifreler asla düz metin tutulmaz;
-- hash'i hash_password.php aracıyla üretilir.
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(128) NOT NULL,
  role          ENUM('editor','viewer') NOT NULL DEFAULT 'viewer',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Açık oturumlar. login.php buraya yazar, api.php buradan doğrular,
-- logout.php siler. Süresi geçenleri login.php her girişte temizler.
CREATE TABLE IF NOT EXISTS sessions (
  token        CHAR(64) NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  role         ENUM('editor','viewer') NOT NULL DEFAULT 'viewer',
  display_name VARCHAR(128) NOT NULL,
  expires_at   DATETIME NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_expires (expires_at),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uygulamanın tüm verisi tek bir JSON satırında (id = 1) tutulur.
-- LONGTEXT seçildi: api.php 16 MB'a kadar gövde kabul ediyor, MEDIUMTEXT sınırda kalırdı.
CREATE TABLE IF NOT EXISTS app_data (
  id         TINYINT UNSIGNED NOT NULL,
  data       LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
