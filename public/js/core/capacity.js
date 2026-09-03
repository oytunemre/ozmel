// Kapasite çözümleme — Kapasiteler ekranındaki getCapacity()/csOzet mantığının
// paylaşılabilir kopyası. Üretim Planı hedef ön dolumu de bunu kullanır.
// (capacities.js kendi özel kopyasını taşımaya devam ediyor; ileride birleştirilebilir.)

// "HH:MM" → dakika; boş/geçersiz → null.
function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (isFinite(h) && isFinite(m)) ? h * 60 + m : null;
}

// Net günlük çalışma dakikası (Çalışma Saatleri'nden). capacities.csOzet ile birebir:
// (sabah bitiş − başlangıç − molası) + (öğleden sonra aynısı). wh yoksa 0.
export function netWorkMinutes(wh) {
  if (!wh) return 0;
  const seg = (start, end, bs, be) => {
    const s = toMin(start), e = toMin(end);
    if (s == null || e == null) return 0;
    let net = e - s;
    const b1 = toMin(bs), b2 = toMin(be);
    if (b1 != null && b2 != null) net -= (b2 - b1);
    return Math.max(0, net);
  };
  return seg(wh.morningStart, wh.morningEnd, wh.morningBreakStart, wh.morningBreakEnd)
       + seg(wh.afternoonStart, wh.afternoonEnd, wh.afternoonBreakStart, wh.afternoonBreakEnd);
}

// Mola aralıkları (Çalışma Saatleri'nden): sabah molası, öğle arası (sabah bitiş →
// öğleden sonra başlangıç), öğleden sonra molası. Her biri [başlangıç, bitiş] "HH:MM".
export function breakIntervals(wh) {
  if (!wh) return [];
  const out = [];
  if (wh.morningBreakStart && wh.morningBreakEnd) out.push([wh.morningBreakStart, wh.morningBreakEnd]);
  if (wh.morningEnd && wh.afternoonStart) out.push([wh.morningEnd, wh.afternoonStart]);   // öğle arası
  if (wh.afternoonBreakStart && wh.afternoonBreakEnd) out.push([wh.afternoonBreakStart, wh.afternoonBreakEnd]);
  return out;
}

// Duruş süresi (dk) = (bitiş − başlangıç) − molalarla kesişim. Molalar zaten çalışma
// dışı olduğu için duruş sayılmaz (referans v78 durusDakikaHesapla). Eksik/ters → 0.
export function downtimeMinutes(start, end, wh) {
  if (!start || !end) return 0;
  const b1 = toMin(start), b2 = toMin(end);
  if (b1 == null || b2 == null || b2 <= b1) return 0;
  let overlap = 0;
  for (const [as, ae] of breakIntervals(wh)) {
    const a1 = toMin(as), a2 = toMin(ae);
    if (a1 == null || a2 == null) continue;
    const lo = Math.max(b1, a1), hi = Math.min(b2, a2);
    if (hi > lo) overlap += hi - lo;
  }
  return Math.max(0, (b2 - b1) - overlap);
}

// (ürün, iş merkezi, operasyon) kapasitesi (adet/gün). Operasyon tam eşleşme, yoksa
// operasyonsuz (eski) kayda düşer. minutes doluysa çalışma saatlerinden CANLI hesaplanır
// (net dakika / dk-per-adet), yoksa vardiya başı capacityPerShift. Kayıt yoksa null.
export function resolveCapacity(caps, productId, wcId, opId, netMin) {
  let rec = null;
  if (opId != null) rec = caps.find(c => c.productCodeId === productId && c.workCenterId === wcId && c.operationId === opId);
  if (!rec) rec = caps.find(c => c.productCodeId === productId && c.workCenterId === wcId && c.operationId == null) || null;
  if (!rec) return null;
  if (rec.minutes && netMin > 0 && rec.minutes > 0) return Math.floor(netMin / rec.minutes);
  return rec.capacityPerShift ?? null;
}
