# Claude Code brief — Satış Siparişleri (yeni ekran)

Tasarım kaynağı: `tasarim/Satis-Siparisleri-v2.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewSatisSiparisleri()`

v78'de **iki ayrı sipariş ekranı** var, v2'de tek:

| v78 | Odak |
|---|---|
| Satış Siparişleri | Müşteri siparişi, teslim takibi, ilerleme raporu |
| Üretim Siparişleri | Tüm siparişler, iş emri açma noktası |

v2'de yalnızca ikincisi var (`orders`). Bu brief birincisini ekliyor.

---

## Veri hazır — migration gerekmiyor

`orders` tablosunda gerekli alanların hepsi var:

```
kaynak (satis), musteri, satisSiparisNo, orderNo, urun,
hedefMiktar, baslangicTarihi, istenenTeslimTarihi, not, durum
```

Yedekteki 25 siparişin **hepsi** `kaynak = 'satis'`, `musteri` dolu
(Mosdorfer CCL), `satisSiparisNo` dolu (`50500`, `50501`…).

⌨️ Yine de `DESCRIBE orders` ile sütun adlarını doğrula ve raporla —
özellikle `sales_order_no`, `customer`, `source` karşılıkları.

Bu ekran **`kaynak = 'satis'` olanları** listeler. Aynı tabloyu okur,
farklı bir görünüm sunar.

---

## Ekran

### Başlık

`SATIŞ SİPARİŞLERİ`
Alt satır: "Müşteri siparişleri — girildiği anda Üretim Siparişleri listesine
düşer, iş emirleri planlamacı tarafından ayrıca açılır"

Sağda `+ Yeni Satış Siparişi`.

### Filtre çubuğu

Arama kutusu (satış sipariş no, sipariş no, müşteri, ürün, not alanlarında)
+ sağda sayaç `12 / 25 sipariş`.

Durum filtreleri — bitişik düğme grubu, aktif `--color-accent-900`:

```
Hepsi · İş Emri Bekleyen · Termin Riski · Tamamlanan
```

### Tablo

Kolon başlığına tıklayınca sıralar, tekrar tıklayınca yön değişir.

```
SATIŞ SİP. NO · SİPARİŞ NO · MÜŞTERİ · ÜRÜN · HEDEF ·
SİPARİŞ TARİHİ · İSTENEN TESLİM · ÜRETİM DURUMU · İLERLEME · [eylemler]
```

- ÜRÜN hücresi iki satırlı: kod + altında ürün adı
- İSTENEN TESLİM geçmişse ve tamamlanmamışsa danger renk
- İLERLEME: yüzde + çubuk

**Eylemler:** `Rapor` · `Üretim Siparişinde Gör` · `Düzenle`

`Üretim Siparişinde Gör` → `#orders?id=<id>` (mevcut `focusId`)

Boşsa: `Bu filtreyle eşleşen satış siparişi yok.`

Alt not: "Satış siparişleri girildiği anda Üretim Siparişleri listesine düşer
ancak iş emirleri otomatik açılmaz — planlamacı orada 'İş Emri Aç' ile
başlatır."

---

## Üretim durumu — dikkat, hesap özel

**İlerleme son rota adımından hesaplanır**, tüm iş emirlerinden değil.

```js
sonlar  = işEmirleri.filter(w => son adım mı)
hedef   = sum(sonlar.hedefMiktar)
üretilen = sum(sonlar.üretilen)
yüzde   = üretilen / hedef
```

Gerekçe: bir sipariş beş operasyondan geçiyorsa, kesim %100 bitmiş olabilir
ama müşteriye giden bitmiş ürün son adımdan çıkar. Ortalama almak yanıltıcı
olur.

**Son adım tespiti:** ürünün `routes` kayıtlarında en yüksek `sequence`.
Aynı sırada birden çok iş merkezi varsa (bölünmüş iş emri) hepsi sayılır.

**Durum rozeti:**

| Koşul | Metin | Renk |
|---|---|---|
| Hiç iş emri yok | `İş Emri Bekliyor` | warning |
| Son adım hedefe ulaştı | `Tamamlandı` | success |
| Tahmini bitiş > teslim tarihi | `Termin Riski` | danger |
| Diğer | `Üretimde` | accent |

Termin riski `core/eta.js:estimateCompletion()` ile — Genel Bakış için
yazdığın fonksiyon.

---

## Rapor penceresi

`Rapor` düğmesi bir modal açar.

### Üst bilgi

Müşteri, ürün, hedef miktar, sipariş tarihi, istenen teslim.

### TAHMİNİ BİTİŞ

KPI kartları: üretilen / hedef / kalan / tahmini bitiş tarihi.

İş emri yoksa: `Henüz iş emri açılmadı — tahmini süre hesaplanamıyor.`

### Bölünmüş iş emri tablosu

Son adımda birden fazla iş emri varsa (A/B bölmesi):

```
İŞ EMRİ · MAKİNE · HEDEF · ÜRETİLEN · TAHMİNİ BİTİŞ
```

Her satır için ayrı ETA. Siparişin tahmini bitişi bunların **en geçi**.

Tek iş emri varsa bu tablo görünmez.

### Tüm iş emirleri

```
İŞ EMRİ NO · OPERASYON · MAKİNE · İLERLEME
```

Rota sırasına göre, her satırda ilerleme çubuğu.

`Kapat` düğmesi.

---

## Yeni / düzenle formu

Mevcut drawer desenini kullan.

```
Satış Sipariş No
Müşteri
Ürün *              (FK → product_codes)
Hedef Miktar *
Sipariş Tarihi
İstenen Teslim Tarihi
Not
```

Kaydederken `kaynak = 'satis'` otomatik yazılır.

Form altında not: "Kaydedildiğinde bu sipariş Üretim Siparişleri listesine de
düşer. İş emirleri otomatik açılmaz."

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `ss.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten
- ETA `core/eta.js`'ten — yeniden yazma
- Sol menüye **Satış Siparişleri**, "Satış" grubunun başına
  (mevcut `Siparişler` → **Üretim Siparişleri** olarak yeniden adlandırılsın,
  ikisi karışmasın)
- Sipariş durumu (`durum`) alanı bu ekranda **gösterilmez** — üretim durumu
  hesaplanan bir değer, elle girilen `durum` alanından farklı. İkisini
  karıştırma
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. `DESCRIBE orders` doğrulaması → raporla
2. Ekran
3. Menü: yeni öğe + mevcut `Siparişler`in adı `Üretim Siparişleri` olsun
4. Sözlük, `node --check`
5. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

---

## Kapsam dışı

- Üretim Siparişleri ekranındaki "İş Emri Aç" akışı — o ekran ayrı iş
- Sipariş → sevkiyat bağlantısı (sevkiyat modülü yok)
- Müşteri tablosu — `musteri` şimdilik serbest metin
