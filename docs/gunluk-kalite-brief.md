# Claude Code brief — Günlük Kalite Raporları v2 (beş modülü tek ekrana)

Tasarım kaynağı: `tasarim/Gunluk-Kalite-Raporlari-v2.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewGunlukKalite()`, `viewGunlukOzet()`

Bugüne kadarki en büyük iş. **Beş menü öğesi tek modüle dönüşüyor:**

```
Giriş Kalite Kontrolleri  ┐
First-Off Noktaları       │
First-Off Kayıtları       ├──→  Günlük Kalite Raporları (4 sekme)
Saatlik Noktalar          │
Saatlik Kayıtlar          ┘
```

---

## Neden

Şu an Melih bir ürün/operasyon/tarih için kalite kaydı girerken beş ayrı
ekran arasında geziniyor ve her birinde seçimi baştan yapıyor. Yeni yapıda
bağlam bir kez kuruluyor, dört sekmede korunuyor.

---

## Üstte ortak filtre çubuğu

Sekmeler arası **korunur**, hiçbir sekme değişiminde sıfırlanmaz.

| Filtre | Kaynak |
|---|---|
| Ürün | `first_off_points`'te tanımı olan tekil ürünler |
| Operasyon | aşağıdaki üç kademeli çözüm |
| Tarih | serbest, varsayılan bugün |
| Vardiya | 1 / 2 / 3 |

