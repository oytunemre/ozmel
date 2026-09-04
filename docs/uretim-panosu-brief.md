# Claude Code brief — Üretim Panosu (yeni ekran)

Tasarım kaynağı: `tasarim/Uretim-Panosu.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewUretimPanosu()`

Bu ekran v2'de **hiç yok**. Sıfırdan yazılacak.

---

## Ne olduğu

Sahaya asılan TV ekranı. Diğer ekranlardan iki temel farkı var:

1. **Salt görüntüleme** — hiçbir düzenleme, hiçbir form yok
2. **Otomatik yenilenen** — uygulamada bunu yapan tek modül

Uzaktan okunması gerektiği için tipografi çok büyük: başlık 46px, KPI değerleri
58px, kart sayıları 44px. Bunlar tasarımdan birebir alınacak, küçültülmeyecek.

---

## Yerleşim

### 1. Başlık şeridi

Sol: `ÜRETİM PANOSU` (46px) + altında tarih satırı
(`Cuma, 04.09.2026` — gün adı + `GG.AA.YYYY`)

Sağ: **canlı saat** (mono, 40px, `toLocaleTimeString("tr-TR")`, saniyede bir
güncellenir) + `Tam Ekran` düğmesi

Tam ekran: `requestFullscreen()` / `exitFullscreen()`, kök elemana uygulanır.
Hata yakalanır, sessizce yutulur.

### 2. Dört KPI kartı

Üst kenarda 3px renkli çizgi, zemin duruma göre değişir.

| Kart | Değer | Alt satır |
|---|---|---|
| Bugün Planlanan | `sum(hedef)` | `N iş merkezi` |
| Bugün Gerçekleşen | `sum(gerçek)` | `Üretim Girişi'nden` |
| Genel Gerçekleşme | `%` | `Eşik: %90` |
| Bugün Toplam Duruş | süre | duruş varsa `Kayıtlı duruş var`, yoksa `Duruş kaydı yok` |

**Renk eşiği panoda farklı** — `core/report.js`'teki `thresholdClass` değil:

```
y >= esik        → iyi   (#3f7a44 / zemin #e4efe4)
y >= esik - 30   → orta  (#b3801a / zemin #f6ecd9)
altı             → kötü  (#a33a32 / zemin #f5e2e0)
```

Dikkat: aradaki fark **30 puan**, diğer ekranlarda 20. Uzaktan bakıldığında
daha az kırmızı olsun diye. Bu değerleri `--pano-iyi`, `--pano-orta`,
`--pano-kotu` ve `-zemin` varyantları olarak tanımla — mevcut
`--color-success/warning/danger` ile karıştırma, tonları farklı.

### 3. Boş hal

Bugün için plan yoksa kart ızgarası yerine:

> **Bugün için planlanmış üretim yok**
> Üretim Planı'ndan bugüne hedef girildiğinde pano kendini tazeler.

### 4. İş merkezi kartları

`repeat(auto-fill, minmax(340px, 1fr))` ızgara.

Her kart:
```
CNC Machining Workplace                    %87
221173 · İE-2847
    1.740  / 2.000              [45 dk]
    ████████████░░░░░
```

- Başlık: iş merkezi adı (25px)
- Sağ üst: yüzde (mono, duruma göre renkli)
- Alt satır: `ürün · iş emri no` (mono, gri)
- Büyük sayı: gerçekleşen (44px, duruma göre renkli) + `/ hedef` (20px gri)
- Duruş varsa sağda rozet — kırmızı çerçeve + zemin
- Altta ilerleme çubuğu, genişlik `min(yüzde, 100)%`

Sıralama: iş merkezi adına göre (`localeCompare` "tr").

### 5. Bu Hafta şeridi

Yedi kolon, Pazartesi–Pazar. Her kolon:
- Gün kısaltması (`Pzt`, `Sal`…)
- Tarih (`04.09`)
- `gerçek / plan` (28px / 16px)
- Yüzde (duruma göre renkli)

Bugünün kolonu: `--color-accent-100` zemin + `--color-accent-500` çerçeve.
Verisi olmayan gün: `—`, yüzde boş.

### 6. Ayak notu

`Otomatik olarak {N} saniyede bir güncellenir · Başka bir yerde plan
değiştiğinde burada da yansır`

---

## Otomatik yenileme

Uygulamada başka hiçbir yerde yoklama yok — bu ekran istisna, çünkü TV'de
kimse yenilemeye basmayacak.

- Varsayılan **15 saniye** (tasarımda ayarlanabilir, 5–120 arası)
- Yenileme sırasında **eski veri ekranda kalır**, iskelet gösterme, ekran
  zıplamasın
- Yenileme başarısız olursa kartlar durur, sessizce geç — TV'de hata şeridi
  göstermek anlamsız
- **Modülden çıkılınca `clearInterval` şart.** Saat için de ayrı bir
  `setInterval` var (1 saniye), o da temizlenmeli. `bindLang`'deki abonelik
  bırakma desenine benzer bir temizlik yolu kur.

---

## Veri kaynağı

Mevcut `listAll()` deseniyle. Yeni BE ucu açma.

| Alan | Kaynak |
|---|---|
| bugünün planı | `machine_plans` `date = bugün` |
| hedef | `machine_plans.target_quantity` |
| iş merkezi | `work_center_id` → `work_centers.name` |
| ürün | `product_code_id` → `product_codes.code` |
| iş emri no | `work_order_id` → `work_orders.wo_no` (+ `split_label`) |
| gerçekleşen | `production.actual_quantity`, `(tarih, iş emri)` eşleşmesi |
| duruş | `core/capacity.js:downtimeMinutes` — mola düşülmüş |

Haftalık şerit aynı mantıkla, Pazartesi–Pazar aralığı için.

Tarih hesabı **yerel**, `toISOString()` kullanma. Hafta başı Pazartesi.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `pano.*` anahtarları
  `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten (`fmtTr`, `fmtDuration`)
- Sol menüye **Üretim Panosu**, Üretim grubuna
- Kabuk (sol menü + üst şerit) normal görünsün — tam ekrana geçince sadece
  pano içeriği kaplar
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. Ekran
2. Menü kaydı
3. `node --check` + sözlük
4. Ayrı commit, push

---

## Kapsam dışı

- Panonun ayrı bir adresten (kabuk olmadan) açılması — ileride TV'ye
  gömülecekse gerekebilir, şimdilik değil
- Ses/uyarı bildirimi
- Vardiya bazlı kırılım
