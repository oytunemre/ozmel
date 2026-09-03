// Genel Üretim Raporu — v2 modülü (yeni ekran). Referans mantık: v78 viewUretimRaporu.
// Salt okunur pano: dönem (günlük/haftalık/aylık) seçilir; 4 KPI, otomatik uyarılar,
// duruş nedeni Pareto'su, makine/ürün özetleri, günlük trend.
//
// Veri istemcide türetilir (listAll — yeni BE ucu yok): production + machine_plans +
// work_orders + work_centers + product_codes + downtime_reasons + working_hours.
// Plan hedefi machine_plans'tan, gerçekleşen production.actualQuantity'den; eşleştirme
// (tarih, iş merkezi) üzerinden (production → work_order → work_center).
//
// i18n: özel görünüm — bindLang ile dil değişince VERİ ÇEKMEDEN yeniden çizilir
// (dönem/mod closure'da korunur). Makine/ürün/neden adları sunucudan geldiği gibi basılır.

import { resource, request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { toast } from '../core/toast.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { downtimeMinutes } from '../core/capacity.js';
import { fmtTr, fmtDuration, fmtDateTR, fmtPct } from '../core/format.js';
import { createPeriodStrip, thresholdClass, kpiCard, DAY_NAMES, fmtISO } from '../core/report.js';

const TARGET_THRESHOLD = 90;   // hedefEsigi: ≥eşik success, ≥eşik−20 warning, altı danger

// Dönem durumu oturum boyu modül düzeyinde (modüle dönünce korunur).
const period = createPeriodStrip('gunluk');

export async function viewUretimRaporu(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let centers, products, reasons, workOrders, plans, production, wh;
  try {
    centers = await loadLookup('work-centers', mapNamed);
    products = await loadLookup('product-codes', mapProduct);
    reasons = await loadLookup('downtime-reasons', mapNamed);
    workOrders = (await resource('work-orders').listAll()).data;
    plans = (await resource('machine-plans').listAll()).data;
    production = (await resource('production').listAll()).data;
    ({ data: wh } = await request('/working-hours'));
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewUretimRaporu(container) }));
    return;
  }
  const woById = new Map(workOrders.map(w => [w.id, w]));

  render();
  bindLang(container, render);

  function compute(dates) {
    const dateSet = new Set(dates);
    const recs = production.filter(p => dateSet.has(p.date)).map(p => {
      const wo = woById.get(p.workOrderId) || {};
      return {
        date: p.date,
        wcId: wo.workCenterId ?? null,
        productCodeId: wo.productCodeId ?? null,
        actual: Number(p.actualQuantity) || 0,
        scrap: Number(p.scrapQuantity) || 0,
        downtime: downtimeMinutes(p.downtimeStart, p.downtimeEnd, wh),
        reasonId: p.downtimeReasonId ?? null,
      };
    });
    const planRows = plans.filter(p => dateSet.has(p.date));

    const totalActual = recs.reduce((s, r) => s + r.actual, 0);
    const totalScrap = recs.reduce((s, r) => s + r.scrap, 0);
    const totalPlan = planRows.reduce((s, p) => s + (Number(p.targetQuantity) || 0), 0);
    const totalDowntime = recs.reduce((s, r) => s + r.downtime, 0);
    const scrapPct = (totalActual + totalScrap) > 0 ? totalScrap / (totalActual + totalScrap) * 100 : 0;
    const overallPct = totalPlan > 0 ? Math.round(totalActual / totalPlan * 100) : null;

    // Pareto: duruş süresi neden bazında
    const byReason = new Map();
    for (const r of recs) {
      if (r.downtime <= 0) continue;
      const key = r.reasonId != null ? (reasons.byId.get(r.reasonId)?.name || ('#' + r.reasonId)) : t('ur.unspecified');
      byReason.set(key, (byReason.get(key) || 0) + r.downtime);
    }
    let cum = 0;
    const pareto = [...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([reason, dk]) => {
      const pct = totalDowntime > 0 ? dk / totalDowntime * 100 : 0;
      cum += pct;
      return { reason, dk, pct, cum };
    });
    const reasonCount = byReason.size;

    // Makine / ürün / gün aggregatları
    const agg = (keyOf) => {
      const m = new Map();
      const get = (k) => { if (!m.has(k)) m.set(k, { actual: 0, scrap: 0, downtime: 0, plan: 0 }); return m.get(k); };
      for (const r of recs) { const k = keyOf.rec(r); if (k == null) continue; const v = get(k); v.actual += r.actual; v.scrap += r.scrap; v.downtime += r.downtime; }
      for (const p of planRows) { const k = keyOf.plan(p); if (k == null) continue; get(k).plan += Number(p.targetQuantity) || 0; }
      return m;
    };
    const machineAgg = agg({ rec: r => r.wcId, plan: p => p.workCenterId });
    const productAgg = agg({ rec: r => r.productCodeId, plan: p => p.productCodeId });

    const machineRows = [...machineAgg.entries()].map(([wcId, v]) => ({
      label: centers.label(wcId), ...v, pct: v.plan > 0 ? Math.round(v.actual / v.plan * 100) : null,
    })).sort((a, b) => b.downtime - a.downtime);
    const productRows = [...productAgg.entries()].map(([pid, v]) => ({
      label: products.byId.get(pid)?.code || ('#' + pid), ...v, pct: v.plan > 0 ? Math.round(v.actual / v.plan * 100) : null,
    })).sort((a, b) => b.actual - a.actual);

    const trend = dates.map(d => {
      const dr = recs.filter(r => r.date === d);
      const actual = dr.reduce((s, r) => s + r.actual, 0);
      const downtime = dr.reduce((s, r) => s + r.downtime, 0);
      const plan = planRows.filter(p => p.date === d).reduce((s, p) => s + (Number(p.targetQuantity) || 0), 0);
      return { date: d, actual, plan, downtime, pct: plan > 0 ? Math.round(actual / plan * 100) : null };
    });

    // Dikkat edilmesi gereken noktalar
    const warns = [];
    if (overallPct !== null && overallPct < 80) warns.push(t('ur.warnOverall', { n: overallPct }));
    if (scrapPct > 3) warns.push(t('ur.warnScrap', { n: fmtPct(scrapPct).replace('%', '') }));
    if (pareto.length && pareto[0].pct >= 40) warns.push(t('ur.warnSingleReason', { n: Math.round(pareto[0].pct), reason: pareto[0].reason }));
    const missingReason = recs.filter(r => r.downtime > 0 && r.reasonId == null).length;
    if (missingReason > 0) warns.push(t('ur.warnMissingReason', { n: missingReason }));
    for (const m of machineRows) if (m.pct !== null && m.pct < 70) warns.push(t('ur.warnMachine', { name: m.label, n: m.pct }));

    return { recCount: recs.length, totalActual, totalScrap, totalPlan, totalDowntime, scrapPct, overallPct,
      reasonCount, pareto, machineRows, productRows, trend, warns };
  }

  function render() {
    const dates = period.dates();
    const todayISO = fmtISO(new Date());
    const d = compute(dates);

    const scrapCls = d.scrapPct <= 2 ? 'success' : d.scrapPct <= 5 ? 'warning' : 'danger';
    const overCls = thresholdClass(d.overallPct, TARGET_THRESHOLD);
    const downCls = d.totalDowntime > 0 ? 'warning' : 'success';

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.uretim-raporu'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('ur.subtitle'))}</div>
        </div>
        <button class="btn btn-secondary" id="ur-export">${esc(t('ur.export'))}</button>
      </div>

      ${period.barHTML(dates)}

      <div class="kpis" style="margin-top:16px;">
        ${kpiCard({ title: t('ur.kpiProduced'), value: fmtTr(d.totalActual, '0'), cls: 'accent', detail: t('ur.kpiPlannedFoot', { n: fmtTr(d.totalPlan, '0') }) })}
        ${kpiCard({ title: t('ur.kpiScrap'), value: fmtPct(d.scrapPct), cls: scrapCls, detail: t('ur.kpiScrapFoot', { n: fmtTr(d.totalScrap, '0') }) })}
        ${kpiCard({ title: t('ur.kpiOverall'), value: d.overallPct !== null ? fmtPct(d.overallPct) : '—', cls: overCls, detail: t('ur.kpiRecordsFoot', { n: fmtTr(d.recCount, '0') }) })}
        ${kpiCard({ title: t('ur.kpiDowntime'), value: fmtDuration(d.totalDowntime), cls: downCls, style: 'font-size:24px;', detail: t('ur.kpiReasonsFoot', { n: fmtTr(d.reasonCount, '0') }) })}
      </div>

      ${d.warns.length ? `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-head"><h3>${esc(t('ur.attention'))}</h3></div>
        <div class="panel-body" style="padding:0;">
          ${d.warns.map(w => `<div class="ur-warn"><span class="ur-warn-ic">⚠</span><span>${esc(w)}</span></div>`).join('')}
        </div>
      </div>` : ''}

      ${d.pareto.length ? `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-head"><h3>${esc(t('ur.paretoTitle'))}</h3><span class="sub">${esc(t('ur.paretoSub'))}</span></div>
        <div class="table-wrap"><table class="table ur-table">
          <thead><tr><th>${esc(t('ur.colReason'))}</th><th class="num">${esc(t('ur.colDuration'))}</th><th class="num">${esc(t('ur.colShare'))}</th><th class="num">${esc(t('ur.colCumulative'))}</th><th class="ur-barcol"></th></tr></thead>
          <tbody>${d.pareto.map(n => `<tr>
            <td>${esc(n.reason)}</td>
            <td class="mono num">${esc(fmtDuration(n.dk))}</td>
            <td class="mono num">${esc(fmtPct(n.pct))}</td>
            <td class="mono num">${esc(fmtPct(n.cum))}</td>
            <td class="ur-barcol"><div class="ur-bar-track"><i style="width:${Math.max(n.pct, 1)}%; background:${n.cum <= 80 ? 'var(--color-danger)' : 'var(--color-neutral-400)'};"></i></div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

      ${d.machineRows.length ? summaryTable(t('ur.machineTitle'), t('ur.machineSub'), t('ur.colMachine'), d.machineRows) : ''}
      ${d.productRows.length ? summaryTable(t('ur.productTitle'), '', t('ur.colProduct'), d.productRows) : ''}

      ${d.trend.some(g => g.plan > 0 || g.actual > 0) ? trendPanel(d.trend, todayISO) : ''}

      ${d.recCount === 0 ? `<div class="panel"><div class="panel-body text-muted">${esc(t('ur.noData'))}</div></div>` : ''}
    `;

    // olaylar
    container.querySelector('#ur-export').addEventListener('click', () => toast(t('ur.exportSoon'), 'info'));
    period.bind(container, render);
  }

  // Özet tablosu (makine / ürün): İLK · PLAN · GERÇEK · % · FİRE · DURUŞ
  function summaryTable(title, sub, firstCol, rows) {
    return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-head"><h3>${esc(title)}</h3>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>
      <div class="table-wrap"><table class="table ur-table">
        <thead><tr><th>${esc(firstCol)}</th><th class="num">${esc(t('ur.colPlan'))}</th><th class="num">${esc(t('ur.colActual'))}</th><th class="num">%</th><th class="num">${esc(t('ur.colScrapCol'))}</th><th class="num">${esc(t('ur.colDowntimeCol'))}</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${esc(r.label)}</td>
          <td class="mono num">${esc(fmtTr(r.plan))}</td>
          <td class="mono num">${esc(fmtTr(r.actual))}</td>
          <td class="num">${r.pct !== null ? pctBadge(r.pct) : '—'}</td>
          <td class="mono num">${esc(fmtTr(r.scrap))}</td>
          <td class="mono num">${esc(fmtDuration(r.downtime))}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  // Günlük trend: TARİH(+gün) · PLAN · GERÇEK · % · DURUŞ + satır içi çubuk (dikey çizgi = plan)
  function trendPanel(trend, todayISO) {
    const maxVal = Math.max(1, ...trend.map(g => Math.max(g.actual, g.plan)));
    return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-head"><h3>${esc(t('ur.trendTitle'))}</h3></div>
      <div class="table-wrap"><table class="table ur-table">
        <thead><tr><th>${esc(t('ur.colDate'))}</th><th class="num">${esc(t('ur.colPlan'))}</th><th class="num">${esc(t('ur.colActual'))}</th><th class="num">%</th><th class="num">${esc(t('ur.colDowntimeCol'))}</th><th class="ur-barcol"></th></tr></thead>
        <tbody>${trend.map(g => `<tr${g.date === todayISO ? ' class="ur-today-row"' : ''}>
          <td class="mono">${esc(fmtDateTR(g.date))} <span class="ur-dayname">${esc(DAY_NAMES()[new Date(g.date + 'T00:00:00').getDay()])}</span></td>
          <td class="mono num">${esc(fmtTr(g.plan))}</td>
          <td class="mono num">${esc(fmtTr(g.actual))}</td>
          <td class="num">${g.pct !== null ? pctBadge(g.pct) : '—'}</td>
          <td class="mono num">${esc(fmtDuration(g.downtime))}</td>
          <td class="ur-barcol"><div class="ur-trend-track"><i style="width:${g.actual / maxVal * 100}%;"></i><b style="left:${Math.min(g.plan / maxVal * 100, 100)}%;"></b></div></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="ur-note">${esc(t('ur.trendNote'))}</div>
    </div>`;
  }

  function pctBadge(n) {
    const cls = n >= TARGET_THRESHOLD ? 'tag-success' : n >= TARGET_THRESHOLD - 20 ? 'tag-warn' : 'tag-danger';
    return `<span class="tag ${cls}">${esc(fmtPct(n))}</span>`;
  }
}
