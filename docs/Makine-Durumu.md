# Makine Durumu — uygulama notu

Genel Bakış ekranındaki "Makine Durumu" bölümünün nasıl kurulacağı. Tasarım kaynağı: `Makine-Durumu.dc.html`. Görsel diller `Tasarim-Sistemi.dc.html`'e bağlıdır — renk, tipografi ve ölçüler oradan gelir, yeni değer uydurulmaz.

## Ne gösterir

Açık iş emirlerinin **iş merkezi bazında kalan miktarı**. Her kart bir iş merkezi, her satır o merkezde bekleyen bir operasyondur. Kayıt oluşturma/düzenleme yoktur — bölüm salt okunurdur, tıklama yalnızca ilgili iş emri listesine götürür.

## Veri

Tek uç nokta yeterli: `GET /api/dashboard/machine-load`

```json
{
  "updated_at": "2026-09-02T11:32:04+03:00",
  "work_centers": [
    {
      "work_center_id": 12,
      "name": "Packaging Workplace",
      "operations": [
        { "work_order_id": 8814, "order_code": "221173", "operation_name": "Packaging", "remaining_qty": 20000 }
      ]
    }
  ]
}
```

Kurallar:

- `name`, `order_code`, `operation_name` **sunucudan geldiği gibi** basılır. Türkçeleştirme, kısaltma, büyük harfe çevirme yapılmaz (veri karışık TR/EN'dir: "Poşetleme", "CNC OPERASYON 2(Alın Alma ve 2.Knurl)").
- Aynı `order_code` bir merkezde birden çok kez görünebilir — bunlar farklı iş emirleridir, birleştirilmez.
- `remaining_qty` tam sayı gelir; toplama/oranlama istemcide yapılır.
- Operasyonu kalmamış merkez yanıtta yer almaz (boş kart basılmaz).

## Hesaplar (istemci)

| Değer | Nasıl |
| --- | --- |
| Kart toplamı | `sum(remaining_qty)` |
| Yük payı | `kartToplamı / max(tümKartToplamları)`, çubuk genişliği `max(pay*100, 2)%` |
| Çubuk rengi | pay > 0,60 → `--color-warning`, aksi halde `--color-accent` |
| Üst özet | merkez sayısı, operasyon sayısı, toplam kalan |
| Sıralama | varsayılan kart toplamına göre azalan; ikinci seçenek `localeCompare(ad, "tr")` |

Sayı biçimi: `toLocaleString("tr-TR")` — binlik ayırıcı nokta (`20.000`), ondalık virgül. Miktarlar `IBM Plex Mono`, sağa hizalı.

## Yerleşim

- Bölüm tek bir kutu: `1px solid var(--color-neutral-400)`, beyaz zemin, dört köşede aksan renkli registration işareti.
- Üç şerit: **başlık + özet** → **sıralama/açıklama şeridi** (`--color-neutral-100` zemin) → **kart ızgarası**.
- Izgara: `repeat(auto-fill, minmax(322px, 1fr))`, `gap: 14px`, `align-items: stretch`. Sabit kolon sayısı verilmez; 1920'de 4-5, tablette 2 kolon oluşur.
- Kart: başlık bloğu (ad + `N op.` + yük çubuğu + toplam) ve altında satır listesi. Satır yüksekliği 32px (yoğun liste), tablo satırları 44px olan ana listelerden bilinçli olarak daha sıkıdır.
- Satır ızgarası: `72px | minmax(0,1fr) | 92px` → kod, operasyon adı (taşarsa `ellipsis` + `title`), kalan.
- İlk 5 satır basılır; fazlası `+ N operasyon daha` satırına toplanır. Limit 2-8 arasında ayarlanabilir.

Kart genişliği içerik uzunluğuna göre değişmez — eski tasarımdaki ragged ızgara ve büyük boşluklar bu yüzden oluşuyordu.

## Durum halleri

| Hal | Gösterim |
| --- | --- |
| Yükleniyor | Izgarada 8 iskelet kart: başlık ve 4 satır yerinde gri bloklar (`--color-neutral-200`), yükseklikler gerçek kartla aynı — ızgara zıplamaz. |
| Boş | Bölüm kutusu korunur, içinde "Açık iş emri yok" başlığı ve tek satır açıklama. Kart ızgarası basılmaz. |
| Hata | Bölüm kutusunun içine `--color-danger-fill` zeminli şerit: "Makine durumu alınamadı", saat ve "Tekrar dene". Sayfanın kalanı etkilenmez — bu bölüm kendi başına başarısız olur. |
| Kısmi | Gelen kartlar basılır, ızgaranın sonuna iskelet kartlar eklenir; özet sayıları "—" gösterir, yanlış toplam yazılmaz. |

HTTP durum kodu (409, 500 vb.) arayüzde **görünmez**; kullanıcıya ne olduğunu ve ne yapabileceğini anlatan Türkçe mesaj yazılır, teknik ayrıntı konsola gider.

## Yetki

Bölüm okuma yetkisi olan herkese görünür. Başlıkta "Salt okunur" rozeti sabittir — burada değiştirme aksiyonu hiç yoktur, dolayısıyla devre dışı düğme de yoktur. Karta tıklandığında açılan İş Emirleri ekranında yetki kuralları o ekranın kendi kuralıdır.

## Yenileme

- `updated_at` başlıkta saat olarak yazılır ("11:32'de güncellendi").
- 5 dakikada bir sessiz yenileme; yenileme sırasında eski veri ekranda kalır, iskelet gösterilmez.
- Yenileme başarısız olursa kartlar durur, başlıktaki saat eskimiş olarak kalır ve hata şeridi eklenir.

## Bağlantı

Kart başlığı ve `+ N operasyon daha` satırı İş Emirleri ekranını `work_center_id` filtresiyle açar (`/is-emirleri?work_center=12`). Satırın kendisi tek iş emrini açar (`/is-emirleri/8814`). Yeni pencere açılmaz.

## Kaçınılacaklar

- Kalan miktarı chip/etiket içine almak — sayılar kolon halinde hizalı kalmalı.
- Kart genişliğini içeriğe göre büyütmek.
- Uzun kuyrukları tam basıp kartları farklı yükseklikte bırakmak.
- Operasyon adını kısaltmak veya çevirmek.
- Aksan dışında renk eklemek; yalnızca yük çubuğu sarıya döner, kritik eşik yoktur.
