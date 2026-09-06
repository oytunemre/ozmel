# Claude Code brief — Üretim Girişi mükerrer kayıt hatası

Kaynak: `docs/tutarlilik-raporu.md` madde 1 / Bölüm C
İlgili kod: `public/js/modules/production.js:129`

**Bu bir hata düzeltmesi, özellik eklemesi değil.**

---

## Sorun

`production.js` her kayıtta `api.create` çağırıyor. Aynı `(iş emri, tarih,
vardiya)` üçlüsü için ikinci kez giriş yapılırsa **yeni satır** oluşuyor.

v78 bunu `uretimGirisiKaydiBul()` ile çözüyordu: aynı üçlü varsa üzerine
yazıyordu.

**Etkisi:** üretim toplamları çift sayılır. Etkilenen yerler:

- İş Emirleri ilerleme yüzdesi
- Verimlilik ekranı (gerçekleşen / planlanan)
- Üretim Raporu (toplam üretilen, fire oranı, makine/ürün kırılımı)
- Üretim Panosu (bugünkü üretim)
- Genel Bakış (bugünkü üretim, MRP riski)
- Satış/Üretim Siparişleri ilerleme ve ETA
- Stok Durumu (tüketilen hesabı)

Yani tek bir yanlış giriş, sekiz ekranda yanlış sayı üretiyor.

---

## Önce doğrula, raporla

⌨️ Mevcut veride çakışma var mı:

```sql
SELECT work_order_id, `date`, shift, COUNT(*) n
FROM production
GROUP BY work_order_id, `date`, shift
HAVING n > 1;
```

Ben çalıştıracağım, sen sorguyu ver ve sonucu bekle.

**Çakışma varsa** tekil kısıt eklenemez; önce temizlenmesi gerekir. O durumda
hangi kayıtların birleştirileceği/silineceği ayrı bir karar — bana bildir.

**Çakışma yoksa** doğrudan devam.

---

## Düzeltme

### 1. Migration `042_production_unique.sql`

```sql
ALTER TABLE production
  ADD UNIQUE KEY uniq_prod_tenant_wo_date_shift
    (tenant_id, work_order_id, `date`, shift);
```

Sütun adlarını `DESCRIBE production` ile doğrula — `date` ve `shift`
karşılıkları farklı olabilir.

**Idempotent yaz** — `information_schema` kontrolü + `PREPARE`/`DO 0` deseni,
migration 041'deki gibi. Cutover DB'sinde ve dev DB'de aynı davranışı
göstersin.

### 2. Repository upsert

`ProductionRepository`'de: aynı `(tenant_id, work_order_id, date, shift)` için
kayıt varsa **güncelle**, yoksa **oluştur**.

`MachinePlanRepository`'de aynı deseni kurmuştuk (migration 033) — oradaki
uygulamaya bak, tutarlı ol.

Optimistic locking: upsert güncelleme yaptığında `updated_at` kontrolü
uygulanmalı mı? Mevcut desene bak, `machine_plans`'ta nasıl çözüldüyse öyle.

### 3. Frontend

`production.js:129` — `api.create` yerine upsert çağrısı.

Kullanıcıya geri bildirim: aynı üçlü için kayıt varsa **sessizce üzerine
yazma**. Kaydetmeden önce uyar:

> Bu iş emri için 04.09.2026 / Sabah vardiyasında zaten bir kayıt var
> (üretilen: 256). Üzerine yazılsın mı?

Onay verilirse güncelle, verilmezse iptal.

Gerekçe: v78 sessizce üzerine yazıyordu ama bu da veri kaybı riski — operatör
yanlış vardiya seçtiyse önceki kaydı fark etmeden siler. Uyarı ikisini de
önler.

---

## Kapsam dışı

Bu turda **sadece mükerrer kayıt** düzeltiliyor. Şunlar ayrı iş:

- Üretim Girişi'nin plana bağlanması
- Vardiya hedefi (`hedefAdet`) hesabı ve kaydı
- `varsayilanVardiya()` — saate göre otomatik vardiya
- Duruş ve not alanlarının listelerde gösterimi

Bunlar bir sonraki turda, Üretim Girişi'nin v78'e hizalanmasıyla birlikte
gelecek.

---

## Sıra

1. Çakışma sorgusunu ver → ben çalıştırıp sonucu bildireceğim
2. `DESCRIBE production` ile sütun adlarını doğrula
3. Migration `042` (idempotent)
4. Repository upsert
5. Frontend + onay uyarısı
6. `php -l` + `node --check`
7. Ayrı commit, push

Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`. Migration'ı ben çalıştıracağım.
