# Claude Code brief — Kalite Kontrol (yeni ekran + migration + ETL)

Tasarım kaynağı: `tasarim/Kalite-Kontrol-v2.dc.html`
Referans mantık: `docs/referans/v78.html` → `viewKalite()`,
`kontrolPlaniForUrun()`, `orderQualityStats()`, `renderOlcuselInput()`

Bu ekran v2'de **hiç yok** ve **verisi de aktarılmadı**. Üç parçalı iş:
migration → ETL → ekran.

---

## Kaynak veri

Yedekte iki koleksiyon var, ikisi de ETL'de atlanmıştı:

### `kontrolPlani` — 124 kayıt

```
id, urun, sira, operasyon, isMerkezi, karakteristik, spesifikasyonRaw,
tip, altLimit, ustLimit, nominal, birim,
olcumYontemi, numuneAdedi, kontrolSikligi, kayitForm, aksiyon
```

**Dikkat: `sira` metin, sayı değil.** Örnek değer `"G"` (Girdi / Hammadde
Kabul). `routes.sequence`'tan farklı — `VARCHAR(8)` olmalı, `DECIMAL` değil.

`tip` iki değer: `olcusel`, `nitel`.

Tasarımda görünmeyen ama saklanması gereken alanlar: `olcumYontemi`,
`numuneAdedi`, `kontrolSikligi`, `kayitForm`, `aksiyon`. Ekranda
göstermeyebilirsin ama veriyi kaybetme.

### `kaliteOlcumleri` — 60 kayıt

```
id, orderId, kontrolPlaniId, tarih, vardiya, deger, sonuc, operator, not
```

`deger` nitel maddelerde `null` olabilir, `sonuc` yine dolu.

---

## ÖNEMLİ: tasarım ile veri arasında uyumsuzluk

Tasarım her kontrol planı maddesi için **tek değer** varsayıyor
(`BASLANGIC` haritası: `id → değer`).

Ama gerçek veride **aynı (sipariş, plan maddesi) için birden çok ölçüm var**:

```
kontrolPlaniId ms4iiu63yti4e, orderId ms3pduqwboo84:
  deger -1     → Uygun Değil
  deger  1     → Uygun Değil
  deger 13.28  → Uygun
```

Yani bu bir **ölçüm günlüğü**, tek bir değer değil. Numune adedi birden
fazlaysa doğal olan da bu.

**Karar gerekiyor.** Üç seçenek:

1. **Son ölçümü göster** — tasarıma en yakın, geçmiş kaybolmaz ama görünmez
2. **Ölçüm listesi** — madde açılınca o maddeye ait tüm ölçümler listelenir,
   yeni ölçüm eklenir. Veriye sadık ama tasarımdan sapma
3. **Numune adedi kadar giriş** — `numuneAdedi` alanına göre N adet kutu

**Şimdilik (1)'i uygula**, ama veriyi kaybetme: yeni girilen ölçüm yeni satır
olarak eklensin, üzerine yazılmasın. Ekranda son değer görünür, geçmiş
tabloda durur. (2) ve (3) sonraki tur.

Bunu raporla, Melih'e sorulacak.

---

## 1. Migration `036_quality_control.sql`

```sql
CREATE TABLE control_plans (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         INT UNSIGNED NOT NULL DEFAULT 1,
  legacy_id         VARCHAR(64) NULL,
  product_code_id   BIGINT UNSIGNED NOT NULL,
  sequence_label    VARCHAR(8) NULL,          -- "G", "1", "2" — metin
  operation_id      BIGINT UNSIGNED NULL,
  work_center_id    BIGINT UNSIGNED NULL,
  characteristic    VARCHAR(255) NOT NULL,
  specification_raw TEXT NULL,
  type              VARCHAR(16) NOT NULL,      -- olcusel | nitel
  lower_limit       DECIMAL(12,4) NULL,
  upper_limit       DECIMAL(12,4) NULL,
  nominal           DECIMAL(12,4) NULL,
  unit              VARCHAR(32) NULL,
  measure_method    VARCHAR(128) NULL,
  sample_size       INT NULL,
  check_frequency   VARCHAR(128) NULL,
  record_form       VARCHAR(128) NULL,
  action_on_fail    TEXT NULL,
  created_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by        INT UNSIGNED NULL,
  updated_by        INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_cp_tenant_legacy (tenant_id, legacy_id),
  KEY idx_cp_product (product_code_id),
  CONSTRAINT fk_cp_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_cp_operation FOREIGN KEY (operation_id)    REFERENCES operations (id),
  CONSTRAINT fk_cp_wc        FOREIGN KEY (work_center_id)  REFERENCES work_centers (id)
);

CREATE TABLE quality_measurements (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64) NULL,
  order_id        BIGINT UNSIGNED NOT NULL,
  control_plan_id BIGINT UNSIGNED NOT NULL,
  measured_at     DATE NULL,
  shift           VARCHAR(16) NULL,
  value           DECIMAL(12,4) NULL,
  result          VARCHAR(32) NULL,           -- Uygun | Uygun Değil
  operator        VARCHAR(128) NULL,
  note            TEXT NULL,
  created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED NULL,
  updated_by      INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_qm_tenant_legacy (tenant_id, legacy_id),
  KEY idx_qm_order (order_id),
  KEY idx_qm_plan (control_plan_id),
  CONSTRAINT fk_qm_order FOREIGN KEY (order_id)        REFERENCES orders (id),
  CONSTRAINT fk_qm_plan  FOREIGN KEY (control_plan_id) REFERENCES control_plans (id)
);
```

