// Genel Bakış v2 — SALT OKUNUR pano. Tasarım: Genel-Bakis-v2.dc.html.
// Veri istemcide türetilir (listAll — GET /dashboard artık kullanılmıyor; DashboardRepository
// dokunulmadı, dışarıdan çağıran olabilir diye bırakıldı). Bölümler:
//   1) 5 KPI  2) Geciken Görevler  3) Ürün Bazlı Darboğaz  4) Üretim Takibi (MRP) Özeti
//
// KAPSAM DIŞI (modül yok): Tedarikçi Sitesi + Parça KPI'ları ve Tedarikçi Dağılımı—Ülke.
// `sites`/`parts` modülleri eklenince o iki KPI ve Ülke bölümü geri konur; yerlerine
// şimdilik Aktif Sipariş + Açık İş Emri KPI'ları var.
//
// Ortak hesaplar core/ katmanından: darboğaz + kapasite uyarısı (bottleneck.js), ETA (eta.js).
// i18n: dil değişince VERİ ÇEKMEDEN yeniden çizilir (bindLang; veri closure'da).

import { resource, request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDateTR } from '../core/format.js';
import { fmtISO, parseISO, startOfDay } from '../core/report.js';
import { createCapacityHelpers } from '../core/bottleneck.js';
import { estimateCompletion } from '../core/eta.js';

const OVERDUE_ROWS = 6;   // geciken görev tablosunda gösterilen satır (fazlası alt notta)
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const isOpenOrder = (o) => o.status !== 'İptal' && o.status !== 'Tamamlandı';

// product-codes lookup + risk3 için gereken alanlar (tip/ağırlık/çıkan operasyon).
const mapProdFull = (r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, materialWeight: r.materialWeight, outgoingOperationId: r.outgoingOperationId });

