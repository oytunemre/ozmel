# Claude Code brief — Satınalma İstekleri: malzeme kodu ve adı

Referans: `docs/referans/index.html` → `openSatinalmaModal()`,
`satinalmaKoduSecildi()`

Müşteri kendi sisteminde bu değişikliği yaptı, v2'ye taşınacak.

---

## ÖNCE: ETL'de bir hata var

Kaynak veride **iki ayrı alan** var:

```json
{
  "malzeme": "13,28*2.24*2650 Cu-ETP BAKIR BORU",   ← serbest açıklama
  "urun":    "221CM016",                            ← gerçek kod
  "birim":   "kg"
}
```

**36 isteğin 36'sında `urun` alanı kod tanımlarıyla eşleşiyor.** Sorun yok.

Ama ETL raporunda "malzeme cozulemedi: 36 kayit" çıkıyor ve `material_code_id`
NULL kalıyor. Demek ki ETL `malzeme` alanını kod sanıp eşleştirmeye çalışıyor,
`urun` alanını kullanmıyor.

⌨️ `tools/etl.php`'deki `satinalmaIstekleri` dönüşümünü kontrol et ve raporla:
hangi alan `material_code_id`'ye eşleniyor?

**Düzeltme:** `urun` → `material_code_id` (kod eşleşmesi),
`malzeme` → yeni `material_description` sütunu.

Bu tek başına 36 kaydı düzeltir.

---

## Migration `044_purchase_request_material_description.sql`

```sql
ALTER TABLE purchase_requests
  ADD COLUMN material_description VARCHAR(255) NULL AFTER material_code_id;
```

Idempotent yaz (041 deseni), `INSERT IGNORE INTO schema_migrations` ekle.

Sütun adını mevcut şemayla doğrula (`DESCRIBE purchase_requests`).

**Mevcut veri:** ETL şu an çözülemeyen malzeme metnini `note` alanının başına
ekliyor. Migration sonrası ETL yeniden çalıştırılınca `material_description`
dolacak. `note`'a eklenen eski metinler kalacak — temizlemeye gerek yok, ETL
upsert ile `note`'u da güncelleyecek.

---

## Form değişikliği

Mevcut drawer'da alan sırası ve türü değişiyor.

### Önce (v2 şu an)

```
Malzeme Kodu    [FK seçici — tüm ürün kodları]
Miktar
Birim
...
```

### Sonra

```
Malzeme / Ürün Kodu *   [seçici — sadece tip='Hammadde', alfabetik]
                         Etiket: "221CM016 — 18,03*3.21*2640 Cu-ETP BAKIR BORU"

Malzeme Adı              [metin — kod seçilince otomatik dolar, düzenlenebilir]
                         Placeholder: "Kod seçilince otomatik dolar, gerekirse düzenleyin"

Miktar *
Birim                    [kod seçilince otomatik dolar]
Tedarikçi
İstek Tarihi
Beklenen Tarih
Bağlı Sipariş
Not
```

**Davranış:** kod seçildiğinde `product_codes`'tan `ad` ve `birim` okunur,
ilgili alanlara yazılır. İkisi de sonradan elle değiştirilebilir.

Referanstaki `satinalmaKoduSecildi()` fonksiyonunun yaptığı bu.

**Hammadde filtresi:** seçici yalnız `type = 'Hammadde'` olan kodları
göstersin. Veride 20 hammadde kodu var.

⌨️ `product_codes.type` sütun adını doğrula — `tip` karşılığı ne?

---

## Tablo değişikliği

Listede **Malzeme** sütunu iki satırlı olsun:

```
221CM016
18,03*3.21*2640 Cu-ETP BAKIR BORU
```

Üstte kod (mono, aksan), altında açıklama (küçük, gri). Açıklama yoksa sadece
kod.

Arama her ikisinde de çalışsın.

---

## v2 uyarlamaları

- `material_description` DTO, Validator, Repository'ye eklenecek
- Zorunlu değil (nullable)
- Yeni sözlük anahtarları `docs/ceviri-sozlugu.md`'ye
- `text-transform: uppercase` veri metnine uygulanmayacak

---

## Sıra

1. ETL'deki alan eşlemesini kontrol et → raporla
2. Migration `044`
3. ETL düzeltmesi (`urun` → kod, `malzeme` → açıklama)
4. Backend (DTO / Validator / Repository)
5. Form + tablo
6. Sözlük, `php -l`, `node --check`
7. Ayrı commit, push

Migration ve ETL'i ben çalıştıracağım. Repo `~/Projects/Ozmel/ozmel`, dal
`krc-port`.

---

## Kapsam dışı

- Satınalma durum takibi (Bekliyor / Kısmi / Tamamlandı) — ayrı iş
- Gelen kümülatif miktar sütunu — ayrı iş
- BOM'dan otomatik satınalma önerisi — ayrı iş
