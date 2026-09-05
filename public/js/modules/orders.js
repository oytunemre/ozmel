// Üretim Siparişleri v2 — planlamacının ekranı. Tasarım: Uretim-Siparisleri-v2.dc.html.
// Referans: v78 viewOrders. Tüm siparişleri (her kaynak) gösterir; asıl yenilik İŞ EMRİ AÇ akışı.
//
// Durum modeli: orders.status 9 aşamalı akış KORUNUR (Order::STATUSES; karar: 9-aşamayı koru).
//   "Aktif" = açık sipariş (status ∉ {Tamamlandı, İptal}) — KPI/filtre bunu kullanır.
//   "Durduruldu" kavramı YOK (gerekirse İptal). İki AYRI kolon: DURUM (saklanan 9-aşama) ve
//   RİSK (hesaplanan: Kapasite Yetersiz / Termin Riski / İş Emri Bekliyor; risk yoksa boş).
// İlerleme SON rota adımından.
//
// Ortak core: eta.js (estimateCompletion), bottleneck.js (getCapacity/productBottleneck).
// i18n: uo.* (brief 'us.*' diyor ama o önek Kullanıcılar'da — çakışmayı önlemek için uo.*).
// Not: iş emri açımı tek BE işlemi değil (toplu uç yok); sıralı yazılır, hata olursa
// açılanlar geri silinir (telafi) — sonuç "hepsi ya da hiçbiri".

import { resource, request } from '../core/api.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, tStatus } from '../core/i18n.js';
import { fmtTr, fmtDateTR } from '../core/format.js';
import { fmtISO, parseISO, startOfDay } from '../core/report.js';
import { estimateCompletion } from '../core/eta.js';
import { createCapacityHelpers } from '../core/bottleneck.js';

