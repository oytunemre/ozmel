# Claude Code brief — Stok Durumu (yeni ekran)

Tasarım kaynağı: `tasarim/Stok-Durumu-v2.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewStok()`

Bu ekran v2'de **hiç yok**. Sıfırdan yazılacak.

---

## ÖNCE: veri durumu — bunu bilerek başla

Yedekteki `kodTanimlari` (57 kayıt) incelendi:

| Alan | Durum |
|---|---|
| `tip` | 57/57 dolu — değerler: `Hammadde`, `Yarı Mamül`, `Ürün` |
| `hammaddeAgirlik` | **14/57 dolu** — kg/adet çevrimi için gerekli |
| `hammaddeUzunluk` | 14/57 dolu |
| `minStokSeviyesi` | **0/57 — hiç doldurulmamış** |
| `tedarikSuresi` | 0/57 |

Yani:

- Hammadde listesi `tip = 'Hammadde'` ile süzülecek
- **Ağırlığı olmayan hammaddede kg↔adet çevrimi yapılamaz** — o satırda adet
  eşdeğeri `—` gösterilecek, hata verilmeyecek
- **Min stok seviyesi hiç girilmemiş**, dolayısıyla "Düşük Stok" uyarısı
  başlangıçta hiç çıkmayacak. Bu beklenen; Melih değerleri Kod Tanımları'ndan
  girecek. Alan yoksa uyarı bölümü sessizce atlanır.

### Şema doğrulaması (ilk adım, raporla)

```sql
DESCRIBE product_codes;
```

Şu sütunlar var mı: `type`, `raw_material_weight`, `raw_material_length`,
`min_stock_level`, `lead_time`, `outgoing_operation`, `main_product`,
`outer_diameter`, `inner_diameter`, `box_quantity`, `suppliers`, `customer`,
`drawing_no`, `revision`, `revision_date`, `category`

Eksik olanlar varsa migration `036_product_code_stock_fields.sql` gerekir.
**Hangileri eksik, bana raporla** — migration'ı ondan sonra yaz.

---

## Ekran — iki bölüm

### Bölüm 1: Hammadde Stok Durumu

Alt başlık: "Bir siparişe bağlı olsun olmasın tüm onaylı (giriş kalite kontrolü
Uygun) malzeme — tüketildikçe otomatik düşer"

Sütunlar:

```
ÜRÜN · MALZEME KODU · ONAYLI GELEN · TÜKETİLEN (KESİM) · NET STOK (KG) · DURUM · BAĞLI SİPARİŞ(LER)
```

**Hücre içerikleri iki satırlı:**
- ONAYLI GELEN: `4.800 kg` / `2.000 adet eşd.`
- TÜKETİLEN: `3.720 kg` / `1.550 adet`
- NET STOK: `1.080 kg` / `450 adet eşd.`

Adet eşdeğeri = `kg / hammaddeAgirlik`. Ağırlık yoksa `—`.

**Net stok rengi:** negatifse `--color-danger`, değilse `--color-success`.

**DURUM sütunu** yalnızca sorun varsa dolu:
- `netKg < 0` → `Eksi Stok`, danger rozeti
- `netKg < minStokSeviyesi` → `Düşük Stok`, warning rozeti
- İkisi de değilse hücre boş
- Rozetin `title` özniteliği: `Min. stok seviyesi: N kg`

**BAĞLI SİPARİŞ(LER):** ilgili sipariş numaraları virgülle; yoksa `Genel stok`.

### Bölüm 2: Sipariş Bazında Üretim Akışı (WIP)

Solda sipariş listesi (seçili olan `--color-accent-100` zemin + sol aksan
çubuğu), sağda seçili siparişin aşama zinciri.

Sipariş satırı: `SIP-2026-041` + altında `FLN-DN80-A · 1.200 adet`

**Aşama zinciri** — her aşama bir kart, numaralı işaretçi + dikey çizgi:

```
(1) Kesim                    hammadde: üstteki tabloya bakın
    BU AŞAMADA ÜRETİLEN   1.180
    SONRAKİNE AKTARILAN   1.090
    ARA STOK (WIP)           90
```

