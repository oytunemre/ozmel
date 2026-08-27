// Kapasiteler — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// product_code_id + work_center_id FK. Bir ürün-iş merkezi çifti için tek kapasite.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';

const api = resource('capacities');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewCapacities(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
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
    title: 'Kapasite Yönetimi',
    subtitle: 'İş merkezi başına vardiya kapasitesi',
    canWrite,
    addLabel: 'Yeni Kapasite',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), centers.label(r.workCenterId)].join(' '),
    emptyMessage: 'Henüz kapasite eklenmemiş. "Yeni Kapasite" ile başlayın.',
    columns: [
      { label: 'İş Merkezi', render: (r) => esc(centers.label(r.workCenterId)) },
      { label: 'Ürün / Parça', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Adet / vardiya', key: 'capacityPerShift', className: 'mono' },
      { label: 'Dakika', render: (r) => r.minutes ?? '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: 'İş merkezi seçin…' });

    openDrawer({
      title: editing ? 'Kapasite Düzenle' : 'Yeni Kapasite',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'workCenterId', label: 'İş Merkezi', type: 'fk', fk: centerFk, required: true },
        { name: 'capacityPerShift', label: 'Kapasite (vardiya başı)', type: 'number', step: 'any', required: true },
        { name: 'minutes', label: 'Dakika', type: 'number', step: 'any' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Kapasite güncellendi' : 'Kapasite eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Kapasite silinsin mi?',
      body: `${products.label(row.productCodeId)} · ${centers.label(row.workCenterId)} kaydı silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Kapasite silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
