# Claude Code brief — Genel Bakış v2 (mevcut ekranın yenilenmesi)

Tasarım kaynağı: `tasarim/Genel-Bakis-v2.dc.html`

Mevcut `dashboard.js` tamamen değişiyor. Yapı ve içerik farklı.

---

## ÖNCE: iki KPI kapsam dışı modüllere dayanıyor

Tasarımdaki beş KPI'dan ikisi v2'de olmayan modüllerden besleniyor:

| KPI | Kaynak | Durum |
|---|---|---|
| Tedarikçi Sitesi | `sites` koleksiyonu | **Modül yok.** Yedekte 1 kayıt var (SAMCO, Türkiye/Samsun) |
| Parça | `parts` koleksiyonu | **Modül yok.** Yedekte **0 kayıt** |

Ayrıca **Tedarikçi Dağılımı — Ülke** bölümü tamamen `sites.country` alanına
dayanıyor. O modül olmadan bu bölüm çalışamaz.

### Karar

Bu turda **Tedarikçi Sitesi ve Parça KPI'larını, ve Ülke Dağılımı bölümünü
uygulama.** Yerlerine mevcut veriden anlamlı olanları koy:

| Yerine | Kaynak |
|---|---|
| Aktif Sipariş | `orders` durumu İptal/Tamamlandı olmayanlar |
| Açık İş Emri | `work_orders` durumu Aktif |

Beş KPI şu hale gelsin:

```
AKTİF SİPARİŞ · AÇIK İŞ EMRİ · GECİKEN GÖREV · GÖREV TAMAMLAMA · KAPASİTE UYARISI
```

`sites`/`parts` modülleri ileride eklenirse KPI'lar geri konur. Bunu koda
yorum olarak düş.

---

## Bölümler

### 1. Beş KPI kartı

| Kart | Değer | Alt satır | Renk |
|---|---|---|---|
| Aktif Sipariş | sayı | `N iş emri açık` | accent |
| Açık İş Emri | sayı | `N sipariş içinde` | accent |
| Geciken Görev | sayı | `N açık görevden` | danger |
| Görev Tamamlama | `%` | `N / M görev` | success |
| Kapasite Uyarısı | sayı | `N ürün rotası tanımlı` | warning |

**Kapasite uyarısı** — `capacities.js`'te yazdığın `computeDataWarnings()`
mantığının aynısı (duplicate / orphan / missing). Ortak bir yardımcıya çıkar,
iki ekran da kullansın.

### 2. Geciken Görevler

Başlıkta sayı rozeti. Sütunlar:

```
GÖREV · SORUMLU · TERMİN · GECİKME
```

- `tasks` tablosundan, `durum != 'Tamamlandı'` **ve** `termin < bugün`
- Gecikme = bugün − termin, gün olarak
- Sıralama: en çok gecikenden aza
- Varsayılan **6 satır**, fazlası alt notta:
  `+N görev daha — Görev Takibi modülünde görüntüleyin.`
- Geciken yoksa: `Tüm geciken görevler listelendi.` yerine boş hal

`tasks` alanları: `gorevTanimi`, `anaSorumlu`, `termin`, `durum`,
`tamamlanmaYuzdesi`. Durum değerleri: `Başlamadı`, `Devam Ediyor`,
`Tamamlandı`.

### 3. Ürün Bazlı Günlük Hedef Kapasite (Darboğaz)

Alt başlık: `En kısıtlı 8 ürün`

Her satır:
```
221173                                    204
Kapak Grubu · darboğaz: CNC Machining Wp.  ████████░░
```

- Ürün kodu, altında ürün adı + `darboğaz: <iş merkezi>`
- Sağda günlük hedef kapasite
- Çubuk genişliği: `kapasite / max(kapasite)`
- Oran %15'in altındaysa `--color-danger`, değilse `--color-accent-500`
- **En düşük kapasiteli 8 ürün** (en kısıtlı olanlar üstte)

**Hesap `capacities.js`'teki `productBottleneck()` ile aynı.** Ortak
yardımcıya çıkar.

Alt not: "Darboğaz istasyonundaki kapasiteyi Kapasite Yönetimi'nden
değiştirdiğinizde bu sıralama anında güncellenir."

### 4. Üretim Takibi (MRP) Özeti

Üstte iki sayı: `AKTİF SİPARİŞ` ve `BUGÜNKÜ ÜRETİM`.
Başlıkta rozet: `N riskli`.

Alt başlık: "Termin riski taşıyan siparişler — ilerleme / hedef"

Her satır:
```
FLN-DN100-A                                %62
SIP-2026-044 · Termin gerisinde — 3 gün    ██████░░░░
```

**Risk sebebi üç türde:**

| Sebep | Koşul |
|---|---|
| `Termin gerisinde — N gün` | Tahmini bitiş > teslim tarihi |
| `Kapasite yetersiz` | Kalan miktar / günlük kapasite > kalan gün |
| `Hammadde eksiği` | Stok Durumu ekranındaki net stok negatif |

**Bunlardan ilk ikisi ETA hesabı gerektiriyor** — v78'deki `workOrderStats()`
mantığı: son 7 üretim kaydının günlük ortalamasından kalan gün hesabı.

Bu hesap v2'de **henüz yok**. İki seçenek:

1. Bu turda sadece **Hammadde eksiği** riskini uygula (Stok Durumu ekranındaki
   hesaptan), diğer ikisi İş Emirleri ekranı yapılınca eklenir
2. ETA hesabını burada yaz, sonra İş Emirleri de kullansın

**(2)'yi uygula** — `core/` altına `estimateCompletion(workOrder, production)`
diye bir yardımcı çıkar. İş Emirleri ekranı sırada, o da aynı fonksiyonu
kullanacak.

İlerleme yüzdesi: üretilen / hedef.

---

## Ortak yardımcılar

Bu ekran üç hesabı `capacities.js` ve gelecekteki İş Emirleri ile paylaşıyor.
Hepsini `core/` altına çıkar, mevcut ekranları da ona bağla:

```
core/bottleneck.js  → productBottleneck(), computeDataWarnings()
core/eta.js         → estimateCompletion()
```

`capacities.js`'i yeni yardımcılara bağlarken **davranışını değiştirme**.
Çalışan ekranı bozma.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `gb.*` anahtarları
  `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten
- Çapraz bağlantılar: görev → `#tasks`, ürün → `#product-codes?id=`,
  sipariş → `#orders?id=`, darboğaz iş merkezi → `#capacities?id=`
- Eski dashboard'daki **İş Merkezi Doluluğu** kartı gizliydi (formülü hatalı) —
  yeni tasarımda zaten yok, kaldır
- `DashboardRepository`'deki ham SQL: yeni ekran `listAll()` ile türetiyorsa
  Repository'ye gerek kalmayabilir. Kullanılmayan metotları sil, ama
  `overview()` başka yerden çağrılıyorsa dokunma
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. Ortak yardımcıları çıkar (`bottleneck.js`, `eta.js`), `capacities.js`'i bağla,
   davranış aynı kalsın
2. Yeni dashboard
3. Sözlük
4. `node --check` + gerekiyorsa `php -l`
5. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

---

## Kapsam dışı

- Tedarikçi Sitesi / Parça KPI'ları ve Ülke Dağılımı — modüller yok
- Görev tamamlama trendi / grafik
- Otomatik yenileme (Üretim Panosu dışında hiçbir ekranda yok)
