# Üretim Planı (Haftalık Makine Planlama) — uygulama notu

Ekranın tasarım kaynağı: `Uretim-Plani-v2.dc.html`. Yapı v78'deki `viewUretimPlani()` ile birebir aynıdır (kolonlar, hücre kontrolleri, düğmeler, üç özet tablosu); yalnızca görsel dil `Tasarim-Sistemi.dc.html`'e taşınmıştır. Renk, tipografi, ölçü değerleri oradan gelir; yeni değer uydurulmaz.

Not: `Uretim-Plani.dc.html` bu ekranın ilk (salt okunur doluluk ızgarası) denemesidir, geçerli tasarım v2'dir.

## Ne yapar

Planlamacı, hangi makinenin hangi gün hangi işe çalışacağını belirler. **Gözlem ve planlama aracıdır** — iş emri açmayı tetiklemez, Kapasite ve İş Emirleri modüllerinden bağımsız çalışır. Kapasite kayıtları yalnızca hedef adedin ön dolmasında kullanılır.

## Veri

Kayıt birimi: `machine_plan` — bir **(tarih, iş merkezi)** çifti için tek satır.

```json
{
  "id": 4412,
  "date": "2026-09-02",
  "work_center": "Upcut Saw 1",
  "product": "221173",
  "work_order_id": 8814,
  "target_qty": 3360,
  "note": ""
}
```

- `(date, work_center)` **tekildir**; aynı makineye aynı gün ikinci kayıt açılmaz, var olan güncellenir.
- `work_order_id` boş olabilir → "plansız ürün" planı.
- Seçim temizlenirse (`—`) kayıt **silinir**, boş `product` ile tutulmaz.
- Makine listesi rotalardan gelir (`routes.work_center` distinct). Rota tanımlı makine yoksa ekran boş hal gösterir: "Rota tanımlı makine yok / Önce Rotalar modülünden ürün rotası ekleyin."

Hücre seçenekleri iki gruptur:

| Grup | Kaynak |
| --- | --- |
| Açık İş Emirleri | O makineye ait, `durum = Aktif` ve `kalan > 0` iş emirleri. Etiket: `IE-8814 — 221173 (3.360 kalan)` |
| Ürün (plansız) | O makinenin rotasında geçen ürün kodları, alfabetik |

## Hedef adet

- İş emri seçildiğinde `target_qty`, o **ürün + makine + operasyon** için tanımlı kapasite kaydından otomatik gelir. Kapasite kaydı yoksa alan boş kalır ve elle girilir.
- Plansız üründe hedef her zaman elle girilir.
- Girilen hedef kapasitenin üstündeyse: alan `2px solid var(--color-danger)` + `--color-danger-fill`, altında `kapasite 20.000` notu. **Kayıt engellenmez** — plan yazılır, yalnızca uyarılır. Metin sebebi ve çıkışı söyler (kapasiteyi güncelle ya da işi iki güne böl).
- Sayı biçimi `toLocaleString("tr-TR")`; miktar alanları `IBM Plex Mono`, sağa hizalı.

## Yerleşim

1. **Hafta şeridi** — `← Önceki Hafta`, tarih aralığı (Barlow Condensed 17px), `Sonraki Hafta →`; sağda `Bu Hafta`. Hepsi ghost düğme.
2. **Makine Planı paneli** — başlık solda; sağda "Sadece bu hafta planlı makineleri göster" onay kutusu ve iki gruplama düğmesi (`İş Merkezine Göre` / `Operasyona Göre`, aktif olan dolu aksan).
3. **Izgara** — `Makine` (210px) + 7 gün kolonu (min 130px). Bugünün kolonu `--color-accent-200` başlık / `--color-accent-100` hücre; Cmt-Paz `--color-neutral-100/200`. Gün başlığında kısaltma + tarih.
4. **Hücre** — `<select>` (30px, mono 11.5px) → `<input type="number">` hedef (26px) → iş emri no notu (9.5px mono). Plan yokken yalnızca `—` seçili select durur.
5. **Üç özet paneli** — İş Merkezi / Makine / Ürün bazlı. Her biri: ilk kolon + 7 gün + `Hafta Toplamı`; değerler mono, sıfır gün `—`. Boşsa tek satır: "Henüz plan girilmedi."

Gruplama operasyona alındığında: operasyon başlık satırı (`▾ CUTTING (2 makine)`, mono 10.5px uppercase), makine adı 32px girintili ve ad altındaki operasyon satırı kaldırılır. Grup açık/kapalı durumu kullanıcı başına saklanır.

Operasyon sırası sabit önceliktedir: `Cutting → Countersink → Marking → Pressing → Packaging`, kalanlar alfabetik.

## Tarih hesabı

Hafta **yerel** tarihe göre hesaplanır; `toISOString()` kullanılmaz (pozitif saat diliminde gece yarısı bir gün geriye kayar). Hafta başı Pazartesi. Bugün kolonu yerel tarihle karşılaştırılır.

## Durum halleri

| Hal | Gösterim |
| --- | --- |
| Yükleniyor | Izgara başlıkları basılır, satırlarda iskelet hücreler; kolon genişlikleri gerçek satırla aynı — tablo zıplamaz. |
| Makine yok | Panel içinde boş hal: başlık + tek satır açıklama + "Rotalar'a git" düğmesi. |
| Plan yok (hafta boş) | Izgara dolu basılır (her hücre `—`), özet tabloları "Henüz plan girilmedi." satırını gösterir. |
| Hata | Panelin içine `--color-danger-fill` şerit: ne olduğu, saat, "Tekrar dene". Diğer paneller etkilenmez. |
| Kapasite üstü | Hücrede kırmızı alan + not; kayıt yine yazılır. |

HTTP durum kodu (409, 422, 500) arayüzde görünmez; kullanıcıya Türkçe açıklama yazılır, teknik ayrıntı konsola gider.

## Yetki

Salt okuma yetkisinde tüm `select` ve `input` alanları `disabled` (0.45 opaklık), üzerine gelince sebebi yazar; hafta gezinme ve gruplama düğmeleri çalışır. Aksiyonlar gizlenmez.

## Çakışma

Aynı hücreyi iki kişi düzenlerse sunucu reddeder ve mesaj şudur: "Bu kayıt siz açtıktan sonra başkası tarafından değiştirildi." Uyarıda değiştiren kişi ve saat yazar, iki çıkış sunulur: **Farkları göster** ve **Yeniden yükle**. Kopya olarak kaydetme yoktur — `(date, work_center)` tekil kısıtı ikinci kaydı kabul etmez.

## Kaçınılacaklar

- Hücrede iş emri numarasını gizleyip yalnız ürün kodu göstermek — seçim iş emrinin kendisidir, etiket `IE-8814 · 221173` biçimindedir.
- Üç özet tablosunu tek anahtara indirmek (v78 üçünü alt alta gösterir; planlamacı üçünü birlikte okur).
- Kapasite aşımında kaydı engellemek.
- Aynı makine-güne ikinci plan satırı yazmak.
- Makine, ürün ve operasyon adlarını çevirmek veya kısaltmak — sunucudan geldiği gibi basılır.