export async function viewDashboard(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let products, centers, ops, people, orders, workOrders, tasks, caps, routes, production,
      trees, receipts, requests, inspections, wh;
  try {
    [products, centers, ops, people] = await Promise.all([
      loadLookup('product-codes', mapProdFull),
      loadLookup('work-centers', mapNamed),
      loadLookup('operations', mapNamed),
      loadLookup('task-people', mapNamed),
    ]);
    orders = (await resource('orders').listAll()).data;
    workOrders = (await resource('work-orders').listAll()).data;
    tasks = (await resource('tasks').listAll()).data;
    caps = (await resource('capacities').listAll()).data;
    routes = (await resource('routes').listAll()).data;
    production = (await resource('production').listAll()).data;
    // Risk 3 (hammadde eksiği) — Stok Durumu'ndaki net stok mantığı:
    trees = (await resource('product-trees').listAll()).data;
    receipts = (await resource('purchase-receipts').listAll()).data;
    requests = (await resource('purchase-requests').listAll()).data;
    inspections = (await resource('incoming-inspections').listAll()).data;
    ({ data: wh } = await request('/working-hours'));   // dakika/adet kapasiteleri canlı hesaplansın (capacities.js ile birebir)
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewDashboard(container) }));
    return;
  }

  const woById = new Map(workOrders.map(w => [w.id, w]));
  const orderById = new Map(orders.map(o => [o.id, o]));
  const wosByOrder = new Map();
  for (const w of workOrders) { if (!wosByOrder.has(w.orderId)) wosByOrder.set(w.orderId, []); wosByOrder.get(w.orderId).push(w); }

  const { productBottleneck, computeDataWarnings } = createCapacityHelpers({
    caps, routes, wh, products, ops, centers, t,
  });

  // Risk 3: net stoğu negatif hammaddeyi kullanan bitmiş ürünler (BOM üzerinden). Stok
  // Durumu ekranındaki hesabın küçük kopyası (ileride ortak yardımcıya çıkarılabilir).
  const shortProducts = computeShortProducts();

  render();
  bindLang(container, render);

  function computeShortProducts() {
    const nodeById = new Map(trees.map(n => [n.id, n]));
    const rootProductOf = (n) => { let c = n, g = 0; while (c && c.parentId != null && nodeById.has(c.parentId) && g++ < 100) c = nodeById.get(c.parentId); return c; };
    const multFromRoot = (n) => { let m = 1, c = n, g = 0; while (c && c.parentId != null && nodeById.has(c.parentId) && g++ < 100) { const q = Number(c.unitQuantity); m *= (q > 0 ? q : 1); c = nodeById.get(c.parentId); } return m; };
    const rawToProducts = new Map();
    const add = (raw, F, m) => { if (raw == null || F == null) return; if (!rawToProducts.has(raw)) rawToProducts.set(raw, new Map()); const mm = rawToProducts.get(raw); mm.set(F, (mm.get(F) || 0) + m); };
    for (const n of trees) {
      const F = rootProductOf(n)?.productCodeId, m = multFromRoot(n);
      if (n.materialCodeId != null) add(n.materialCodeId, F, m);
      if (n.parentId != null && products.byId.get(n.productCodeId)?.type === 'Hammadde') add(n.productCodeId, F, m);
    }
    let cutting = new Set(ops.rows.filter(o => /kesim|cutting/i.test(o.name || '')).map(o => o.id));
    if (cutting.size === 0) for (const p of products.rows) if (p.type === 'Hammadde' && p.outgoingOperationId != null) cutting.add(p.outgoingOperationId);
    const cutByProduct = new Map();
    for (const p of production) {
      const wo = woById.get(p.workOrderId); if (!wo || !cutting.has(wo.operationId)) continue;
      const ord = orderById.get(wo.orderId); if (!ord) continue;
      cutByProduct.set(ord.productCodeId, (cutByProduct.get(ord.productCodeId) || 0) + (Number(p.actualQuantity) || 0));
    }
    const approved = new Set(inspections.filter(i => i.overallResult === 'Uygun' && i.purchaseReceiptId != null).map(i => i.purchaseReceiptId));
    const reqById = new Map(requests.map(r => [r.id, r]));
    const gelenByMat = new Map();
    for (const rc of receipts) {
      if (!approved.has(rc.id)) continue;
      const req = reqById.get(rc.purchaseRequestId); if (!req || req.materialCodeId == null) continue;
      gelenByMat.set(req.materialCodeId, (gelenByMat.get(req.materialCodeId) || 0) + (Number(rc.quantity) || 0));
    }
    const short = new Set();
    for (const [rawId, fmap] of rawToProducts) {
      const W = Number(products.byId.get(rawId)?.materialWeight) > 0 ? Number(products.byId.get(rawId).materialWeight) : null;
      if (!W) continue;   // ağırlık yoksa kg net stok hesaplanamaz → risk sayılmaz
      let consumedAdet = 0;
      for (const [F, mult] of fmap) consumedAdet += (cutByProduct.get(F) || 0) * mult;
      if ((gelenByMat.get(rawId) || 0) - consumedAdet * W < 0) for (const F of fmap.keys()) short.add(F);
    }
    return short;
  }

  function render() {
    const today = startOfDay(new Date());
    const todayISO = fmtISO(today);

    // --- KPI'lar ---
    const activeOrders = orders.filter(isOpenOrder);
    const openWos = workOrders.filter(w => w.status === 'Aktif');
    const openWoOrderIds = new Set(openWos.map(w => w.orderId));
    const openTasks = tasks.filter(t0 => t0.status !== 'Tamamlandı');
    const overdue = tasks.filter(t0 => t0.status !== 'Tamamlandı' && t0.dueDate && parseISO(t0.dueDate) < today)
      .map(t0 => ({ ...t0, delay: daysBetween(parseISO(t0.dueDate), today) }))
      .sort((a, b) => b.delay - a.delay);
    const doneTasks = tasks.filter(t0 => t0.status === 'Tamamlandı').length;
    const taskPct = tasks.length ? Math.round(doneTasks / tasks.length * 100) : 0;
    const warnCount = computeDataWarnings().length;
    const routeProductCount = new Set(routes.map(r => r.productCodeId)).size;

    const kpis = [
      { label: t('gb.kpiActiveOrders'), value: fmtTr(activeOrders.length), sub: t('gb.kpiActiveOrdersSub', { n: fmtTr(openWos.length) }), top: 'var(--color-accent-500)', color: 'var(--color-text)' },
      { label: t('gb.kpiOpenWo'), value: fmtTr(openWos.length), sub: t('gb.kpiOpenWoSub', { n: fmtTr(openWoOrderIds.size) }), top: 'var(--color-accent-500)', color: 'var(--color-text)' },
      { label: t('gb.kpiOverdue'), value: fmtTr(overdue.length), sub: t('gb.kpiOverdueSub', { n: fmtTr(openTasks.length) }), top: 'var(--color-danger)', color: 'var(--color-danger)' },
      { label: t('gb.kpiTaskDone'), value: '%' + taskPct, sub: t('gb.kpiTaskDoneSub', { done: fmtTr(doneTasks), total: fmtTr(tasks.length) }), top: 'var(--color-success)', color: 'var(--color-text)' },
      { label: t('gb.kpiCapWarn'), value: fmtTr(warnCount), sub: t('gb.kpiCapWarnSub', { n: fmtTr(routeProductCount) }), top: 'var(--color-warning)', color: 'var(--color-warning)' },
    ];

    // --- Geciken görevler tablosu ---
    const shown = overdue.slice(0, OVERDUE_ROWS);
    const overdueRows = shown.map(o => `
      <tr>
        <td class="gb-c-task"><a class="xlink" href="#tasks">${esc(o.description || '')}</a></td>
        <td class="mono gb-c-who">${esc(o.primaryAssigneeId != null ? people.label(o.primaryAssigneeId) : t('common.dash'))}</td>
        <td class="mono gb-c-due">${esc(fmtDateTR(o.dueDate))}</td>
        <td class="gb-c-delay"><span class="gb-badge-bad">${esc(t('gb.days', { n: o.delay }))}</span></td>
      </tr>`).join('');
    const overdueNote = overdue.length > OVERDUE_ROWS
      ? t('gb.moreTasks', { n: overdue.length - OVERDUE_ROWS })
      : (overdue.length ? t('gb.allListed') : '');

    // --- Darboğaz: rota tanımlı ürünlerin darboğaz kapasitesi, en kısıtlı 8 ---
    const bnList = [...new Set(routes.map(r => r.productCodeId))]
      .map(pid => ({ pid, bn: productBottleneck(pid).bottleneck }))
      .filter(x => x.bn && x.bn.capacity != null)
      .sort((a, b) => a.bn.capacity - b.bn.capacity)
      .slice(0, 8);
    const maxCap = Math.max(1, ...bnList.map(x => x.bn.capacity));
    const bnRows = bnList.map(({ pid, bn }) => {
      const p = products.byId.get(pid) || {};
      const ratio = bn.capacity / maxCap;
      const color = ratio < 0.15 ? 'var(--color-danger)' : 'var(--color-accent-500)';
      return `
        <div class="gb-bn-row">
          <a class="mono xlink gb-bn-code" href="#product-codes?id=${pid}">${esc(p.code || ('#' + pid))}</a>
          <span class="gb-bar"><i style="width:${(ratio * 100).toFixed(1)}%; background:${color};"></i></span>
          <a class="xlink gb-bn-station" href="#capacities?id=${pid}">${esc((p.name || '') + ' · ' + t('gb.bottleneckOf', { wc: centers.label(bn.workCenterId) }))}</a>
          <div class="mono gb-bn-cap">${esc(fmtTr(bn.capacity))}</div>
        </div>`;
    }).join('');

    // --- MRP: aktif siparişlerin termin riski ---
    const todayProd = production.filter(p => p.date === todayISO).reduce((s, p) => s + (Number(p.actualQuantity) || 0), 0);
    const risky = [];
    for (const order of activeOrders) {
      const F = order.productCodeId;
      const cap = productBottleneck(F).bottleneck?.capacity ?? null;
      const steps = (wosByOrder.get(order.id) || []).slice().sort((a, b) => (Number(b.sequence) || 0) - (Number(a.sequence) || 0));
      const finalWO = steps[0] || null;
      const est = finalWO ? estimateCompletion(finalWO, production, { today, fallbackRate: cap }) : null;
      const pct = est ? Math.round(est.pct) : 0;
      const delivery = order.requestedDeliveryDate ? parseISO(order.requestedDeliveryDate) : null;
      let reason = null;
      if (est && est.etaDate && delivery && est.etaDate > delivery) {
        reason = t('gb.riskBehind', { n: daysBetween(delivery, est.etaDate) });
      }
      if (!reason && cap > 0 && delivery && est && est.remaining > 0) {
        const remDays = daysBetween(today, delivery);
        if (remDays >= 0 && est.remaining / cap > remDays) reason = t('gb.riskCapacity');
      }
      if (!reason && shortProducts.has(F)) reason = t('gb.riskMaterial');
      if (reason) risky.push({ order, F, pct, reason });
    }
    risky.sort((a, b) => a.pct - b.pct);
    const riskyRows = risky.map(r => {
      const p = products.byId.get(r.F) || {};
      return `
        <div class="gb-risk-row">
          <a class="mono xlink" href="#orders?id=${r.order.id}">${esc(p.code || ('#' + r.F))}</a>
          <span class="gb-bar"><i style="width:${Math.min(r.pct, 100)}%; background:var(--color-danger);"></i></span>
          <div class="gb-risk-reason">${esc((r.order.orderNo || '') + ' · ' + r.reason)}</div>
          <div class="mono gb-risk-pct">%${r.pct}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.dashboard'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('gb.subtitle'))}</div>
        </div>
      </div>

      <div class="gb-kpis">
        ${kpis.map(k => `
          <div class="gb-kpi" style="border-top-color:${k.top};">
            <div class="gb-kpi-label">${esc(k.label)}</div>
            <div class="gb-kpi-value" style="color:${k.color};">${esc(k.value)}</div>
            <div class="gb-kpi-sub">${esc(k.sub)}</div>
          </div>`).join('')}
      </div>

      <div class="panel gb-panel">
        <div class="gb-panel-head">
          <span class="gb-panel-title">${esc(t('gb.overdueTitle'))}</span>
          <span class="gb-badge-bad">${esc(fmtTr(overdue.length))}</span>
        </div>
        <div class="gb-tablewrap">
          <table class="gb-table">
            <thead><tr>
              <th>${esc(t('gb.colTask'))}</th>
              <th class="gb-c-who">${esc(t('gb.colAssignee'))}</th>
              <th class="gb-c-due">${esc(t('gb.colDue'))}</th>
              <th class="gb-c-delay">${esc(t('gb.colDelay'))}</th>
            </tr></thead>
            <tbody>${overdueRows || `<tr><td colspan="4" class="text-muted" style="padding:16px 18px;">${esc(t('gb.noOverdue'))}</td></tr>`}</tbody>
          </table>
        </div>
        ${overdueNote ? `<div class="gb-note">${esc(overdueNote)}</div>` : ''}
      </div>

      <div class="panel gb-panel">
        <div class="gb-panel-head">
          <span class="gb-panel-title">${esc(t('gb.bottleneckTitle'))}</span>
          <span class="gb-panel-sub">${esc(t('gb.bottleneckSub'))}</span>
        </div>
        <div class="gb-bn-body">${bnRows || `<div class="text-muted">${esc(t('cap.emptyRoutes'))}</div>`}</div>
        <div class="gb-note">${esc(t('gb.bottleneckNote'))}</div>
      </div>

      <div class="panel gb-panel">
        <div class="gb-panel-head">
          <span class="gb-panel-title">${esc(t('gb.mrpTitle'))}</span>
          <span class="gb-badge-bad">${esc(t('gb.risky', { n: risky.length }))}</span>
        </div>
        <div class="gb-mrp">
          <div class="gb-mrp-nums">
            <div><div class="gb-mrp-lbl">${esc(t('gb.mrpActiveOrders'))}</div><div class="gb-mrp-val">${esc(fmtTr(activeOrders.length))}</div></div>
            <div><div class="gb-mrp-lbl">${esc(t('gb.mrpToday'))}</div><div class="gb-mrp-val">${esc(fmtTr(todayProd))}</div></div>
          </div>
          <div class="gb-mrp-list">
            <div class="text-muted" style="font-size:13px;">${esc(t('gb.mrpSub'))}</div>
            ${riskyRows || `<div class="text-muted" style="font-size:13px;">${esc(t('gb.noRisk'))}</div>`}
          </div>
        </div>
      </div>
    `;
  }
}
