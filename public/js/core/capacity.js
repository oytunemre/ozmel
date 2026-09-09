// Kapasite çözümleme — Kapasiteler ekranındaki getCapacity()/csOzet mantığının
// paylaşılabilir kopyası. Üretim Planı hedef ön dolumu de bunu kullanır.
// (capacities.js kendi özel kopyasını taşımaya devam ediyor; ileride birleştirilebilir.)

// "HH:MM" → dakika; boş/geçersiz → null.
function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (isFinite(h) && isFinite(m)) ? h * 60 + m : null;
}

// Bir vardiya diliminin net dakikası: (bitiş − başlangıç) − molası. Eksik/geçersiz → 0.
function segMinutes(start, end, bs, be) {
  const s = toMin(start), e = toMin(end);
  if (s == null || e == null) return 0;
  let net = e - s;
  const b1 = toMin(bs), b2 = toMin(be);
  if (b1 != null && b2 != null) net -= (b2 - b1);
  return Math.max(0, net);
}

// Net günlük çalışma dakikası (Çalışma Saatleri'nden). capacities.csOzet ile birebir:
// (sabah bitiş − başlangıç − molası) + (öğleden sonra aynısı). wh yoksa 0.
export function netWorkMinutes(wh) {
  if (!wh) return 0;
  return segMinutes(wh.morningStart, wh.morningEnd, wh.morningBreakStart, wh.morningBreakEnd)
       + segMinutes(wh.afternoonStart, wh.afternoonEnd, wh.afternoonBreakStart, wh.afternoonBreakEnd);
}

// Vardiya kırılımı: günlük net dakikayı vardiyalara böler. netWorkMinutes ile aynı segment
// mantığı — her vardiyayı ayrı döndürür. Üretim Girişi'nin vardiya hedefi bunu kullanır
// (referans v78 vardiyaHedefiHesapla; sabit oran DEĞİL, Çalışma Saatleri'nden CANLI).
// Vardiya anahtarları production.shift enum'uyla birebir ('Sabah', 'Öğleden Sonra').
export function shiftWorkMinutes(wh) {
  const morning = wh ? segMinutes(wh.morningStart, wh.morningEnd, wh.morningBreakStart, wh.morningBreakEnd) : 0;
  const afternoon = wh ? segMinutes(wh.afternoonStart, wh.afternoonEnd, wh.afternoonBreakStart, wh.afternoonBreakEnd) : 0;
  return { 'Sabah': morning, 'Öğleden Sonra': afternoon, total: morning + afternoon };
}

// Bir vardiyanın günlük net süredeki payı (0–1). Toplam 0 ya da bilinmeyen vardiya → 0.
export function shiftRatio(wh, shift) {
  const m = shiftWorkMinutes(wh);
  return m.total > 0 && m[shift] ? m[shift] / m.total : 0;
}

// Günlük hedefin vardiyaya orantılı payı (adet). Hedef/oran yoksa null (kartta '—').
export function shiftTarget(wh, shift, dailyTarget) {
  if (dailyTarget == null || dailyTarget === '') return null;
  const r = shiftRatio(wh, shift);
  if (!r) return null;
  return Math.round(Number(dailyTarget) * r);
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
