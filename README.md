# Ozmel — Üretim ve Tedarikçi Kalite Takip Sistemi

Özmel Dış Ticaret için geliştirilen katmanlı web uygulaması. Eski tek-dosya
sürümün (v1, tarayıcı `localStorage`) yerini alır.

Kimlik doğrulama `public/login.php` / `public/logout.php` üzerinden, ortak
`users` + `sessions` tabloları ile.

---

## Ortamlar

| Ortam | Adres | Dal | Klasör | Veritabanı |
|---|---|---|---|---|
| Staging | `staging.ozmel.com` | `krc-port` | `httpdocs/test` | `ozmel_test` |
| Üretim | `ozmel.com` | `main` | `httpdocs/prod` | `ozmel_db` |

Dağıtım Plesk Git ile otomatik. Geliştirme `krc-port`'ta yapılır, staging'de
doğrulanır, `main`'e birleştirilip üretime alınır.

`config.php` ve `data/` klasörü `.gitignore`'dadır — her ortamda elle
oluşturulur.

---

## Mimari

```
FE (veri tutmaz)  ->  Controller  ->  Repository  ->  DB
                       yetki          SQL (tek yer)
                       doğrulama      tenant filtresi
                       DTO dönüşüm    eşzamanlılık kontrolü
```

Frontend saf ES modülleri — derleme adımı yok. `public/js/core/` ortak
altyapı, `public/js/modules/` ekranlar.

### Ortak frontend katmanı

| Dosya | İş |
|---|---|
| `core/api.js` | HTTP sarmalayıcı, `listAll()` sayfalama |
| `core/store.js` | Oturum içi önbellek, yazma sonrası geçersiz kılma |
| `core/i18n.js` | TR/EN sözlük, canlı dil değişimi |
| `core/table.js` | Sıralanabilir tablo, arama, sayfalama |
| `core/drawer.js` | Form paneli, optimistic locking |
| `core/eta.js` | Tahmini bitiş hesabı (son 7 gün ortalaması) |
| `core/capacity.js` | Kapasite ve duruş süresi (mola düşülmüş) |
| `core/bottleneck.js` | Darboğaz tespiti, kapasite veri uyarıları |
| `core/report.js` | Dönem şeridi, eşik renkleri, KPI kartı |
| `core/format.js` | tr-TR sayı, süre, tarih biçimi |

---

## Kurulum (yeni ortam)

1. Depoyu klonla, `config.php`'yi kök dizine koy:

```php
<?php
return [
    'db_host'        => 'localhost',
    'db_name'        => '...',
    'db_user'        => '...',
    'db_pass'        => '...',
    'allowed_origin' => 'https://...',
];
```

2. `users` ve `sessions` tablolarını oluştur — bunlar migration'larda **yok**,
   v1'den paylaşılan tablolar olarak tasarlanmıştı. Tanımları mevcut bir
   ortamdan dışa aktar.

3. Migration'ları sırayla çalıştır (`000` → `044`). `000b_tenant_columns`
   atlanmamalı; sütun zaten varsa hata verir, geçilebilir.

4. `data/` klasörü oluştur, v1 yedek JSON'unu koy.

5. ETL çalıştır (aşağıda).

6. Belge kökünü `public/` olarak ayarla.

---

## Endpoint deseni

mod_security PUT/DELETE'i kesiyor; yazma işlemleri POST + `?op=` ile:

```
GET   api/index.php/work-centers?page=1&limit=50
GET   api/index.php/work-centers/12
POST  api/index.php/work-centers
POST  api/index.php/work-centers/12?op=guncelle
POST  api/index.php/work-centers/12?op=sil
POST  api/index.php/work-orders/batch        # toplu, transaction içinde
```

Yanıt zarfı her zaman aynı:

```json
{ "ok": true, "data": [], "meta": { "page": 1, "total": 0 }, "errors": [] }
```

---

## Modüller

**Üretim** — İş Merkezleri · Operasyonlar · Operatörler · Rotalar ·
Kapasiteler · Üretim Planı · İş Emirleri · Üretim Girişi · Üretim Raporu ·
Verimlilik · Üretim Panosu · Ürün Ağaçları

**Tedarikçi & Kalite** — Tedarikçi & Site · Günlük Kalite Raporları ·
Kalite Kontrol

**Satınalma & Stok** — Satınalma İstekleri · Satınalma Girişleri · Stok Durumu

**Satış** — Satış Siparişleri · Üretim Siparişleri · Satış Raporları

**Tanımlar** — Ürün Kodları · Terimler · Çalışma Saatleri · Duruş Nedenleri ·
First-Off Noktaları · Saatlik Noktalar

**Yönetim** — Görev Takibi · Kullanıcılar

Genel Bakış panosu tüm modüllerden türetilmiş özet gösterir.

---

## Yeni modül eklerken

