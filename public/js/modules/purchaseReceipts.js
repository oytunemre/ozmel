// Satınalma Girişleri — v2 modülü. Bir satınalma isteğine bağlıdır (malzeme oradan gelir).
// i18n: etiketler () => t(...). Bağlı istekte malzeme NULL ise lookups.label -> "seçilmedi".

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';
import { t } from '../core/i18n.js';

const api = resource('purchase-receipts');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewPurchaseReceipts(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, requests;
  try {
    products = await loadLookup('product-codes', mapProduct);
    requests = await loadLookup('purchase-requests', (r) => ({ id: r.id, code: '#' + r.id, name: products.label(r.materialCodeId) }));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewPurchaseReceipts(container) })); return; }

  const table = new DataTable(container, {
    title: () => t('menu.purchase-receipts'),
    subtitle: () => t('prc.subtitle'),
    canWrite,
    addLabel: () => t('prc.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => requests.label(r.purchaseRequestId),
    emptyMessage: () => t('prc.empty'),
    columns: [
      { label: () => t('prc.requestCol'), render: (r) => esc(requests.label(r.purchaseRequestId)) },
      { label: () => t('field.date'), render: (r) => esc(r.date || '—') },
      { label: () => t('field.quantity'), render: (r) => r.quantity ?? '—', className: 'mono' },
      { label: () => t('field.note'), render: (r) => esc(r.note || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const requestFk = new FkSelect({ source: requests.source, rows: requests.rows, value: row?.purchaseRequestId ?? null, placeholder: t('prc.selectRequest') });
    openDrawer({
      title: () => t(editing ? 'prc.editTitle' : 'prc.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.save'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'purchaseRequestId', label: () => t('prc.request'), type: 'fk', fk: requestFk, required: true,
          help: () => t('prc.requestHelp') },
        { name: 'date', label: () => t('field.date'), type: 'date' },
        { name: 'quantity', label: () => t('field.quantity'), type: 'number', step: 'any' },
        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'prc.updated' : 'prc.saved'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('prc.deleteTitle'), body: t('prc.deleteBody'), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('prc.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
