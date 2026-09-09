# Claude Code brief — İş Emirleri v2 (ekranın yeniden yazımı)

Tasarım kaynağı: `tasarim/Is-Emirleri-v2.dc.html`
Referans mantık: `docs/referans/index.html` → `viewWorkOrders()`,
`viewWorkOrdersSiparisBazli()`, `viewWorkOrdersListe()`, `viewDurusKayitlari()`
İlgili rapor: `docs/tutarlilik-raporu.md` madde 2

Mevcut `workOrders.js` düz bir tabloya indirgenmiş — tutarlılık raporundaki
**en çok gerileyen modül**. Üç sekmeli yapıya dönüyor.

Müşteri isteği (toplantı notu, madde 2): *"sipariş bazlı, tarih filtresi,
duruşlar."*

---

## Üç sekme

Üstte bitişik düğme grubu, aktif olan `--color-accent-900` zemin:

```
Sipariş Bazlı  |  Liste  |  Duruşlar
```

Varsayılan: Sipariş Bazlı. Sekme seçimi `localStorage`'da.

---

## Sekme 1: Sipariş Bazlı

İki kolon sabit ızgara — Rotalar ekranındaki `.rt-picker` deseninin aynısı.
Kaydırma her kolonun kendi içinde, dış kapsayıcı `overflow: hidden`.

### Sol kolon (280px)

Üstte arama (ürün kodu, ürün adı, sipariş no) ve **plan tarihi filtresi**.

Tarih seçilince: yalnız o güne planlanmış iş emri olan siparişler listelenir.
`machine_plans` üzerinden çözülür.

Her satır:
```
221173  SP-2026-50500
1.500 adet · teslim 18.09.2026
████████████░░░░░░
[Üretimde]  %62
```

**İlerleme hesabı:** zincirdeki tüm adımların `min(üretilen, hedef)` toplamı ÷
hedef toplamı. Fazla üretim %100'ü aşmasın.

Çubuk rengi: termin riski varsa danger, değilse success.

**Durum rozeti** — hesaplanan, `orders.status` değil:
`Tamamlandı` · `Durduruldu` · `İş Emri Bekliyor` · `Termin Riski` · `Üretimde`

Sıralama: Aktif → Durduruldu → Tamamlandı, her grup içinde teslim tarihine göre.

Arama boşsa: `Arama sonucu bulunamadı.`

### Sağ kolon — operasyon zinciri

Panel başlığı: ürün kodu (mono) + ürün adı, sağda
`SP-2026-50500 · 1.500 adet · 8 operasyon`

**Bakım düğmeleri** — başlıkta, sadece gerektiğinde görünür, ikincil stil:

| Düğme | Ne zaman görünür | Ne yapar |
|---|---|---|
| `Rotaya Göre Eksik Adımları Ekle (N)` | rotada olup iş emri açılmamış adım varsa | eksik adımlar için iş emri oluşturur |
| `Mükerrer Adımları Birleştir (N)` | aynı (sıra, makine) için birden çok iş emri varsa | hedefleri toplayıp tek kayda indirir |
| `İş Emirlerini Sil` | iş emri varsa | siparişin tüm iş emirlerini siler, onay ister |

Bunlar planlamacının veri düzeltme araçları — v78'de var, nadiren kullanılır
ama başka çözümü yok.

**Eksik adım tespiti:** ürünün `routes` kayıtlarındaki `sequence` değerleri ile
açılmış iş emirlerinin sıraları karşılaştırılır.

**Mükerrer tespiti:** aynı `(order_id, sequence, work_center_id)` için birden
çok `work_orders` kaydı.

### Adım zinciri

Her adım numaralı işaretçi + dikey çizgi:

| Durum | İşaretçi |
|---|---|
| Tamamlanmış (%100) | dolu success, tik |
| Devam eden (üretilen > 0) | dolu aksan, sıra no |
| Gecikmiş | danger çerçeve |
| Başlamamış | beyaz zemin, ince çerçeve, sıra no |

Adım satırı: operasyon adı · makine adı · sağda `930 / 1.500` ve `%62` +
ilerleme çubuğu. Gecikme varsa `⚠ 3 gün gecikme`.

**Şu an işlenen adım varsayılan açık** — `üretilen < hedef` olan ilk adım.

**Bölünmüş iş emri:** adım altında `A` / `B` satırları, her birinin kendi
makinesi, iş emri no'su, hedefi ve ilerlemesi.

### Genişleyen bölüm

Adıma tıklanınca açılır:

