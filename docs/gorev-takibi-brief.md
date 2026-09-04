# Claude Code brief — Görev Takibi v2 (mevcut ekranın yenilenmesi)

Tasarım kaynağı: `tasarim/Gorev-Takibi-v2.dc.html`

Mevcut `tasks.js` düz bir tablo. Yeni tasarım **beş sekmeli** bir çalışma alanı.
Ayrıca mevcut `taskPeople.js` (Görev Kişileri) bu ekranın bir sekmesi haline
geliyor — ayrı menü öğesi kalkacak.

---

## Veri

`tasks` (42 kayıt) alanları:

```
sira, gorevTanimi, departman, anaSorumlu, yardimci,
oncelik, termin, durum, tamamlanmaYuzdesi, notlar
```

Mevcut durum değerleri: `Başlamadı`, `Devam Ediyor`, `Tamamlandı`

**Tasarım dördüncü bir durum bekliyor: `Beklemede`.** Veride yok ama Durum
Dağılımı sekmesinde listeleniyor. Validator'a ekle, sıfır sayıyla görünsün.

`task_people` (4 kayıt): `isim`, `eposta`, `telefon`

⌨️ Şema doğrulaması — `DESCRIBE tasks` ile şu alanların varlığını kontrol et
ve raporla: `department`, `assistant`, `priority`, `completion_ratio`, `notes`.
Eksik varsa migration gerekir.

---

## Türetilen değerler

```
kalanGun = termin − bugün        (gün cinsinden, yerel tarih)
gecikti  = durum != 'Tamamlandı' && kalanGun < 0
```

Sıralama — üç kademeli:
1. Geciken görevler üstte
2. Tamamlanmamışlar önce
3. Termin sırasına göre

---

## Beş sekme

Sekme şeridi üstte, KPI kartlarının altında.

### Sekme 1: Görev Listesi (varsayılan)

Alt başlık: "Geciken görevler üstte, ardından termin sırası"

11 kolon:

```
SIRA(60) · GÖREV TANIMI(auto) · DEPARTMAN(150) · ANA SORUMLU(130) ·
YARDIMCI(120) · ÖNCELİK(110) · TERMİN(110) · DURUM(140) ·
TAMAMLANMA(150) · KALAN GÜN(130, sağa) · NOTLAR(190)
```

**Rozet renkleri:**

| Alan | Değer | Renk |
|---|---|---|
| Durum | Tamamlandı | success |
| | Devam Ediyor | warning |
| | Başlamadı / Beklemede | nötr |
| Öncelik | Yüksek | danger |
| | Orta | warning |
| | Düşük | nötr |

**Tamamlanma** hücresi: `%75` + ilerleme çubuğu.

**Kalan gün:**
- Tamamlandıysa `—`
- Geciktiyse `N gün gecikti`, danger renk + zemin
- Değilse `N gün`

**Geciken satırın tamamı** `--color-danger-fill` zeminli.

Boş alanlar `—` gösterilir.

### Sekme 2: Kişi Özeti

```
KİŞİ · TOPLAM GÖREV · AÇIK GÖREV · TAMAMLANAN · GECİKEN · YARDIMCI OLDUĞU
```

- Kişiler `anaSorumlu` alanından türetilir
- `YARDIMCI OLDUĞU` = o kişinin `yardimci` olarak geçtiği görev sayısı
- Geciken sayısı sıfırdan büyükse danger renk + zemin
- Sıralama: geciken sayısına göre azalan, sonra toplam göreve göre

### Sekme 3: Pano

İki bölüm yan yana:

**Durum Dağılımı** — dört durum, her biri yatay çubuk + sayı. Çubuk genişliği
en yüksek sayıya oranlı.

**Yaklaşan ve Geciken** — sayı kartları:
- Geciken görev sayısı
- Bu hafta terminli (kalan gün 0–7 arası, tamamlanmamış)

### Sekme 4: Günlük Hatırlatma

Alt başlık: "Açık görevi olan kişiler için hazır mesaj — kopyalayıp gönderin"

Her kişi için bir kart:

```
Furkan                              3 açık · 1 geciken     [Kopyala]
0532 616 40 15

Merhaba Furkan, bugünkü açık görevleriniz:
- CNC makinasının hazırlanması (Termin: 06.08.2026, 28 gün gecikti)
- Kalıp bakım kaydı (Termin: 10.09.2026, kalan 6 gün)
```

- Kişinin telefonu `task_people` tablosundan (`fmtPhone` ile biçimli)
- Rozet: `N açık` + geciken varsa `· N geciken`, danger renkli
- Mesaj metni `<pre>` benzeri, satır sonları korunmuş
- **Kopyala düğmesi** — `navigator.clipboard.writeText()`, sonra toast
- Açık görevi olmayan kişi listede görünmez

Bu sekme WhatsApp'a yapıştırmak için tasarlanmış; metni bozma.

### Sekme 5: Kişiler

`taskPeople.js`'in yerini alır.

```
İSİM · E-POSTA · TELEFON · AÇIK GÖREV
```

- E-posta `mailto:` bağlantılı
- Telefon `fmtPhone` ile biçimli (`+90 532 616 40 15`)
- `AÇIK GÖREV` türetilir: o kişinin `anaSorumlu` olduğu tamamlanmamış görevler
- Bu sekmede de ekleme/düzenleme/silme olmalı — mevcut `taskPeople.js`
  drawer'ını taşı

**`taskPeople` menü öğesini kaldır.** Bu sekme onun yerini alıyor.

---

## Beş KPI kartı

Sekmelerin üstünde, hepsinde görünür:

```
TOPLAM GÖREV · BAŞLAMADI · DEVAM EDİYOR · TAMAMLANDI · GECİKEN
```

Geciken sıfırsa success, değilse danger.

---

## Görev ekleme / düzenleme

Sağ üstte `+ Yeni Görev`. Mevcut drawer desenini kullan.

Alanlar: sıra, görev tanımı, departman, ana sorumlu (FK → `task_people`),
yardımcı (FK), öncelik (Yüksek/Orta/Düşük), termin, durum (dört değer),
tamamlanma yüzdesi, notlar.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, `gt.*` anahtarları `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js` ve `core/phone.js`'ten
- Sekme durumu `localStorage`'da saklansın
- Menü: **Görev Takibi** kalır, **Görev Kişileri** kaldırılır
- `text-transform: uppercase` veri metnine uygulanmayacak
- Enum değerleri (durum, öncelik) BE'de Türkçe kalır, yalnız gösterim çevrilir —
  sipariş durumundaki desenin aynısı

---

## Sıra

1. `DESCRIBE tasks` doğrulaması → raporla
2. Gerekiyorsa migration
3. Ekran (beş sekme)
4. `taskPeople.js` sekmeye taşınır, menü öğesi kalkar
5. Sözlük, `node --check`, gerekiyorsa `php -l`
6. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

---

## Kapsam dışı

- Görev atama bildirimi (e-posta/SMS gönderimi) — "Kopyala" yeterli
- Görev geçmişi / değişiklik günlüğü
- Alt görev / bağımlılık
