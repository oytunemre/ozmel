# CLAUDE.md — Ozmel projesinde çalışırken

Bu dosya, projede kod yazan AI asistanları içindir. Claude Code depoyu açtığında
otomatik okur.

---

## Sistem ne yapıyor

Özmel Dış Ticaret, Mosdorfer CCL için alüminyum ve bakır parça üretiyor.
Bu uygulama üretim planlamasını, kalite kontrolünü ve tedarikçi takibini
yönetiyor.

Kullanıcılar: üretim planlamacısı (Melih), operatörler, kalite sorumlusu.
Toplam 5-10 kişi. Yoğun eşzamanlı kullanım yok.

### İş akışı — bu zinciri anlamadan modül yazma

```
Ürün Kodu tanımlanır
    ↓
Rota çizilir           (ürün → operasyon → iş merkezi → sıra)
    ↓
Kapasite girilir       (ürün + iş merkezi + operasyon başına adet/gün)
    ↓
Sipariş açılır         (müşteri siparişi ya da stok için)
    ↓
İş Emri açılır         (rotadaki her adım için bir kayıt, "İş Emri Aç" ile)
    ↓
Makine Planı yapılır   (hangi gün hangi makine hangi işi yapacak)
    ↓
Üretim Girişi          (vardiya sonunda gerçekleşen miktar + duruş)
    ↓
Raporlar               (Verimlilik, Üretim Raporu, Üretim Panosu, Stok)
```

Kalite tarafı paralel yürür: giriş kalite (tedarikçiden gelen malzeme),
first-off (ilk parça), saatlik kontrol, sipariş bazlı kontrol planı.

### Ana tablo ilişkileri

```
product_codes ──< routes >── operations
                    │
                    └──< capacities

orders ──< work_orders ──< production ──> downtime_reasons
                │              │
                │              └──> operators
                └──> operations, work_centers

machine_plans ──> work_orders, work_centers, product_codes
```

`legacy_id` her tabloda var — v1'den gelen eski string id. ETL bunu FK
çözümlemesi için kullanır.

---

## Mimari kuralları

**SQL yalnızca Repository'de.** Controller'da, DTO'da, hiçbir yerde ham SQL
olmaz. Tablo adı yalnızca `Repository::table()` içinde geçer.

**Her sorgu tenant kapsamlı.** `BaseRepository` bunu garanti eder, elle
`tenant_id` yazma.

**Optimistic locking.** Güncellemede istemci `updatedAt` gönderir; değişmişse
409 STALE döner. Bunu atlama.

**Enum'lar veritabanında Türkçe.** `Sabah`, `Üretimde`, `Uygun Değil` gibi.
Gösterimde `t()` ile çevrilir. İngilizceye çevirip saklama.

**Yazma işlemleri POST + `?op=`.** mod_security PUT/DELETE'i kesiyor:
```
POST api/index.php/work-centers/12?op=guncelle
POST api/index.php/work-centers/12?op=sil
```

**Migration'lar idempotent.** `information_schema` kontrolü +
`PREPARE`/`DO 0` deseni. Sonunda `INSERT IGNORE INTO schema_migrations`.

**Açılışta veri düzeltme kodu yok.** Düzeltme gerekiyorsa migration yazılır.

---

## Frontend

Saf ES modülleri, derleme yok. `public/js/core/` ortak altyapı,
`public/js/modules/` ekranlar.

**Mevcut `core/` fonksiyonlarını yeniden yazma:**

| İhtiyaç | Kullan |
|---|---|
| Tahmini bitiş, gecikme | `core/eta.js` |
| Kapasite, duruş süresi (mola düşülmüş) | `core/capacity.js` |
| Darboğaz, kapasite veri uyarıları | `core/bottleneck.js` |
| Dönem şeridi, eşik renkleri, KPI | `core/report.js` |
| tr-TR sayı/süre/tarih | `core/format.js` |
| Telefon biçimi | `core/phone.js` |
| Veri çekme + önbellek | `core/api.js`, `core/store.js` |

**Tüm metinler `t()` içinde.** Yeni anahtarlar hem TR hem EN'e eklenir ve
`docs/ceviri-sozlugu.md`'ye belgelenir. Anahtar sayıları eşit olmalı.

