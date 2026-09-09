# Claude Code brief — Denetim Soruları modülünün kaldırılması

Müşteri kararı (toplantı notu, madde 6): **Denetim Soruları silinecek.**

Bu modül v78 referansında da yok — veri var ama ekranı yok. v2'ye taşınmış
ama kullanılmıyor.

---

## Kapsam

Veride 561 kayıt var (`denetimSorulari`). Silinecek yerler:

| Katman | Ne |
|---|---|
| Menü | `audits` öğesi (`admin` grubu) |
| Frontend | `public/js/modules/audits.js` |
| Backend | `AuditController`, `AuditRepository`, `Audit` DTO, `AuditValidator` |
| Router | `audits` kaynağı (`public/api/index.php`) |
| ETL | `denetimSorulari` → `audits` dönüşümü |
| Sözlük | `menu.audits` ve `audit.*` anahtarları (TR + EN) |
| Tablo | `audits` — migration ile |

---

## Migration `043_drop_audits.sql`

```sql
DROP TABLE IF EXISTS audits;
```

FK bağı var mı kontrol et — başka tablo `audits`'e referans veriyorsa önce o
temizlenmeli. `SHOW CREATE TABLE` ile bak, raporla.

Idempotent yaz (041 deseni), `INSERT IGNORE INTO schema_migrations` ekle.

---

## Dikkat

**`audits` ile denetim kaydı (audit log) karıştırılmasın.** Bu tablo
"denetim soruları" — bir kontrol listesi. Sistem günlüğü değil.

`created_by` / `updated_by` gibi izleme sütunları başka tablolarda duruyor,
onlara dokunulmayacak.

**Global aramada** `audits` tipi var mı kontrol et (`SearchRepository`) —
varsa çıkar.

**Dashboard** ya da başka bir ekran `audits` okuyor mu kontrol et. Tutarlılık
raporunda geçmiyordu ama emin ol.

**`core/store.js` önbelleğinde** `audits` anahtarı varsa çıkar.

---

## Sıra

1. `audits` tablosuna FK bağı var mı → raporla
2. Migration `043`
3. Kod temizliği (yukarıdaki tablo)
4. ETL'den çıkar
5. Sözlük anahtarlarını sil
6. `php -l` + `node --check`
7. Ayrı commit, push

Migration'ı ben çalıştıracağım. Repo `~/Projects/Ozmel/ozmel`, dal `krc-port`.

---

## Not

561 kayıt yedek dosyalarında duruyor. İleride geri istenirse ETL'e yeniden
eklenebilir — bu yüzden `tools/etl.php`'deki dönüşüm kodunu **silmek yerine
yorum satırına al**, kısa bir açıklamayla:

```php
// Denetim Soruları modülü kaldırıldı (müşteri kararı, Eylül 2026).
// Geri istenirse bu blok ve migration 043 geri alınır.
```