const api = resource('orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const isOpen = (o) => o.status !== 'Tamamlandı' && o.status !== 'İptal';
const srcLabel = (v) => v ? t('src.' + v) : '—';
// Saklanan 9-aşama durumu -> rozet tonu (yalnızca sunum). Liste tek kaynak /order-statuses.
const STATUS_TONE = {
  'Hammadde Bekleniyor': 'warning', 'Üretimde': 'accent', 'Kalite Kontrolde': 'warning',
  'Sevke Hazır': 'accent', 'Kısmi Sevk': 'accent', 'Sevk Edildi': 'success',
  'İade': 'danger', 'Tamamlandı': 'success', 'İptal': 'neutral',
};

const COLUMNS = [
  ['orderNo', 'uo.colOrderNo', '150px', 'left'],
  ['source', 'uo.colSource', '90px', 'left'],
  ['productCodeId', 'uo.colProduct', '200px', 'left'],
  ['targetQuantity', 'uo.colTarget', '90px', 'right'],
  ['uretilen', 'uo.colProduced', '100px', 'right'],
  ['kalan', 'uo.colRemaining', '90px', 'right'],
  ['requestedDeliveryDate', 'uo.colDue', '140px', 'left'],
  ['eta', 'uo.colEta', '140px', 'left'],
  ['durum', 'uo.colStatus', '170px', 'left'],
  ['risk', 'uo.colRisk', '150px', 'left'],   // hesaplanan; sıralanmaz
  ['woCount', 'uo.colWo', '120px', 'left'],
];
const FILTERS = [['hepsi', 'uo.fAll'], ['aktif', 'uo.fActive'], ['bekleyen', 'uo.fWaiting'], ['geride', 'uo.fRisk'], ['tamam', 'uo.fDone']];
const SEARCH_FIELDS = ['orderNo', 'customer', 'salesOrderNo', 'note'];

export async function viewOrders(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, orders, workOrders, production, routes, caps, wh, statuses;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    orders = (await api.listAll()).data;
    workOrders = (await resource('work-orders').listAll()).data;
    production = (await resource('production').listAll()).data;
    routes = (await resource('routes').listAll()).data;
    caps = (await resource('capacities').listAll()).data;
    ({ data: wh } = await request('/working-hours'));
    statuses = (await request('/order-statuses')).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewOrders(container, params) }));
    return;
  }

  const { getCapacity, productBottleneck } = createCapacityHelpers({ caps, routes, wh, products, ops, centers, t });
  const woByOrder = new Map();
  for (const w of workOrders) { if (!woByOrder.has(w.orderId)) woByOrder.set(w.orderId, []); woByOrder.get(w.orderId).push(w); }
  const producedByWo = new Map();
  for (const p of production) producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (Number(p.actualQuantity) || 0));
  const routeMaxSeq = new Map();
  for (const r of routes) { const c = routeMaxSeq.get(r.productCodeId); if (c == null || Number(r.sequence) > c) routeMaxSeq.set(r.productCodeId, Number(r.sequence)); }
  const today = startOfDay(new Date());

  let search = '';
  let filter = 'hepsi';
  let sortKey = null;
  let sortDir = 1;

  // Rota adımları (sequence grupları) — İş Emri Aç modalı + form önizlemesi.
  function routeSteps(productId) {
    const steps = new Map();
    for (const r of routes.filter(x => x.productCodeId === productId)) {
      if (!steps.has(r.sequence)) steps.set(r.sequence, []);
      steps.get(r.sequence).push(r);
    }
    return [...steps.entries()].sort((a, b) => a[0] - b[0]).map(([sequence, group]) => {
      const rep = group.find(g => g.isActive) || group[0];
      return {
        sequence, operationId: rep.operationId, variantLabel: rep.variantLabel, variants: rep.variants || [],
        options: [...new Set(group.map(g => g.workCenterId))],
        activeWc: (group.find(g => g.isActive) || group[0]).workCenterId,
      };
    });
  }

  // Sipariş özeti: son rota adımından ilerleme + ETA + kapasite/termin riski.
  function summary(o) {
    const wos = woByOrder.get(o.id) || [];
    let lastSeq = routeMaxSeq.get(o.productCodeId);
    if (lastSeq == null) lastSeq = wos.reduce((m, w) => Math.max(m, Number(w.sequence) || 0), -Infinity);
    const lastWos = wos.filter(w => Number(w.sequence) === lastSeq);
    const hedef = Number(o.targetQuantity) || 0;
    const uretilen = lastWos.reduce((s, w) => s + (producedByWo.get(w.id) || 0), 0);
    const kalan = Math.max(0, hedef - uretilen);
    const pct = hedef > 0 ? Math.round(uretilen / hedef * 100) : 0;
    const tamamMi = o.status === 'Tamamlandı' || (hedef > 0 && uretilen >= hedef);
    const due = o.requestedDeliveryDate ? parseISO(o.requestedDeliveryDate) : null;
    // ETA — son adım iş emirlerinin en geç bitişi.
    let eta = null;
    if (wos.length && !tamamMi) for (const w of lastWos) { const e = estimateCompletion(w, production, { today }); if (e.etaDate && (!eta || e.etaDate > eta)) eta = e.etaDate; }
    const riskli = !!(eta && due && eta > due);
    // Kapasite yetersiz: kalan / darboğaz günlük kapasite > teslime kalan gün.
    const cap = productBottleneck(o.productCodeId).bottleneck?.capacity ?? null;
    const remDays = due ? daysBetween(today, due) : null;
    const kapasiteYetersiz = !!(isOpen(o) && cap > 0 && kalan > 0 && remDays != null && remDays >= 0 && (kalan / cap > remDays));
    return { wos, lastWos, hedef, uretilen, kalan, pct, tamamMi, due, eta, riskli, kapasiteYetersiz, isEmriVar: wos.length > 0 };
  }

  // İki AYRI bilgi: (1) saklanan iş-akışı durumu (9 aşama), (2) hesaplanan risk.
  // Risk yoksa boş; kapanmış siparişte risk gösterilmez.
  function riskOf(o, z) {
    if (!isOpen(o)) return null;
    if (z.kapasiteYetersiz) return { text: t('uo.stCapacity'), cls: 'danger' };
    if (z.riskli) return { text: t('uo.stRisk'), cls: 'danger' };
    if (!z.isEmriVar) return { text: t('uo.stWaiting'), cls: 'warning' };
    return null;
  }

  function visible() {
    const q = search.trim().toLocaleLowerCase('tr');
    const rows = orders.filter(o => {
      if (q) {
        const hay = [...SEARCH_FIELDS.map(k => o[k] || ''), products.byId.get(o.productCodeId)?.code || '', products.byId.get(o.productCodeId)?.name || ''].join(' ').toLocaleLowerCase('tr');
        if (!hay.includes(q)) return false;
      }
      if (filter === 'aktif') return isOpen(o);
      if (filter === 'bekleyen') return isOpen(o) && !(woByOrder.get(o.id) || []).length;
      if (filter === 'geride') { const z = summary(o); return isOpen(o) && (z.kapasiteYetersiz || z.riskli); }
      if (filter === 'tamam') return o.status === 'Tamamlandı';
      return true;
    });
    if (sortKey == null) {
      // Varsayılan: açık → İptal → Tamamlandı; grup içinde teslime göre.
      const rank = (o) => o.status === 'Tamamlandı' ? 2 : o.status === 'İptal' ? 1 : 0;
      return rows.sort((a, b) => rank(a) - rank(b) || String(a.requestedDeliveryDate || '~').localeCompare(String(b.requestedDeliveryDate || '~')));
    }
    const val = (o) => {
      if (sortKey === 'targetQuantity') return Number(o.targetQuantity) || 0;
      if (sortKey === 'uretilen') return summary(o).uretilen;
      if (sortKey === 'kalan') return summary(o).kalan;
      if (sortKey === 'durum') return o.status || '';
      if (sortKey === 'woCount') return (woByOrder.get(o.id) || []).length;
      if (sortKey === 'eta') { const e = summary(o).eta; return e ? e.getTime() : Infinity; }
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
  if (params?.id != null) setTimeout(() => focusRow(Number(params.id)), 0);

  function render() {
    // KPI'lar
    const open = orders.filter(isOpen);
    const waiting = open.filter(o => !(woByOrder.get(o.id) || []).length).length;
    const risk = open.filter(o => { const z = summary(o); return z.kapasiteYetersiz || z.riskli; }).length;
    const openWoCount = open.reduce((s, o) => s + (woByOrder.get(o.id) || []).length, 0);
    const kpis = [
      { label: t('uo.kpiActive'), value: fmtTr(open.length), top: 'var(--color-accent-500)' },
      { label: t('uo.kpiWaiting'), value: fmtTr(waiting), top: 'var(--color-warning)' },
      { label: t('uo.kpiRisk'), value: fmtTr(risk), top: risk ? 'var(--color-danger)' : 'var(--color-success)' },
      { label: t('uo.kpiOpenWo'), value: fmtTr(openWoCount), top: 'var(--color-accent-500)' },
    ];

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.orders'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('uo.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" id="uo-new"${canWrite ? '' : ` disabled title="${esc(t('common.readonlyHint'))}"`}>${esc(t('uo.new'))}</button>
      </div>
      <div class="uo-kpis">
        ${kpis.map(k => `<div class="uo-kpi" style="border-top-color:${k.top};"><div class="uo-kpi-label">${esc(k.label)}</div><div class="uo-kpi-value">${esc(k.value)}</div></div>`).join('')}
      </div>
      <div class="toolbar" style="align-items:center; gap:12px; flex-wrap:wrap;">
        <div class="search"><input class="input" type="search" id="uo-search" placeholder="${esc(t('uo.searchPlaceholder'))}" value="${esc(search)}"></div>
        <div class="ss-filters">${FILTERS.map(([id, lbl]) => `<button type="button" class="ss-filter${id === filter ? ' on' : ''}" data-f="${id}">${esc(t(lbl))}</button>`).join('')}</div>
        <span class="mono text-muted" id="uo-count" style="font-size:12px; margin-left:auto;"></span>
      </div>
      <div id="uo-table"></div>`;

    const inp = container.querySelector('#uo-search');
    inp.addEventListener('input', () => { search = inp.value; paint(); });
    container.querySelector('#uo-new').addEventListener('click', () => { if (canWrite) openForm(null); });
    container.querySelectorAll('.ss-filter').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; render(); }));
    paint();
  }

  function paint() {
    const list = visible();
    container.querySelector('#uo-count').textContent = t('uo.counter', { shown: list.length, total: orders.length });
    const arrow = (k) => sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    const head = COLUMNS.map(([key, lbl, w, al]) => key === 'risk'
      ? `<th style="width:${w}; text-align:${al};">${esc(t(lbl))}</th>`   // hesaplanan — sıralanmaz
      : `<th class="ss-th${sortKey === key ? ' on' : ''}" data-key="${key}" style="width:${w}; text-align:${al};">${esc(t(lbl))}${arrow(key)}</th>`).join('') + '<th class="ss-th-actions"></th>';
    const dash = t('common.dash');

    const rows = list.map(o => {
      const z = summary(o);
      const tone = STATUS_TONE[o.status] || 'neutral';
      const risk = riskOf(o, z);
      const p = products.byId.get(o.productCodeId) || {};
      const overdue = !z.tamamMi && z.due && z.due < today;
      const woCell = z.isEmriVar ? `<span class="mono">${esc(fmtTr(z.wos.length))}</span>` : `<span class="ss-badge ss-badge-warning">${esc(t('uo.stWaiting'))}</span>`;
      return `
        <tr data-id="${o.id}">
          <td class="mono ss-strong">${esc(o.orderNo || dash)}</td>
          <td><span class="tag tag-neutral">${esc(srcLabel(o.source))}</span></td>
          <td><div class="mono">${esc(p.code || ('#' + o.productCodeId))}</div><div class="ss-sub">${esc(p.name || '')}</div></td>
          <td class="mono" style="text-align:right;">${esc(fmtTr(o.targetQuantity))}</td>
          <td class="mono" style="text-align:right;">${esc(z.isEmriVar ? fmtTr(z.uretilen) : dash)}</td>
          <td class="mono" style="text-align:right;">${esc(z.isEmriVar ? fmtTr(z.kalan) : dash)}</td>
          <td class="mono"${overdue ? ' style="color:var(--color-danger);"' : ''}>${esc(o.requestedDeliveryDate ? fmtDateTR(o.requestedDeliveryDate) : dash)}</td>
          <td class="mono">${esc(z.eta ? fmtDateTR(fmtISO(z.eta)) : dash)}</td>
          <td>
            <span class="ss-badge ss-badge-${tone}">${esc(tStatus(o.status))}</span>
            <div class="ss-prog"><span class="ss-prog-bar"><i style="width:${z.isEmriVar ? Math.min(z.pct, 100) : 0}%; background:${badgeColor(tone)};"></i></span><span class="mono ss-prog-pct">${z.isEmriVar ? '%' + z.pct : dash}</span></div>
          </td>
          <td>${risk ? `<span class="ss-badge ss-badge-${risk.cls}">${esc(risk.text)}</span>` : ''}</td>
          <td>${woCell}</td>
          <td class="ss-c-actions">
            <div class="ss-acts">
              <button class="btn btn-ghost btn-sm" data-viewwo="${o.id}">${esc(t('uo.viewWo'))}</button>
              ${canWrite ? `<button class="btn btn-primary btn-sm" data-openwo="${o.id}">${esc(t('uo.openWo'))}</button>` : ''}
              ${canWrite ? `<button class="btn btn-ghost btn-sm" data-edit="${o.id}">${esc(t('action.edit'))}</button>` : ''}
              ${canWrite ? `<button class="btn btn-danger btn-sm" data-del="${o.id}">${esc(t('action.delete'))}</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    container.querySelector('#uo-table').innerHTML = `
      <div class="ss-tablewrap"><table class="ss-table" style="min-width:1400px;">
        <thead><tr>${head}</tr></thead>
        <tbody>${list.length ? rows : `<tr><td colspan="${COLUMNS.length + 1}" class="ss-empty">${esc(t('uo.empty'))}</td></tr>`}</tbody>
      </table></div>`;

    container.querySelectorAll('.ss-th').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.key; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } paint();
    }));
    container.querySelectorAll('[data-viewwo]').forEach(b => b.addEventListener('click', () => { location.hash = `#work-orders?id=${b.dataset.viewwo}`; }));
    if (canWrite) {
      container.querySelectorAll('[data-openwo]').forEach(b => b.addEventListener('click', () => { const o = orders.find(x => x.id === Number(b.dataset.openwo)); if (o) openWoModal(o); }));
      container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { const o = orders.find(x => x.id === Number(b.dataset.edit)); if (o) openForm(o); }));
      container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const o = orders.find(x => x.id === Number(b.dataset.del)); if (o) remove(o); }));
    }
  }

  function focusRow(id) {
    const tr = container.querySelector(`#uo-table tr[data-id="${id}"]`);
    if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('row-flash'); setTimeout(() => tr.classList.remove('row-flash'), 1600); }
  }

  async function reload() {
    orders = (await api.listAll()).data;
    workOrders = (await resource('work-orders').listAll()).data;
    woByOrder.clear();
    for (const w of workOrders) { if (!woByOrder.has(w.orderId)) woByOrder.set(w.orderId, []); woByOrder.get(w.orderId).push(w); }
    render();
  }

  // ---- İş Emri Aç modalı ----
  async function openWoModal(order) {
    const steps = routeSteps(order.productCodeId);
    if (!steps.length) { toast(t('uo.noRoute'), 'danger'); return; }
    const existing = (woByOrder.get(order.id) || []).length;
    if (existing > 0) {
      const ok = await confirmDialog({ title: t('uo.reopenTitle'), body: t('uo.reopenBody', { n: existing }), confirmLabel: t('uo.openWo'), danger: false });
      if (!ok) return;
    }
    // Model: her adım için seçili makineler + varyant.
    const mo = steps.map(s => ({ ...s, picks: [s.activeWc], variantValue: '' }));

    const bd = el('div', 'uo-modal-backdrop');
    bd.innerHTML = `<div class="uo-modal" style="width:720px;">
      <div class="uo-modal-head"><span class="uo-modal-title">${esc(t('uo.openTitle', { no: order.orderNo || '' }))}</span><button class="btn btn-ghost" data-x>×</button></div>
      <div class="uo-modal-body">
        <div class="text-muted" style="font-size:13px; margin-bottom:14px;">${esc(t('uo.openHelp'))}</div>
        <div id="uo-steps"></div>
      </div>
      <div class="uo-modal-foot">
        <span class="mono text-muted" id="uo-wo-count" style="margin-right:auto;"></span>
        <button class="btn btn-secondary" data-x>${esc(t('action.cancel'))}</button>
        <button class="btn btn-primary" id="uo-wo-save">${esc(t('uo.openConfirm'))}</button>
      </div>
    </div>`;
    container.appendChild(bd);
    const close = () => bd.remove();
    bd.querySelectorAll('[data-x]').forEach(x => x.addEventListener('click', close));
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });

    const stepsEl = bd.querySelector('#uo-steps');
    const target = Number(order.targetQuantity) || 0;

    function shareFor(step) {
      const capsArr = step.picks.map(wc => getCapacity(order.productCodeId, wc, step.operationId)?.capacity);
      const known = capsArr.every(c => c != null && c > 0);
      const weights = known ? capsArr : step.picks.map(() => 1);
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      const targets = weights.map((w, i) => { if (i === weights.length - 1) return Math.max(0, target - acc); const v = Math.round(target * w / sum); acc += v; return v; });
      const pct = weights.map(w => Math.round(w / sum * 100));
      return { targets, pct, equalSplit: !known && step.picks.length > 1 };
    }

    function paintSteps() {
      let totalWo = 0;
      stepsEl.innerHTML = mo.map((step, si) => {
        totalWo += step.picks.length;
        const sh = shareFor(step);
        const single = step.options.length < 2;
        const rows = step.picks.map((wc, pi) => {
          const opts = step.options.filter(o => o === wc || !step.picks.includes(o))
            .map(o => `<option value="${o}"${o === wc ? ' selected' : ''}>${esc(centers.label(o))}</option>`).join('');
          return `<div class="uo-mrow">
            <select class="input uo-msel" data-step="${si}" data-pick="${pi}">${opts}</select>
            <span class="mono uo-mpct">%${sh.pct[pi]}</span>
            <span class="mono text-muted uo-mtgt">${esc(fmtTr(sh.targets[pi]))}</span>
            ${step.picks.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-rm="${si}:${pi}">${esc(t('uo.remove'))}</button>` : ''}
          </div>`;
        }).join('');
        const canAdd = step.picks.length < step.options.length;
        const variant = step.variantLabel ? `
          <div class="uo-variant">
            <span class="text-muted">${esc(step.variantLabel)}:</span>
            <select class="input uo-vsel" data-step="${si}">
              <option value="">${esc(t('fk.select'))}</option>
              ${step.variants.map(v => `<option value="${esc(v)}"${v === step.variantValue ? ' selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>` : '';
        return `<div class="uo-step">
          <div class="uo-step-head"><span class="uo-step-title">${esc(String(step.sequence) + '. ' + ops.label(step.operationId))}</span>
            <span class="text-muted uo-step-meta">${esc(single ? t('uo.singleWc') : t('uo.wcOptions', { n: step.options.length }))}</span></div>
          ${rows}
          ${sh.equalSplit ? `<div class="uo-warn">${esc(t('uo.equalSplit'))}</div>` : ''}
          ${canAdd ? `<button type="button" class="btn btn-ghost btn-sm uo-addm" data-add="${si}">${esc(t('uo.addMachine'))}</button>` : ''}
          ${variant}
        </div>`;
      }).join('');
      bd.querySelector('#uo-wo-count').textContent = t('uo.willOpen', { n: totalWo });
      bindSteps();
    }

    function bindSteps() {
      stepsEl.querySelectorAll('.uo-msel').forEach(sel => sel.addEventListener('change', () => {
        mo[Number(sel.dataset.step)].picks[Number(sel.dataset.pick)] = Number(sel.value); paintSteps();
      }));
      stepsEl.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        const [si, pi] = b.dataset.rm.split(':').map(Number); mo[si].picks.splice(pi, 1); paintSteps();
      }));
      stepsEl.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const si = Number(b.dataset.add); const step = mo[si];
        const next = step.options.find(o => !step.picks.includes(o)); if (next != null) step.picks.push(next); paintSteps();
      }));
      stepsEl.querySelectorAll('.uo-vsel').forEach(sel => sel.addEventListener('change', () => { mo[Number(sel.dataset.step)].variantValue = sel.value; }));
    }

    paintSteps();

    bd.querySelector('#uo-wo-save').addEventListener('click', async () => {
      const saveBtn = bd.querySelector('#uo-wo-save'); saveBtn.disabled = true;
      // Plan: her (adım, makine) çifti bir iş emri.
      const plan = [];
      for (const step of mo) {
        const sh = shareFor(step);
        const split = step.picks.length > 1;
        step.picks.forEach((wc, i) => {
          const letter = split ? String.fromCharCode(65 + i) : '';
          const variantSuffix = step.variantValue ? ` (${step.variantValue})` : '';
          const splitLabel = (letter + variantSuffix).trim();
          plan.push({
            woNo: `${order.orderNo}-${step.sequence}`, operationId: step.operationId, workCenterId: wc,
            sequence: step.sequence, targetQuantity: sh.targets[i], splitLabel: splitLabel || null,
          });
        });
      }
      // Tek transaction (POST work-orders/batch) — hepsi ya da hiçbiri (BE Db::transaction).
      const items = plan.map(w => ({
        orderId: order.id, productCodeId: order.productCodeId, woNo: w.woNo, operationId: w.operationId,
        workCenterId: w.workCenterId, sequence: w.sequence, targetQuantity: w.targetQuantity, status: 'Aktif', splitLabel: w.splitLabel,
      }));
      try {
        await request('/work-orders/batch', { method: 'POST', body: { items } });
        toast(t('uo.opened', { n: plan.length }), 'success');
        close();
        await reload();
        focusRow(order.id);
      } catch (err) {
        saveBtn.disabled = false;
        toast((err && err.message) || t('err.GENERIC'), 'danger');
      }
    });
  }

  // ---- Yeni / düzenle formu (modal + canlı rota önizlemesi) ----
  function openForm(row) {
    const editing = !!row;
    const bd = el('div', 'uo-modal-backdrop');
    bd.innerHTML = `<div class="uo-modal" style="width:640px;">
      <div class="uo-modal-head"><span class="uo-modal-title">${esc(t(editing ? 'uo.editTitle' : 'uo.newTitle'))}</span><button class="btn btn-ghost" data-x>×</button></div>
      <div class="uo-modal-body">
        <div class="field"><label>${esc(t('field.product'))} <span class="req">*</span></label><div id="uo-f-product"></div></div>
        <div id="uo-f-preview" class="uo-preview"></div>
        <div class="field"><label>${esc(t('field.targetQuantity'))} <span class="req">*</span></label>
          <input type="number" step="any" class="input mono" id="uo-f-qty" value="${esc(row?.targetQuantity ?? '')}"></div>
        <div class="uo-frow">
          <div class="field"><label>${esc(t('field.startDate'))}</label><input type="date" class="input mono" id="uo-f-start" value="${esc(row?.startDate || '')}"></div>
          <div class="field"><label>${esc(t('field.requestedShipDate'))}</label><input type="date" class="input mono" id="uo-f-due" value="${esc(row?.requestedDeliveryDate || '')}"></div>
        </div>
        <div class="uo-frow">
          <div class="field"><label>${esc(t('field.source'))}</label>
            <select class="input" id="uo-f-source">
              <option value="uretim"${(row?.source || 'uretim') === 'uretim' ? ' selected' : ''}>${esc(t('src.uretim'))}</option>
              <option value="stok"${row?.source === 'stok' ? ' selected' : ''}>${esc(t('src.stok'))}</option>
              ${row?.source === 'satis' ? `<option value="satis" selected>${esc(t('src.satis'))}</option>` : ''}
            </select></div>
          <div class="field"><label>${esc(t('field.status'))}</label>
            <select class="input" id="uo-f-status">${statuses.map(s => `<option value="${esc(s)}"${(row?.status || statuses[0]) === s ? ' selected' : ''}>${esc(tStatus(s))}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>${esc(t('field.note'))}</label><input type="text" class="input" id="uo-f-note" value="${esc(row?.note || '')}"></div>
        <div class="uo-form-err" id="uo-f-err" style="display:none;"></div>
      </div>
      <div class="uo-modal-foot">
        <button class="btn btn-secondary" data-x>${esc(t('action.cancel'))}</button>
        <button class="btn btn-primary" id="uo-f-save">${esc(t(editing ? 'action.update' : 'action.add'))}</button>
      </div>
    </div>`;
    container.appendChild(bd);
    const close = () => bd.remove();
    bd.querySelectorAll('[data-x]').forEach(x => x.addEventListener('click', close));

    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    bd.querySelector('#uo-f-product').appendChild(productFk.el);
    const preview = bd.querySelector('#uo-f-preview');
    const paintPreview = () => {
      const pid = productFk.getValue();
      if (pid == null) { preview.innerHTML = ''; return; }
      const steps = routeSteps(pid);
      preview.innerHTML = steps.length
        ? `<span class="text-muted">${esc(t('uo.routePreview'))}:</span> ${steps.map(s => esc(ops.label(s.operationId))).join(' → ')}`
        : `<span class="uo-warn">${esc(t('uo.noRoutePreview'))}</span>`;
    };
    productFk.onChange(paintPreview);
    paintPreview();

    bd.querySelector('#uo-f-save').addEventListener('click', async () => {
      const pid = productFk.getValue();
      const qty = bd.querySelector('#uo-f-qty').value.trim();
      const err = bd.querySelector('#uo-f-err');
      if (pid == null) return showErr(err, t('uo.errProduct'));
      if (!(parseFloat(qty) > 0)) return showErr(err, t('uo.errQty'));
      const payload = {
        productCodeId: pid, targetQuantity: parseFloat(qty),
        startDate: bd.querySelector('#uo-f-start').value || null,
        requestedDeliveryDate: bd.querySelector('#uo-f-due').value || null,
        source: bd.querySelector('#uo-f-source').value,
        status: bd.querySelector('#uo-f-status').value,
        note: bd.querySelector('#uo-f-note').value || null,
      };
      const save = bd.querySelector('#uo-f-save'); save.disabled = true;
      try {
        if (editing) await api.update(row.id, { ...payload, orderNo: row.orderNo, updatedAt: row.updatedAt });
        else await api.create({ ...payload, orderNo: nextOrderNo() });
        toast(t('toast.saved'), 'success');
        close();
        await reload();
      } catch (e) { save.disabled = false; showErr(err, (e && e.message) || t('err.GENERIC')); }
    });
  }

  function showErr(el2, msg) { el2.textContent = msg; el2.style.display = ''; }

  // Üretim/stok siparişi için takip no: SP-<yıl>-<sıra>.
  function nextOrderNo() {
    const year = new Date().getFullYear();
    let max = 0;
    for (const o of orders) { const m = String(o.orderNo || '').match(new RegExp('^SP-' + year + '-(\\d+)$')); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    return `SP-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  async function remove(order) {
    const wos = woByOrder.get(order.id) || [];
    if (wos.length) { toast(t('uo.delBlocked', { n: wos.length }), 'danger'); return; }
    const ok = await confirmDialog({ title: t('uo.delTitle'), body: t('uo.delBody', { no: order.orderNo || '' }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(order.id); toast(t('toast.deleted'), 'success'); await reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function badgeColor(cls) {
  return cls === 'success' ? 'var(--color-success)' : cls === 'danger' ? 'var(--color-danger)'
    : cls === 'warning' ? 'var(--color-warning)' : cls === 'neutral' ? 'var(--color-neutral-500)' : 'var(--color-accent-500)';
}
