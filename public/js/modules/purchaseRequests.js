// Satınalma İstekleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// malzeme listeden seçilir (material_code_id FK, opsiyonel). Birim açılır liste (adet/kg).
// i18n: kullanıcıya görünen metinler t() ile; etiketler () => t(...) (canlı dil değişimi).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, UNIT_OPTIONS } from '../core/lookups.js';
import { childTable } from './_childDetail.js';
import { t } from '../core/i18n.js';

const api = resource('purchase-requests');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewPurchaseRequests(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, orders, receiptsByReq;
  try {
    products = await loadLookup('product-codes', mapProduct);
    orders = await loadLookup('orders', (o) => ({ id: o.id, code: o.orderNo, name: products.label(o.productCodeId) }));
    receiptsByReq = await loadReceipts();
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewPurchaseRequests(container) })); return; }

  // Satınalma girişleri istek bazında gruplanır (genişleyen satır için).
  async function loadReceipts() {
    const { data } = await resource('purchase-receipts').listAll();
    const m = new Map();
    for (const g of data) { if (!m.has(g.purchaseRequestId)) m.set(g.purchaseRequestId, []); m.get(g.purchaseRequestId).push(g); }
    return m;
  }

  const table = new DataTable(container, {
    title: () => t('menu.purchase-requests'),
    subtitle: () => t('pr.subtitle'),
    canWrite,
    addLabel: () => t('action.newRequest'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.materialCodeId), r.supplier].join(' '),
    emptyMessage: () => t('pr.empty'),
    // Malzemesi seçilmemiş (ETL'de koda çözülemeyen) istekler işaretlenir.
    rowClass: (r) => r.materialCodeId ? '' : 'row-warn',
    flagFilter: { test: (r) => !r.materialCodeId, label: (n) => t('pr.noMaterialCount', { n }) },
    // Genişleyen satır: bu isteğe bağlı satınalma girişleri (expand her çizimde t() yeniden çözer).
    expand: (r) => childTable(
      [{ label: t('field.date'), key: 'date' },
       { label: t('field.quantity'), render: (g) => esc(String(g.quantity ?? '—')), mono: true },
       { label: t('field.note'), render: (g) => esc(g.note || '—') }],
      receiptsByReq.get(r.id) || [], t('pr.noReceipts')),
    columns: [
      { label: () => t('field.material'), render: (r) => r.materialCodeId
          ? esc(products.label(r.materialCodeId))
          : `<span class="cell-empty">${esc(t('common.notSelected'))}</span>` },
      { label: () => t('field.quantity'), render: (r) => r.quantity ?? '—', className: 'mono' },
      { label: () => t('field.unit'), render: (r) => esc(r.unit || '—') },
      { label: () => t('field.supplier'), render: (r) => esc(r.supplier || '—') },
      { label: () => t('field.requestDate'), render: (r) => esc(r.requestDate || '—') },
      { label: () => t('field.expectedDate'), render: (r) => esc(r.expectedDate || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: t('pr.selectMaterial') });
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('pr.selectProduct') });
    const orderFk = new FkSelect({ source: orders.source, rows: orders.rows, value: row?.orderId ?? null, placeholder: t('pr.selectOrderOpt') });
    openDrawer({
      title: () => t(editing ? 'pr.editTitle' : 'pr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { unit: '' },
      fields: [
        { name: 'materialCodeId', label: () => t('field.material'), type: 'fk', fk: materialFk, required: true,
          help: () => t('pr.materialHelp') },
        { name: 'quantity', label: () => t('field.quantity'), type: 'number', step: 'any' },
        { name: 'unit', label: () => t('field.unit'), type: 'select', options: UNIT_OPTIONS },
        { name: 'supplier', label: () => t('field.supplier'), type: 'text' },
        { name: 'requestDate', label: () => t('field.requestDate'), type: 'date' },
        { name: 'expectedDate', label: () => t('field.expectedDate'), type: 'date' },
        { name: 'productCodeId', label: () => t('pr.productFor'), type: 'fk', fk: productFk },
        { name: 'orderId', label: () => t('pr.linkedOrder'), type: 'fk', fk: orderFk },
        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t('toast.saved'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('pr.deleteTitle'),
      body: t('pr.deleteBody', { name: products.label(row.materialCodeId) }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
