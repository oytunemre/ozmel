# v78 ↔ v2 Tutarlılık Denetimi Raporu

**Tarih:** 2026-09-06
**Referans:** `docs/referans/v78.html` (eski monolitik uygulama)
**Kaynak veri:** `data/qfw_konsol_yedek_2026-09-04.json` (2456 kayıt, 32 koleksiyon)
**Yöntem:** v78'in her modül `view*`/hesap fonksiyonu, karşılık gelen v2 modülü ve verideki alan doluluk oranı karşılaştırıldı. Kod değiştirilmedi.

> **Nasıl okunmalı:** Önce "Yönetici Özeti"ndeki öncelik sıralamasına bak. Ayrıntılar Bölüm A (alanlar), B (hesaplar), C (davranışlar), D (veride dolu ama ekranda yok) altında. Emin olunamayan yerler **DOĞRULANMALI** ile işaretlendi; Bölüm E'de toplandı.

---

## Yönetici Özeti — öncelik sırasıyla

### 🔴 Yüksek — veri kaybı ya da yanlış hesap riski

1. **Üretim Girişi (production) bambaşka bir ekran.** v78: o güne makine planında atanmış, kalanı>0 iş emirlerini kart olarak listeler; plan yoksa "önce plan yapın" der; vardiya hedefini gösterir; aynı wo+tarih+vardiya varsa **üzerine yazar**. v2: tarih/plan filtresi yok, kullanıcı tüm iş emirleri arasından tek tek seçer, vardiya hedefi hesaplanmaz, **her kayıtta `api.create` → aynı vardiya için mükerrer kayıt riski** (production.js:129). *En büyük davranış gerilemesi.*
2. **İş Emirleri (workOrders) düz CRUD'a indirgenmiş.** v78'de 3 sekme (Sipariş-bazlı timeline / Planlı-Plansız liste / Duruş Kayıtları) + ETA/gecikme rozetleri + rota bakım aksiyonları (mükerrer birleştir, eksik adım ekle, makine kaldır, hedefi siparişe eşitle). v2: tek DataTable + üretim alt-listesi. Timeline, ETA rozetleri, duruş sekmesi, bakım araçları yok.
3. **Üretim Raporu'nda planlanan hedefin kaynağı değişti.** v78 `production.hedefAdet` topluyordu (205/205 dolu); v2 `machine_plans.targetQuantity` topluyor (uretimRaporu.js:67). Genel gerçekleşme % ve tüm kırılımlar v78'den **farklı çıkar**. Bilinçli tasarım mı, regresyon mu netleştirilmeli.
4. **Ürün Ağaçları'nda hammadde ihtiyacı hesap motoru tamamen yok** (`urunHammaddeIhtiyaciHesapla`, `bomYapraklariTopla`, `bomDugumHesapla`). "Verim" kolonu ve "Hammadde İhtiyacı Hesapla" paneli v2'de yok. Bu motor satınalma önerisini de besliyordu.
5. **Giriş Kalite — satınalma iş akışı bağı koptu.** v78: bekleyen satınalma girişlerini listeler, çoklu seçip tek kontrolle onaylar, gelen adedi toplar, FR-09 tablosundan numune sayısını türetir, BOM'dan karakteristik önerir, sonucu otomatik hesaplar. v2: jenerik form, tek receipt FK, elle numune, elle sonuç. Veride `satinalmaGirisIdleri` 11/12 dolu ama v2 kullanmıyor.
6. **Stok'ta birim dönüşümü yok.** v78 `birimDonusum` girişleri kg/tüp/adet'e göre çeviriyordu; v2 gelen miktarı **körlemesine kg** kabul ediyor (stok.js). Tüp/adet cinsi girişlerde net stok yanlış.
7. **Operatör Performans sekmesi tamamen kaldırılmış.** Veri altyapısı (`production.operatorId`) hazır ama agregasyon/ekran yok.

### 🟡 Orta

