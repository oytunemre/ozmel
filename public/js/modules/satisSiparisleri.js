// Satış Siparişleri — v2 modülü (yeni ekran). Tasarım: Satis-Siparisleri-v2.dc.html.
// Referans: v78 viewSatisSiparisleri. Aynı `orders` tablosunu source='satis' görünümüyle
// okur (Üretim Siparişleri ekranıyla aynı kayıtlar, farklı odak). Migration yok.
//
// Üretim durumu HESAPLANIR (elle girilen orders.status DEĞİL): ilerleme yalnız SON rota
// adımından — bir sipariş beş operasyondan geçse de müşteriye giden bitmiş ürün son adımdan
// çıkar. Termin riski core/eta.js:estimateCompletion ile (Genel Bakış'la ortak).
//
// Sıralanabilir tablo (kolon başlığı) + arama + durum filtreleri + Rapor modalı + drawer.
// i18n: dil değişince VERİ ÇEKMEDEN yeniden çizilir (veri closure'da).

import { resource, request } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDateTR } from '../core/format.js';
import { fmtISO, parseISO, startOfDay } from '../core/report.js';
import { estimateCompletion } from '../core/eta.js';

const api = resource('orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// [alan, i18n başlık, genişlik, hiza] — sıralama alan adına göre; 'durum' yüzdeye göre.
const COLUMNS = [
  ['salesOrderNo', 'ss.colSalesNo', '150px', 'left'],
  ['orderNo', 'ss.colOrderNo', '150px', 'left'],
  ['customer', 'ss.colCustomer', '200px', 'left'],
  ['productCodeId', 'ss.colProduct', '200px', 'left'],
  ['targetQuantity', 'ss.colQty', '100px', 'right'],
  ['startDate', 'ss.colOrderDate', '140px', 'left'],
  ['requestedDeliveryDate', 'ss.colDue', '150px', 'left'],
  ['durum', 'ss.colStatus', '200px', 'left'],
];
const FILTERS = [['hepsi', 'ss.fAll'], ['bekleyen', 'ss.fWaiting'], ['geride', 'ss.fRisk'], ['tamam', 'ss.fDone']];
const SEARCH_FIELDS = ['salesOrderNo', 'orderNo', 'customer', 'note'];

export async function viewSatisSiparisleri(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, orders, workOrders, production, routes, statuses;
  try {
    let allOrders;
    [products, ops, centers, allOrders, workOrders, production, routes, statuses] = await Promise.all([
      loadLookup('product-codes', mapProduct),
      loadLookup('operations', mapNamed),
      loadLookup('work-centers', mapNamed),
      api.listAll().then(r => r.data),
      resource('work-orders').listAll().then(r => r.data),
      resource('production').listAll().then(r => r.data),
      resource('routes').listAll().then(r => r.data),
      request('/order-statuses').then(r => r.data),   // create için varsayılan durum
    ]);
    orders = allOrders.filter(o => o.source === 'satis');
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewSatisSiparisleri(container) }));
    return;
  }

  const woByOrder = new Map();
  for (const w of workOrders) { if (!woByOrder.has(w.orderId)) woByOrder.set(w.orderId, []); woByOrder.get(w.orderId).push(w); }
  const producedByWo = new Map();
  for (const p of production) producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (Number(p.actualQuantity) || 0));
  const routeMaxSeq = new Map();   // productCodeId -> en yüksek rota sequence
  for (const r of routes) {
    const cur = routeMaxSeq.get(r.productCodeId);
    if (cur == null || Number(r.sequence) > cur) routeMaxSeq.set(r.productCodeId, Number(r.sequence));
  }
  const today = startOfDay(new Date());

  let search = '';
  let filter = 'hepsi';
  let sortKey = 'startDate';
  let sortDir = -1;
  let reportId = null;

  // Son rota adımının iş emirleri + ilerleme/ETA özeti.
  function summary(o) {
    const wos = woByOrder.get(o.id) || [];
    // Son adım: ürünün en yüksek rota sequence'i; rota yoksa iş emirlerinin en yükseği.
    let lastSeq = routeMaxSeq.get(o.productCodeId);
    if (lastSeq == null) lastSeq = wos.reduce((m, w) => Math.max(m, Number(w.sequence) || 0), -Infinity);
    const lastWos = wos.filter(w => Number(w.sequence) === lastSeq);
    const hedef = lastWos.reduce((s, w) => s + (Number(w.targetQuantity) || 0), 0);
    const uretilen = lastWos.reduce((s, w) => s + (producedByWo.get(w.id) || 0), 0);
    const pct = hedef > 0 ? Math.round(uretilen / hedef * 100) : 0;
    const tamamMi = hedef > 0 && uretilen >= hedef;
    // Termin: son adım iş emirlerinin EN GEÇ tahmini bitişi.
    let eta = null;
    if (wos.length && !tamamMi) {
      for (const w of lastWos) {
        const est = estimateCompletion(w, production, { today });
        if (est.etaDate && (!eta || est.etaDate > eta)) eta = est.etaDate;
      }
    }
    const due = o.requestedDeliveryDate ? parseISO(o.requestedDeliveryDate) : null;
    const riskli = !!(eta && due && eta > due);
    return { wos, lastWos, hedef, uretilen, pct, tamamMi, eta, due, riskli, isEmriVar: wos.length > 0 };
  }

  function statusOf(z) {
    if (!z.isEmriVar) return { text: t('ss.stWaiting'), cls: 'warning' };
    if (z.tamamMi) return { text: t('ss.stDone'), cls: 'success' };
    if (z.riskli) return { text: t('ss.stRisk'), cls: 'danger' };
    return { text: t('ss.stInProd'), cls: 'accent' };
  }

  function visible() {
    const q = search.trim().toLocaleLowerCase('tr');
    const rows = orders.filter(o => {
      if (q) {
        const hay = [...SEARCH_FIELDS.map(k => o[k] || ''), products.byId.get(o.productCodeId)?.code || ''].join(' ').toLocaleLowerCase('tr');
        if (!hay.includes(q)) return false;
      }
      const z = summary(o);
      if (filter === 'bekleyen') return !z.isEmriVar;
      if (filter === 'geride') return z.isEmriVar && !z.tamamMi && z.riskli;
      if (filter === 'tamam') return z.tamamMi;
      return true;
    });
    const val = (o) => {
      if (sortKey === 'targetQuantity') return Number(o.targetQuantity) || 0;
      if (sortKey === 'durum') return summary(o).pct;
      if (sortKey === 'productCodeId') return products.byId.get(o.productCodeId)?.code || '';
      return o[sortKey] || '';
    };
    return rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return sortDir * (va - vb);
      return sortDir * String(va).localeCompare(String(vb), 'tr', { numeric: true });
    });
  }

  render();
  bindLang(container, render);

  function render() {
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.satis-siparisleri'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('ss.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" id="ss-new"${canWrite ? '' : ` disabled title="${esc(t('common.readonlyHint'))}"`}>${esc(t('ss.new'))}</button>
      </div>
      <div class="toolbar" style="align-items:center; gap:12px; flex-wrap:wrap;">
        <div class="search"><input class="input" type="search" id="ss-search" placeholder="${esc(t('ss.searchPlaceholder'))}" value="${esc(search)}"></div>
        <div class="ss-filters">
          ${FILTERS.map(([id, lbl]) => `<button type="button" class="ss-filter${id === filter ? ' on' : ''}" data-f="${id}">${esc(t(lbl))}</button>`).join('')}
        </div>
        <span class="mono text-muted" id="ss-count" style="font-size:12px; margin-left:auto;"></span>
      </div>
      <div id="ss-table"></div>
      <div class="ss-foot text-muted">${esc(t('ss.footNote'))}</div>`;

    const inp = container.querySelector('#ss-search');
    inp.addEventListener('input', () => { search = inp.value; paint(); });
    container.querySelector('#ss-new').addEventListener('click', () => { if (canWrite) openForm(null); });
    // Filtre değişince TAM yeniden çiz — düğmelerin .on sınıfı da tazelensin (arama değeri korunur).
    container.querySelectorAll('.ss-filter').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; render(); }));
    paint();
  }

  function paint() {
    const list = visible();
    container.querySelector('#ss-count').textContent = t('ss.counter', { shown: list.length, total: orders.length });

    const arrow = (k) => sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    const head = COLUMNS.map(([key, lbl, w, al]) =>
      `<th class="ss-th${sortKey === key ? ' on' : ''}" data-key="${key}" style="width:${w}; text-align:${al};">${esc(t(lbl))}${arrow(key)}</th>`).join('')
      + '<th class="ss-th-actions"></th>';

    const rows = list.map(o => {
      const z = summary(o);
      const st = statusOf(z);
      const p = products.byId.get(o.productCodeId) || {};
      const overdue = !z.tamamMi && z.due && z.due < today;
      return `
        <tr>
          <td class="mono ss-strong">${esc(o.salesOrderNo || t('common.dash'))}</td>
          <td class="mono text-muted">${esc(o.orderNo || t('common.dash'))}</td>
          <td>${esc(o.customer || t('common.dash'))}</td>
          <td><div class="mono">${esc(p.code || ('#' + o.productCodeId))}</div><div class="ss-sub">${esc(p.name || '')}</div></td>
          <td class="mono" style="text-align:right;">${esc(fmtTr(o.targetQuantity))}</td>
          <td class="mono">${esc(o.startDate ? fmtDateTR(o.startDate) : t('common.dash'))}</td>
          <td class="mono"${overdue ? ' style="color:var(--color-danger);"' : ''}>${esc(o.requestedDeliveryDate ? fmtDateTR(o.requestedDeliveryDate) : t('common.dash'))}</td>
          <td>
            <span class="ss-badge ss-badge-${st.cls}">${esc(st.text)}</span>
            <div class="ss-prog"><span class="ss-prog-bar"><i style="width:${z.isEmriVar ? Math.min(z.pct, 100) : 0}%; background:${badgeColor(st.cls)};"></i></span><span class="mono ss-prog-pct">${z.isEmriVar ? '%' + z.pct : t('common.dash')}</span></div>
          </td>
          <td class="ss-c-actions">
            <div class="ss-acts">
              <button class="btn btn-primary btn-sm" data-report="${o.id}">${esc(t('ss.report'))}</button>
              <button class="btn btn-ghost btn-sm" data-goprod="${o.id}">${esc(t('ss.goProd'))}</button>
              ${canWrite ? `<button class="btn btn-ghost btn-sm" data-edit="${o.id}">${esc(t('action.edit'))}</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    container.querySelector('#ss-table').innerHTML = `
      <div class="ss-tablewrap">
        <table class="ss-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${list.length ? rows : `<tr><td colspan="${COLUMNS.length + 1}" class="ss-empty">${esc(t('ss.empty'))}</td></tr>`}</tbody>
        </table>
      </div>`;

    container.querySelectorAll('.ss-th').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      paint();
    }));
    container.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => openReport(Number(b.dataset.report))));
    container.querySelectorAll('[data-goprod]').forEach(b => b.addEventListener('click', () => { location.hash = `#orders?id=${b.dataset.goprod}`; }));
    if (canWrite) container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const o = orders.find(x => x.id === Number(b.dataset.edit)); if (o) openForm(o);
    }));
  }

  // --- Rapor modalı ---
  function openReport(id) {
    reportId = id;
    const o = orders.find(x => x.id === id); if (!o) return;
    const z = summary(o);
    const p = products.byId.get(o.productCodeId) || {};
    const dash = t('common.dash');
    const etaText = z.tamamMi ? t('ss.stDone') : (z.eta ? fmtDateTR(fmtISO(z.eta)) : dash);

    const info = [
      [t('ss.customer'), o.customer || dash],
      [t('ss.product'), (p.code || '') + (p.name ? ' — ' + p.name : '')],
      [t('ss.qty'), fmtTr(o.targetQuantity)],
      [t('ss.orderDate'), o.startDate ? fmtDateTR(o.startDate) : dash],
      [t('ss.due'), o.requestedDeliveryDate ? fmtDateTR(o.requestedDeliveryDate) : dash],
    ].map(([l, v]) => `<div><div class="ss-r-lbl">${esc(l)}</div><div class="mono ss-r-val">${esc(v)}</div></div>`).join('');

    let etaBlock;
    if (!z.isEmriVar) {
      etaBlock = `<div class="ss-r-warn">${esc(t('ss.noWo'))}</div>`;
    } else {
      const kpis = [
        { lbl: t('ss.kpiProduced'), val: `${fmtTr(z.uretilen)} / ${fmtTr(z.hedef)}`, color: 'var(--color-accent-500)' },
        { lbl: t('ss.kpiRemaining'), val: fmtTr(Math.max(0, z.hedef - z.uretilen)), color: 'var(--color-accent-500)' },
        { lbl: t('ss.kpiEta'), val: etaText, color: z.riskli ? 'var(--color-danger)' : 'var(--color-success)' },
      ].map(k => `<div class="ss-kpi" style="border-top-color:${k.color};"><div class="ss-kpi-lbl">${esc(k.lbl)}</div><div class="ss-kpi-val">${esc(k.val)}</div></div>`).join('');
      etaBlock = `<div class="ss-kpis">${kpis}</div><div class="text-muted" style="font-size:12.5px; margin-top:10px;">${esc(t('ss.etaNote'))}</div>`;
    }

    // Bölünmüş son adım (>1 iş emri): her biri ayrı ETA.
    let splitBlock = '';
    if (z.lastWos.length > 1) {
      const rows = z.lastWos.map(w => {
        const est = estimateCompletion(w, production, { today });
        const eta = est.complete ? t('ss.stDone') : (est.etaDate ? fmtDateTR(fmtISO(est.etaDate)) : t('common.dash'));
        return `<tr><td class="mono">${esc(woLabel(w))}</td><td>${esc(centers.label(w.workCenterId))}</td>
          <td class="mono" style="text-align:right;">${esc(fmtTr(w.targetQuantity))}</td>
          <td class="mono" style="text-align:right;">${esc(fmtTr(producedByWo.get(w.id) || 0))}</td>
          <td class="mono">${esc(eta)}</td></tr>`;
      }).join('');
      splitBlock = `
        <div style="margin-top:20px;">
          <div class="text-muted" style="font-size:12.5px; margin-bottom:8px;">${esc(t('ss.splitNote'))}</div>
          <table class="ss-r-table">
            <thead><tr><th>${esc(t('ss.colWo'))}</th><th>${esc(t('ss.colMachine'))}</th><th style="text-align:right;">${esc(t('ss.colTarget'))}</th><th style="text-align:right;">${esc(t('ss.colProduced'))}</th><th>${esc(t('ss.colEta'))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    // Tüm iş emirleri (rota sırasına göre).
    let allBlock = '';
    if (z.isEmriVar) {
      const sorted = z.wos.slice().sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
      const rows = sorted.map(w => {
        const done = producedByWo.get(w.id) || 0;
        const tgt = Number(w.targetQuantity) || 0;
        const pct = tgt > 0 ? Math.min(100, Math.round(done / tgt * 100)) : 0;
        return `<tr><td class="mono">${esc(woLabel(w))}</td><td>${esc(ops.label(w.operationId))}</td><td>${esc(centers.label(w.workCenterId))}</td>
          <td><div class="ss-prog"><span class="ss-prog-bar"><i style="width:${pct}%; background:var(--color-accent-500);"></i></span><span class="mono ss-prog-pct">%${pct}</span></div></td></tr>`;
      }).join('');
      allBlock = `
        <div style="margin-top:20px;">
          <div class="ss-r-sec">${esc(t('ss.woSection'))}</div>
          <table class="ss-r-table">
            <thead><tr><th>${esc(t('ss.colWoNo'))}</th><th>${esc(t('ss.colOperation'))}</th><th>${esc(t('ss.colMachine'))}</th><th>${esc(t('ss.colProgress'))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'ss-modal-backdrop';
    overlay.innerHTML = `
      <div class="ss-modal" role="dialog" aria-modal="true">
        <div class="ss-modal-head">
          <span class="ss-modal-title">${esc(t('ss.reportTitle', { no: o.orderNo || o.salesOrderNo || '' }))}</span>
          <button class="btn btn-ghost" id="ss-r-x">×</button>
        </div>
        <div class="ss-modal-body">
          <div class="ss-r-info">${info}</div>
          <div class="ss-r-eta"><div class="ss-r-sec">${esc(t('ss.etaSection'))}</div>${etaBlock}</div>
          ${splitBlock}
          ${allBlock}
        </div>
        <div class="ss-modal-foot"><button class="btn btn-secondary" id="ss-r-close">${esc(t('action.close'))}</button></div>
      </div>`;
    container.appendChild(overlay);
    const close = () => { overlay.remove(); reportId = null; };
    overlay.querySelector('#ss-r-x').addEventListener('click', close);
    overlay.querySelector('#ss-r-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function woLabel(w) { return (w.woNo || '') + (w.splitLabel ? '-' + w.splitLabel : ''); }

  // --- Yeni / düzenle formu (drawer) ---
  function openForm(row) {
    const editing = !!row;
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    openDrawer({
      title: () => t(editing ? 'ss.editTitle' : 'ss.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'salesOrderNo', label: () => t('ss.salesNo'), type: 'text' },
        { name: 'customer', label: () => t('ss.customer'), type: 'text' },
        { name: 'productCodeId', label: () => t('ss.product'), type: 'fk', fk: productFk, required: true },
        { name: 'targetQuantity', label: () => t('ss.qty'), type: 'number', step: 'any', required: true },
        { name: 'startDate', label: () => t('ss.orderDate'), type: 'date' },
        { name: 'requestedDeliveryDate', label: () => t('ss.due'), type: 'date' },
        { name: 'note', label: () => t('field.note'), type: 'textarea' },
      ],
      onSubmit: async (v) => {
        if (editing) {
          // orderNo / source / status'a dokunma (bu ekranda gösterilmez).
          return (await api.update(row.id, v)).data;
        }
        // Yeni satış siparişi: source='satis', takip no üret, başlangıç durumu.
        const payload = { ...v, source: 'satis', status: statuses[0] || 'Hammadde Bekleniyor', orderNo: makeOrderNo(v.salesOrderNo) };
        return (await api.create(payload)).data;
      },
      onSaved: async () => { toast(t('ss.saved'), 'success'); orders = (await api.listAll()).data.filter(o => o.source === 'satis'); render(); },
    });
  }

  // Takip no (order_no): mevcut veri deseni SP-<yıl>-<müşteri PO no> (ör. SP-2026-50500).
  // Son kısım satisSiparisNo (müşterinin PO'su), sıra değil. PO boşsa sıra numarasına düşer.
  // Çakışırsa BE 409 döner; kullanıcı yeniden dener.
  function makeOrderNo(salesNo) {
    const year = new Date().getFullYear();
    const po = String(salesNo || '').trim();
    if (po) return `SP-${year}-${po}`;
    let max = 0;
    for (const o of orders) {
      const m = String(o.orderNo || '').match(new RegExp('^SP-' + year + '-(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `SP-${year}-${String(max + 1).padStart(4, '0')}`;
  }
}

function badgeColor(cls) {
  return cls === 'success' ? 'var(--color-success)' : cls === 'danger' ? 'var(--color-danger)'
    : cls === 'warning' ? 'var(--color-warning)' : 'var(--color-accent-500)';
}