**`text-transform: uppercase` yalnızca sabit başlıklarda.** Veri metnine
uygulanmaz — `lang="tr"` olsa bile İngilizce veriyi bozma riski var.

---

## Sık yapılan hatalar — hepsi bu projede yaşandı

**1. `node --check` çalışma zamanı hatalarını yakalamaz.**

`const LIST_FILTERS` bildirimi, onu kullanan koddan sonra tanımlanmıştı.
Sözdizimi geçerliydi, CI geçti, ekran açılmadı (temporal dead zone).

Modül seviyesi `const`/`let` bildirimlerini kullanımdan **önce** koy.
Fonksiyon bildirimleri hoist edilir, `const` edilmez.

**2. ETL'de yanlış alan eşlemesi sessiz veri kaybettirir.**

Dört kez yaşandı:
- Kapasitede `operation_id` yoktu → 28 kayıt "mükerrer" sanılıp atlandı
- Rotada `sequence` tamsayıya yuvarlanıyordu → 25 alt operasyon eziliyordu
- `minutes` alanı `dakika` diye aranıyordu, kaynakta `dakikaPerAdet` → hiç
  aktarılmadı
- Satınalmada `malzeme` (serbest metin) kod sanıldı, gerçek kod `urun`
  alanındaydı → 36 kayıt FK'siz kaldı

Yeni bir koleksiyon eklerken kaynak veriyi **oku**, alan adlarını doğrula.

**3. Migration drift.**

Bir migration çalıştırıldıktan sonra dosyaya sütun eklenirse, o veritabanında
bir daha çalışmaz. `schema_migrations`'ta kayıtlı görünür ama şema eksiktir.

Çözüm: dosyayı düzenleme, **yeni idempotent migration yaz**.

**4. `find -exec` hata kodunu yutar.**

CI'da `find ... -exec php -l {} \;` bozuk dosya olsa bile yeşil döner.
Açık döngü kullan:

```bash
hata=0
while IFS= read -r -d '' f; do php -l "$f" || hata=1; done \
  < <(find src public tools -name "*.php" -print0)
exit $hata
```

**5. ETL silme yapmaz.**

v1'de silinen kayıt v2'de kalır. Yeni yedek aktarılırken tekil anahtar
ihlali çıkarsa eski kayıt elle temizlenir.

---

## Nereye bakılacak

| Soru | Belge |
|---|---|
| Bir çeviri anahtarı var mı? | `docs/ceviri-sozlugu.md` |
| v1'de olup burada olmayan ne var? | `docs/tutarlilik-raporu.md` |
| Bu modül neden böyle yazıldı? | `docs/<modul>-brief.md` |
| İlk mimari kararlar | `docs/ANALIZ.md` |
| Kurulum, ortamlar, ETL | `README.md` |
| Lokal ortam kurulumu | `docs/kurulum.md` |
| İki kişi çalışırken kurallar | `docs/calisma-duzeni.md` |

`docs/referans/` klasöründe v1 uygulaması (`index.html`) durur — tek dosyalık
eski sürüm. Yeni ekran yazarken oradaki karşılığına bakılır.

`tasarim/` klasöründe (gitignore'da) Claude Design çıktıları durur.

---

## Çalışma biçimi

**Brief'siz büyük iş yapma.** Yeni bir ekran ya da modül isteniyorsa önce
`docs/` altında bir brief olmalı: ne yapılacak, hangi veri kullanılacak,
neler kapsam dışı.

**Şema doğrulamasını önce yap.** `DESCRIBE <tablo>` çalıştıramıyorsan
migration dosyalarından türet ve **raporla**. Varsayımla ilerleme.

**Belirsizlik varsa dur ve sor.** Bu projede tasarım ile veri arasında
birkaç kez çelişki çıktı (First Off numune sayısı, sipariş durum enum'u).
Tahmin etmek yerine sormak doğru davranış.

**Her iş ayrı commit.** Büyük değişiklikler adım adım, her adımdan sonra
rapor. Bir şey ters giderse geri dönülebilsin.

**Doğrulama:** `php -l` tüm değişen PHP, `node --check` tüm değişen JS,
TR/EN anahtar dengesi. Mümkünse tarayıcıda açıp konsola bak — TDZ gibi
hatalar sadece orada görünür.
