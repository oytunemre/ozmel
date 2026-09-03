// Verimlilik — v2 modülü (yeni ekran). Plan hedefi (machine_plans) ile Üretim
// Girişi'nden kaydedilen gerçekleşenin (production) İŞ EMRİ bazında karşılaştırması.
// Tek soruya odaklı, salt okunur pano: planladığımızı üretebildik mi?
//
// Yalnızca work_order_id DOLU plan satırları girer — "plansız ürün" planları hariç.
// Eşleştirme (tarih, iş emri) üzerinden: gerçekleşen = o (date, workOrderId) için
// production.actualQuantity toplamı; duruş = downtimeMinutes toplamı (mola düşülmüş).
// Satır tıklanınca ilgili iş emri #work-orders?id= ile salt görüntü açılır.
//
// Veri istemcide türetilir (listAll — yeni BE ucu yok). Dönem şeridi / renk eşiği /
// KPI kartı core/report.js'ten paylaşılır (Üretim Raporu ile ortak). i18n: bindLang
// ile dil değişince VERİ ÇEKMEDEN yeniden çizilir; makine/ürün adları sunucudan
// geldiği gibi basılır.

import { resource, request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { downtimeMinutes } from '../core/capacity.js';
import { fmtTr, fmtDuration, fmtDateTR, fmtPct } from '../core/format.js';
import { createPeriodStrip, thresholdClass, kpiCard } from '../core/report.js';

const TARGET_THRESHOLD = 90;   // hedefEsigi: ≥eşik success, ≥eşik−20 warning, altı danger

// Dönem durumu oturum boyu modül düzeyinde (modüle dönünce korunur).
const period = createPeriodStrip('gunluk');

export async function viewVerimlilik(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let centers, products, workOrders, plans, production, wh;
  try {
    centers = await loadLookup('work-centers', mapNamed);
    products = await loadLookup('product-codes', mapProduct);
    workOrders = (await resource('work-orders').listAll()).data;
    plans = (await resource('machine-plans').listAll()).data;
    production = (await resource('production').listAll()).data;
    ({ data: wh } = await request('/working-hours'));
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewVerimlilik(container) }));
    return;
  }
  const woById = new Map(workOrders.map(w => [w.id, w]));

  render();
  bindLang(container, render);

  function compute(dates) {
    const dateSet = new Set(dates);

    // (tarih|iş emri) → gerçekleşen + duruş toplamı. Eşleştirme iş merkezi değil,
    // İŞ EMRİ üzerinden — aynı makinede gün içinde iş emri değişebilir.
    const prodByKey = new Map();
    for (const p of production) {
      if (p.workOrderId == null || !dateSet.has(p.date)) continue;
      const key = p.date + '|' + p.workOrderId;
      const v = prodByKey.get(key) || { actual: 0, downtime: 0 };
      v.actual += Number(p.actualQuantity) || 0;
      v.downtime += downtimeMinutes(p.downtimeStart, p.downtimeEnd, wh);
      prodByKey.set(key, v);
    }

    // Satır birimi: work_order_id DOLU plan kayıtları.
    const rows = plans
      .filter(p => p.workOrderId != null && dateSet.has(p.date))
      .map(p => {
        const wo = woById.get(p.workOrderId) || {};
        const m = prodByKey.get(p.date + '|' + p.workOrderId) || { actual: 0, downtime: 0 };
        const planned = Number(p.targetQuantity) || 0;
        return {
          date: p.date,
          wcId: p.workCenterId ?? wo.workCenterId ?? null,
          productCodeId: p.productCodeId ?? wo.productCodeId ?? null,
          woNo: [wo.woNo, wo.splitLabel].filter(Boolean).join(' · ') || ('#' + p.workOrderId),
          workOrderId: p.workOrderId,
          planned, actual: m.actual, downtime: m.downtime,
          pct: planned > 0 ? Math.round(m.actual / planned * 100) : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date)
        || centers.label(a.wcId).localeCompare(centers.label(b.wcId), 'tr'));

    const totalPlan = rows.reduce((s, r) => s + r.planned, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    const totalDowntime = rows.reduce((s, r) => s + r.downtime, 0);
    const overallPct = totalPlan > 0 ? Math.round(totalActual / totalPlan * 100) : null;

    return { rows, totalPlan, totalActual, totalDowntime, overallPct };
  }

  function render() {
    const dates = period.dates();
    const d = compute(dates);
    const empty = d.rows.length === 0;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.verimlilik'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('vr.subtitle'))}</div>
        </div>
      </div>

      ${period.barHTML(dates)}

      ${empty ? emptyState(period.title(dates)) : `
        <div class="kpis" style="margin-top:16px;">
          ${kpiCard({ title: t('vr.kpiPlanned'), value: fmtTr(d.totalPlan, '0'), cls: 'accent', detail: t('vr.kpiPlannedFoot', { n: fmtTr(d.rows.length, '0') }) })}
          ${kpiCard({ title: t('vr.kpiActual'), value: fmtTr(d.totalActual, '0'), cls: 'accent', detail: t('vr.kpiActualFoot') })}
          ${kpiCard({ title: t('vr.kpiOverall'), value: d.overallPct !== null ? fmtPct(d.overallPct) : '—', cls: thresholdClass(d.overallPct, TARGET_THRESHOLD), detail: t('vr.kpiThreshold', { n: TARGET_THRESHOLD }) })}
          ${kpiCard({ title: t('vr.kpiDowntime'), value: fmtDuration(d.totalDowntime), cls: d.totalDowntime > 0 ? 'warning' : 'success', style: 'font-size:24px;', detail: d.totalDowntime > 0 ? t('vr.downtimeYes') : t('vr.downtimeNo') })}
        </div>

        <div class="panel" style="margin-top:20px;">
          <div class="panel-head">
            <h3>${esc(t('vr.tableTitle'))}</h3>
            <span class="sub">${esc(t('vr.tableSub'))}</span>
          </div>
          <div class="table-wrap"><table class="table ur-table vr-table">
            <thead><tr>
              <th>${esc(t('ur.colDate'))}</th>
              <th>${esc(t('ur.colMachine'))}</th>
              <th>${esc(t('vr.colProductWo'))}</th>
              <th class="num">${esc(t('ur.colPlan'))}</th>
              <th class="num">${esc(t('ur.colActual'))}</th>
              <th class="num">%</th>
              <th class="num">${esc(t('ur.colDowntimeCol'))}</th>
            </tr></thead>
            <tbody>${d.rows.map(r => `<tr class="vr-row" data-wo="${esc(r.workOrderId)}">
              <td class="mono">${esc(fmtDateTR(r.date))}</td>
              <td>${esc(centers.label(r.wcId))}</td>
              <td>
                <div class="mono">${esc(products.byId.get(r.productCodeId)?.code || '—')}</div>
                <div class="vr-wo">${esc(r.woNo)}</div>
              </td>
              <td class="mono num">${esc(fmtTr(r.planned))}</td>
              <td class="mono num">${esc(fmtTr(r.actual))}</td>
              <td class="num">${r.pct !== null ? pctBadge(r.pct) : '—'}</td>
              <td class="mono num">${esc(fmtDuration(r.downtime))}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>
      `}
    `;

    period.bind(container, render);
    container.querySelectorAll('.vr-row').forEach(tr =>
      tr.addEventListener('click', () => { location.hash = `#work-orders?id=${tr.dataset.wo}`; }));
  }

  // Boş hal — dönemde iş emrine bağlı planlanmış kayıt yoksa tablo/KPI yerine.
  function emptyState(periodTitle) {
    return `
      <div class="panel vr-empty" style="margin-top:20px;">
        <div class="vr-empty-mark"></div>
        <div class="vr-empty-title">${esc(t('vr.emptyTitle'))}</div>
        <p class="vr-empty-msg">${esc(t('vr.emptyBody', { period: periodTitle }))}</p>
      </div>`;
  }

  function pctBadge(n) {
    const cls = n >= TARGET_THRESHOLD ? 'tag-success' : n >= TARGET_THRESHOLD - 20 ? 'tag-warn' : 'tag-danger';
    return `<span class="tag ${cls}">${esc(fmtPct(n))}</span>`;
  }
}
