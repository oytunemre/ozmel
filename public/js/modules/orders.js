// Siparişler (Üretim Siparişleri) — v2 modülü. Tasarım: Uretim-Siparisleri.dc.html.
// Standart tablo + drawer. Kaynak: satış / üretim / stok.
// i18n: etiketler () => t(...); durum/kaynak değerleri BE'de TR saklanır, tStatus/t ile gösterilir.
//
// Genişleyen satır = sipariş DETAY paneli: sipariş bilgileri, bağlı iş emirleri
// (üretilen + ilerleme + kalan), ilgili kalite kayıtları (tembel yüklenir). Çapraz
// bağlantılar: iş emri satırı -> #work-orders?id=…, ürün -> #product-codes?id=…
// (mevcut hash router'daki ?id deseni; hedef modül DataTable.focusId ile o satıra gider).

import { resource, request } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, outOfTolerance } from '../core/lookups.js';
import { childTable, childFields } from './_childDetail.js';
import { t, tStatus } from '../core/i18n.js';

const api = resource('orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Durum -> renk tonu (rozet). Durum LİSTESİ backend'den; harita yalnızca SUNUM (renk).
const STATUS_TONE = {
  'Hammadde Bekleniyor': 'warn', 'Üretimde': 'accent', 'Kalite Kontrolde': 'warn',
  'Sevke Hazır': 'accent', 'Kısmi Sevk': 'accent', 'Sevk Edildi': 'success',
  'İade': 'danger', 'Tamamlandı': 'success', 'İptal': 'danger'
};
const statusBadge = (s) => s
  ? `<span class="status-badge ${STATUS_TONE[s] || 'neutral'}">${esc(tStatus(s))}</span>`
  : '—';
// Kaynak seçenekleri (çevrilmiş; drawer açılışında kurulur).
const sourceOptions = () => [
  { value: '', label: t('src.select') }, { value: 'satis', label: t('src.satis') },
  { value: 'uretim', label: t('src.uretim') }, { value: 'stok', label: t('src.stok') }
];
const srcLabel = (v) => v ? t('src.' + v) : '—';
// İlerleme çubuğu (workOrders.js ile aynı .progress/.bar/.pct düzeni).
const progressBar = (done, target) => {
  const tgt = Number(target) || 0;
  const pct = tgt > 0 ? Math.min(100, Math.round((done / tgt) * 100)) : 0;
  return `<span class="progress"><span class="bar"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></span><span class="pct">${tgt > 0 ? pct + '%' : '—'}</span></span>`;
};
const go = (key, id) => { location.hash = `#${key}?id=${id}`; };   // hash router çapraz bağlantısı

export async function viewOrders(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, woByOrder, producedByWo, statuses;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    statuses = (await request('/order-statuses')).data;   // 9 aşamalı akış (tek kaynak: BE)
    ({ woByOrder, producedByWo } = await loadWorkOrders());
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewOrders(container) })); return; }

  async function loadWorkOrders() {
    const [{ data: wos }, { data: prod }] = await Promise.all([
      resource('work-orders').listAll(), resource('production').listAll()
    ]);
    const producedByWo = new Map();
    for (const p of prod) producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
    const woByOrder = new Map();
    for (const w of wos) { if (!woByOrder.has(w.orderId)) woByOrder.set(w.orderId, []); woByOrder.get(w.orderId).push(w); }
    return { woByOrder, producedByWo };
  }

  // Kalite kayıtları YALNIZCA bir detay ilk açıldığında çekilir (liste ekranını
  // yavaşlatmamak için). Ürün koduna göre { fo, hr, out } — out = tolerans dışı ölçüm.
  let qualityPromise = null;
  function ensureQuality() {
    if (!qualityPromise) qualityPromise = loadQuality();
    return qualityPromise;
  }
  async function loadQuality() {
    const [{ data: fo }, { data: hr }, { data: fop }, { data: hp }] = await Promise.all([
      resource('first-off-records').listAll(), resource('hourly-records').listAll(),
      resource('first-off-points').listAll(), resource('hourly-points').listAll()
    ]);
    const foPt = new Map(fop.map(p => [p.id, p]));
    const hpPt = new Map(hp.map(p => [p.id, p]));
    const byProduct = new Map();
    const bump = (pc) => { if (pc == null) return null; if (!byProduct.has(pc)) byProduct.set(pc, { fo: 0, hr: 0, out: 0 }); return byProduct.get(pc); };
    for (const f of fo) {
      const e = bump(f.productCodeId); if (!e) continue; e.fo++;
      for (const m of (f.measurements || [])) { const p = foPt.get(m.pointId); if (p && outOfTolerance(m.value, p.lowerLimit, p.upperLimit)) e.out++; }
    }
    for (const h of hr) {
      const e = bump(h.productCodeId); if (!e) continue; e.hr++;
      for (const m of (h.measurements || [])) for (const v of (m.values || [])) { const p = hpPt.get(m.pointId); if (p && outOfTolerance(v, p.lowerLimit, p.upperLimit)) e.out++; }
    }
    return byProduct;
  }

  // Sipariş detay paneli (genişleyen satır).
  function orderDetail(r) {
    const box = el('div', 'order-detail');
    const wos = woByOrder.get(r.id) || [];
    const producedTotal = wos.reduce((a, w) => a + (producedByWo.get(w.id) || 0), 0);
    const tq = Number(r.targetQuantity);
    const remaining = Number.isFinite(tq) ? tq - producedTotal : null;

    // 1) Sipariş bilgileri — ürün tıklanınca Ürün Kodları'na gider.
    const productLink = `<a class="xlink" href="#product-codes?id=${r.productCodeId}" title="${esc(t('ord.openProduct'))}">${esc(products.label(r.productCodeId))}</a>`;
    box.append(secTitle(t('ord.detailInfo'), true));
    box.append(childFields([
      { label: t('field.customer'), value: r.customer },
      { label: t('field.product'), value: productLink, html: true },
      { label: t('field.targetQuantity'), value: r.targetQuantity, mono: true },
      { label: t('field.startDate'), value: r.startDate },
      { label: t('field.dueDate'), value: r.requestedDeliveryDate },
      { label: t('field.source'), value: srcLabel(r.source) },
      { label: t('field.status'), value: statusBadge(r.status), html: true }
    ], t('common.emptyHint')));

    // 2) Sipariş geneli — kalan = hedef − toplam üretilen + ilerleme.
    box.append(secTitle(t('ord.detailSummary')));
    box.append(childFields([
      { label: t('field.targetQuantity'), value: Number.isFinite(tq) ? tq : '—', mono: true },
      { label: t('ord.produced'), value: producedTotal, mono: true },
      { label: t('ord.remaining'), value: remaining != null ? remaining : '—', mono: true },
      { label: t('field.progress'), value: progressBar(producedTotal, tq), html: true }
    ], t('common.emptyHint')));

    // 3) Bağlı iş emirleri — satır tıklanınca İş Emirleri'ne gider.
    box.append(secTitle(t('menu.work-orders')));
    const woTable = childTable([
      { label: t('field.workOrderNo'), key: 'woNo', mono: true },
      { label: t('field.splitLabel'), render: (w) => esc(w.splitLabel || '—') },
      { label: t('field.operation'), render: (w) => esc(w.operationId ? ops.label(w.operationId) : '—') },
      { label: t('field.workCenter'), render: (w) => esc(w.workCenterId ? centers.label(w.workCenterId) : '—') },
      { label: t('field.targetQuantity'), render: (w) => esc(String(w.targetQuantity ?? '—')), mono: true },
      { label: t('ord.produced'), render: (w) => producedByWo.get(w.id) || 0, mono: true },
      { label: t('field.progress'), render: (w) => progressBar(producedByWo.get(w.id) || 0, w.targetQuantity) },
      { label: t('field.status'), render: (w) => esc(tStatus(w.status) || '—') }
    ], wos, t('ord.noWorkOrders'));
    // Satırları tıklanabilir yap (childTable sırayı korur -> wos[i] ile eşleşir).
    woTable.querySelectorAll('tbody tr').forEach((tr, i) => {
      const w = wos[i]; if (!w) return;
      tr.classList.add('clickable');
      tr.title = t('ord.openWorkOrder');
      tr.addEventListener('click', () => go('work-orders', w.id));
    });
    box.append(woTable);

    // 4) İlgili kalite kayıtları — tembel yüklenir (sayılar + tolerans dışı uyarısı).
    box.append(secTitle(t('ord.detailQuality')));
    const qbox = el('div', 'child-detail');
    qbox.innerHTML = `<div class="cd-empty">${esc(t('common.loading'))}</div>`;
    box.append(qbox);
    ensureQuality().then((map) => {
      if (!document.body.contains(qbox)) return;   // detay kapandı/başka modüle geçildi
      const e = map.get(r.productCodeId);
      qbox.innerHTML = '';
      qbox.append(qualityChips(e));
    }).catch(() => { qbox.innerHTML = `<div class="cd-empty">${esc(t('err.GENERIC'))}</div>`; });

    return box;
  }

  function qualityChips(e) {
    const wrap = el('div', 'cd-chips');
    if (!e || (e.fo === 0 && e.hr === 0)) { wrap.innerHTML = `<span class="text-muted">${esc(t('ord.noQuality'))}</span>`; return wrap; }
    const chips = [
      `<span class="tag tag-neutral">${esc(t('ord.qFirstOff'))}: ${e.fo}</span>`,
      `<span class="tag tag-neutral">${esc(t('ord.qHourly'))}: ${e.hr}</span>`
    ];
    if (e.out > 0) chips.push(`<span class="tag tag-danger">${esc(t('ord.outOfTol', { n: e.out }))}</span>`);
    wrap.innerHTML = chips.join('');
    return wrap;
  }

  const table = new DataTable(container, {
    title: () => t('ord.title'),
    subtitle: () => t('ord.subtitle'),
    canWrite,
    addLabel: () => t('ord.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.orderNo, products.label(r.productCodeId), r.customer, r.status].join(' '),
    emptyMessage: () => t('ord.empty'),
    facetFilter: { values: statuses, get: (r) => r.status, label: (v) => tStatus(v) },
    expand: (r) => orderDetail(r),
    expandOnRowClick: true,   // sipariş satırına/numarasına tıklanınca detay açılır (chevron da çalışır)
    columns: [
      { label: () => t('field.orderNo'), key: 'orderNo', className: 'mono' },
      { label: () => t('field.product'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('field.quantity'), render: (r) => r.targetQuantity, className: 'mono' },
      { label: () => t('field.dueDate'), render: (r) => esc(r.requestedDeliveryDate || '—') },
      { label: () => t('field.source'), render: (r) => `<span class="tag tag-neutral">${esc(srcLabel(r.source))}</span>` },
      { label: () => t('field.status'), render: (r) => statusBadge(r.status) }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    openDrawer({
      title: () => t(editing ? 'ord.editTitle' : 'ord.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { source: '', status: statuses[0] },
      fields: [
        { name: 'secId', type: 'section', label: () => t('ord.secOrder') },
        { name: 'orderNo', label: () => t('field.orderNo'), type: 'text', required: true },
        { name: 'source', label: () => t('field.source'), type: 'select', required: true, options: sourceOptions() },
        { name: 'status', label: () => t('field.status'), type: 'select', required: true, options: statuses.map(s => ({ value: s, label: tStatus(s) })) },
        { name: 'productCodeId', label: () => t('field.product'), type: 'fk', fk: productFk, required: true },
        { name: 'targetQuantity', label: () => t('field.targetQuantity'), type: 'number', step: 'any', required: true },
        { name: 'secDates', type: 'section', label: () => t('ord.secDates') },
        { name: 'startDate', label: () => t('field.startDate'), type: 'date' },
        { name: 'requestedDeliveryDate', label: () => t('field.requestedShipDate'), type: 'date' },
        { name: 'customer', label: () => t('field.customer'), type: 'text' },
        { name: 'salesOrderNo', label: () => t('field.salesOrderNo'), type: 'text' },
        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t('toast.saved'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('ord.deleteTitle'),
      body: t('ord.deleteBody', { no: row.orderNo }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function secTitle(text, first) {
  const d = el('div', 'cd-sectitle' + (first ? ' first' : ''));
  d.textContent = text;
  return d;
}
