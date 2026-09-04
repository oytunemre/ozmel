// eta.js — iş emri tahmini bitiş (ETA) hesabı. Referans: v78 workOrderStats.
// Son 7 üretim kaydının günlük ortalamasından kalan gün hesaplanır. Genel Bakış (MRP
// riski) ve gelecekteki İş Emirleri ekranı paylaşır. Tarih hesabı YEREL (report.js).
//
// avgRate yoksa (hiç üretim) opts.fallbackRate (ör. darboğaz kapasitesi) kullanılır.
// Tamamlanmışsa etaDate null (risk yok). production tüm dizidir; workOrderId ile süzülür.

import { startOfDay, addDays } from './report.js';

/**
 * @param {{id:any, targetQuantity:number}} workOrder
 * @param {Array<{workOrderId:any, date:string, actualQuantity:number}>} production
 * @param {{today?:Date, fallbackRate?:number}} [opts]
 * @returns {{produced:number, remaining:number, pct:number, avgRate:number|null,
 *            effRate:number|null, daysNeeded:number|null, etaDate:Date|null, complete:boolean}}
 */
export function estimateCompletion(workOrder, production, { today = null, fallbackRate = null } = {}) {
  const target = Number(workOrder.targetQuantity) || 0;
  const logs = production
    .filter(p => p.workOrderId === workOrder.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const produced = logs.reduce((s, p) => s + (Number(p.actualQuantity) || 0), 0);
  const remaining = Math.max(0, target - produced);
  const pct = target > 0 ? Math.min(100, produced / target * 100) : 0;
  const complete = remaining <= 0 && target > 0;

  const recent = logs.slice(-7);
  const avgRate = recent.length
    ? recent.reduce((s, p) => s + (Number(p.actualQuantity) || 0), 0) / recent.length
    : null;
  const effRate = (avgRate && avgRate > 0) ? avgRate : (fallbackRate && fallbackRate > 0 ? fallbackRate : null);

  const base = startOfDay(today || new Date());
  let etaDate = null, daysNeeded = null;
  if (!complete && effRate) {
    daysNeeded = Math.ceil(remaining / effRate);
    etaDate = addDays(base, daysNeeded);
  }
  return { produced, remaining, pct, avgRate, effRate, daysNeeded, etaDate, complete };
}
