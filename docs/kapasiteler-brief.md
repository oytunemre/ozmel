# Claude Code brief — Kapasiteler ekranı (referans v78 düzeni)

Referans: `docs/referans/v78.html` → `viewCapacity()`, `getCapacity()`,
`productBottleneck()`, `computeDataWarnings()`, `makineDurumu()`,
`setActiveWorkCenter()`, `setCapacityValue()`, `setCapacityDakika()`, `csOzet()`.

---

## ÖNCE: şema hatası — bu düzeltilmeden ekran anlamsız

`capacities` tablosunda **`operation_id` yok**. Tekil anahtar
`uniq_cap_tenant_product_wc` = `(tenant_id, product_code_id, work_center_id)`.

Ama referans model kapasiteyi **`(ürün, iş merkezi, operasyon)`** üçlüsünde
tutuyor — aynı makinede farklı operasyonların farklı kapasitesi olabiliyor.

Yedekteki gerçek veri:

```
400544 / CNC Machining Workplace
  (operasyonsuz, eski kayıt)                → 250 adet/gün
  CNC OPERASYON 1 (Alın Alma ve 1.Knurl)   → 204,  2.5 dk/adet
  CNC OPERASYON 2 (Alın Alma ve 2.Knurl)   → 204,  2.5 dk/adet
  CNC Machining                             → 204,  2.5 dk/adet
```

`(ürün, iş merkezi, operasyon)` üçlüsünde **tekrar yok** — 0 çakışma.

**Sonuç:** ETL'de "28 mükerrer kapasite atlandı" dediğimiz kayıtlar mükerrer
değil, ayrı operasyonlar. Üstelik tutulan kayıt eski/kaba olan; atılanlar
güncel ve dakika bazlı olanlar. `ozmel_test`'teki kapasite verisi eksik değil,
**yanlış**.

### Yapılacak

**Migration `032_capacity_operation.sql`:**

```sql
ALTER TABLE capacities
  ADD COLUMN operation_id BIGINT UNSIGNED NULL AFTER work_center_id,
  ADD CONSTRAINT fk_cap_operation FOREIGN KEY (operation_id) REFERENCES operations (id);

ALTER TABLE capacities
  DROP INDEX uniq_cap_tenant_product_wc,
  ADD UNIQUE KEY uniq_cap_tenant_product_wc_op
    (tenant_id, product_code_id, work_center_id, operation_id);
```

MySQL'de `NULL` değerler tekil anahtarda çakışmaz — operasyonsuz eski kayıtlar
sorunsuz durur. Bu istenen davranış; referansın geri düşme mantığıyla uyumlu.

**ETL:** `capacity` dönüşümünde `operasyon` alanı `operation_id`'ye eşlensin.
`minutes` sütunu `dakikaPerAdet`'i karşılıyor mu doğrula (10 kayıtta var).

**ETL yeniden çalıştırılacak** — kapasite tablosu temizlenip yeniden
yüklenmeli. Bunu ben yapacağım, sen sadece migration + ETL kodunu hazırla.

---

## Ekran

Rotalar ekranındaki `part-picker` / `timeline` düzeninin aynısı, üstüne üç
ek bölüm.

### Sol panel — ürün listesi

- Ürün kodu, ürün adı
- Üçüncü satır: `Hedef: <darboğaz kapasitesi>/gün` — hesaplanamıyorsa
  "Hedef hesaplanamadı"

### Üst bölüm 1 — Makine Durumu (salt okunur)

`makineDurumu()`: açık iş emirlerinden türetiliyor. Her iş merkezi için bir
kart, içinde o makinede bekleyen işler:

```
CNC Machining Workplace
  400544   CNC Machining      [1200 kalan]
  226181   CNC OPERASYON 1    [450 kalan]
```

Kalan miktar = iş emri hedefi − üretilen. `remaining <= 0` olanlar gösterilmez.

### Üst bölüm 2 — Veri Kontrolü Uyarıları

`computeDataWarnings()` üç tür tutarsızlık üretiyor:

| Tür | Koşul | Eylem düğmesi |
|---|---|---|
| `duplicate` | Aynı (ürün, iş merkezi, operasyon) için >1 kapasite kaydı | Ürüne Git |
| `orphan` | Kapasite var ama o iş merkezi/operasyonu kullanan rota adımı yok | **Kaydı Sil** + Ürüne Git |
| `missing` | Rota adımı var ama kapasitesi tanımlanmamış | Ürüne Git |

Rozet renkleri: duplicate → hata tonu, orphan → uyarı tonu, missing → nötr.
En fazla 30 uyarı göster.

