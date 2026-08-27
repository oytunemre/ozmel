// Kapasiteler — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// product_code_id + work_center_id FK. Bir ürün-iş merkezi çifti için tek kapasite.
// i18n: etiketler () => t(...).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t } from '../core/i18n.js';

const api = resource('capacities');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewCapacities(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, centers;
  try {
    products = await loadLookup('product-codes', mapProduct);
    centers = await loadLookup('work-centers', mapNamed);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewCapacities(container) }));
    return;
  }

  const table = new DataTable(container, {
    title: () => t('cap.title'),
    subtitle: () => t('cap.subtitle'),
    canWrite,
    addLabel: () => t('cap.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), centers.label(r.workCenterId)].join(' '),
    emptyMessage: () => t('cap.empty'),
    columns: [
      { label: () => t('field.workCenter'), render: (r) => esc(centers.label(r.workCenterId)) },
      { label: () => t('field.product'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('cap.perShiftCol'), key: 'capacityPerShift', className: 'mono' },
      { label: () => t('cap.minutes'), render: (r) => r.minutes ?? '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: t('wo.selectCenter') });

    openDrawer({
      title: () => t(editing ? 'cap.editTitle' : 'cap.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'productCodeId', label: () => t('field.productShort'), type: 'fk', fk: productFk, required: true },
        { name: 'workCenterId', label: () => t('field.workCenter'), type: 'fk', fk: centerFk, required: true },
        { name: 'capacityPerShift', label: () => t('cap.perShift'), type: 'number', step: 'any', required: true },
        { name: 'minutes', label: () => t('cap.minutes'), type: 'number', step: 'any' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(t(editing ? 'cap.updated' : 'cap.added'), 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('cap.deleteTitle'),
      body: t('cap.deleteBody', { name: `${products.label(row.productCodeId)} · ${centers.label(row.workCenterId)}` }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('cap.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
