# Claude Code brief — Tedarikçi & Site Yönetimi (yeni modül)

Tasarım kaynağı: `tasarim/Tedarikci-Site-v2.dc.html`

Bu modül v2'de **hiç yok** — kapsam kararında elenmişti, şimdi geri alınıyor.
Basit bir CRUD; önceki ekranlara göre küçük iş.

---

## Veri

Yedekte `sites` koleksiyonu **1 kayıt** içeriyor:

```json
{
  "id": "ms4hblc317gcr",
  "supplier": "SAMCO",
  "trigoRE": "Aykun Bey",
  "sqe": "", "sqeEmail": "ayse@samco.com.tr",
  "sqm": "", "sqmEmail": "",
  "country": "Türkiye", "city": "Samsun",
  "siteCode": "1"
}
```

Yani ekran başlangıçta tek satır gösterecek. Beklenen — Melih doldurdukça
büyür.

---

## Migration `037_sites.sql`

```sql
CREATE TABLE IF NOT EXISTS sites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL DEFAULT 1,
  legacy_id   VARCHAR(64) NULL,
  supplier    VARCHAR(255) NOT NULL,
  trigo_re    VARCHAR(128) NULL,
  sqe         VARCHAR(128) NULL,
  sqe_email   VARCHAR(255) NULL,
  sqm         VARCHAR(128) NULL,
  sqm_email   VARCHAR(255) NULL,
  country     VARCHAR(128) NULL,
  city        VARCHAR(128) NULL,
  site_code   VARCHAR(64) NULL,
  ...
);
```

Ortak sütunlar (`created_at`, `updated_at`, `created_by`, `updated_by`),
tenant index + FK, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` ve
`INSERT IGNORE INTO schema_migrations` — ev standardına göre tamamla.

Tekil anahtar: `uniq_site_tenant_legacy (tenant_id, legacy_id)`.
`site_code` üzerinde tekillik **kurma** — veride `"1"` gibi değerler var,
çakışabilir.

## ETL

`sites` koleksiyonunu ekle. Alan eşlemesi doğrudan (camelCase → snake_case).

## Backend

Mevcut katman deseni: Dto + Repository + Validator + Controller + routing
(`sites`). Optimistic locking `updated_at` ile, diğer CRUD'lardaki gibi.

Zorunlu alan: yalnızca `supplier`.

---

## Ekran

Başlık: `TEDARİKÇİ & SİTE YÖNETİMİ`
Alt başlık: `N site · M ülke · kolon başlığına tıklayarak sıralayın`

Sağda `+ Yeni Site`.

### Arama ve sıralama

- Arama kutusu: `supplier`, `trigoRE`, `sqe`, `sqm`, `country`, `city`,
  `siteCode` alanlarında
- Sağda sayaç: `8 / 12`
- **Kolon başlığına tıklayınca sıralar**, tekrar tıklayınca yön değişir.
  Aktif kolonun başlığında ok işareti
- Sıralama `localeCompare(…, "tr", { numeric: true })`

### Tablo

| Kolon | Genişlik |
|---|---|
| TEDARİKÇİ | auto |
| TRİGO RE | 150px |
| SQE | 220px — ad + altında e-posta |
| SQM | 220px — ad + altında e-posta |
| ÜLKE | 120px |
| ŞEHİR | 130px |
| SİTE KODU | 150px |
| — | Düzenle / Sil |

SQE ve SQM hücreleri iki satırlı: üstte ad, altında e-posta (küçük, gri).
E-posta `mailto:` bağlantısı olsun.

Arama sonucu boşsa: `Arama sonucu bulunamadı.`

**Not:** Tasarımdaki kolon başlıkları `VİNFAST SQE` / `VİNFAST SQM` yazıyor.
Bunlar müşteriye özel terimler — sözlükte `SQE` / `SQM` olarak bırak,
müşteri adını gömme.

### Drawer

Mevcut `drawer.js` desenini kullan. Alanlar:

```
Tedarikçi *        (metin, zorunlu)
TRİGO RE           (metin)
SQE                (metin)
SQE E-posta        (e-posta)
SQM                (metin)
SQM E-posta        (e-posta)
Ülke               (metin)
Şehir              (metin)
Site Kodu          (metin)
```

Silmede onay iste.

---

## Sonrası: Genel Bakış'a ülke dağılımı

Bu modül eklendikten sonra dashboard'daki **Tedarikçi Dağılımı — Ülke**
bölümü uygulanabilir hale gelir. Brief'te kapsam dışı bırakılmıştı çünkü
`sites` yoktu.

Bu turda **ekleme** — ayrı iş olarak sonra alacağız. Sadece not düş.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `site.*` anahtarları
  `docs/ceviri-sozlugu.md`'ye
- Sol menüye **Tedarikçi & Site**, "Tedarikçi & Kalite" grubunun başına
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. Migration `037`
2. ETL eklemesi
3. Backend katmanı + `php -l`
4. Ekran + menü kaydı
5. Sözlük
6. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

Migration ve ETL'i ben çalıştıracağım.

---

## Kapsam dışı

- Parça Yönetimi (`parts`) — veride **0 kayıt**, ayrı karar
- Dashboard ülke dağılımı — bu modül oturduktan sonra
- Tedarikçi ↔ malzeme ilişkisi (`kodTanimlari.tedarikciler` alanı var ama
  3 kayıtta dolu) — ayrı iş
