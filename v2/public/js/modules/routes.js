// Rotalar — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// urun/operasyon/isMerkezi FK; varyantlar ÇOCUK tablo (serbest metin çoklu giriş).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { TagList } from '../core/taglist.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';

const api = resource('routes');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewRoutes(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, centers;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewRoutes(container) }));
    return;
  }

  const table = new DataTable(container, {
    title: 'Rotalar',
    canWrite,
    addLabel: 'Yeni Rota',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), centers.label(r.workCenterId)].join(' '),
    emptyMessage: 'Henüz rota eklenmemiş. "Yeni Rota" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => esc(ops.label(r.operationId)) },
      { label: 'İş Merkezi', render: (r) => esc(centers.label(r.workCenterId)) },
      { label: 'Sıra', key: 'sequence', className: 'mono' },
      { label: 'Varyantlar', render: (r) => r.variants.length ? esc(r.variants.join(', ')) : '—' },
      { label: 'Aktif', render: (r) => r.isActive ? '<span class="tag tag-success">Aktif</span>' : '<span class="tag tag-neutral">Pasif</span>' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: 'İş merkezi seçin…' });
    const variants = new TagList({ value: row?.variants ?? [], placeholder: 'Varyant yaz ve Enter…' });

    openDrawer({
      title: editing ? 'Rota Düzenle' : 'Yeni Rota',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { sequence: 0, isActive: 1 },
      fields: [
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: 'Operasyon', type: 'fk', fk: opFk, required: true },
        { name: 'workCenterId', label: 'İş Merkezi', type: 'fk', fk: centerFk, required: true },
        { name: 'sequence', label: 'Sıra', type: 'number', required: true },
        { name: 'variantLabel', label: 'Varyant Etiketi', type: 'text' },
        { name: 'variants', label: 'Varyant Seçenekleri', type: 'tags', tags: variants,
          help: 'Serbest metin; yaz ve Enter ile ekle.' },
        { name: 'isActive', label: 'Aktif', type: 'bool' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Rota güncellendi' : 'Rota eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Rota silinsin mi?',
      body: `${products.label(row.productCodeId)} · ${ops.label(row.operationId)} rotası silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Rota silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
