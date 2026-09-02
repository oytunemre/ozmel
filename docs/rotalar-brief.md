# Claude Code brief — Rotalar ekranını referans uygulamaya göre yeniden yaz

---

## Görev

`public/js/modules/routes.js` ekranını, referans uygulamadaki (`index__78_.html`,
`viewRoutes()`) düzen ve işlevle eşleştir. Düz tablo yerine **ürün seçici +
zaman çizelgesi** düzenine geç.

---

## Önce doğrula, sonra başla

Bu üçünü kontrol edip bana raporla, kapsamı ona göre netleştirelim:

```sql
DESCRIBE routes;
DESCRIBE route_variants;
```

1. **`sequence` tipi.** Referansta `sira` ondalıklı (1, 1.1, 1.2) — alt
   operasyon böyle ekleniyor. v2'de `INT` ise `DECIMAL(5,1)` migration'ı
   gerekiyor. Mevcut veride ondalıklı sıra var mı da bak.

2. **`is_active` alanı.** Referansta `aktif` bool — aynı sırada birden çok iş
   merkezi varsa hangisinin kapasite hesabına gireceğini belirliyor. Yedekte
   `221170 / Cutting` için `Upcut Saw 2` aktif, `Upcut Saw 1` alternatif.

3. **`route_variants` tablosu.** DB'de var. Şeması referanstaki
   `varyantEtiketi` + `varyantSecenekleri` yapısını karşılıyor mu?

---

## Düzen

Solda ürün listesi, sağda seçili ürünün rota çizelgesi. Mevcut
`part-picker` / `timeline` CSS sınıfları `app.css`'te varsa kullan, yoksa ekle.

### Sol panel — ürün listesi

Her satırda:
- Ürün kodu (mono)
- Ürün adı
- `N operasyon adımı` — **tekil `sequence` sayısı**, satır sayısı değil
  (aynı sırada birden çok iş merkezi olabilir)

Seçili ürün vurgulu. Üstteki arama kutusu bu listeyi süzer — ürün kodu **ve**
ürün adı üzerinde.

Seçim `SELECTED_URUN_ROUTE` benzeri bir modül durumunda tutulsun; liste
değişince geçersiz kalırsa ilk ürüne düşsün.

### Sağ panel — zaman çizelgesi

Adımlar `sequence` bazında gruplanmış, sayısal sıraya göre. Her grup:

```
┌─ (sıra no) ── Operasyon adı        [+ Alt Operasyon] [+ Varyant]
│               Varyant: 8,40 mm  10,50 mm  12,70 mm
│               [Aktif]       Upcut Saw 2      Düzenle  Sil
│               [Alternatif]  Upcut Saw 1      Düzenle  Sil
```

- Sıra numarası yuvarlak işaretçide, altında dikey çizgi
- Operasyon adı `terms` tablosundan çevrilmiş (referansta `terimCevir()`)
- Aynı sıradaki her iş merkezi ayrı satır, `Aktif` / `Alternatif` rozetiyle
- Varyant tanımlıysa etiket + seçenekler rozet olarak

**CNC grup başlığı:** Sıra tamsayıysa ve operasyon adında "CNC" geçiyorsa,
grubun üstüne küçük "CNC İşleme" başlığı. Referanstaki davranış:

```js
const cncGrupBasi = Number.isInteger(siraNum) &&
                    group[0].operasyon.toUpperCase().includes('CNC');
```

**Alt bilgi notu:** "Bir operasyonda birden fazla iş merkezi varsa, hangisinin
aktif hat olduğunu Kapasiteler modülünden seçebilirsiniz."

---

## Eylemler

### Yeni / Düzenle rota adımı

Mevcut drawer desenini kullan. Alanlar:

| Alan | Tip | Not |
|---|---|---|
| Ürün Kodu | FK (`product_codes`) | seçili ürün ön dolu |
| Sıra No | sayı, adım 0.1 | zorunlu |
| Operasyon | FK (`operations`) | zorunlu |
| İş Merkezi | FK (`work_centers`) | zorunlu |
| Aktif | bool | aynı sırada tek aktif olmalı |

Referansta "Listede olmayan bir makine/operasyon mı lazım?" diye İş Merkezleri
ekranına bağlantı var — aynısını ekle.

### + Alt Operasyon Ekle

Aynı makinede birden fazla ayar gerektiren işler için (örn. CNC'nin 1. ve 2.
operasyonu). Referans mantığı:

```js
// mevcut sıranın tam sayı tabanından başlayıp boş ondalık bul
let onerilenSira = Math.floor(mevcutSira) + 0.1;
while (tumSiralar.some(s => Math.abs(s - onerilenSira) < 0.001))
  onerilenSira += 0.1;
```

Yani sıra 1'de alt operasyon eklenince 1.1 önerilir, o doluysa 1.2.

Form: sıra no (ön dolu), operasyon adı (serbest metin), iş merkezi (mevcut
ön dolu), opsiyonel kapasite.

Referansta operasyon ya da iş merkezi listede yoksa otomatik oluşturuluyor.
**v2'de bunu yapma** — FK bütünlüğü var. Bunun yerine kullanıcıyı ilgili
tanım ekranına yönlendir.

### + Varyant Seçenekleri

Sipariş bazında değişebilen seçenek grubu (örn. "Delik Ölçüsü": 8,40 mm;
10,50 mm; 12,70 mm). İş emri açarken bunlardan biri seçiliyor.

Form:
- Seçenek grubu adı
- Seçenekler — **noktalı virgülle ayrılmış** (virgül ondalık ayracı olduğu
  için kullanılamaz)
- Varyant tanımlıysa "Varyant Tanımını Kaldır" düğmesi

**Önemli:** Varyant, aynı `(ürün, sıra, operasyon)` üçlüsündeki **tüm iş
merkezi alternatiflerine** uygulanıyor — tutarlılık için. Kaldırma da öyle.

Kaldırma onayında: "Bu seçeneklerle zaten açılmış iş emirlerindeki seçim
korunur."

---

## v2 uyarlamaları

Referans tek dosyalı, global `DB` nesnesi kullanıyor. v2'de:

- Veri `api.listAll()` ile çekilecek, `DB.routes` yok
- Yazma işlemleri Repository/API üzerinden, doğrudan dizi mutasyonu yok
- **Tüm metinler `t()`** ile, `() => t(...)` deseni — dil canlı değişiyor
- Yeni anahtarlar `docs/ceviri-sozlugu.md`'ye eklenecek
- `focusId` desteği korunacak (global aramadan gelen `#routes?id=` yönlendirmesi)
- Optimistic locking (`updated_at`, 409 STALE) mevcut desene uyacak
- İş merkezi ve operasyon adları `terms` tablosundan çevrilecek — bu
  ertelenen bir işti, burada gerekiyorsa şimdi ele al

---

## Kapsam dışı

- Kapasite entegrasyonu (darboğaz hesabı, veri uyarıları) — ayrı iş
- İş emri açma akışında varyant seçimi — ayrı iş
- `sequence` migration'ı gerekiyorsa önce onu ayrı adımda yap

---

## Sıra

1. Şema doğrulaması (yukarıdaki üç madde) → bana raporla
2. Gerekiyorsa `sequence` migration'ı
3. Ekran yeniden yazımı
4. `php -l` + `node --check`
5. Sözlük güncellemesi
