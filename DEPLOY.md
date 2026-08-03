# QFW Program — Plesk'te Canlıya Alma

Hedef: **https://ozmel.com** (alan adının kökü)

---

## 1) config.php'ye veritabanı şifresini yazın

`config.php` dosyasını açın, şu satırı doldurun:

```php
'db_pass' => 'BURAYA_VERITABANI_SIFRESINI_YAZIN',
```

Aynı dosyadaki `db_name` ve `db_user` değerlerinin Plesk'te gördüğünüz adlarla
**birebir aynı** olduğunu da kontrol edin (Plesk > Databases):

```php
'db_name' => 'ozmel_db',
'db_user' => 'ozmel_admin',
```

> Şifreyi hatırlamıyorsanız Plesk > Databases > kullanıcının yanındaki
> **Change Password** ile yenisini belirleyip buraya yazın.

---

## 2) Tabloları oluşturun

Plesk > **Databases** > veritabanınızın satırındaki **phpMyAdmin** > üstteki **SQL**
sekmesi. `schema.sql` dosyasının içeriğini kopyalayıp yapıştırın ve **Go** deyin.

Üç tablo oluşur: `users`, `sessions`, `app_data`.

---

## 3) Dosyaları yükleyin

Plesk > **Files** > `httpdocs` klasörü. Klasörün içindeki varsayılan Plesk dosyalarını
(`index.html`, `index.php`, `favicon.ico` gibi karşılama sayfaları) silin, sonra
şu dosyaları yükleyin:

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Uygulamanın tamamı (arayüz) |
| `login.php` | Giriş |
| `logout.php` | Çıkış |
| `api.php` | Veri okuma/yazma |
| `config.php` | Veritabanı bilgileri |
| `.htaccess` | Güvenlik ayarları — **atlamayın** |
| `hash_password.php` | Kullanıcı oluşturma aracı — **6. adımdan sonra silinecek** |

`schema.sql` ve `DEPLOY.md` dosyalarını sunucuya yüklemenize gerek yok.

> **Not:** `.htaccess` başında nokta olduğu için bazı FTP programlarında gizli görünür.
> Plesk'in kendi dosya yöneticisi ("Files") bunu sorunsuz yükler; yüklendiğini
> mutlaka gözle doğrulayın — `config.php`'yi dışarıdan okunmaktan o koruyor.

---

## 4) PHP ayarlarını kontrol edin

Plesk > **PHP Settings**:

- **PHP version:** 8.0 veya üzeri
- **post_max_size:** `20M` (uygulama 16 MB'a kadar veri gönderebiliyor; varsayılan 8M yetmez)
- **memory_limit:** `256M`

`pdo_mysql` eklentisi Plesk'te varsayılan olarak açıktır, ayrıca bir şey yapmanız gerekmez.

---

## 5) HTTPS'i açın

Plesk > **SSL/TLS Certificates** > **Let's Encrypt** ile ücretsiz sertifika alın
(`ozmel.com` ve `www.ozmel.com` ikisini de işaretleyin).

Sonra Plesk > **Hosting Settings** > **Permanent SEO-safe 301 redirect from HTTP to HTTPS**
kutusunu işaretleyin.

---

## 6) Kullanıcılarınızı oluşturun

Tarayıcıda **https://ozmel.com/hash_password.php** adresini açın.

Her kullanıcı için: kullanıcı adı, görünen ad, şifre ve rol girip **SQL Oluştur** deyin.
Çıkan SQL satırını phpMyAdmin > SQL sekmesinde çalıştırın.

- **editor** — görüntüler *ve* değişiklik yapar
- **viewer** — sadece görüntüler

En az bir tane **editor** hesabı oluşturun, yoksa hiçbir veri kaydedilemez.

---

## 7) hash_password.php'yi silin

Kullanıcıları oluşturduktan sonra Plesk > Files üzerinden `hash_password.php`
dosyasını **silin**. Açık kalırsa herkes o sayfaya erişebilir.

---

## 8) Test edin

1. **https://ozmel.com** adresini açın → giriş ekranı gelmeli.
2. Oluşturduğunuz editor hesabıyla girin.
3. Bir kayıt ekleyip sayfayı yenileyin → kayıt duruyorsa veritabanı çalışıyor demektir.
4. phpMyAdmin > `app_data` tablosunda `id = 1` satırının oluştuğunu görün.

---

## Sorun giderme

| Belirti | Sebep |
|---|---|
| "config.php henüz düzenlenmemiş" | 1. adım yapılmamış — şifre hâlâ örnek değer |
| "Veritabanı bağlantı hatası" | `db_name` / `db_user` / `db_pass` üçünden biri yanlış. Plesk > Databases ile karşılaştırın |
| Giriş ekranı gelmiyor, dosya listesi çıkıyor | `index.html` `httpdocs` içinde değil ya da Plesk'in varsayılan `index.php`'si silinmemiş |
| "Kullanıcı adı veya şifre hatalı" (doğru yazmanıza rağmen) | Kullanıcı `users` tablosuna eklenmemiş — 6. adımdaki SQL çalıştırılmamış |
| Tarayıcıda PHP kodu düz metin görünüyor | Domain'de PHP kapalı — Plesk > Hosting Settings > PHP support işaretli olmalı |
| Büyük veri kaydederken hata | 4. adımdaki `post_max_size` ayarlanmamış |

### Veri yedeği

Tüm veri `app_data` tablosunun tek satırında duruyor. Plesk > **Backup Manager**
üzerinden zamanlanmış yedek kurun — kaza ile silinen veri başka türlü geri gelmez.
