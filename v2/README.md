# v2 — Katmanli API

v1 (kok dizindeki `index.html` + `js/app.js` + `api.php`) calismaya devam eder.
Bu klasor onun yaninda buyur; hazir olunca gecis yapilir.

## Akis

```
FE (veri tutmaz)  ->  Controller  ->  Repository  ->  DB
                       yetki          SQL (tek yer)
                       dogrulama      tenant filtresi
                       DTO donusum    eszamanlilik kontrolu
```

## Kurulum

1. `config.php`'yi v2 kok dizinine kopyala (v1 ile ayni format).
2. Migration'lari phpMyAdmin'den sirayla calistir:
   - `migrations/000_core.sql`
   - `migrations/000b_tenant_columns.sql`  (sutun varsa hata verir, gecebilirsin)
   - `migrations/001_work_centers.sql`
3. `public/` klasorunu sunucuya yukle.

## Endpoint deseni

mod_security PUT/DELETE'i kesiyor; yazma islemleri POST + `?op=` ile:

```
GET   api/index.php/work-centers?page=1&limit=50
GET   api/index.php/work-centers/12
POST  api/index.php/work-centers
POST  api/index.php/work-centers/12?op=guncelle
POST  api/index.php/work-centers/12?op=sil
```

Yanit zarfi her zaman ayni:

```json
{ "ok": true, "data": [], "meta": { "page": 1, "total": 0 }, "errors": [] }
```

## Yeni modul eklerken

1. `migrations/00X_<tablo>.sql` — ortak sutunlar: `id, tenant_id, created_at,
   updated_at, created_by, updated_by`; benzersizlik `UNIQUE(tenant_id, ...)`
2. `src/Dto/<Ad>.php` — API sozlesmesi, camelCase <-> snake_case siniri
3. `src/Validator/<Ad>Validator.php`
4. `src/Repository/<Ad>Repository.php` — `table()` + `columns()` whitelist
5. `src/Controller/<Ad>Controller.php`
6. `public/api/index.php` icindeki `$routes` dizisine bir satir
7. `public/js/modules/<ad>.js`

## Kurallar

- SQL yalnizca Repository'de.
- Her sorgu tenant kapsamlidir — `BaseRepository` garanti eder.
- Guncellemede istemci `updatedAt` gonderir; degismisse 409 doner.
- Kimlik DB'de uretilir. `uid()` yok.
- Acilista veri duzeltme kodu calismaz; duzeltmeler migration'dir.
- Tablo adlari sade, onek YOK (or. `work_centers`, `orders`, `first_off_records`).
  Erken gelistirmede kullanilan gecici tablo oneki DB yeniden adlandirilinca
  kaldirildi; `Repository::table()` degerleri de sade addir.

## ETL (v1 -> v2 tasima)

`tools/etl.php` v1 yedek JSON'unu (`data/qfw_konsol_yedek_*.json`) v2 tablolarina aktarir.

```
php tools/etl.php --file=data/qfw_konsol_yedek_2026-08-23.json --dry-run   # rapor, yazma yok
php tools/etl.php --file=data/qfw_konsol_yedek_2026-08-23.json             # canli
```

- Her v1 kaydinin eski string id'si `legacy_id` sutununa yazilir; bellekte
  `[koleksiyon][eski_id] => yeni_id` haritasi tutulur, FK'ler bundan cozulur.
- Metin -> FK: `isMerkezi`/`operasyon`/kisi adlari ad uzerinden, urun/malzeme kod
  uzerinden cozulur. Referans tablolarda (work_centers/operations/task_people) yoksa
  otomatik olusturulur; product_codes'ta kod yoksa kayit ATLANIR (kod uydurulamaz).
- Yeniden calistirilabilir: `legacy_id` zaten varsa guncellenir, ikilenmez.
- Her koleksiyon kendi `Db::transaction()`'inda; biri patlarsa oncekiler korunur.
  Sonda koleksiyon basina rapor (okundu/eklendi/guncellendi/atlandi/oto-referans).
- Yalnizca Repository katmani kullanilir (ETL yardimcilari: `BaseRepository::etlUpsert`,
  `etlEnsureByName`, `etlFindByLegacy`). Bu metotlar yalnizca ETL icindir; API akisi
  `legacy_id` yazmaz.
