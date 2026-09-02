# Ürün Rotaları — uygulama notu

Ekranın tasarım kaynağı: `Rotalar-v2.dc.html`. Yapı v78'deki `viewRoutes()` ile birebir aynıdır (sol ürün seçici + sağda sıra çizelgesi, adım içi düğmeler, Aktif/Alternatif rozetleri); görsel dil `Tasarim-Sistemi.dc.html`'e taşınmıştır. Renk, tipografi ve ölçü değerleri oradan gelir.

Not: `Rotalar.dc.html` bu ekranın ilk (gruplu tablo) denemesidir; geçerli tasarım v2'dir.

## Ne yapar

Bir ürünün üretim yolunu tanımlar: **ürün → operasyon → iş merkezi → sıra**. Rota, Üretim Planı ve Kapasite modüllerinin makine listesini besleyen kaynaktır; buradaki operasyon sırası iş emirlerinin açılma sırasını belirler.

## Veri

Kayıt birimi tek bir rota adımıdır (`routes`):

```json
{
  "id": 5312,
  "product": "221173",
  "product_name": "Kapak Grubu · Alüminyum",
  "operation": "Cutting",
  "work_center": "Upcut Saw 1",
  "sira": 1,
  "aktif": true,
  "variant_label": "Poşet tipi",
  "variant_options": ["Şeffaf", "Baskılı"]
}
```

- Ürün listesi rota kayıtlarından türetilir (`product` distinct, alfabetik). Hiç rota yoksa boş hal: "Henüz rota tanımı yok / Yeni rota adımı ekleyin." + düğme.
- `product_name` ürünün ilk adımından okunur; adımlar arasında farklıysa ilki geçerlidir.
- **Aynı sıra numarasında birden fazla iş merkezi olabilir.** Bunlar alternatif hatlardır; adım kartında alt alta listelenir. Kayıtlar `sira`, sonra `work_center` adına göre sıralanır.
- `aktif` yalnızca bir hat için true olmalıdır — kapasite hesabı bu hattı kullanır. Rozet: `Aktif` (yeşil) / `Alternatif` (nötr).
- **Alt operasyon** kesirli sıra ile yazılır (4 → 4.1, 4.2). Yeni alt operasyonun sırası, mevcut tam sayı ile bir sonraki tam sayı arasındaki ilk boş 0,1 adımıdır.
- `variant_options` doluysa adım başlığının altında etiket + seçenek rozetleri basılır; boşsa düğme "+ Varyant Seçenekleri Ekle" olur.

## Yerleşim

İki kolon, **sabit yan yana** (`grid-template-columns: 272px minmax(0, 1fr)`). Sarmaz; kaydırma her kolonun kendi içindedir. Dış kapsayıcı `overflow: hidden`, kolonlar `min-height: 0` — panel içleri `overflow-y: auto`.

**Sol — ürün seçici (272px)**
Üstte arama (kod + ad üzerinde), altında liste. Her satır: kod (mono, aksan), ürün adı, "N operasyon adımı". Seçili satır `--color-accent-200` zemin + `inset 3px 0 0 var(--color-accent)` sol çubuk.

**Sağ — sıra çizelgesi**
Panel başlığı: ürün kodu (mono 19px), adı, sağda "10 adım · 8 operasyon".
Her adım iki kolonlu: 30×30 sıra kutusu + altında dikey çizgi, yanında içerik.

| Öğe | Kural |
| --- | --- |
| Sıra kutusu | Ana adım dolu aksan + beyaz sayı; alt operasyon (kesirli) beyaz zemin + hairline çerçeve |
| Adım başlığı | Barlow Condensed 18px/600, **büyük harfe çevrilmez** |
| Adım düğmeleri | "+ Alt Operasyon Ekle" ve varyant düğmesi — ghost, 28px |
| Varyant | Etiket + seçenek rozetleri (nötr, 24px) |
| İş merkezi satırı | Rozet + ad, sağda `Düzenle` (çerçeveli) ve `Sil` (kırmızı çerçeveli) |
| Grup etiketi | Aynı işin CNC gibi alt adımları varsa üstünde mono 11px etiket (örn. "CNC İşleme"), 44px girintili |

Panelin altında v78'den birebir alınan bilgi metni durur: bir operasyonda birden fazla iş merkezi varsa aktif hattın Kapasite Yönetimi'nden seçildiği notu.

## Metin kuralı

Ürün kodu, operasyon ve iş merkezi adları **sunucudan geldiği gibi** basılır — çevrilmez, kısaltılmaz ve `text-transform: uppercase` uygulanmaz. Sayfa `lang="tr"` olduğu için CSS ile büyük harfe çevirmek İngilizce adları bozar ("Cutting" → "CUTTİNG"). Büyük harf yalnızca bizim yazdığımız Türkçe başlıklarda kullanılır.

## Durum halleri

| Hal | Gösterim |
| --- | --- |
| Yükleniyor | Sol listede 8 iskelet satır, sağ panelde 4 iskelet adım (sıra kutusu + iki gri blok). Kolon genişlikleri değişmez. |
| Rota yok (hiç) | Tek boş hal: başlık, açıklama, "Yeni Rota Adımı" düğmesi. Kolonlar basılmaz. |
| Arama sonucu boş | Sol liste yerine "Eşleşen ürün yok" + "Aramayı temizle"; sağ panel son seçili üründe kalır. |
| Aktif hat yok | O adımda sarı uyarı: kapasite hesabının yapılamayacağı ve Kapasite Yönetimi bağlantısı. Adım yine görünür. |
| Hata | Sağ panelin içine `--color-danger-fill` şerit: ne olduğu, saat, "Tekrar dene". Sol liste etkilenmez. |

HTTP durum kodu arayüzde görünmez; kullanıcıya Türkçe açıklama yazılır.

## Yetki

Salt okuma yetkisinde `+ Alt Operasyon Ekle`, varyant düğmesi, `Düzenle`, `Sil` ve `Yeni Rota Adımı` devre dışıdır (0.45 opaklık, üzerine gelince sebebi yazar). Ürün seçme, arama ve okuma çalışır. Aksiyonlar gizlenmez.

## Silme ve çakışma

- **Silme** onay ister ve bağlı kayıt sayılarını listeler: o adıma bağlı açık iş emri, kapasite kaydı ve haftalık plan satırı. Bağlı iş emri varsa silme yerine adımı pasife almak önerilir.
- Aynı adımı iki kişi düzenlerse sunucu reddeder: "Bu kayıt siz açtıktan sonra başkası tarafından değiştirildi." Değiştiren kişi ve saat yazılır; iki çıkış sunulur — **Farkları göster** ve **Yeniden yükle**. Kopya olarak kaydetme yoktur.
- `(product, sira, work_center)` tekildir; aynı sıraya aynı iş merkezi ikinci kez eklenemez.

## Kaçınılacaklar

- İki kolonu alt alta sarmak — ekran yan yana çalışır, kaydırma panel içindedir.
- Alternatif hatları ayrı adım gibi göstermek; aynı sıra tek adımdır.
- Alt operasyonu tam sayı sırayla açmak (kesirli sıra düzeni bozulur).
- Adım başlığını veya iş merkezi adını büyük harfe çevirmek.
- Aktif hat rozetini iki hatta birden vermek.
