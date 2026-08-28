// İş Emirleri — v2 modülü. Tasarım: Is-Emirleri.dc.html.
// Tablo + drawer. "Üretilen / Hedef" ve ilerleme, üretim kayıtlarından toplanır.
// i18n: etiketler () => t(...); vardiya/durum değerleri BE'de TR saklanır, t/tStatus ile gösterilir.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, ORDER_STATUS_OPTIONS, withCurrent } from '../core/lookups.js';
import { childTable } from './_childDetail.js';
import { t, tStatus } from '../core/i18n.js';

const api = resource('work-orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const shiftLabel = (s) => s ? t('shift.' + s) : '—';

export async function viewWorkOrders(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, orders, producedByWo, prodByWo;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    orders = await loadLookup('orders', (o) => ({ id: o.id, code: o.orderNo, name: products.label(o.productCodeId) }));
    ({ producedByWo, prodByWo } = await loadProduction());
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkOrders(container) }));
    return;
  }

  // Üretim kayıtları bir kez çekilir: hem üretilen adet toplamı hem iş emri bazında liste.
  async function loadProduction() {
    const { data } = await resource('production').listAll();
    const producedByWo = new Map();
    const prodByWo = new Map();
    for (const p of data) {
      producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
      if (!prodByWo.has(p.workOrderId)) prodByWo.set(p.workOrderId, []);
      prodByWo.get(p.workOrderId).push(p);
    }
    return { producedByWo, prodByWo };
  }

  const table = new DataTable(container, {
    title: () => t('menu.work-orders'),
    subtitle: () => t('wo.subtitle'),
    focusId: params?.id,   // çapraz bağlantı: #work-orders?id=… geldiğinde o satıra git
    canWrite,
    addLabel: () => t('wo.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.woNo, products.label(r.productCodeId), centers.label(r.workCenterId)].join(' '),
    emptyMessage: () => t('wo.empty'),
    expand: (r) => childTable([
      { label: t('field.date'), key: 'date' },
      { label: t('field.shift'), render: (p) => esc(shiftLabel(p.shift)) },
      { label: t('field.actualQuantity'), render: (p) => esc(String(p.actualQuantity ?? '—')), mono: true },
      { label: t('field.scrap'), render: (p) => esc(String(p.scrapQuantity ?? '—')), mono: true }
    ], prodByWo.get(r.id) || [], t('wo.noProduction')),
    columns: [
      { label: () => t('field.workOrderNo'), key: 'woNo', className: 'mono' },
      { label: () => t('field.product'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('field.operation'), render: (r) => r.operationId ? esc(ops.label(r.operationId)) : '—' },
      { label: () => t('field.workCenter'), render: (r) => r.workCenterId ? esc(centers.label(r.workCenterId)) : '—' },
      { label: () => t('field.producedTarget'), render: (r) => `<span class="mono">${producedByWo.get(r.id) || 0} / ${r.targetQuantity}</span>` },
      { label: () => t('field.progress'), render: (r) => progress(producedByWo.get(r.id) || 0, r.targetQuantity) },
      { label: () => t('field.status'), render: (r) => esc(tStatus(r.status) || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const orderFk = new FkSelect({ source: orders.source, rows: orders.rows, value: row?.orderId ?? null, placeholder: t('wo.selectOrder') });
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('wo.selectProduct') });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: t('wo.selectOperation') });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: t('wo.selectCenter') });
    openDrawer({
      title: () => t(editing ? 'wo.editTitle' : 'wo.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'wo.open'),
      values: editing ? { ...row } : { status: 'Aktif' },
      fields: [
        { name: 'woNo', label: () => t('field.workOrderNo'), type: 'text', required: true },
        { name: 'orderId', label: () => t('menu.orders'), type: 'fk', fk: orderFk, required: true },
        { name: 'productCodeId', label: () => t('field.product'), type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: () => t('field.operation'), type: 'fk', fk: opFk },
        { name: 'workCenterId', label: () => t('field.workCenter'), type: 'fk', fk: centerFk },
        { name: 'sequence', label: () => t('field.sequence'), type: 'number' },
        { name: 'targetQuantity', label: () => t('field.targetQuantity'), type: 'number', step: 'any', required: true },
        { name: 'status', label: () => t('field.status'), type: 'select', required: true, options: withCurrent(ORDER_STATUS_OPTIONS.map(o => ({ value: o.value, label: tStatus(o.value) })), row?.status) },
        { name: 'splitLabel', label: () => t('field.splitLabel'), type: 'text' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t('toast.saved'), 'success'); ({ producedByWo, prodByWo } = await loadProduction()); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('wo.deleteTitle'),
      body: t('wo.deleteBody', { no: row.woNo }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); ({ producedByWo, prodByWo } = await loadProduction()); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

function progress(done, target) {
  const tgt = Number(target) || 0;
  const pct = tgt > 0 ? Math.min(100, Math.round((done / tgt) * 100)) : 0;
  return `<span class="progress"><span class="bar"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></span><span class="pct">${pct}%</span></span>`;
}
