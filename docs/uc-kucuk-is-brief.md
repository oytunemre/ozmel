# Claude Code brief — Üç küçük iş

Birbirinden bağımsız üç madde. Sırayla yap, **her biri ayrı commit**.

Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.

---

# 1. Nokta sayfalarını Tanımlar grubuna taşı

Müşteri kararı: First-Off Noktaları ve Saatlik Noktalar ayrı sayfa olarak
**kalacak** ama menüde yeri değişecek.

Gerekçe: bunlar birer tanım — Ürün Kodları, Terimler, Çalışma Saatleri ve
Duruş Nedenleri ile aynı grupta olmalı. Günlük Kalite Raporları'nı kullanan
kişi noktalara nadiren dokunur.

`public/index.html`'deki `GROUPS` tablosunda:

```
supplierQuality: first-off-points, hourly-points  ← çıkar
definitions:     first-off-points, hourly-points  ← ekle
```

Tanımlar grubunun sonuna, `downtime-reasons`'dan sonra.

Modül dosyalarına dokunma, sadece menü kaydı.

---

# 2. Doluluk kartını düzelt

Genel Bakış'ta "İş Merkezi Doluluğu" kartı vardı, **formülü hatalı olduğu için
gizlenmişti**. `DashboardRepository::workCenterLoad()` yorum satırında.

## Sorun

Eski formül `SUM(capacity_per_shift)`'i plan satırı sayısıyla çarpıyordu —
JOIN hatası. Her iş merkezi %100 çıkıyordu.

## Doğru hesap

Müşteri bilgisi: **haftada 5 gün, günde 2 vardiya = 10 vardiya.**

```
haftalık kapasite = kapasite × haftalık vardiya sayısı
haftalık plan     = o iş merkezine bu hafta atanmış hedeflerin toplamı
doluluk           = plan / kapasite
```

**Kapasite kaynağı** `core/bottleneck.js:getCapacity()` — `minutes` doluysa
çalışma saatlerinden hesaplanan canlı değer, yoksa `capacity_per_shift`.
Yeniden yazma.

**Dikkat:** `getCapacity()` **günlük** değer döndürüyor (`netWorkMinutes` günün
tamamı). Haftalık için 5 ile çarp, 10 ile değil. Bunu koda yorum olarak yaz,
karışmasın.

Kapasitesi tanımsız iş merkezi hesaba girmesin, "kapasite tanımsız" olarak
ayrı gösterilsin.

## Ekran

Genel Bakış'a bir bölüm: **İş Merkezi Doluluğu (bu hafta)**

Her iş merkezi bir satır:
```
CNC Machining Workplace    1.400 / 2.040    ████████░░  %69
```

- Doluluk çubuğu: %85 üzeri danger, %60 üzeri warning, altı accent
- %100'ü aşanlar kırmızı ve `%120` gibi gerçek değeri göstersin — aşırı
  yükleme görünsün
- Sıralama: dolulukta azalan
- Planı olmayan iş merkezleri listede görünmesin

Alt not: *"Haftalık kapasite = günlük kapasite × 5 iş günü. Plan Üretim
Planı'ndan gelir."*

`DashboardRepository`'deki eski metodu **silme**, kullanan başka yer varsa
bozulur — kontrol et, kullanılmıyorsa sil.

---

# 3. Operatör performans sekmesi

Referans: `docs/referans/index.html` → `viewOperatorPerformans()`

Operatörler ekranı şu an düz liste. İki sekme olacak:

```
Operatör Listesi  |  Performans
```

Mevcut liste birinci sekme, aynen kalır.

## Performans sekmesi

Üstte dönem seçici — bitişik düğme grubu:
```
Bu Hafta  |  Bu Ay  |  Tüm Zamanlar
```

`production` kayıtları operatöre göre gruplanır. Sadece `operator_id` dolu
olanlar (veride 197/247).

```
OPERATÖR · KAYIT SAYISI · ÜRETİLEN · FİRE · FİRE ORANI · HEDEF GERÇEKLEŞME · DURUŞ
```

**Hesaplar:**

| Sütun | Formül |
|---|---|
| Üretilen | `sum(actual_quantity)` |
| Fire | `sum(scrap_quantity)` |
| Fire oranı | `fire / (üretilen + fire)` % |
| Hedef gerçekleşme | `üretilen / sum(target_quantity)` % |
| Duruş | `core/capacity.js:downtimeMinutes()` toplamı |

**Renk eşikleri:**
- Fire oranı: ≤%2 success · ≤%5 warning · üstü danger
- Hedef gerçekleşme: `core/report.js:thresholdClass()` (eşik 90)

Sıralama: üretilene göre azalan.

Silinmiş operatör kaydı varsa `(silinmiş operatör)` yaz, satırı atlama.

**Boş hal:** *"Bu dönemde operatör girilmiş üretim kaydı yok. Üretim
Girişi'nde kayıt girerken Operatör seçilmesi gerekir."*

Dönem seçimi `localStorage`'da.

---

## Ortak kurallar

- Tüm metinler `() => t(...)`, yeni anahtarlar `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`
- `text-transform: uppercase` veri metnine uygulanmayacak
- Mevcut `core/` fonksiyonlarını yeniden yazma
- Her madde ayrı commit, sırayla push

## Doğrulama

- `node --check` tüm değişen JS
- `php -l` değişen PHP
- TR/EN anahtar dengesi
- **Tarayıcıda üç ekranı da aç, konsolda hata var mı bak** — bugün
  `LIST_FILTERS` TDZ hatası `node --check`'ten geçmişti