**Not:** `operation_id` eklendikten sonra `duplicate` uyarısı gerçek
çakışmaları yakalar — şu anki 28 kayıt artık çakışma sayılmayacak.

### Sağ panel — üç KPI kartı

```
Ürün Günlük Hedef Kapasitesi    Darboğaz İstasyonu       Tanımsız Adım
        204                      CNC Machining Wp.             2
 adet/gün (darboğaz adımına)     Sıra 3 · CNC OPERASYON 1   hedef hesabına dahil değil
```

`productBottleneck(urun)` mantığı:

```js
// her sıra grubunda aktif (ya da ilk) iş merkezini al
// onun kapasitesini bul; yoksa missing listesine ekle
// tüm sıralar içinde EN DÜŞÜK kapasite = darboğaz
```

Ürünün günlük hedef kapasitesi darboğaz adımının kapasitesidir.

### Sağ panel — kapasite çizelgesi

Rotalar'daki zaman çizelgesinin aynısı, ama her iş merkezi satırında düzenleme
alanları var:

```
┌─ 3 ── CNC Machining  [Darboğaz]
│       ( ) CNC Machining Workplace  [204    ] adet/gün │ [2.5] dk/adet  [Aktif Hat]
│       (•) CNC Tezgah 2             [180    ] adet/gün                  [Alternatif]
```

**Radyo düğmesi — aktif hat seçimi.** `setActiveWorkCenter()`: aynı
`(ürün, sıra)` grubundaki tüm rota kayıtlarında `is_active` güncellenir, sadece
seçilen `true` olur. Bu Rotalar ekranında bilinçli olarak yapılmamıştı — asıl
yeri burası.

**Kapasite alanı (adet/gün).** Boş bırakılırsa kayıt silinir. `minutes`
doluysa **salt okunur** — çünkü hesaplanıyor (aşağıya bak).

**Dakika/adet alanı — sadece CNC adımlarında.** Görünürlük koşulu:

```js
const kokSira = Math.floor(sira);
const kokRoute = routes.find(r => r.urun===urun && r.sira===kokSira);
const kokCncMi = kokRoute && (/cnc/i.test(kokRoute.operasyon) || /cnc/i.test(kokRoute.isMerkezi));
const cncMi = /cnc/i.test(g.operasyon) || /cnc/i.test(g.isMerkezi) || (sira!==kokSira && kokCncMi);
```

Yani alt operasyonlar (1.1, 1.2) kök adım CNC ise onlar da CNC sayılır.

**Kapasitenin çalışma saatlerinden canlı hesabı** — `getCapacity()`:

```js
if (rec.minutes) {
  const net = csOzet().toplam;               // günlük net çalışma dakikası
  return { ...rec, capacity: Math.floor(net / rec.minutes) };
}
```

`csOzet()` = (sabah bitiş − sabah başlangıç − sabah molası) + (öğleden sonra
aynısı). Yani Çalışma Saatleri değişince kapasite otomatik güncellenir, elle
düzeltme gerekmez.

Yardım metni: `dk/adet (çalışma saatlerine göre otomatik hesaplanır — bugün
7s 30dk net)`. Çalışma saati tanımlı değilse: `(önce Çalışma Saatleri girilmeli)`.

**Alt bilgi notu:** "Kapasite değerini değiştirdiğinizde bu ürünün hedef
kapasitesi, darboğaz istasyonu ve Genel Bakış panosundaki ilgili göstergeler
otomatik olarak yeniden hesaplanır."

---

## v2 uyarlamaları

- Veri `api.listAll()` ile; `routes`, `capacities`, `work_orders`, `production`,
  `working_hours` gerekiyor
- Yazma Repository/API üzerinden, optimistic locking mevcut desene uygun
- Tüm metinler `() => t(...)`, yeni anahtarlar `docs/ceviri-sozlugu.md`'ye
- `focusId` desteği (`#capacities?id=`)
- Görsel dil Rotalar ekranındaki gibi: v2 token'ları, kare işaretçi
- KPI kartları için `app.css`'te mevcut bir desen varsa onu kullan

---

## Kapsam dışı

- Genel Bakış doluluk kartının düzeltilmesi — ayrı iş (formülü hatalı,
  şu an gizli)
- İş emri açma akışında kapasite kullanımı
- `csOzet()`'in vardiya bazlı bölünmesi

---

## Sıra

1. Şema doğrulaması: `DESCRIBE capacities;` — `minutes` sütunu
   `dakikaPerAdet`'i karşılıyor mu, `operation_id` gerçekten yok mu → raporla
2. Migration `032`
3. ETL'de `operasyon` → `operation_id` eşlemesi
4. Ekran
5. `php -l` + `node --check` + sözlük