8. **Vardiya bazlı hedef bölme** (`vardiyaHedefiHesapla` + `csOzet` vardiya payı %) hiçbir v2 ekranında yok. Çalışma Saatleri önizlemesi ve Üretim Girişi hedefi bundan besleniyordu.
9. **Plan-bazlı ETA yok.** v78 `planBazliETA` haftalık makine planından bitiş günü tahmin ediyordu; v2 `eta.js` yalnız son-7 üretim hız ortalaması (+fallbackRate). Sipariş/Satış ETA sonuçları farklı çıkabilir.
10. **Satış Raporları amaç değiştirmiş.** v78 = sipariş-bazlı ETA/iş emri ilerleme accordion'u (operasyonel). v2 = aylık/ürün/müşteri üretim kırılımı (analitik). v78'in operasyonel raporu kısmen orders.js/satisSiparisleri.js'e taşınmış.
11. **Kod Tanımları tip-bazlı koşullu alan gösterimi eksik** (sadece Hammadde ölçüleri koşullu; Yarı Mamül/Ürün blokları her tipte görünür) + tip filtre butonları yok.
12. **Çeviri Sözlüğü otomatik terim tarama yok.** v78 rotalar/kapasitedeki tüm makine/operasyon adlarını tarayıp çevrilmemişleri de listeliyordu; v2 yalnız `terms` tablosunu gösterir.
13. **Giriş Kalite ölçüsel limit-eksik davranışı ters:** limit girilmemiş maddede v78 "Uygun Değil", v2 "Uygun" verir (52/124 maddede limit dolu, kalan 72'de fark).
14. **Görev Panosu "Departman Bazında" tablosu** eksik (departman 42/42 dolu); **Günlük Hatırlatma'da WhatsApp/Mail derin-linkleri** kaldırılmış (yalnız kopyala).

### 🟢 Düşük / bilinçli

- Dashboard'daki Tedarikçi/Parça KPI + Ülke paneli eksikliği bilinçli (sites/parts modülü kapsam dışı) ve dokümante.
- Üretim Panosu hedefsiz plan satırlarını da hesaba alıyor (v78 `hedefMiktar` ile eliyordu); pano kart yüzdesi 100 ile sınırlanmıyor.
- Çeşitli `not` alanları ekranlarda düzenlenmiyor (çoğu veride boş).

---

## Bölüm A — Eksik alanlar

| Modül | Alan | v78'de | v2'de | Veride dolu | Önem |
|---|---|---|---|---|---|
| İş Emirleri | Operatör / Duruş / Not (üretim alt-tablo) | Timeline'da 9 kolon | Expand'de 4 kolon (Tarih/Vardiya/Gerçek/Fire) | operator 197/201, durus 96/203, not 104/205 | yüksek |
| İş Emirleri | `splitLabel` (bölme etiketi /A /B) | woNo ile birleştirilir | Ana tabloda birleştirilmiyor | 2/2 | orta |
| İş Emirleri | `varyant` | Liste/timeline'da rozet | Tabloda/formda yok | 0/55 (bu veride boş) | orta |
| Üretim Girişi | `hedefAdet` (vardiya hedefi) | Kartta gösterilir + kayda yazılır | Yok, kayda yazılmıyor | 205/205 | yüksek |
| Üretim Girişi | Bugünkü Girişler'de Duruş/Hedef/Sapma | Timeline'da var | Yalnız Saat/İşEmri/Operatör/Adet/Fire | — | orta |
| Ürün Ağaçları | hammaddeUzunluk/Ağırlık, parcaBoyu, kesimKaybi, disCap/icCap | Ağaç kolonlarında | Yalnız drawer'da (ağaçta yok) | 32/90, 31/90, 6/90, 18/90 | yüksek |
| Ürün Ağaçları | **Verim** (parça adedi/ağırlığı, hesaplanan) | Ağaç kolonu | Yok | türetilir | yüksek |
| Ürün Ağaçları | revNo/revTarihi | Ağaç kolonu + form | Yalnız form | 58/90 | orta |
| Kod Tanımları | cizimNo, revizyon, kategori, minStok (tablo kolonu) | Tabloda | Yalnız expand/form | 33/57, 25/57, 14/57 | orta |
| Kod Tanımları | (22 form alanının tamamı v2 formunda MEVCUT) | — | — | — | — |
| Satınalma İstekleri | `malzeme` (serbest malzeme adı) | Zorunlu metin alanı | Yok (yalnız materialCodeId FK) | 29/29 | yüksek |
| Satınalma İstekleri | Gelen (kümülatif) + Durum kolonu | Tabloda | Yok | türetilir | yüksek |
| Satınalma İstekleri | Bağlı Sipariş (orderNo) kolonu | Tabloda | Yalnız formda | 24/29 | orta |
| Satınalma Girişleri | İsteğin toplamı (gelen/istenen), Kalan hint | Tablo + modal hint | Yok | türetilir | yüksek |
| Satınalma Girişleri | Kalite Kontrol durumu + "KK Yap" butonu | Tabloda | Yok | ilişkili | yüksek |
| Giriş Kalite | satinalmaGirisIdleri (çoklu giriş bağı) | Çoklu seçim + toplam uygula | Yok (tek receipt FK) | 11/12 | yüksek |
| Giriş Kalite | gozlemNedeni (sabit 2 seçenek) | Select | Serbest metin | 12/12 | düşük-orta |
| Giriş Kalite | ilaveBilgi | Form input | Yok | 1/12 | düşük |
| Saatlik Kontrol | makina, uretimAdedi | v78 kaydeder | gunlukKalite sekmesi payload'da GÖNDERMEZ | 1/24, 2/24 | orta |
| First Off (firstOffRecords.js) | not, oto genel karar | v78'de var | Bu jenerik ekranda yok (gunlukKalite'de var) | 16/90 | orta |
| Operatörler | Performans özeti (üretilen/fire/hedef/duruş) | Ayrı sekme | Yok | — | yüksek |
| Operatörler | `sicilNo`/`badgeNo` zorunluluğu | Opsiyonel | v2 required (veride 0/13) | 0/13 | orta |
| Görev Panosu | Departman Bazında tablosu | Panoda | Yok | 42/42 | orta |
| Üretim Siparişleri | Satış rozeti tooltip (müşteri/PO) | title ile | Yok | 25/25 | düşük |
| Tedarikçi Site | (tüm alanlar mevcut; trigoRE datalist → düz text) | datalist | text | 1/1 | düşük |
| Çalışma Saatleri | (8 alan mevcut; v2 ayrıca öğle arası/mola özeti ekler) | — | — | 1/1 | — |
| Rotalar | donusumKodu / donusumVaryantEslesme | DOĞRULANMALI | Yok | 1/1 | orta (DOĞRULANMALI) |