1. `migrations/0XX_<tablo>.sql` — ortak sütunlar: `id, tenant_id, legacy_id,
   created_at, updated_at, created_by, updated_by`; benzersizlik
   `UNIQUE(tenant_id, ...)`; `INSERT IGNORE INTO schema_migrations` ile kendi
   kaydını düşür
2. `src/Dto/<Ad>.php` — API sözleşmesi, camelCase ↔ snake_case sınırı
3. `src/Validator/<Ad>Validator.php`
4. `src/Repository/<Ad>Repository.php` — `table()` + `columns()` whitelist
5. `src/Controller/<Ad>Controller.php`
6. `public/api/index.php` içindeki `$routes` dizisine bir satır
7. `public/js/modules/<ad>.js`
8. `public/index.html` içindeki `GROUPS` tablosuna menü kaydı
9. `core/i18n.js`'e TR + EN anahtarlar, `docs/ceviri-sozlugu.md`'ye belgele

---

## Kurallar

- SQL yalnızca Repository'de; tablo adı yalnızca `table()` metodunda
- Her sorgu tenant kapsamlıdır — `BaseRepository` garanti eder
- Güncellemede istemci `updatedAt` gönderir; değişmişse 409 döner
- Kimlik DB'de üretilir, `uid()` yok
- Açılışta veri düzeltme kodu çalışmaz; düzeltmeler migration'dır
- Enum değerleri veritabanında Türkçe saklanır, gösterimde `t()` ile çevrilir
- `text-transform: uppercase` yalnızca sabit başlıklarda; veri metnine
  uygulanmaz
- Migration'lar idempotent yazılır — `information_schema` kontrolü +
  `PREPARE`/`DO 0` deseni

---

## ETL (v1 → v2 taşıma)

`tools/etl.php` v1 yedek JSON'unu v2 tablolarına aktarır.

```bash
php tools/etl.php --file=data/qfw_konsol_yedek_2026-09-09.json --dry-run
php tools/etl.php --file=data/qfw_konsol_yedek_2026-09-09.json
```

SSH yoksa `tools/etl_web.php` sarmalayıcısı `public/` içine kopyalanır,
anahtarı ve `require` yolu ayarlanır, tarayıcıdan çalıştırılır.
**İş bitince silinmelidir** — kalıcı bir uç nokta değildir.

### Nasıl çalışır

- Her v1 kaydının eski string id'si `legacy_id` sütununa yazılır; bellekte
  `[koleksiyon][eski_id] => yeni_id` haritası tutulur, FK'ler bundan çözülür
- Metin → FK: iş merkezi, operasyon, kişi adları ad üzerinden; ürün ve malzeme
  kod üzerinden çözülür. Referans tablolarda yoksa otomatik oluşturulur;
  `product_codes`'ta kod yoksa kayıt **atlanır** (kod uydurulamaz)
- Yeniden çalıştırılabilir: `legacy_id` varsa güncellenir, ikilenmez
- Her koleksiyon kendi `Db::transaction()`'ında; biri patlarsa öncekiler korunur
- Sonda koleksiyon başına rapor: okundu / eklendi / güncellendi / atlandı /
  oto-referans

### Bilinen atlamalar

- **1 terim** — `Cap Plugging` boş çeviri, doğal anahtar çakışması
- **60 kalite ölçümü** — silinmiş iki siparişe bağlı (`orderId` çözülemiyor)

### Dikkat

ETL tek yönlüdür ve **silme yapmaz**. v1'de silinen bir kayıt v2'de kalır.
Yeni yedek aktarılırken çakışma çıkarsa (tekil anahtar ihlali) eski kayıt elle
temizlenmelidir.

---

## CI

`.github/workflows/ci.yml` her push'ta çalışır:

- Tüm `src/`, `public/`, `tools/` PHP dosyalarında `php -l`
- Tüm `public/js/` dosyalarında `node --check`

Hata kodu açık döngüyle yakalanır — `find -exec` hata kodunu yutar, kullanma.

PHP sürümü **8.3** (sunucuyla aynı). Lokal 8.5 olabilir; CI sunucu sürümünü
kullanır.

---

## Belgeler

`docs/` altında:

- `ceviri-sozlugu.md` — tüm i18n anahtarları, modül modül
- `tutarlilik-raporu.md` — v1 referansı ile karşılaştırma, eksik alan ve
  hesaplar
- `ANALIZ.md` — ilk mimari analiz
- `*-brief.md` — her modülün geliştirme brief'i

`tasarim/` klasörü (gitignore'da) Claude Design çıktılarını tutar.

---

## Bilinen eksikler

Ayrıntılar `docs/tutarlilik-raporu.md`'de. Öne çıkanlar:

- Ürün Ağaçları'nda hammadde ihtiyacı hesap motoru yok
- Giriş Kalite'de toplu satınalma girişi onaylama yok
- Stok'ta birim dönüşümü (kg/tüp/adet) yok
- Satınalma durum takibi (Bekliyor/Kısmi/Tamamlandı) yok
- Satış Raporları yeniden tasarlanacak
- Otomatik test yok — sadece sözdizimi kontrolü
