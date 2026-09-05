# Claude Code brief — Üretim Siparişleri v2 (mevcut ekranın yenilenmesi)

Tasarım kaynağı: `tasarim/Uretim-Siparisleri-v2.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewOrders()`

Mevcut `orders.js` yenileniyor. Ana yenilik: **İş Emri Aç akışı** — v2'de hiç
yok, en karmaşık kısım.

---

## Ekranın konumu

Satış Siparişleri müşteri tarafını görüyor. Bu ekran **planlamacının** tarafı:
sipariş var, rota var, şimdi iş emirleri açılacak.

Alt başlık: "Sipariş kaydedildiğinde iş emirleri otomatik açılmaz — hazır
olduğunuzda 'İş Emri Aç' ile siz başlatırsınız"

---

## Dört KPI kartı

| Kart | Hesap |
|---|---|
| Aktif Sipariş | `durum = 'Aktif'` |
| İş Emri Bekliyor | aktif ve hiç iş emri açılmamış |
| Termin Riski | aktif ve (geride ya da kapasite yetersiz) |
| Açık İş Emri | aktif siparişlerin toplam iş emri sayısı |

---

## Filtre + tablo

Arama: sipariş no, ürün kodu, ürün adı, müşteri, satış sipariş no, not

Filtreler: `Tümü · Aktif · İş Emri Bekliyor · Termin Riski · Tamamlandı`

**Kolon başlığına tıklayınca sıralar.** Sıralama seçilmemişse varsayılan:
Aktif → Durduruldu → Tamamlandı, her grup içinde teslim tarihine göre.

```
SİPARİŞ NO · KAYNAK · ÜRÜN · HEDEF · ÜRETİLEN · KALAN ·
İSTENEN TESLİM · TAHMİNİ BİTİŞ · DURUM · İŞ EMRİ · [eylemler]
```

- ÜRÜN iki satırlı: kod + ürün adı
- KAYNAK rozeti: Satış / Üretim / Stok
- İŞ EMRİ sütunu: açılmış iş emri sayısı; sıfırsa `Bekliyor` rozeti
- TAHMİNİ BİTİŞ `core/eta.js` ile

**Durum rozeti — hesaplanan, `orders.status` değil:**

| Koşul | Metin | Renk |
|---|---|---|
| `status = 'Tamamlandı'` | Tamamlandı | success |
| `status = 'Durduruldu'` | Durduruldu | nötr |
| Kapasite yetersiz | Kapasite Yetersiz | danger |
| ETA > teslim tarihi | Termin Riski | danger |
| Hiç iş emri yok | İş Emri Bekliyor | warning |
| Diğer | Üretimde | accent |

**Kapasite yetersiz** hesabı: kalan miktar ÷ darboğaz günlük kapasite >
teslime kalan gün. `core/bottleneck.js:productBottleneck()` kullan.

**Eylemler:** `İş Emirlerini Görüntüle` · `İş Emri Aç` · `Düzenle` · `Sil`

`İş Emirlerini Görüntüle` → `#work-orders?id=` (o siparişin iş emirleri)

---

## İş Emri Aç akışı — asıl iş

`İş Emri Aç` düğmesi bir modal açar.

### Açılışta

Ürünün rotası okunur (`routes`, `sequence` sırasına göre gruplanmış). Her sıra
grubu için **aktif hat** (`is_active`) ön seçili gelir; aktif yoksa ilk seçenek.

Rota yoksa: toast `Bu ürün için tanımlı rota bulunamadı` ve modal açılmaz.

### Açıklama metni (tasarımdan birebir)

"Rotadaki her operasyon için iş emri açılacak. Birden fazla makine seçeneği
olan adımlarda hangi makinenin kullanılacağını seçebilir, 'İkinci makine ekle'
ile o adımı iki makineye bölebilirsiniz — miktar, Kapasite Yönetimi'ndeki
kapasitelerle orantılı paylaşılır."

### Her rota adımı için bir blok

