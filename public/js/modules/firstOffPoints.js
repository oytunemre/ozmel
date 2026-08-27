// First-Off Noktaları — v2 modülü. Standart tablo + drawer.
// Ürün + operasyon FK; ölçüsel/nitel tip; nominal/alt/üst limit.
// i18n: etiketler () => t(...); tip değeri BE'de TR saklanır (olcusel/nitel), t ile gösterilir.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, fmtMeasure, withCurrent } from '../core/lookups.js';
import { t } from '../core/i18n.js';

const api = resource('first-off-points');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Nokta tipi: BE değeri olcusel/nitel; ekranda dile göre etiket. Beklenmedik eski
// değer için t() anahtarı yoksa ham değeri gösteririz.
const typeLabel = (v) => { if (!v) return '—'; const k = 'qc.' + v; const s = t(k); return s === k ? v : s; };
const typeOptions = () => [{ value: 'olcusel', label: t('qc.olcusel') }, { value: 'nitel', label: t('qc.nitel') }];
const unitOptions = () => [{ value: '', label: t('qc.unitPlaceholder') }, { value: 'mm', label: 'mm' }];

export async function viewFirstOffPoints(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewFirstOffPoints(container) })); return; }

  const table = new DataTable(container, {
    title: () => t('menu.first-off-points'),
    subtitle: () => t('fp.subtitle'),
    canWrite,
    addLabel: () => t('fp.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.characteristic].join(' '),
    emptyMessage: () => t('fp.empty'),
    columns: [
      { label: () => t('field.productShort'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('field.operation'), render: (r) => esc(ops.label(r.operationId)) },
      { label: () => t('field.no'), key: 'pointNo', className: 'mono' },
      { label: () => t('field.characteristic'), key: 'characteristic' },
      { label: () => t('field.type'), render: (r) => esc(typeLabel(r.type)) },
      { label: () => t('field.nominal'), render: (r) => fmtMeasure(r.nominal), className: 'mono' },
      { label: () => t('field.unit'), render: (r) => esc(r.unit || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: t('wo.selectOperation') });
    openDrawer({
      title: () => t(editing ? 'fp.editTitle' : 'fp.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { type: '' },
      fields: [
        { name: 'productCodeId', label: () => t('field.productShort'), type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: () => t('field.operation'), type: 'fk', fk: opFk, required: true },
        { name: 'pointNo', label: () => t('field.pointNo'), type: 'number', required: true },
        { name: 'characteristic', label: () => t('field.characteristic'), type: 'text', required: true },
        { name: 'type', label: () => t('field.type'), type: 'select', required: true, options: withCurrent(typeOptions(), row?.type) },
        { name: 'nominal', label: () => t('field.nominal'), type: 'number', step: 'any' },
        { name: 'lowerLimit', label: () => t('field.lowerLimit'), type: 'number', step: 'any' },
        { name: 'upperLimit', label: () => t('field.upperLimit'), type: 'number', step: 'any' },
        { name: 'unit', label: () => t('field.unit'), type: 'select', options: withCurrent(unitOptions(), row?.unit) }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'fp.updated' : 'fp.added'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('fp.deleteTitle'), body: t('fp.deleteBody', { name: row.characteristic }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('fp.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