**Operasyon listesi — üç kademeli geri çekilme** (v78'deki `urunOperasyonlari`):

```
1. routes'ta o ürünün operasyonları, sequence sırasına göre
2. yoksa: first_off_points'te o ürün için girilmiş operasyonlar
3. o da yoksa: sabit liste
```

Rota tanımlanmadan da First Off girilebilsin diye.

Filtre çubuğunun altında özet satırı: `221173 · Kesim · 04.09.2026 · Vardiya 1`

**Giriş Kalite sekmesinde operasyon filtresi gizlenir** — tedarikçi girişinin
operasyonu yok.

---

## Sekme 1: Günlük Özet — v2'de karşılığı yok, yeni

Alt başlık: `{tarih} — o gün fiilen kontrol edilen ürün / operasyonlar`

Üç kaynağı çapraz okuyup tablo üretir:

```
ÜRÜN · OPERASYON · FIRST OFF · KARAR DAĞILIMI · DOLU SAATLER · SAATLİK ÖLÇÜM · UYGUNSUZ
```

| Sütun | Hesap |
|---|---|
| FIRST OFF | o gün o ürün/operasyon için kayıt sayısı |
| KARAR DAĞILIMI | `N uygun · M uygun değil`; kayıt yoksa `First Off yok` |
| DOLU SAATLER | en az bir değer girilmiş saatler, virgülle (`10:30, 15:00`) |
| SAATLİK ÖLÇÜM | girilen toplam ölçüm sayısı |
| UYGUNSUZ | limit dışı ölçüm sayısı, sıfırdan büyükse danger |

**Önemli:** Kaydı olmayan ürün/operasyon kombinasyonları tabloda **hiç
görünmez**. Boş satır basma.

Hiç kayıt yoksa: `Bu tarihte hiçbir ürün / operasyon için kayıt girilmemiş.`

Karar dağılımı rengi: bir tane bile `Uygun Değil` varsa danger, hepsi uygunsa
success, kayıt yoksa nötr.

---

## Sekme 2: First Off (İlk Parça)

İki görünüm: **liste** ve **form**.

### Liste

```
SAAT · OPERATÖR · İŞ EMRİ NO · GEREKÇE · NOT · KARAR · [Düzenle]
```

Saate göre sıralı. Sağ üstte `+ Yeni First Off`.
Boşsa: `Bu gün için henüz First Off kaydı yok.`

### Form

`← Listeye Dön` ile geri.

Üst alanlar: saat, operatör, iş emri no, numune adedi (varsayılan 6)

**FIRST OFF GEREKÇESİ** — çoklu seçim kutucukları:

```
Yeni iş emri / seri başlangıcı · Setup / kurulum sonrası · Vardiya değişimi ·
Uzun duruş sonrası · Ayar / parametre değişimi · Malzeme / lot değişimi ·
Düzeltici faaliyet sonrası
```

**İLK 6 PARÇA ÖLÇÜMÜ** — ızgara:

```
KONTROL MADDESİ · TOLERANS · 1 · 2 · 3 · 4 · 5 · 6 · SONUÇ
```

- Satırlar `first_off_points` tanımlarından
- Ölçüsel maddede sayısal giriş, nitel maddede `OK` / `NOK` düğmeleri
- **Hücre rengi:** tolerans dışıysa danger çerçeve + zemin
- SONUÇ sütunu: `—` (boş) / `Uygun` / `N uygunsuz`

**İLK PARÇA KARARI (OTOMATİK)** — elle seçilmez:

```
Herhangi bir numune tolerans dışıysa → Uygun Değil
En az bir değer girilmiş ve hepsi içindeyse → Uygun
Hiç değer yoksa → boş
```

Formun altında bu kuralı açıklayan not.

`Kaydet` / `İptal`.

---

## Sekme 3: Saatlik Kontrol

Üstte iş merkezi adı (seçili ürün/operasyonun rotasından).

**Dört saat bloğu:** `10:30`, `12:00`, `15:00`, `18:00`

Her blok:
- Başlıkta saat + durum rozeti:
  `kayıt yok` / `N ölçüm · uygun` / `N uygunsuz / M ölçüm`
- Personel adı girişi
- Ölçüm ızgarası, First Off ile aynı yapı:

```
ÖLÇÜM YERİ · NOMİNAL · 1 · 2 · 3 · 4 · 5 · 6 · SONUÇ
```

- Satırlar `hourly_points` tanımlarından
- `olcumYeri` alanı satır adı
- Tolerans: ölçüsel `alt-üst`, nitel `OK/NOK`
- Hücre ve sonuç renklendirmesi First Off ile aynı

Saatler sabit liste; ayarlanabilir olması gerekiyorsa Çalışma Saatleri'ne
bağlanabilir — **bu turda sabit bırak**.

---

## Sekme 4: Giriş Kalite Kontrol

Mevcut `incomingInspections.js` ekranı buraya taşınır.

```
TARİH · TEDARİKÇİ · MALZEME · ÇİZİM NO · GÖZLEM NEDENİ · GELEN ADET · NUMUNE · SONUÇ
```

Sağ üstte `+ Yeni Giriş Kalite Kontrolü`.

Bu sekmede operasyon filtresi gizli, tarih filtresi geçerli.

Mevcut modüldeki iç içe karakteristik editörü korunur — o zaten çalışıyor,
yeniden yazma, taşı.

---

## Nokta tanımları nerede yönetilecek

Şu an `first_off_points` ve `hourly_points` ayrı menü öğeleri. Yeni yapıda
menüden kalkıyorlar.

**Tanımları ilgili sekme içinde yönet:** her sekmenin sağ üstünde
`Kontrol Noktaları` bağlantısı, tıklanınca drawer açılır — seçili ürün ve
operasyon için tanımlı noktalar listelenir, eklenir, düzenlenir.

Böylece bağlam korunur: Melih "221173 / Kesim için nokta ekle" derken zaten
o bağlamdadır.

---

## Menü değişikliği

**Kaldırılacak:** Giriş Kalite Kontrolleri, First-Off Noktaları,
First-Off Kayıtları, Saatlik Noktalar, Saatlik Kayıtlar

**Eklenecek:** Günlük Kalite Raporları — "Tedarikçi & Kalite" grubunda

Modül dosyaları (`incomingInspections.js`, `firstOffPoints.js`,
`firstOffRecords.js`, `hourlyPoints.js`, `hourlyRecords.js`) silinmeyecek;
içerikleri yeni modüle taşındıktan sonra silinsin. **API, tablolar ve
Repository katmanı aynen kalır.**

---

## Doğrulanacaklar

⌨️ Bunları raporla, sonra devam et:

1. `first_off_records` ve `hourly_records` tablolarında `vardiya` / `shift`
   alanı var mı? Filtre çubuğunda vardiya var ama kayıtlarda tutulmuyorsa
   filtre işe yaramaz.
2. `hourly_points` tablosunda `olcumYeri` karşılığı hangi sütun?
3. First Off kaydında `gerekce` çoklu değer — tabloda nasıl tutuluyor
   (JSON, virgüllü metin, ayrı tablo)?
4. `first_off_records.numuneAdedi` alanı var mı? Tasarım 6 numune varsayıyor
   ama form numune adedi soruyor.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `gkr.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten
- Sekme durumu ve filtre seçimleri `localStorage`'da
- Enum değerleri (karar, gerekçe) BE'de Türkçe kalır, gösterim çevrilir
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra — bu iş parçalı yapılmalı

Tek turda bitirmeye çalışma. Her adımdan sonra dur ve raporla:

1. **Doğrulama** (yukarıdaki dört madde) → raporla, bekle
2. **Kabuk + filtre çubuğu + Sekme 1 (Günlük Özet)** → raporla
3. **Sekme 2 (First Off)** → raporla
4. **Sekme 3 (Saatlik)** → raporla
5. **Sekme 4 (Giriş Kalite taşınması)** + menü değişikliği + eski dosyaların
   silinmesi
6. Sözlük, `node --check`, ayrı commit, push

Her adım kendi commit'i olsun — bir şey ters giderse geri dönülebilsin.

Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.

---

## Kapsam dışı

- Saat listesinin Çalışma Saatleri'nden gelmesi
- Kontrol noktası tanımlarının toplu içe aktarımı
- Kalite raporu PDF çıktısı
