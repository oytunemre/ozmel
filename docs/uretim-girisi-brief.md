# Claude Code brief — Üretim Girişi v2 (ekranın yeniden yazımı)

Tasarım kaynağı: `tasarim/Uretim-Girisi-v2.dc.html`
Referans mantık: `docs/referans/index.html` → `viewUretimGirisi()`
İlgili rapor: `docs/tutarlilik-raporu.md` madde 1

Mevcut `production.js` tamamen değişiyor. Bu, tutarlılık raporundaki **en
büyük davranış gerilemesinin** düzeltilmesi.

---

## Sorun

Şu an kullanıcı 101 iş emri arasından `FkSelect` ile tek tek seçim yapıyor.
Tarih filtresi yok, plan bağı yok, vardiya hedefi yok.

Müşterinin isteği: *"Bilale anlatır gibi basit olmalı."*

Yeni akış:

```
Tarih + vardiya seç  →  o gün planlanmış işler kart olarak gelir
                     →  her karta üretilen miktar girilir
```

Kullanıcı iş emri **seçmez**. Liste `machine_plans`'tan gelir.

---

## Üst şerit

- `← Önceki gün` · tarih seçici · `Sonraki gün →` · gün etiketi
  (`09.09.2026 · Salı`)
- Vardiya: **Sabah** / **Öğleden Sonra** — bitişik düğme grubu.
  Saate göre otomatik seçili: 13:00 öncesi Sabah.
- Sağda gün özeti: `4 iş · hedef 8.400 · girilen 6.120` + yüzde

---

## Vardiya hedefi — hesaplanan değer

Günlük hedef (`machine_plans.target_quantity`) vardiyalara **süreye orantılı**
bölünür.

Tasarımda oran sabit kodlanmış (`VARDIYALAR[].oran`). **v2'de
`working_hours`'tan hesapla:**

```
Sabah          = sabahBitis − sabahBaslangic − sabah molası
Öğleden Sonra  = ogledenSonraBitis − ogledenSonraBaslangic − öğleden sonra molası
oran           = o vardiyanın dakikası / toplam net dakika
```

Mevcut veriyle: sabah 195 dk (%38), öğleden sonra 315 dk (%62).

`core/capacity.js`'te `netWorkMinutes()` benzeri bir fonksiyon var — vardiya
kırılımı ekle, yeniden yazma.

Kullanıcı bu değeri **düzenleyemez**. Kartta gösterilir, kayda `target_quantity`
olarak yazılır.

---

## İş kartı

Her planlanan iş bir kart. Sol kenarda durum şeridi.

**Başlık:** iş merkezi adı · sağda `İE-2847 · 221173`
**Alt satır:** operasyon adı · ürün adı

**Üç sayı yan yana:**
```
GÜNLÜK HEDEF    VARDİYA HEDEFİ    KALAN
    2.000             760          1.240
```

`KALAN` = iş emri hedefi − o iş emrinde toplam üretilen.

Vardiya hedefinin altında ipucu: `sabah vardiyası %38`

**Giriş alanları:** Üretilen · Fire · Operatör (FK seçici)

**Duruş bölümü** — katlanabilir, varsayılan kapalı. `+ Duruş ekle` /
`− Duruşu kaldır`.

Açılınca: başlangıç saati · bitiş saati · hesaplanan süre · neden (FK).
Alt not: "Mola süresi duruştan otomatik düşülür."

Süre hesabı `core/capacity.js:downtimeMinutes()` — mevcut fonksiyon, mola
kesişimini düşüyor.

**Not alanı** — tek satır, isteğe bağlı.

**Kaydet düğmesi** — kart başına. Kayıt varsa `Güncelle`.

### Durum şeridi

| Durum | Renk |
|---|---|
| Girilmemiş | nötr |
| Hedefin altında | uyarı |
| Hedefe ulaşmış | başarı |
| Duruş var | uyarı + saat rozeti |

---

## Doğrulama

Tasarımdaki kurallar iyi, aynen uygula — **bir değişiklikle**:

