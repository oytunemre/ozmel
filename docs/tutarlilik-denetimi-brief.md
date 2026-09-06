# Claude Code brief — v78 ↔ v2 tutarlılık denetimi

Referans: `docs/referans/v78.html`
Kaynak veri: `data/qfw_konsol_yedek_2026-09-04.json` (2456 kayıt)

**Bu bir denetim görevidir — kod değiştirme, rapor üret.**

Bugüne kadar ekranlar tek tek v78'e hizalandı ama bütünsel bir karşılaştırma
yapılmadı. Amaç: eksik kalan alan, hesap ya da davranış var mı görmek.

---

## Kapsam

v78'deki **her modül** için v2'deki karşılığını bul ve karşılaştır. Modül
eşlemesi:

| v78 | v2 |
|---|---|
| dashboard | dashboard |
| sites | tedarikciSite |
| parts | **yok** (kapsam dışı, veride 0 kayıt) |
| gorevler | tasks |
| kalite | kaliteKontrol |
| gunluk | gunlukKalite |
| satisSiparisleri | satisSiparisleri |
| satisRaporlari | salesReports |
| routes | routes |
| ismerkezleri | workCenters |
| capacity | capacities |
| uretimplani | machinePlans |
| orders | orders |
| workorders | workOrders |
| uretimgirisi | production |
| produktivite | verimlilik |
| uretimraporu | uretimRaporu |
| operatorler | operators |
| uretimpanosu | uretimPanosu |
| calismasaatleri | workingHours |
| urunagaclari | productTrees |
| kodtanimlari | productCodes |
| cevirisozlugu | terms |
| satinalma | purchaseRequests |
| satinalmaGirisleri | purchaseReceipts |
| stok | stok |

---

## Her modül için üç şeyi karşılaştır

### 1. Alanlar

v78'in o modülde **gösterdiği veya düzenlediği** her alan v2'de var mı?

- v78'de var, v2'de yok → **eksik alan**
- Veride var (`kodTanimlari`'nın 22 alanı gibi), v78 gösteriyor, v2 göstermiyor
  → **eksik gösterim**
- v2'de var, v78'de yok → not düş (sonradan eklenmiş olabilir, sorun değil)

### 2. Hesaplar

v78'deki türetilmiş değerler v2'de var mı? Örnekler:

- `productBottleneck()`, `computeDataWarnings()`, `makineDurumu()` — Kapasiteler
- `workOrderStats()` (ETA, yetişirlik) — İş Emirleri
- `orderQualityStats()` — Kalite Kontrol
- `csOzet()` — Çalışma Saatleri / kapasite
- `varsayilanVardiya()` — Üretim Girişi
- Stok: onaylı gelen, tüketilen, net stok
- Duruş süresi hesabı (mola düşümü)

Her biri için: **v2'de var mı, hangi dosyada, aynı sonucu mu veriyor?**

### 3. Davranışlar

Alan ya da hesap değil, iş akışı farkları:

- **Üretim Girişi**: v78 sadece o güne makine planında atanmış iş emirlerini
  gösteriyor, plan yoksa "önce plan yapın" diyor. v2 böyle mi?
- **Rotalar**: alternatif hat / aktif hat ayrımı
- **Kod Tanımları**: v78'de tip'e göre farklı alanlar mı görünüyor?
- **Ürün Ağaçları**: v78'de miktar çarpanı, hammadde bağı var mı?
- **Satış Raporları**: v78 hangi kırılımları gösteriyor?

---

## Ayrıca: veri ↔ ekran uyumu

Kaynak veride **dolu olan ama hiçbir v2 ekranında görünmeyen** alanları bul.

Yöntem: her koleksiyon için alanları çıkar, kaç kayıtta dolu olduğunu say,
sonra o alanın v2'de bir yerde gösterilip gösterilmediğini kontrol et.

Bilinen örnekler (bunları doğrula, başkaları da olabilir):
- `production.fireAdet` — 9/205 dolu, gösteriliyor mu?
- `kodTanimlari` 22 alan — kaçı ekranda?
- `workorders.splitEtiket` — bölünmüş iş emri etiketi
- `gorevler.notlar`, `gorevler.departman`

**Veride dolu ama ekranda yok** = kullanıcının girdiği bilgi kayboluyor demek.
Bunlar en değerli bulgular.

---

## Rapor biçimi

Üç bölüm halinde, `docs/tutarlilik-raporu.md` dosyasına yaz:

### Bölüm A — Eksik alanlar

| Modül | Alan | v78'de | v2'de | Veride dolu mu | Önem |
|---|---|---|---|---|---|

Önem: **yüksek** (veride dolu ve iş için gerekli) / **orta** / **düşük**
(veride boş, ileride lazım olabilir)

### Bölüm B — Eksik hesaplar

| Hesap | v78'de nerede | v2'de var mı | Not |
|---|---|---|---|

### Bölüm C — Davranış farkları

Serbest metin, her fark için: ne farklı, neden önemli, düzeltmek ne gerektirir.

---

## Kurallar

- **Kod değiştirme.** Sadece oku ve raporla.
- Kapsam dışı bırakılanları (parts, milestones, dimwork, qfw) belirt ama
  eksik sayma.
- Emin olmadığın yerde "doğrulanmalı" yaz, tahmin etme.
- Rapor uzun olacak; özet tablo + ayrıntı şeklinde kur.
- Bitince `docs/tutarlilik-raporu.md`'yi commit et.

Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.
