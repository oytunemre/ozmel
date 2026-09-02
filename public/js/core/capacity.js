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