```
ÜRETİM KAYITLARI                    Tahmini bitiş: 14.09.2026 · termine yetişir
                                                        [+ Üretim Girişi]

TARİH       VARDİYA  OPERATÖR    ÜRETİLEN  FİRE  DURUŞ    NOT
05.09.2026  Sabah    Furkan K.        256     0  2s 45dk  Testere değişimi
05.09.2026  Öğle     Mehmet A.        512     4  —        —
```

- Duruş süresi `core/capacity.js:downtimeMinutes()` ile (mola düşülmüş)
- `+ Üretim Girişi` → `#production` (o tarih ve iş emriyle)
- Kayıt yoksa: `Bu adım için henüz üretim kaydı yok.`

**Bu tablo `production.not`, duruş ve operatör alanlarını görünür kılıyor** —
tutarlılık raporu D1, D2 maddeleri.

---

## Sekme 2: Liste

Düz tablo, **iki gruba ayrılmış**:

**Planlı İş Emirleri** — `machine_plans`'ta bir güne atanmış olanlar
**Plansız İş Emirleri** — henüz plana girmemiş olanlar

Her grup kendi başlığı, sayacı ve kısa açıklamasıyla.

```
İŞ EMRİ NO · SİPARİŞ · ÜRÜN · OPERASYON · MAKİNE · HEDEF · ÜRETİLEN · KALAN · % · DURUM · TAHMİNİ BİTİŞ
```

İş emri no'da `split_label` birleştirilsin: `İE-SP-2026-50500-3/A`

Plansız gruptaki satırlarda `Plana Ekle` → `#machine-plans`

Arama + durum filtresi (Tümü / Aktif / Tamamlandı) + plan tarihi filtresi.

---

## Sekme 3: Duruşlar

Duruşu olan üretim kayıtları — `downtime_start` ve `downtime_end` dolu olanlar.

Üstte tarih filtresi, `Filtreyi Temizle`, ve açıklama:
*"Duruşu olan üretim kayıtlarını gösterir — nedeni girmek için Düzenle'ye
tıklayın."*

Başlıkta iki rozet: toplam sayı ve **nedeni eksik olan sayı** (varsa danger).

```
TARİH · İŞ EMRİ · ÜRÜN · OPERASYON · VARDİYA · SÜRE · NEDEN
```

- Süre `2s 45dk` biçiminde (`core/format.js:fmtDuration`)
- Neden yoksa danger rozet: `Neden girilmemiş`
- `Düzenle` → Üretim Girişi'nde o kaydı açar, ya da yerinde bir drawer

Sıralama: tarihe göre azalan.

Bu sekme bir **veri temizleme aracı** — nedeni girilmemiş duruşları bulup
tamamlamak için.

---

## Hesaplar — mevcut fonksiyonları kullan

| Ne | Nereden |
|---|---|
| Tahmini bitiş, gecikme | `core/eta.js:estimateCompletion()` |
| Duruş süresi | `core/capacity.js:downtimeMinutes()` |
| Sayı/süre biçimi | `core/format.js` |

Tasarımda bunlar sabit veri (`a.eta`, `k.durusDk`) — v2'de hesaplanacak.
**Yeniden yazma.**

---

## Veri kaynağı

`listAll()` + `core/store.js` önbelleği:

`orders`, `work_orders`, `production`, `routes`, `machine_plans`,
`product_codes`, `operations`, `work_centers`, `operators`, `downtime_reasons`

Yeni BE ucu açma. Bakım araçları için `work-orders/batch` ucu var (toplu
oluşturma, transaction içinde) — eksik adım eklemede onu kullan.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `wo.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- `focusId` desteği korunsun — `#work-orders?id=` birçok ekrandan geliyor
  (Kapasiteler, Siparişler, Verimlilik, Genel Bakış). Gelen id bir iş emri
  ise onun siparişi seçilsin ve o adım açılsın
- Sipariş durumu enum'u dokuz aşamalı, hesaplanan rozetle karıştırma
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. Sekme 1 (Sipariş Bazlı) — en büyük parça, bitince dur ve raporla
2. Sekme 2 (Liste)
3. Sekme 3 (Duruşlar)
4. Bakım araçları
5. Sözlük, `node --check`, ayrı commit, push

Her adım kendi commit'i olsun. Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.

---

## Kapsam dışı

- İş emri oluşturma — Üretim Siparişleri ekranında (`İş Emri Aç`)
- İş emri düzenleme formu — mevcut drawer korunsun
- Duruş nedeni tanımları — Duruş Nedenleri modülünde