- Aşamalar ürünün **rota sırasına** göre (`routes.sequence`)
- `üretilen` = o aşamada (o operasyonda) üretilen toplam
- `aktarılan` = **bir sonraki aşamada üretilen** miktar
- `ara stok` = üretilen − aktarılan
- Son aşamada: `aktarılan` etiketi `TÜKETİM (YOK — SON AŞAMA)`, `ara stok`
  etiketi `BİTMİŞ ÜRÜN STOĞU`
- Ara stok > 0 ise numara işaretçisi dolu aksan, değilse beyaz + çerçeve
- Ara stok negatifse `--color-danger`

İlk aşamanın notu: `hammadde: üstteki tabloya bakın`

---

## Veri kaynağı

Mevcut `listAll()` deseniyle. Yeni BE ucu açma.

### Onaylı gelen

`purchase_receipts` kayıtları, ama **yalnızca giriş kalite kontrolü geçmiş
olanlar**:

```
purchase_receipts
  → incoming_inspections (purchase_receipt_id eşleşmesi)
  → genelSonuc / result = 'Uygun'
```

Kontrolü olmayan giriş **sayılmaz** — tasarım açıkça "onaylı" diyor.
`Şartlı Kabul` durumunun sayılıp sayılmayacağı belirsiz; **şimdilik sayma**,
sadece `Uygun`. Bunu rapor et, Melih'e sorulacak.

Miktar `purchase_receipts.quantity`, birim hammaddenin kendi birimi (`kg`).

### Tüketilen (kesim)

`production` kayıtlarından, **kesim operasyonundaki** üretimler. Kesim
operasyonunun hangisi olduğu `product_codes.cikanOperasyon` alanından
gelebilir; yoksa operasyon adında `kesim` / `cutting` geçenler.

Tüketilen kg = üretilen adet × `hammaddeAgirlik`.

**Hangi hammaddeden tüketildiği** ürün ağacından (`product_trees`) ya da
`anaUrun` alanından çözülmeli. Bu ilişki karmaşık — çözülemiyorsa satırda
tüketilen `—` göster, hata verme ve bunu bana raporla.

### Bağlı siparişler

`purchase_requests.order_id` → `orders.order_no`. Bir hammadde birden çok
isteğe bağlı olabilir, hepsi listelenir.

### WIP aşamaları

Sipariş → ürün → `routes` (sequence sırasına göre) → her adım için o
operasyondaki `production` toplamı.

Eşleştirme: `production.work_order_id` → `work_orders` → aynı siparişe bağlı
olanlar; sonra `work_orders.operation_id` ile rota adımı eşleşir.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `stok.*` anahtarları
  `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten (`fmtTr`)
- Sol menüye **Stok Durumu**, "Satınalma & Stok" grubuna
- Sipariş numarası tıklanınca `#orders?id=` — mevcut `focusId`
- Hammadde kodu tıklanınca `#product-codes?id=`
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. `DESCRIBE product_codes` → eksik sütunları raporla, bekle
2. Gerekiyorsa migration `036`
3. Ekran
4. `php -l` + `node --check` + sözlük
5. Ayrı commit, push (repo: `~/Projects/Ozmel/ozmel`, dal `krc-port`)

---

## Kapsam dışı

- `minStokSeviyesi` girişinin Kod Tanımları ekranına eklenmesi — sütun varsa
  zaten formda görünür; yoksa migration sonrası ayrı iş
- Stok hareketi geçmişi / hareket dökümü
- Tedarik süresine göre sipariş önerisi
- "Hammadde Bekleniyor" sipariş durumunun bu veriden otomatik türetilmesi —
  ayrı iş, önce bu ekran doğru çalışsın

---

## Beklenen ilk görünüm

Veri gerçekliği düşük olduğu için ekran başlangıçta seyrek olacak:

- 57 üründen `tip = Hammadde` olanlar listelenecek
- 14'ünde ağırlık var, gerisinde adet eşdeğeri `—`
- Min stok hiç girilmediği için `DURUM` sütunu boş
- WIP bölümü 25 sipariş için çalışacak, rota tanımlı olanlarda dolu

Bu beklenen. Ekranın işi veriyi göstermek, veriyi üretmek değil.