Sütun adlarını mevcut şema deseninle uyumlu tut — `DESCRIBE routes` gibi bir
tabloya bakıp adlandırma tarzını doğrula, gerekirse uyarla.

`operation_id` ve `work_center_id` nullable: veride `isMerkezi` çoğu kayıtta
boş, `operasyon` ise `Hammadde Kabul` gibi rota dışı değerler içerebilir.
ETL'de eşleşmezse NULL bırak, kaydı atlama.

## 2. ETL

`tools/etl.php`'ye iki koleksiyon ekle:

- `kontrolPlani` → `control_plans`. `urun` → `product_code_id` (kod eşleşmesi).
  Ürün bulunamazsa **atla ve raporla** (mevcut desen).
- `kaliteOlcumleri` → `quality_measurements`. `orderId` ve `kontrolPlaniId`
  legacy id haritasından çözülür. İkisinden biri çözülemezse atla ve raporla.

Sıra önemli: `control_plans` önce, `quality_measurements` sonra.

## 3. Ekran

### Üst şerit

Başlık `KALİTE KONTROL` + alt satır: "Sipariş bazında kontrol planı — ölçüsel
maddelere değer, nitel maddelere Uygun / Uygun Değil girilir"

Sağda **Vardiya** seçici: `1` / `2` / `3` bitişik düğme grubu, aktif
`--color-accent-900`.

### Sol panel — kontrol planı olan siparişler

Başlık: `KONTROL PLANI OLAN SİPARİŞLER`

Yalnızca ürünü için kontrol planı tanımlı siparişler listelenir.

Her satır:
```
221173                          8/14 madde girildi
1.200 adet · teslim 18.09.2026  2 uygunsuz
```

- Ürün kodu (mono, aksan)
- Meta: hedef miktar + teslim tarihi
- İlerleme: `girilen/toplam madde girildi`
- Uygunsuz varsa danger renkli rozet

Seçili satır `--color-accent-100` zemin + sol aksan çubuğu.

### Sağ panel — kontrol planı maddeleri

Başlıkta: ürün kodu + ürün adı + özet
(`8/14 madde · 2 uygunsuz · vardiya 1`)

Maddeler **sıra + operasyon** bazında gruplanmış. Grup başlığı:
`G. Hammadde Kabul`, `1. Kesim`, `2. Torna`

**Ölçüsel madde:**

```
Boru dış çap                     [ 18.05 ]        Uygun
17,93 … 18,13 mm
├────────────▼──────────────┤
```

- Karakteristik adı
- Spesifikasyon: `nominal birim  (alt … üst)`
- Değer girişi (sayısal)
- **Kumpas görselleştirmesi**: yatay şerit, nominal işareti sabit konumda,
  ölçülen değerin işaretçisi orantılı konumda
  - Konum = `(değer − alt) / (üst − alt)`, 0–1 arası kırpılmış
  - İşaretçi rengi: uygunsa success, değilse danger
  - Değer yoksa işaretçi gizli
  - Alan çerçevesi uygunsuzsa danger
- Sonuç rozeti: `Uygun` / `Uygun Değil` / `—`

**Sonuç otomatik hesaplanır:** `alt ≤ değer ≤ üst` → Uygun, değilse Uygun Değil.

**Nitel madde:**

```
Çapak / yüzey görünümü          [Uygun] [Uygun Değil]
Görsel kontrol
```

İki düğme, seçili olan dolu (Uygun → aksan, Uygun Değil → danger).

---

## Kaydetme

Değer girildiğinde ya da düğmeye basıldığında `quality_measurements`'a
**yeni satır** eklenir. `measured_at` bugün, `shift` seçili vardiya.

Ekranda gösterilen değer: o (sipariş, plan maddesi) için **en son** ölçüm.

Anlık kaydetme mi, "Kaydet" düğmesi mi — mevcut desene bak. Diğer ekranlar
drawer + Kaydet kullanıyor ama burası satır içi düzenleme. Satır içi anlık
kaydetme daha uygun; her değişiklikte tek istek, toast'suz sessiz kayıt,
hata olursa uyarı.

---

## v2 uyarlamaları

- Tüm metinler `() => t(...)`, yeni `kk.*` anahtarları
  `docs/ceviri-sozlugu.md`'ye
- Biçimlendirme `core/format.js`'ten
- Sol menüye **Kalite Kontrol**, "Tedarikçi & Kalite" grubuna
- Sipariş tıklanınca `#orders?id=` çapraz bağlantısı
- `text-transform: uppercase` veri metnine uygulanmayacak
- Backend: Repository / DTO / Validator / Controller — mevcut katman desenine
  uygun. Optimistic locking gerekmez (append-only), ama `tenant_id` her sorguda

---

## Sıra

1. Şema adlandırma doğrulaması → raporla
2. Migration `036`
3. ETL eklemesi + `php -l`
4. Backend katmanı
5. Ekran
6. Sözlük, menü kaydı
7. Ayrı commit, push (repo `~/Projects/Ozmel/ozmel`, dal `krc-port`)

Migration'ı ve ETL'i ben çalıştıracağım.

---

## Kapsam dışı

- Kontrol planı düzenleme ekranı (maddeleri ekleme/silme) — ayrı iş.
  Bu ekran sadece **ölçüm girişi** yapar, planı okur
- Numune adedi kadar çoklu giriş — yukarıdaki (3). seçenek
- Ölçüm geçmişi görüntüleme — (2). seçenek
- Kontrol planı raporu / sertifika çıktısı
