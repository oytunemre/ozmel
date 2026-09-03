# Claude Code brief — Verimlilik (yeni ekran)

Tasarım kaynağı: `docs/tasarim/Verimlilik.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewProduktivite()`

Bu ekran v2'de **hiç yok**. Sıfırdan yazılacak.

Üretim Raporu ekranıyla (`uretimRaporu.js`) aynı iskeleti paylaşıyor — dönem
şeridi, KPI kartları, renk eşiği mantığı. **Ortak parçaları yeniden yazma**,
oradan al ya da paylaşılan bir yardımcıya çıkar.

---

## Farkı

| | Üretim Raporu | Verimlilik |
|---|---|---|
| Odak | Fire, duruş nedenleri, makine/ürün özeti | Plan hedefi vs gerçekleşen |
| Kırılım | Makine, ürün, gün | **İş emri** |
| Tablo sayısı | Dört (Pareto + üç özet) | Bir |
| Satır tıklama | yok | İş emrini salt görüntü açar |

Verimlilik daha sade ve tek soruya odaklı: **planladığımızı üretebildik mi?**

---

## Ekran

### 1. Başlık

- `VERİMLİLİK`
- Alt satır: "Plan hedefleri ile Üretim Girişi'nden kaydedilen gerçekleşenlerin
  iş emri bazında karşılaştırması"

### 2. Dönem şeridi

Üretim Raporu ile **birebir aynı**:
- `Günlük` / `Haftalık` / `Aylık` bitişik düğme grubu, aktif `--color-accent-900`
  zemin + beyaz metin
- `← Önceki` · dönem başlığı · `Sonraki →` · `Bugüne Dön`
- Başlık biçimi: günlük `28.08.2026 · Cuma` · haftalık `24.08.2026 — 30.08.2026` ·
  aylık `Ağustos 2026`
- Hafta başı Pazartesi, tarih hesabı yerel, `toISOString()` yok

### 3. Boş hal — spec bunu ayrıca tanımlıyor

Dönemde iş emrine bağlı planlanmış kayıt yoksa, tablo ve KPI yerine boş hal:

> **Bu dönemde iş emrine bağlı planlanmış üretim kaydı yok**
> `{dönem}` için makine planına bağlanmış hedef adet bulunamadı. Farklı bir
> dönem seçin ya da Üretim Planı'ndan hedef girin.

Bu önemli: `machine_plans.work_order_id` boş olan plan satırları ("plansız
ürün" planları) bu ekrana **girmez**. Sadece iş emrine bağlı planlar sayılır.

### 4. Dört KPI kartı

| Kart | Değer | Alt satır | Renk |
|---|---|---|---|
| Toplam Planlanan | `sum(planlanan)` | `N iş emri kaydı` | `--color-accent-500` |
| Toplam Gerçekleşen | `sum(gerçekleşen)` | `Üretim Girişi'nden` | `--color-accent-500` |
| Genel Gerçekleşme | `gerçek / plan` % | `Eşik: %90` | eşiğe göre |
| Toplam Duruş | süre | duruş varsa `Kayıtlı duruş var`, yoksa `Duruş kaydı yok` | 0 ise success, değilse warning |

**Renk eşiği** (`hedefEsigi`, varsayılan 90) — Üretim Raporu'ndakiyle aynı:
`≥ eşik` success · `≥ eşik − 20` warning · altı danger

### 5. İş Emri Bazında Gerçekleşme tablosu

Alt başlık: "Bir satıra tıklayınca ilgili iş emrini salt görüntü olarak açar"

Sütunlar:

```
TARİH · MAKİNE · ÜRÜN / İŞ EMRİ · PLANLANAN · GERÇEKLEŞEN · % · DURUŞ
```

- **ÜRÜN / İŞ EMRİ** tek hücrede iki satır: üstte ürün kodu, altında iş emri no
- `%` hücresi renk dolgulu (`fill` + `renk`), eşiğe göre
- Sıralama: tarihe göre artan, aynı günde makine adına göre (`localeCompare` "tr")
- Satır tıklanınca `#work-orders?id=<id>` — mevcut `focusId` mekanizması

---

## Veri kaynağı

Mevcut `listAll()` deseniyle. Yeni BE ucu açma.

**Satır birimi:** `machine_plans` kaydı — ama yalnızca `work_order_id` dolu
olanlar.

| Alan | Kaynak |
|---|---|
| tarih | `machine_plans.date` |
| makine | `machine_plans.work_center_id` → `work_centers.name` |
| ürün | `machine_plans.product_code_id` → `product_codes.code` |
| iş emri no | `machine_plans.work_order_id` → `work_orders.wo_no` (+ `split_label`) |
| planlanan | `machine_plans.target_quantity` |
| gerçekleşen | o tarih + o iş emri için `production.actual_quantity` toplamı |
| duruş | aynı kayıtların `downtime_minutes` toplamı |

**Duruş süresi** `core/capacity.js:downtimeMinutes` ile hesaplanıyor (mola
düşülmüş) — Üretim Raporu'nda kurduğun fonksiyon, aynısını kullan.

**Eşleştirme dikkat:** `production` kaydı iş emrine bağlı (`work_order_id`).
Plan da öyle. Eşleştirme `(date, work_order_id)` üzerinden yapılmalı — sadece
iş merkezi üzerinden değil, çünkü aynı makinede gün içinde iş emri değişebilir.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `vr.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten (`fmtTr`, `fmtDuration`, `fmtDateTR`, `fmtPct`)
- Renk token'larının varlığını doğrula, yeni değer uydurma
- Sol menüye **Verimlilik**, Üretim grubuna — `uretim-raporu`'nun yanına
- `focusId` desteği (`#verimlilik` girişi ve `#work-orders?id=` çıkışı)
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Ortak parçaları çıkar

Üretim Raporu ile paylaşılan üç şey var. Bunları `core/` altına taşı, iki ekran
da oradan kullansın:

1. **Dönem şeridi** — mod düğmeleri, gezinme, dönem başlığı, `gunler()` hesabı
2. **Renk eşiği** — `hal(yuzde)` fonksiyonu
3. **KPI kart bileşeni** — etiket + değer + alt satır + renk

`uretimRaporu.js`'i bu ortak parçaları kullanacak şekilde refactor et, ama
davranışını değiştirme. Çalışan ekranı bozma.

---

## Sıra

1. Ortak parçaları `core/` altına çıkar, `uretimRaporu.js`'i ona bağla,
   davranış aynı kalsın
2. Verimlilik ekranı
3. Menü kaydı
4. `php -l` + `node --check` + sözlük
5. Ayrı commit, push

---

## Kapsam dışı

- `Dışa Aktar` — bu ekranda tasarımda yok, eklemeyin
- Verimlilik uyarıları — tasarımda "Dikkat Edilmesi Gereken Noktalar" bölümü yok