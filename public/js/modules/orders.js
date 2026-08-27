// Siparişler (Üretim Siparişleri) — v2 modülü. Tasarım: Uretim-Siparisleri.dc.html.
// Standart tablo + drawer. Kaynak: satış / üretim / stok.
// i18n: etiketler () => t(...); durum/kaynak değerleri BE'de TR saklanır, tStatus/t ile gösterilir.

import { resource, request } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, withCurrent } from '../core/lookups.js';
import { childTable } from './_childDetail.js';
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
    expand: (r) => childTable([
      { label: t('field.workOrderNo'), key: 'woNo', mono: true },
      { label: t('field.operation'), render: (w) => esc(w.operationId ? ops.label(w.operationId) : '—') },
      { label: t('field.workCenter'), render: (w) => esc(w.workCenterId ? centers.label(w.workCenterId) : '—') },
      { label: t('field.producedTarget'), render: (w) => `${producedByWo.get(w.id) || 0} / ${esc(String(w.targetQuantity ?? '—'))}`, mono: true }
    ], woByOrder.get(r.id) || [], t('ord.noWorkOrders')),
    columns: [
      { label: () => t('field.orderNo'), key: 'orderNo', className: 'mono' },
      { label: () => t('field.product'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('field.quantity'), render: (r) => r.targetQuantity, className: 'mono' },
      { label: () => t('field.dueDate'), render: (r) => esc(r.requestedDeliveryDate || '—') },
      { label: () => t('field.source'), render: (r) => `<span class="tag tag-neutral">${esc(r.source ? t('src.' + r.source) : '—')}</span>` },
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
        { name: 'status', label: () => t('field.status'), type: 'select', required: true, options: withCurrent(statuses.map(s => ({ value: s, label: tStatus(s) })), row?.status) },
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