```
1. Kesim                                    tek iş merkezi
   [Upcut Saw 1 ▾]                          %100

2. CNC Machining                            2 makine seçeneği
   [CNC Machining Workplace ▾]  %62  [Kaldır]
   [CNC Tezgah 2 ▾]             %38  [Kaldır]
   + İkinci makine ekle (böl)

   Varyant: Delik Ölçüsü  [— Seçin — ▾]
```

**Makine seçimi:** o sıradaki iş merkezleri arasından açılır liste.

**Bölme:** `+ İkinci makine ekle` ile aynı adıma ikinci makine eklenir.
Tek makine kaldığında `Kaldır` görünmez.

**Pay hesabı — kapasiteye orantılı:**

```
pay(makine) = kapasite(makine) / toplam kapasite(seçili makineler)
```

Kapasite `core/bottleneck.js:getCapacity()` ile — `minutes` doluysa çalışma
saatlerinden hesaplanan canlı değer.

Kapasitesi tanımlı olmayan makine seçilirse pay hesaplanamaz; eşit bölüştür ve
uyar.

**Varyant seçimi:** o adımda `variant_label` tanımlıysa açılır liste görünür
(`route_variants` seçenekleri). Zorunlu değil.

### Özet ve kaydetme

Modal altında: `N iş emri açılacak`

`İş Emirlerini Aç` düğmesi tıklanınca:

- Her (sıra, makine) çifti için bir `work_orders` kaydı
- `wo_no` = `{orderNo}-{sıra}` — bölünmüşse `split_label` `A`, `B`
- `target_quantity` = sipariş hedefi × pay, **yuvarlanmış**; artık son
  makineye eklenir ki toplam tutsun
- `operation_id`, `work_center_id` rota adımından
- `status = 'Aktif'`
- Hepsi **tek işlemde** — biri başarısız olursa hiçbiri yazılmaz

Sonra toast: `N iş emri açıldı` ve liste tazelenir.

**Tekrar açma:** sipariş için zaten iş emri varsa düğme yine çalışsın ama
uyarı göstersin: `Bu sipariş için N iş emri zaten açık. Yenilerini açmak
istediğinize emin misiniz?`

---

## Yeni / düzenle formu

```
Ürün *              (FK → product_codes)
Hedef Miktar *
[rota önizlemesi]
Başlangıç Tarihi
İstenen Teslim Tarihi
Durum               (Aktif / Durduruldu / Tamamlandı)
Not
```

**Rota önizlemesi:** ürün seçilince o ürünün rota adımları küçük bir satırda
gösterilir: `Kesim → CNC Machining → Countersink → Packaging`. Rota yoksa
uyarı: `Bu ürün için rota tanımlı değil — iş emri açılamaz.`

`kaynak` bu ekrandan girilirse `uretim` ya da `stok` olabilir. Satış
siparişleri Satış Siparişleri ekranından girilir.

---

## Silme

Onay iste. Bağlı iş emri varsa sayısını göster ve engelle:
`Bu siparişe bağlı N iş emri var. Önce onları silin.`

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `us.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- `core/eta.js` ve `core/bottleneck.js` — yeniden yazma
- Menüde adı zaten **Üretim Siparişleri** olarak değişti
- `focusId` desteği (`#orders?id=`) korunsun — Satış Siparişleri oradan
  yönlendiriyor
- Sipariş durumu enum'u (`Aktif`, `Durduruldu`, `Tamamlandı`) ile bugün
  eklediğimiz dokuz aşamalı durum listesi **farklı şeyler mi?** Kontrol et:
  `orders.status` şu an `Üretimde` değerinde (migration 030 backfill'i).
  Tasarım `Aktif / Durduruldu / Tamamlandı` diyor. **Bu çelişkiyi raporla,
  karar bekle** — dokuz aşamalı liste mi geçerli, üçlü mü?
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. **Durum enum çelişkisini raporla** (yukarıdaki madde) → bekle
2. Ekran + KPI + filtre + tablo
3. İş Emri Aç akışı
4. Sözlük, `node --check`, gerekiyorsa `php -l`
5. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

---

## Kapsam dışı

- İş emri düzenleme / silme — İş Emirleri ekranının işi
- Sipariş → sevkiyat bağlantısı
- Toplu iş emri açma (birden çok sipariş için aynı anda)
