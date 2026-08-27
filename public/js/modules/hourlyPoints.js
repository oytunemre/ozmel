// Saatlik Kontrol Noktaları — v2 modülü. Standart tablo + drawer.
// Ürün + operasyon FK; ölçüm yeri; ölçüsel/nitel; nominal/alt/üst limit.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, MEASURE_UNIT_OPTIONS, POINT_TYPE_OPTIONS, optionLabel, fmtMeasure, withCurrent } from '../core/lookups.js';

const api = resource('hourly-points');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewHourlyPoints(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewHourlyPoints(container) })); return; }

  const table = new DataTable(container, {
    title: 'Saatlik Kontrol Noktaları',
    subtitle: 'Saatlik kontrolde ölçülecek noktalar',
    canWrite,
    addLabel: 'Yeni Nokta',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.measureLocation].join(' '),
    emptyMessage: 'Henüz nokta yok. "Yeni Nokta" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => esc(ops.label(r.operationId)) },
      { label: 'Ölçüm Yeri', key: 'measureLocation' },
      { label: 'Tip', render: (r) => esc(optionLabel(POINT_TYPE_OPTIONS, r.type)) },
      { label: 'Nominal', render: (r) => fmtMeasure(r.nominal), className: 'mono' },
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
        { name: 'measureLocation', label: 'Ölçüm Yeri', type: 'text', required: true },
        { name: 'type', label: 'Tip', type: 'select', required: true, options: withCurrent(POINT_TYPE_OPTIONS, row?.type) },
        { name: 'nominal', label: 'Nominal', type: 'number', step: 'any' },
        { name: 'lowerLimit', label: 'Alt Limit', type: 'number', step: 'any' },
        { name: 'upperLimit', label: 'Üst Limit', type: 'number', step: 'any' },
        { name: 'unit', label: 'Birim', type: 'select', options: withCurrent(MEASURE_UNIT_OPTIONS, row?.unit) }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Nokta güncellendi' : 'Nokta eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Nokta silinsin mi?', body: `"${row.measureLocation}" noktası silinecek.`, confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Nokta silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