| Kural | Mesaj |
|---|---|
| Üretilen boş | "Üretilen miktar girilmedi" |
| Üretilen ≤ 0 | "Sıfırdan büyük olmalı — hiç üretim yapılmadıysa kaydetmeyin" |
| Operatör seçilmedi | "Bu vardiyada makineyi kullanan kişiyi seçin" |
| Duruş saatlerinden biri eksik | "İkisini de girin ya da bölümü boş bırakın" |
| Duruş bitişi başlangıçtan önce | "Bitiş saatini sonraya alın" |
| Duruş var, neden yok | "Listeden duruşun nedenini seçin" |

**Değişiklik:** tasarımda `uretilen > kalan` **hata** olarak engelliyor. Bunu
**uyarı** yap, engelleme — veride hedefin üstünde üretim yapılmış kayıtlar var,
meşru bir durum.

Kart içinde sarı şerit: `Girilen miktar kalandan fazla (kalan: 1.240). Yine de
kaydedilecek.`

---

## Kayıt anahtarı — dikkat

Tasarım `id|tarih|vardiya` kullanıyor. **Yanlış.**

Migration 042 ile tekil anahtar `(tenant_id, work_order_id, date, shift,
operator_id)` oldu — aynı vardiyada farklı operatörler kendi kayıtlarını tutar.

Taslak anahtarı da **operatörü içermeli**. Yoksa iki operatörün kaydı ekranda
birbirini ezer.

Kayıt varken tekrar kaydedilirse onay diyaloğu:

> **Kayıt zaten var**
> Bu iş emri için 09.09.2026 / Sabah vardiyasında bu operatörün kaydı var
> (üretilen: 256). Üzerine yazılsın mı?
>
> `Vazgeç` · `Üzerine yaz`

`ProductionRepository::create()` zaten upsert yapıyor (migration 042 turunda
eklendi) — onu kullan.

---

## Boş hal

Plan yoksa kart listesi yerine:

> **Bu tarih için planlanmış iş yok**
> Üretim Planı'ndan bu güne iş atadığınızda burada listelenir.
>
> `Üretim Planı'na git` → `#machine-plans`

---

## Alt bölüm: Bugünkü Girişler

O gün girilmiş tüm kayıtlar (her iki vardiya):

```
SAAT · İŞ EMRİ · ÜRÜN · VARDİYA · OPERATÖR · ÜRETİLEN · FİRE · DURUŞ · NOT
```

- Duruş sütunu hesaplanmış dakika (mola düşülmüş), yoksa `—`
- Not uzunsa kırpılır, `title` ile tamamı
- Boşsa: `Bu gün için henüz kayıt girilmedi.`

**Bu tablo `production.not` ve duruş alanlarını görünür kılıyor** — tutarlılık
raporu D1 ve D2 maddeleri.

---

## Veri kaynağı

Mevcut `listAll()` deseniyle, `core/store.js` önbelleğiyle:

| Ne | Kaynak |
|---|---|
| Günün işleri | `machine_plans` `date = seçili`, `work_order_id` dolu |
| İş merkezi / ürün / operasyon | ilgili FK'ler |
| Günlük hedef | `machine_plans.target_quantity` |
| Kalan | iş emri hedefi − `production` toplamı |
| Mevcut kayıt | `production` `(work_order_id, date, shift, operator_id)` |
| Operatörler | `operators` |
| Duruş nedenleri | `downtime_reasons` (aktif olanlar) |
| Çalışma saatleri | `working_hours` |

Yazma sonrası `production` ve `work_orders` önbelleği geçersiz kılınmalı —
`api.js`'te zaten tanımlı.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `ug.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`
- `text-transform: uppercase` veri metnine uygulanmayacak
- Vardiya enum'u BE'de Türkçe (`Sabah`, `Öğleden Sonra`, `Mesai`) — gösterim
  çevrilir. **Mesai vardiyası tasarımda yok ama veride var** (enum'da tanımlı):
  seçenek olarak kalsın mı, sor

---

## Sıra

1. `working_hours`'tan vardiya oranı hesabını `core/capacity.js`'e ekle
2. Ekran
3. Sözlük, `node --check`
4. Ayrı commit, push

Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.

---

## Kapsam dışı

- Üretim Planı ekranından giriş yapma
- Toplu kaydetme (tüm kartlar tek düğmeyle)
- Vardiya hedefinin elle düzenlenebilmesi
