// bottleneck.js — kapasite çözümleme + darboğaz + veri kontrolü uyarıları.
// Kapasiteler ekranından (capacities.js) çıkarıldı; Kapasiteler + Genel Bakış paylaşır.
// Davranış birebir korunur: tek fark, günlük net dakika artık ortak
// core/capacity.js:netWorkMinutes'ten gelir (capacities.js'teki csOzet(wh).total ile
// aynı değer). Mesaj metinleri t() ile; label'lar çağıranın lookup'larından.
//
// caps/routes değişebilir (Kapasiteler ekranı düzenleyip reload eder) — bu yüzden
// createCapacityHelpers caps/routes'u DİZİ ya da GETİRİCİ (() => dizi) olarak kabul eder;
// getirici verilirse her çağrıda güncel veriyi okur (bayat referans olmaz).

import { netWorkMinutes } from './capacity.js';

// sequence -> [routes], sayısal sıraya göre (referans groupBySeq).
export function groupBySeq(rows) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.sequence)) m.set(r.sequence, []); m.get(r.sequence).push(r); }
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * @param {{caps: array|function, routes: array|function, wh: object|function,
 *          products: object, ops: object, centers: object, t: function}} deps
 *   products/ops/centers: loadLookup sonucu (label() sağlar). t: i18n.
 */
export function createCapacityHelpers({ caps, routes, wh, products, ops, centers, t }) {
  const getCaps = typeof caps === 'function' ? caps : () => caps;
  const getRoutes = typeof routes === 'function' ? routes : () => routes;
  const getWh = typeof wh === 'function' ? wh : () => wh;

  // Kapasite çözümleme (referans getCapacity: operasyon tam eşleşme, yoksa operasyonsuz).
  // Dakika/adet girilmişse kapasite HER ZAMAN o anki çalışma saatlerinden canlı hesaplanır.
  function getCapacity(productId, wcId, opId) {
    const cs = getCaps();
    let rec = null;
    if (opId != null) rec = cs.find(c => c.productCodeId === productId && c.workCenterId === wcId && c.operationId === opId);
    if (!rec) rec = cs.find(c => c.productCodeId === productId && c.workCenterId === wcId && c.operationId == null) || null;
    if (!rec) return null;
    let capacity = rec.capacityPerShift;
    if (rec.minutes) {
      const total = netWorkMinutes(getWh());
      if (total > 0 && rec.minutes > 0) capacity = Math.floor(total / rec.minutes);
    }
    return { ...rec, capacity };
  }

  // Ürünün darboğazı: her sıradaki aktif adımın kapasitesi; en düşük olan darboğaz.
  function productBottleneck(productId) {
    const bySeq = groupBySeq(getRoutes().filter(r => r.productCodeId === productId));
    let bottleneck = null;
    const missing = [];
    for (const [seq, group] of bySeq) {
      const active = group.find(g => g.isActive) || group[0];
      const cap = getCapacity(productId, active.workCenterId, active.operationId);
      if (!cap) { missing.push({ seq, active }); continue; }
      if (bottleneck === null || cap.capacity < bottleneck.capacity) {
        bottleneck = { seq, workCenterId: active.workCenterId, operationId: active.operationId, capacity: cap.capacity };
      }
    }
    return { bottleneck, missing, stepCount: bySeq.size };
  }

  // Veri kontrolü uyarıları: duplicate (aynı ürün/wc/op >1 kayıt) · orphan (kapasite var
  // ama rota adımı yok) · missing (rota adımı var ama kapasite tanımsız).
  function computeDataWarnings() {
    const cs = getCaps(), rs = getRoutes();
    const warnings = [];
    const seen = new Map();
    for (const c of cs) {
      const k = `${c.productCodeId}|${c.workCenterId}|${c.operationId ?? ''}`;
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(c);
    }
    for (const list of seen.values()) {
      if (list.length > 1) {
        const c0 = list[0];
        warnings.push({ type: 'duplicate', productCodeId: c0.productCodeId,
          msg: t('cap.warnDuplicateMsg', { product: products.label(c0.productCodeId), wc: centers.label(c0.workCenterId), n: list.length }) });
      }
    }
    for (const c of cs) {
      const used = rs.some(r => r.productCodeId === c.productCodeId && r.workCenterId === c.workCenterId
        && (c.operationId == null || r.operationId === c.operationId));
      if (!used) {
        const opTxt = c.operationId != null ? ` (${ops.label(c.operationId)})` : '';
        warnings.push({ type: 'orphan', productCodeId: c.productCodeId, capId: c.id,
          msg: t('cap.warnOrphanMsg', { product: products.label(c.productCodeId), wc: centers.label(c.workCenterId), op: opTxt }) });
      }
    }
    for (const r of rs) {
      if (getCapacity(r.productCodeId, r.workCenterId, r.operationId)) continue;
      const activeTxt = r.isActive ? t('cap.activeSuffix') : '';
      warnings.push({ type: 'missing', productCodeId: r.productCodeId,
        msg: t('cap.warnMissingMsg', { product: products.label(r.productCodeId), wc: centers.label(r.workCenterId), op: ops.label(r.operationId), active: activeTxt }) });
    }
    return warnings;
  }

  return { getCapacity, productBottleneck, computeDataWarnings };
}
