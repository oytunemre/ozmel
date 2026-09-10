# Lokal Kurulum

Projeyi kendi bilgisayarında çalıştırmak için. Sunucuya dokunmadan
geliştirme yapabilirsin.

Gereken: **PHP 8.3+**, **MySQL/MariaDB**, **Git**.

---

## Windows

En kolayı **Laragon** — PHP, MySQL, Apache birlikte gelir.

1. [laragon.org](https://laragon.org) → Full sürümü indir, kur
2. Laragon'u aç → **Menu → PHP → Version** → 8.3 seçili olsun
3. **Start All** ile servisleri başlat

Alternatif: XAMPP. Aynı işi görür ama Laragon daha az uğraştırır.

### Depoyu klonla

Laragon'un `www` klasörüne:

```
C:\laragon\www\ozmel
```

Git Bash ya da PowerShell:

```bash
cd C:/laragon/www
git clone https://github.com/ozmelsoftware/ozmel-dis-ticaret.git ozmel
cd ozmel
git checkout krc-port
```

---

## macOS

```bash
brew install php@8.3 mysql
brew services start mysql
```

Depoyu klonla:

```bash
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/ozmelsoftware/ozmel-dis-ticaret.git ozmel
cd ozmel
git checkout krc-port
```

---

## Veritabanı

phpMyAdmin (Laragon'da hazır gelir) ya da komut satırından:

```sql
CREATE DATABASE ozmel_local
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_turkish_ci;
```

### users ve sessions tabloları

**Bunlar migration'larda yok** — v1'den paylaşılan tablolar olarak
tasarlanmıştı. Elle oluşturman gerekiyor:

```sql
CREATE TABLE `sessions` (
  `token` char(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `role` varchar(16) NOT NULL,
  `display_name` varchar(128) NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `legacy_id` varchar(64) DEFAULT NULL,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(128) NOT NULL,
  `role` enum('editor','viewer') NOT NULL DEFAULT 'viewer',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6)
    ON UPDATE current_timestamp(6),
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `updated_by` int(10) UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Kendine bir kullanıcı ekle

Şifre karması üret:

```bash
php -r "echo password_hash('sifren', PASSWORD_DEFAULT), PHP_EOL;"
```

Çıkan değeri kullan:

```sql
INSERT INTO users (tenant_id, username, password_hash, display_name, role, is_active)
VALUES (1, 'kullaniciadin', '<yukaridaki karma>', 'Adın Soyadın', 'editor', 1);
```

### Migration'ları çalıştır

Hepsini birleştir:

```bash
for f in $(ls migrations/*.sql | sort); do
  echo "-- ===== $f ====="
  cat "$f"
  echo
done > /tmp/tum-migrationlar.sql
```

phpMyAdmin → `ozmel_local` → **İçe Aktar** → dosyayı seç.

`000b_tenant_columns` "Duplicate column" hatası verirse geç — sütun
`CREATE TABLE` ile zaten eklendi. Kaydını elle düşür:

```sql
INSERT IGNORE INTO schema_migrations (version) VALUES ('000b_tenant_columns');
```

---

## config.php

Depo kökünde oluştur (gitignore'da, commit edilmez):

```php
<?php
return [
    'db_host'        => 'localhost',
    'db_name'        => 'ozmel_local',
    'db_user'        => 'root',
    'db_pass'        => '',
    'allowed_origin' => 'http://localhost:8000',
];
```

Laragon'da MySQL kök şifresi genelde boştur.

---

## Veriyi yükle

`data/` klasörü oluştur, bir v1 yedeği koy:

```
data/qfw_konsol_yedek_2026-09-09.json
```

ETL çalıştır:

```bash
php tools/etl.php --file=data/qfw_konsol_yedek_2026-09-09.json --dry-run
php tools/etl.php --file=data/qfw_konsol_yedek_2026-09-09.json
```

Dry-run önce çalıştırılır — hiçbir şey yazmaz, sadece rapor verir.

Beklenen atlamalar: 1 terim (boş çeviri), 60 kalite ölçümü (silinmiş
siparişlere bağlı). Bunlar normaldir.

---

## Çalıştır

```bash
php -S localhost:8000 -t public
```

Tarayıcıda: `http://localhost:8000`

Laragon kullanıyorsan alternatif olarak `ozmel.test` gibi bir sanal host da
kurabilirsin — belge kökü `public/` olmalı.

---

## Doğrulama

Giriş yapabiliyorsan ve ekranlarda veri görünüyorsa kurulum tamam.

Sorun çıkarsa:

**"Veritabanı bağlantı hatası"** → `config.php`'deki bilgiler yanlış, ya da
MySQL çalışmıyor.

**Boş ekran** → tarayıcı konsoluna bak. JS hatası olabilir.

**"Oturum bulunamadı"** → normal, giriş yapman gerekiyor.

**Ekranlar var ama veri yok** → ETL çalıştırılmamış.

---

## Kod yazarken

```bash
php -l src/Dto/Route.php        # PHP sözdizimi
node --check public/js/modules/routes.js   # JS sözdizimi
```

CI aynılarını push'ta çalıştırıyor ama lokalde önce denemek zaman kazandırır.

Değişikliklerden sonra tarayıcıyı sert yenile (`Cmd+Shift+R` /
`Ctrl+Shift+R`) — modül dosyaları sürüm parametresiyle önbelleklenir.
