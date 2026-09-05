// store.js — oturum-içi veri önbelleği (nadiren değişen tablolar için).
//
// Amaç: aynı sabit tabloyu her ekranda yeniden çekmemek. İlk istekte ağdan gelir,
// sonra bellekten döner. UÇUŞ-ANI DEDUP: aynı kaynağa aynı anda iki çağrı gelirse
// tek istek gider, ikincisi aynı Promise'e abone olur.
//
// KRİTİK — geçersiz kılma: her YAZMA (POST) sonrası ilgili kaynak(lar) düşürülür.
// api.js bunu her write'ta OTOMATİK çağırır (çağıranın hatırlaması gerekmez). Yanlış/
// eksik geçersiz kılma SESSİZ hata doğurur (kullanıcı kayıt ekler, listede görmez) —
// bu yüzden emin olunmayan yerde geniş davranıp bağımlıları da düşürüyoruz.
//
// Önbellek modül düzeyinde (sayfa ömrü boyu). Sayfa yenilenince sıfırlanır — bu yüzden
// ETL (CLI, tarayıcı dışı) sonrası kullanıcının tek yapması gereken sayfayı yenilemek;
// uygulama içinden toplu bir işlem eklenirse invalidateAll() çağrılmalı.

// Yalnız NADİREN değişen tablolar önbelleklenir. orders/work-orders/production/
// machine-plans SIK değişir → önbelleklenmez (her açılışta taze).
const CACHEABLE_LIST = new Set([
  'product-codes', 'work-centers', 'operations', 'terms', 'task-people',
  'downtime-reasons', 'routes', 'capacities',
]);
const CACHEABLE_GET = new Set(['/working-hours', '/order-statuses']);

// Yazma bağımlılık haritası: bir kaynağa yazınca DÜŞÜRÜLECEK kaynaklar.
// (Önbelleklenmeyen kaynağı düşürmek zararsız no-op'tur; ileride önbelleğe alınırsa
//  doğru kalsın diye ve niyeti belgelemek için tam liste tutulur.)
const WRITE_DEPS = {
  // İş emri açma/değiştirme siparişin ilerleme/durumunu etkiler.
  'work-orders':   ['work-orders', 'orders'],
  // Üretim girişi iş emrinin üretilen/ilerleme değerini değiştirir.
  'production':    ['production', 'work-orders'],
  // Sipariş değişince bağlı iş emri görünümü de tazelensin.
  'orders':        ['orders', 'work-orders'],
  // Plan; Verimlilik ve Üretim Panosu bunu okur.
  'machine-plans': ['machine-plans'],
  // FK ETİKETLERİ: ürün/iş merkezi/operasyon adı rota ve kapasite kayıtlarında görünür → bayatlar.
  'product-codes': ['product-codes', 'routes', 'capacities'],
  'work-centers':  ['work-centers', 'routes', 'capacities'],
  'operations':    ['operations', 'routes', 'capacities'],
  // Rota ↔ kapasite darboğaz bağı çift yönlü.
  'routes':        ['routes', 'capacities'],
  'capacities':    ['capacities', 'routes'],
  'working-hours': ['working-hours'],
  // Diğerleri (control-plans, quality-measurements, first-off-*, hourly-*, tasks,
  // task-people, terms, downtime-reasons, sites, purchase-*, audits, users): kendisi (fallback).
};

const _cache = new Map();   // 'list:<name>' | 'get:<path>' -> Promise<{data,meta}>

export const isCacheableList = (name) => CACHEABLE_LIST.has(name);
export const isCacheableGet = (path) => CACHEABLE_GET.has(path);

/** Önbellekli getir: varsa döndür; uçuşta varsa ona abone ol; yoksa fetcher()'ı çalıştır. */
export function cached(key, fetcher) {
  if (_cache.has(key)) return _cache.get(key);
  const p = fetcher();
  _cache.set(key, p);
  // Hata olursa önbellekten düş — sonraki çağrı yeniden denesin (bayat hata takılmasın).
  p.catch(() => { if (_cache.get(key) === p) _cache.delete(key); });
  return p;
}

/** Tek kaynağı (+ singleton GET'ini) düşür. */
export function invalidate(name) {
  _cache.delete('list:' + name);
  _cache.delete('get:/' + name);
}

/** Bir YAZMA yolundan ('/work-orders/12?op=guncelle' vb.) etkilenen tüm kaynakları düşür. */
export function invalidateWrite(path) {
  const name = String(path).replace(/^\//, '').split(/[/?]/)[0];
  const deps = WRITE_DEPS[name] || [name];
  for (const d of deps) invalidate(d);
}

/** Tüm önbelleği temizle (ETL / uygulama içi toplu işlem sonrası). */
export function invalidateAll() { _cache.clear(); }
