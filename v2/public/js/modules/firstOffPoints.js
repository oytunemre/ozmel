// First-Off Noktaları — v2 modülü. Standart tablo + drawer.
// Ürün + operasyon FK; ölçüsel/nitel tip; nominal/alt/üst limit.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';

const api = resource('first-off-points');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const TYPES = [
  { value: '', label: '— Tip seçin —' },
  { value: 'olcusel', label: 'Ölçüsel' },
  { value: 'nitel', label: 'Nitel' }
];

export async function viewFirstOffPoints(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewFirstOffPoints(container) })); return; }

  const table = new DataTable(container, {
    title: 'First-Off Noktaları',
    subtitle: 'İlk parça kontrolünde ölçülecek noktalar',
    canWrite,
    addLabel: 'Yeni Nokta',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.characteristic].join(' '),
    emptyMessage: 'Henüz nokta yok. "Yeni Nokta" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => esc(ops.label(r.operationId)) },
      { label: 'No', key: 'pointNo', className: 'mono' },
      { label: 'Karakteristik', key: 'characteristic' },
      { label: 'Tip', render: (r) => esc(r.type) },
      { label: 'Nominal', render: (r) => r.nominal ?? '—', className: 'mono' },
      { label: 'Birim', render: (r) => esc(r.unit || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    openDrawer({
      title: editing ? 'Nokta Düzenle' : 'Yeni Nokta',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { type: '' },
      fields: [
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: 'Operasyon', type: 'fk', fk: opFk, required: true },
        { name: 'pointNo', label: 'Nokta No', type: 'number', required: true },
        { name: 'characteristic', label: 'Karakteristik', type: 'text', required: true },
        { name: 'type', label: 'Tip', type: 'select', required: true, options: TYPES },
        { name: 'nominal', label: 'Nominal', type: 'number', step: 'any' },
        { name: 'lowerLimit', label: 'Alt Limit', type: 'number', step: 'any' },
        { name: 'upperLimit', label: 'Üst Limit', type: 'number', step: 'any' },
        { name: 'unit', label: 'Birim', type: 'text' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Nokta güncellendi' : 'Nokta eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Nokta silinsin mi?', body: `"${row.characteristic}" noktası silinecek.`, confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Nokta silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