---

## Bölüm B — Eksik hesaplar

| Hesap | v78'de nerede | v2'de var mı | Not |
|---|---|---|---|
| `urunHammaddeIhtiyaciHesapla` (sipariş→hammadde parça/tüp/uzunluk/ağırlık) | viewUrunAgaclari | **YOK** | En kritik hesap kaybı; grep ile core+modules'te yok |
| `bomYapraklariTopla` (kök→yaprak kümülatif çarpan) | urunAgaclari | **YOK** | BOM ağaç çözümü yok |
| `bomDugumHesapla` (parçaAdedi=floor(boy/(parça+kayıp)), ağırlık, et kalınlığı) | urunAgaclari | **YOK** | Ağaç "Verim" kolonu kayıp |
| `planBazliETA` (haftalık plandan bitiş günü) | 4116 | **YOK** | v2 eta.js yalnız son-7 hız ortalaması (+fallbackRate); plan girdisi yok |
| `vardiyaHedefiHesapla` + vardiya payı % (`csOzet`) | 5971 / 5957 | **YOK** | Günlük hedefi vardiyaya orantılı bölme; production ve çalışma saatlerinde yok |
| `varsayilanVardiya()` (saate göre Sabah/ÖS/Mesai) | 5877 | **YOK** | v2 formda sabit 'Sabah' |
| `uretimGirisiKaydiBul` (aynı wo+tarih+vardiya upsert) | 5912 | **YOK** | v2 `api.create` → mükerrer kayıt riski |
| `workOrderStats.etaLabel` / gecikme rozeti (iş emri satırı) | 5034/5363 | **YOK** (workOrders tablosunda) | Üretilen/kalan/% var; ETA/gecikme yok |
| Operatör performans agregasyonu | viewOperatorPerformans | **YOK** | operatorId kaydediliyor, ekran yok |
| `satinalmaDurum` / `satinalmaDurumBadge` (Bekliyor/Kısmi/Tamamlandı) | 6182/6188 | **YOK** | Kısmi giriş takibi görsel kayıp |
| `satinalmaGelenToplam` (isteğin kümülatif girişi) | 6156 | **YOK** | İstek/giriş tablosunda gelen toplamı yok |
| `satinalmaIhtiyaciUygula` (BOM'dan otomatik satınalma önerisi) | 6833 | **YOK** | — |
| `birimDonusum` (kg/tüp/adet → kg) | 6990 (stok) | **YOK** | v2 gelen miktarı kg kabul eder |
| `girisKaliteDurumu` / bekleyen giriş bağı | 6173/3066 | **YOK** | — |
| FR-09 otomatik numune (`fr09OrnekAdedi`) | 2834 | **YOK** | v2 elle girilir |
| Giriş kalite genel sonuç oto (herhangi red→Red) | kaydetGirisKalite 3163 | **YOK** | v2 elle select |
| Ölçüsel limit-eksik sonucu | olcumSonuc 2209 | **FARKLI** | v78 limit yoksa "Uygun Değil"; v2 "Uygun" |
| `ensureKodTanimlariSeed` (BOM/rota'dan otomatik kod kartı) | 6462 | **YOK** (DOĞRULANMALI: BE'de olabilir) | v2 API'ye güvenir |
| `tumTerimleriBul` (rota/kapasiteden terim tarama) | 6535 | **YOK** | Çevrilmemiş terimler v2'de görünmez |
| Günlük Özet'te giriş kalite bloğu | viewGunlukOzet 2800 | **YOK** | Yalnız First Off + Saatlik var |
| Görev Panosu departman kırılımı | viewGorevPano | **YOK** | — |
| — | — | — | — |
| **Aynı sonucu veren (kanıtlanmış) hesaplar:** productBottleneck, computeDataWarnings, makineDurumu, Pareto duruş analizi, 5 otomatik uyarı kuralı, fire oranı, duruş süresi (mola düşümü, capacity.js:downtimeMinutes), haftalık özetler, kapasiteye orantılı split (shareFor), alt-op ondalık sıra, CNC grup başlığı, orderQualityStats, görev kalanGün/sıralama, çalışma saatleri net süre, dönem şeridi (report.js) | çeşitli | **VAR, AYNI** | Bu alanlarda gerileme yok |

---

## Bölüm C — Davranış farkları (modül bazında)

### Üretim Girişi (production) — 🔴
v78 tarih seçilir, o güne makine planında atanmış ve kalanı>0 iş emirleri kart olarak listelenir; plan yoksa "Bu tarih için planlanmış iş yok — önce plan yapın" boş durumu gösterilir; her kartta vardiya hedefi (`vardiyaHedefiHesapla`) ve saate göre varsayılan vardiya görünür; aynı wo+tarih+vardiya kaydı varsa üzerine yazılır. v2 tamamen farklı: tarih/plan filtresi yok, kullanıcı FkSelect'ten tüm iş emirleri arasından seçer, vardiya varsayılanı sabit 'Sabah', hedef gösterilmez, her `save` yeni kayıt oluşturur (`api.create`, satır 129 — **mükerrer kayıt riski**). "Plana bağlı iş listesi", "önce plan yap uyarısı", "vardiya hedefi" davranışlarının hiçbiri yok.

### İş Emirleri (workOrders) — 🔴
v78 3 sekmeli: (1) Sipariş-bazlı adım timeline (part-picker + 9 kolonlu ilerleme), (2) Liste (makinePlani'ne göre Planlı/Plansız iki tablo), (3) Duruş Kayıtları (süre + neden + eksik neden uyarısı). Ayrıca satır aksiyonları: eksik adım ekle, mükerrer birleştir, makine kaldır, hedefi siparişe eşitle, ek makine ekle. v2 yalnız düz DataTable + üretim alt-listesi. Timeline, planlı/plansız ayrımı, duruş sekmesi, ETA/gecikme rozetleri ve rota bakım araçlarının tamamı eksik. En çok gerileyen modül.

### Üretim Raporu (uretimRaporu) — 🔴
Planlanan hedef kaynağı v78'de `production.hedefAdet`, v2'de `machine_plans.targetQuantity`. Makine/ürün/gün kırılım toplamları ve genel gerçekleşme % v78'den farklı çıkar. Duruş nedeni v78'de string, v2'de `downtime_reasons` lookup (eski string→id migrasyonu DOĞRULANMALI). Pareto, 5 uyarı kuralı, fire oranı, günlük trend hesapları AYNI. Export butonu v2'de "yakında" (işlevsiz).

### Ürün Ağaçları (productTrees) — 🔴
Ağaç/derinlik gösterimi iyi (chevron, rekürsif, arama ile açılma). Ancak v78 ağaç tablosunda 9 kolon (ölçüler + hesaplanan Verim) vardı; v2 ağacında yalnız 4 kolon (Düğüm/Miktar/Birim/Tip), ölçüler yalnız drawer'da. "Hammadde İhtiyacı Hesapla" paneli ve tüm BOM hesap motoru yok. v2 `materialCodeId/materialDescription` alanları eklemiş (v78'de yok) — verideki `hammaddeUzunluk` düğüm alanlarıyla eşleşmesi DOĞRULANMALI.

### Kalite Kontrol (kaliteKontrol) — 🟡
v2 APPEND-ONLY (her giriş yeni satır, en yüksek id gösterilir); v78 üzerine yazıyordu. Sonuç yönü aynı. Tek anlamlı fark: ölçüsel maddede limit girilmemişse v78 "Uygun Değil", v2 "Uygun" verir. "En son ölçüm" seçimi v78'de tarih, v2'de id bazlı (nadir eşit-tarih durumunda ayrışabilir).

### Günlük Kalite (gunlukKalite) — 🟡
Dört sekme (Özet/First Off/Saatlik/Giriş) korunmuş; Giriş sekmesi `incomingInspections` gömülerek karşılanıyor. Eksikler: (a) Günlük Özet'te giriş kalite bloğu yok; (b) Saatlik sekmesinde 4 ürüne özel "Görsel Form" (çizim üzerinde renkli noktalar) yok; (c) Saatlik kayıtta makina + uretimAdedi payload'da gönderilmiyor. First Off ana ekranı (gunlukKalite sekmesi) v78'e sadık; ayrı firstOffRecords.js jenerik ekranı ayrışıyor (6-numune ızgarası yok, oto karar yok).

### Giriş Kalite (incomingInspections) — 🔴
v78 satınalma iş akışına bağlıydı: bekleyen girişleri listeler, çoklu seçip tek kontrolle onaylar, gelen adedi toplar, FR-09'dan numune türetir, BOM'dan karakteristik önerir, tolerans metnini ayrıştırır, sonucu oto hesaplar. v2 bunların hepsini kaldırıp jenerik form yapmış. En büyük tutarlılık kaybı. Veride `satinalmaGirisIdleri` 11/12 dolu ama v2 `purchaseReceiptId` bekliyor → mevcut bağlar ekranda görünmez (BE eşleştirmesi DOĞRULANMALI).

### Satınalma (purchaseRequests/purchaseReceipts) — 🔴
"İhtiyaç göster/uygula" (BOM'dan otomatik öneri) yok. Durum (Bekliyor/Kısmi/Tamamlandı) ve Gelen kümülatif kolonları hiçbir ekranda yok → kısmi giriş takibi görsel olarak kayıp. Giriş modalinde İstenen/Gelen/Kalan hint'i yok. Girişten doğrudan kalite kontrol başlatma yok. Satınalma serbest `malzeme` adı alanı yok (yalnız FK kod).

### Stok (stok) — 🔴
İki bölüm (hammadde + WIP) ve kolonlar v78 ile eşdeğer. Onaylı gelen/tüketilen/net stok, asamaUretilen, çok-üründe hammadde kümülatif çarpanı AYNI. Tek kritik fark: `birimDonusum` yok — gelen miktar körlemesine kg sayılıyor; tüp/adet cinsi girişlerde net stok yanlış.

### Operatörler (operators) — 🟡
Liste var; **Performans sekmesi tamamen yok** (üretim kayıtlarından operatör bazlı üretilen/fire/hedef/duruş agregasyonu). Veri altyapısı hazır. `badgeNo` v2'de required, veride 0/13 dolu → mevcut kayıtlarda sorun olabilir (BE zorunluluğu DOĞRULANMALI).

### Görev Takibi (tasks) — 🟡
Beş sekme ve tüm alanlar tam. Eksikler: Pano'da "Departman Bazında" tablosu yok; Günlük Hatırlatma'da WhatsApp/Mail derin-linkleri kaldırılmış (yalnız kopyala).

### Satış Raporları (salesReports) — 🟡
v78 = sipariş-bazlı ETA/kalan/iş emri ilerleme accordion'u (operasyonel). v2 = aylık/ürün/müşteri üretim kırılımı (analitik, BE `/sales-reports`). Amaç değişmiş. v78'in operasyonel raporu kısmen orders.js/satisSiparisleri.js'e taşınmış (oralarda summary + eta.js var). Sevkiyat verisi olmadığından v2 "üretilen"i gösteriyor.

### Rotalar (routes) — 🟢
Aktif/Alternatif ayrımı v78 ile birebir. v2 ayrıca "hiç aktif hat yok" uyarısı + Kapasiteler bağlantısı ekler (üstün). `donusumKodu/donusumVaryantEslesme` (veride 1/1) v2'de yok (DOĞRULANMALI).

### Dashboard, İş Merkezleri, Operasyonlar, Çeviri Sözlüğü, Kapasiteler, Üretim Planı, Verimlilik, Üretim Panosu, Üretim/Satış Siparişleri, Tedarikçi Site, Çalışma Saatleri
Bu modüllerde ya tam eşleşme ya bilinçli genişletme var; ayrıntılar Bölüm A/B ve Yönetici Özeti'nde. Öne çıkanlar: Kapasiteler'de getCapacity/csOzet mantığı üç yerde tekrar ediyor (şu an eşdeğer, ileride sapma riski); Üretim Planı'nda `not` UI'da düzenlenmiyor (veride boş); Verimlilik'te satır tıklama v78'de salt-görüntü modal açıyordu, v2 iş emri ekranına yönlendiriyor (Vardiya/Fire detay tablosu kayıp); Çalışma Saatleri v2 öğle arası/mola özeti ekler (üstün) ama vardiya payı % kaybolmuş.

---

## Bölüm D — Veride dolu ama hiçbir v2 ekranında görünmeyen alanlar

*Brief'in en değerli çıktısı: kullanıcının girdiği ama v2'de kaybolan bilgi.*

| Koleksiyon.Alan | Doluluk | Durum | Önem |
|---|---|---|---|
| `production.hedefAdet` | 205/205 | Vardiya hedefi hiç hesaplanmıyor/gösterilmiyor | yüksek |
| `production.not` | 104/205 | İş Emirleri alt-tablosu ve Üretim Girişi listesinde gösterilmiyor | yüksek |
| `production.durusBaslangic/Bitis/Neden` | 96/203, 96/127 | Girilebiliyor ama İş Emirleri/Üretim Girişi listelerinde SÜRE olarak gösterilmiyor; ayrı Duruş Kayıtları ekranı yok | yüksek |
| `urunAgaclari.hammaddeUzunluk/Ağırlık/parcaBoyu` | 32/90, 32/90, 31/90 | Ağaçta gösterilmiyor (yalnız drawer); Verim hiç hesaplanmıyor | yüksek |
| `satinalmaIstekleri.malzeme` | 29/29 | Serbest malzeme adı v2'de hiç girilemez/görünmez | yüksek |
| `girisKaliteKontrolleri.satinalmaGirisIdleri` | 11/12 | Satınalma girişi bağı v2'de görünmez | yüksek |
| `saatlikKayitlari.makina` | 1/24 | gunlukKalite sekmesinden kaydedilmiyor | orta |
| `saatlikKayitlari.uretimAdedi` | 2/24 | gunlukKalite sekmesinden kaydedilmiyor | orta |
| `workorders.splitLabel` | 2/2 | İş Emirleri ana tablosunda woNo ile birleştirilmiyor | orta |
| `kodTanimlari.cizimNo/anaUrun/revizyon/kategori` | 33/57, 26/57, 25/57, 14/57 | Tablo kolonunda değil, yalnız expand/form'da (ilk bakışta görünmez) | orta |
| `firstOffKayitlari.not` | 16/90 | firstOffRecords.js jenerik ekranında yok (gunlukKalite'de var) | orta |
| `routes.donusumKodu/donusumVaryantEslesme` | 1/1 | v2'de hiç yok | orta (DOĞRULANMALI) |
| `production.fireAdet` | 9/205 | v2'de gösteriliyor (sorun yok) | — |

---

## Bölüm E — Kapsam dışı ve DOĞRULANMALI

### Kapsam dışı (eksik SAYILMAZ)
- `parts` (0 kayıt), `milestones` (0), `dimwork` (47, boyutsal iş — v2'de yok), `qfw` (0), v78 `viewParts`/`viewQfw`/`viewDimwork` — brief gereği kapsam dışı.
- Dashboard'daki Tedarikçi/Parça KPI + Ülke paneli: sites/parts modülü kapsam dışı olduğu için bilinçli çıkarılmış, dokümante.

### DOĞRULANMALI (kod okumasıyla kesinleştirilemeyen; çoğu BE'ye taşınmış olabilir)
1. **Üretim Raporu duruş nedeni** — eski string nedenlerin `downtime_reason_id`'ye migrate edildiği (ETL ad üzerinden çözüyor; 96/127 dolu).
2. **eta.js plan girdisi** — plan-bazlı ETA gerçekten yok (kod teyitli), ama iş kararı olarak kabul mü edildi netleşmeli.
3. **productTrees `materialCodeId`** model değişikliğinin verideki `hammaddeUzunluk` düğüm alanlarıyla eşleşmesi.
4. **`ensureKodTanimlariSeed` / `tumTerimleriBul`** otomatik türetme mantıklarının BE'ye taşınıp taşınmadığı.
5. **incomingInspections** BE'sinin `satinalmaGirisIdleri`/`satinalmaGirisId`'yi `purchaseReceiptId`'ye eşleyip eşlemediği.
6. **operators `badgeNo`** zorunluluğunun BE'de mi yalnız FE'de mi olduğu (veride 0/13).
7. **routes `donusumKodu/donusumVaryantEslesme`** alanlarının v78'deki tam işlevi.
8. **Satış Raporları operasyonel görünümü** — orders.js/satisSiparisleri.js sipariş detay/ETA'yı yeterince karşılıyor mu.

---

*Rapor sonu. Bulgular 6 paralel modül-grubu incelemesinin sentezidir; yüksek etkili maddeler (üretim raporu hedef kaynağı, eta.js, production upsert eksikliği, stok birim dönüşümü) doğrudan kod okumasıyla teyit edilmiştir.*
