# Çalışma Düzeni

İki kişi aynı repoda çalışırken çakışmayı önlemek için. Kural değil,
anlaşma — işe yaramayan yeri değiştiririz.

---

## Dallar

| Dal | Ne için | Kim |
|---|---|---|
| `main` | Üretim — `ozmel.com` buradan dağıtılır | birleştirme ile |
| `krc-port` | Geliştirme — `staging.ozmel.com` buradan dağıtılır | ikimiz |
| `f/<konu>` | Büyük ya da riskli işler | ihtiyaç halinde |

Küçük işler doğrudan `krc-port`'a. Büyük bir modül ya da riskli bir
değişiklik varsa `f/` ile ayrı dal aç, bitince `krc-port`'a birleştir.

**`main`'e doğrudan commit atma.** Sadece `krc-port`'tan birleştirme ile
girilir, o da staging'de doğrulandıktan sonra.

---

## Akış

```
krc-port'ta çalış
    ↓
push → staging.ozmel.com otomatik dağıtılır
    ↓
staging'de test et
    ↓
sorun yoksa: main'e birleştir → push
    ↓
prod otomatik dağıtılır
```

Üretime alma:

```bash
git checkout main
git pull
git merge krc-port
git push
git checkout krc-port
```

---

## Ortak dosyalar — çakışma riski yüksek

Bu dosyalara neredeyse her iş dokunuyor:

- `public/js/core/i18n.js` — her yeni ekran anahtar ekler
- `public/css/app.css` — her yeni ekran stil ekler
- `public/index.html` — menü kaydı ve sürüm numarası
- `docs/ceviri-sozlugu.md`

**Öneriler:**

Çalışmaya başlamadan `git pull` yap. Bir günlük eski dal üzerinde çalışmak
çakışma üretir.

İşi bitirince hemen push et, bekletme.

Aynı anda aynı ekran üzerinde çalışmayın. Kim ne yapıyor, önceden konuşun.

`i18n.js`'te önek kullanın — `rt.*` Rotalar, `wo.*` İş Emirleri gibi.
Farklı öneklerde çalışırsanız çakışma satır bazında kalır, çözmesi kolay olur.

---

## Migration numarası

İkiniz de `045` yazarsanız çakışır.

**Önce şunu çalıştır:**

```bash
git pull
ls migrations/ | tail -3
```

En büyük numaranın bir fazlasını al. Aynı anda migration yazacaksanız
numaraları önceden paylaşın (biri `045`, diğeri `046`).

Migration'lar **her ortamda elle çalıştırılır** — lokal, staging, prod.
Yazan kişi diğerine haber verir.

Uygulanan migration dosyasını **sonradan düzenleme.** Değişiklik gerekiyorsa
yeni bir migration yaz. Düzenlenen dosya, daha önce çalıştırılmış
veritabanlarında bir daha çalışmaz — şema kayması olur.

---

## Commit

Türkçe, kısa, ne yapıldığını söyleyen:

```
Rotalar: alt operasyon sirasi ondalik olsun
Uretim Girisi: mukerrer kayit engellendi (migration 042)
CI: hata kodunu acik donguyle yakala
```

Bir commit bir iş. "Şunu şunu şunu yaptım" tarzı toplu commit'ler geri
almayı zorlaştırır.

---

## Push'tan önce

```bash
php -l <degisen php dosyalari>
node --check <degisen js dosyalari>
git diff --stat
```

Son komut önemli: beklenmedik büyüklükte bir silme varsa dur. Bir kez
`i18n.js`'ten 574 satır sessizce silinmişti.

CI push'ta sözdizimini kontrol eder ama çalışma zamanı hatalarını yakalamaz.
Tarayıcıda açıp konsola bakmak hâlâ gerekli.

---

## Veri

**Üretim verisi sadece `ozmel.com`'a girilir.** Staging test içindir; oraya
girilen kayıt üretime taşınmaz.

v1 (`index.html`) tasarım denemesi için kullanılabilir ama **üretim kaydı
girilmez.** İki yerde veri tutulursa birleştirilemez.

ETL tek yönlüdür: v1 yedeği → v2. Ters yön yok.

---

## AI kullanırken

Claude Code ya da başka bir asistan kullanıyorsanız:

**`docs/CLAUDE.md`'yi okumasını sağlayın.** Proje bağlamı, kurallar ve bu
projede yaşanmış hatalar orada.

**Brief'siz büyük iş yaptırmayın.** Yeni bir modül isteniyorsa önce `docs/`
altında bir brief olsun: ne yapılacak, hangi veri, neler kapsam dışı.
Brief'ler geriye dönük belge olarak da işe yarıyor.

**Şema doğrulamasını atlatmayın.** AI `DESCRIBE` çalıştıramıyor; migration
dosyalarından türetip raporlamalı. Varsayımla yazılan kod dört kez veri
kaybettirdi.

**Çıktıyı okuyun.** Rapor "tamamlandı" diyor diye geçmeyin — `git diff --stat`
ile bakın, tarayıcıda açın.

---

## Belgeler

Yeni bir modül yazıldığında:

- `docs/ceviri-sozlugu.md`'ye anahtarlar eklenir
- Brief `docs/` altında kalır
- Önemli bir mimari karar alındıysa `docs/CLAUDE.md`'ye yazılır

Belge yazmak angarya gibi görünüyor ama üç ay sonra "bu neden böyle" sorusuna
cevap veren tek şey o.
