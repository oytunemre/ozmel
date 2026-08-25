// Siparişler (Üretim Siparişleri) — v2 modülü. Tasarım: Uretim-Siparisleri.dc.html.
// Standart tablo + drawer. Kaynak: satış / üretim / stok.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';

const api = resource('orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const SOURCES = [
  { value: '', label: '— Kaynak seçin —' },
  { value: 'satis', label: 'Satış' },
  { value: 'uretim', label: 'Üretim' },
  { value: 'stok', label: 'Stok' }
];
const SRC_LABEL = { satis: 'Satış', uretim: 'Üretim', stok: 'Stok' };

export async function viewOrders(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products;
  try { products = await loadLookup('product-codes', mapProduct); }
  catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewOrders(container) })); return; }

  const table = new DataTable(container, {
    title: 'Üretim Siparişleri',
    subtitle: 'Satış siparişinden ya da stok tamamlamadan açılan üretim talepleri',
    canWrite,
    addLabel: 'Yeni Sipariş',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.orderNo, products.label(r.productCodeId), r.customer].join(' '),
    emptyMessage: 'Henüz sipariş yok. "Yeni Sipariş" ile başlayın.',
    columns: [
      { label: 'Sipariş No', key: 'orderNo', className: 'mono' },
      { label: 'Ürün / Parça', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Miktar', render: (r) => r.targetQuantity, className: 'mono' },
      { label: 'Termin', render: (r) => esc(r.requestedDeliveryDate || '—') },
      { label: 'Kaynak', render: (r) => `<span class="tag tag-neutral">${esc(SRC_LABEL[r.source] || r.source)}</span>` },
      { label: 'Durum', render: (r) => esc(r.status || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    openDrawer({
      title: editing ? 'Sipariş Düzenle' : 'Yeni Sipariş',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { source: '' },
      fields: [
        { name: 'secId', type: 'section', label: 'Sipariş' },
        { name: 'orderNo', label: 'Sipariş No', type: 'text', required: true },
        { name: 'source', label: 'Kaynak', type: 'select', required: true, options: SOURCES },
        { name: 'status', label: 'Durum', type: 'text', required: true },
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'targetQuantity', label: 'Hedef Miktar', type: 'number', step: 'any', required: true },
        { name: 'secDates', type: 'section', label: 'Tarihler & Müşteri' },
        { name: 'startDate', label: 'Başlangıç Tarihi', type: 'date' },
        { name: 'requestedDeliveryDate', label: 'İstenen Teslim (Termin)', type: 'date' },
        { name: 'customer', label: 'Müşteri', type: 'text' },
        { name: 'salesOrderNo', label: 'Satış Sipariş No', type: 'text' },
        { name: 'note', label: 'Not', type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Sipariş güncellendi' : 'Sipariş eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Sipariş silinsin mi?',
      body: `"${row.orderNo}" ve BAĞLI iş emirleri + üretim kayıtları silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Sipariş silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
