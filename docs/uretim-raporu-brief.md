# Claude Code brief — Genel Üretim Raporu (yeni ekran)

Tasarım kaynağı: `docs/tasarim/Genel-Uretim-Raporu.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewUretimRaporu()`

Bu ekran v2'de **hiç yok**. Sıfırdan yazılacak.

---

## ÖNCE: eksik veri alanı — bu olmadan ekranın yarısı çalışmaz

Ekranın merkezinde **duruş nedeni Pareto analizi** var. Ama:

- `production` tablosunda `durusBaslangic` / `durusBitis` alanları **var**
- **Duruş nedeni alanı YOK** — ne v2 şemasında ne de yedek veride
- Yedekteki 134 üretim kaydında duruş saatleri de **hepsi boş**

Yani duruş verisi hiç toplanmamış. Ekran yapılsa bile o bölüm boş kalır.

### Gerekli hazırlık

**Migration `035_downtime_reasons.sql`:**

```sql
CREATE TABLE downtime_reasons (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL DEFAULT 1,
  name        VARCHAR(128) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by  INT UNSIGNED NULL,
  updated_by  INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_dtr_tenant_name (tenant_id, name)
);

ALTER TABLE production
  ADD COLUMN downtime_reason_id BIGINT UNSIGNED NULL AFTER downtime_end,
  ADD CONSTRAINT fk_prod_downtime_reason
    FOREIGN KEY (downtime_reason_id) REFERENCES downtime_reasons (id);
```

Sütun adları mevcut şemayla eşleşmiyorsa `DESCRIBE production` ile doğrula.

**Başlangıç kayıtları** — tasarımdaki nedenler:
`Malzeme bekleme`, `Kalıp değişimi`, `Mekanik arıza`, `Ölçü ayarı`, `Vardiya devri`

**Üretim Girişi ekranına duruş alanları** — başlangıç/bitiş saati + neden seçimi.
Bu ayrı bir iş; brief'te sadece raporla, uygulama.

---

## Ekran yapısı

### 1. Üst şerit

- Sağda `Dışa Aktar` düğmesi
- Dönem modu: `Günlük` / `Haftalık` / `Aylık` — bitişik düğme grubu, aktif olan
  `--color-accent-900` zemin + beyaz metin
- Gezinme: `← Önceki`, dönem başlığı, `Sonraki →`, `Bugüne Dön`

Dönem başlığı biçimi:
- Günlük: `28.08.2026 · Cuma`
- Haftalık: `24.08.2026 — 30.08.2026`
- Aylık: `Ağustos 2026`

Hafta başı **Pazartesi**. Tarih hesabı **yerel**, `toISOString()` kullanma.

### 2. Dört KPI kartı

| Kart | Değer | Alt satır | Renk kuralı |
|---|---|---|---|
| Toplam Üretilen | `sum(uretilen)` | `Planlanan N adet` | `--color-accent-500` |
| Fire Oranı | `fire / (üretilen + fire)` % | `N adet fire` | ≤2 başarı · ≤5 uyarı · >5 hata |
| Genel Gerçekleşme | `üretilen / hedef` % | `N üretim kaydı` | eşiğe göre (aşağıda) |
| Toplam Duruş | süre | `N farklı neden` | 0 ise başarı, değilse uyarı |

**Gerçekleşme renk eşiği** (`hedefEsigi`, varsayılan 90):
- `≥ eşik` → success
- `≥ eşik − 20` → warning
- altı → danger
- `null` → nötr

### 3. Dikkat Edilmesi Gereken Noktalar

Dönem verisinden otomatik türetilen uyarılar:

```
genel gerçekleşme < %80        → danger
fire oranı > %3                → danger
tek neden duruşun ≥ %40'ı      → warning: "Duruşların %N'i tek nedenden: 'X'"
neden girilmemiş duruş kaydı   → warning: "N duruş kaydında neden girilmemiş"
makine gerçekleşmesi < %70     → danger, makine adıyla
```

Uyarı yoksa bölüm hiç görünmesin.

### 4. Duruş Nedeni Dağılımı (Pareto)

Sütunlar: `NEDEN · SÜRE · PAY · KÜMÜLATİF`

- Nedenler süreye göre azalan
- Kümülatif yüzde birikmeli
- **Kümülatif ≤ %80 olan satırlar `--color-danger`**, sonrakiler
  `--color-neutral-400` — Pareto'nun %80/20 kuralı
- Nedeni boş kayıtlar `Belirtilmemiş` altında toplanır
- Satır içi yüzde çubuğu, genişlik `max(pay, 1)%`

### 5. Makine Bazlı Özet

Sütunlar: `MAKİNE · PLAN · GERÇEK · % · FİRE · DURUŞ`
Sıralama: **en çok duruşu olan üstte**

### 6. Ürün Bazlı Özet

Aynı sütunlar, ilk kolon ürün.
Sıralama: **en çok üretilen üstte**

### 7. Günlük Trend

Sütunlar: `TARİH · PLAN · GERÇEK · % · DURUŞ`
Tarih hücresinde gün adı da var (`28.08.2026` / `Cuma`).

Satır içi çubuk: bar gerçekleşen adedi, **dikey çizgi o günün planını** gösterir.
Genişlikler dönemin en büyük değerine göre oranlanır.

Bugünün satırı `--color-accent-100` zeminli.

Alt not: "Dikey çizgi o günün planlanan adedini gösterir"

---

## Biçim kuralları

- Sayılar `toLocaleString("tr-TR")` — binlik nokta
- Süre: `< 60 dk` → `45 dk`, üstü → `2 sa 15 dk`, sıfır → `—`
- Tarih `GG.AA.YYYY`
- Miktar ve süre `IBM Plex Mono`, sağa hizalı
- Veri yoksa `—`, sıfır yazma

---

## Veri kaynağı

Mevcut `listAll()` deseniyle: `production`, `machine_plans`, `work_centers`,
`product_codes`, `downtime_reasons`.

Plan hedefi `machine_plans.target_quantity`'den, gerçekleşen
`production.quantity`'den geliyor. Eşleştirme (tarih, iş merkezi) üzerinden.

Yeni BE ucu açma — mevcut türetme desenini koru.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni anahtarlar `docs/ceviri-sozlugu.md`'ye
- Renk token'larının `app.css`'te var olduğunu doğrula:
  `--color-success`, `--color-success-fill`, `--color-danger`,
  `--color-danger-fill`, `--color-accent-500`, `--color-accent-900`.
  Yoksa mevcut token'larla eşleştir, yeni değer uydurma
- Sol menüye "Üretim Raporu" ekle, Üretim grubunda
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. `DESCRIBE production` — duruş sütun adlarını doğrula, raporla
2. Migration `035` (tablo + sütun + başlangıç nedenleri)
3. Ekran
4. `php -l` + `node --check` + sözlük
5. Ayrı commit, push

---

## Kapsam dışı

- Üretim Girişi'ne duruş alanları eklemek — ayrı iş, sonra
- `Dışa Aktar` işlevi — düğme dursun, tıklanınca "yakında" mesajı
- Verimlilik modülü — ayrı ekran
