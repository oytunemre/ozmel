// Satınalma İstekleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// malzeme listeden seçilir (material_code_id FK, zorunlu). Birim açılır liste (adet/kg).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, UNIT_OPTIONS } from '../core/lookups.js';
import { childTable } from './_childDetail.js';

const api = resource('purchase-requests');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewPurchaseRequests(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
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
    title: 'Satınalma İstekleri',
    subtitle: 'Üretim için gereken malzemenin tedarik talebi',
    canWrite,
    addLabel: 'Yeni İstek',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.materialCodeId), r.supplier].join(' '),
    emptyMessage: 'Henüz istek yok. "Yeni İstek" ile başlayın.',
    // Malzemesi seçilmemiş (ETL'de koda çözülemeyen) istekler işaretlenir.
    rowClass: (r) => r.materialCodeId ? '' : 'row-warn',
    flagFilter: { test: (r) => !r.materialCodeId, label: (n) => `${n} kayıtta malzeme seçilmemiş` },
    // Genişleyen satır: bu isteğe bağlı satınalma girişleri (tarih, miktar).
    expand: (r) => childTable(
      [{ label: 'Tarih', key: 'date' }, { label: 'Miktar', render: (g) => esc(String(g.quantity ?? '—')), mono: true }, { label: 'Not', render: (g) => esc(g.note || '—') }],
      receiptsByReq.get(r.id) || [], 'Henüz giriş yapılmadı.'),
    columns: [
      { label: 'Malzeme', render: (r) => r.materialCodeId
          ? esc(products.label(r.materialCodeId))
          : '<span class="cell-empty">seçilmedi</span>' },
      { label: 'Miktar', render: (r) => r.quantity ?? '—', className: 'mono' },
      { label: 'Birim', render: (r) => esc(r.unit || '—') },
      { label: 'Tedarikçi', render: (r) => esc(r.supplier || '—') },
      { label: 'İstek Tarihi', render: (r) => esc(r.requestDate || '—') },
      { label: 'Beklenen', render: (r) => esc(r.expectedDate || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: 'Malzeme seçin…' });
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const orderFk = new FkSelect({ source: orders.source, rows: orders.rows, value: row?.orderId ?? null, placeholder: 'Sipariş (opsiyonel)…' });
    openDrawer({
      title: editing ? 'İstek Düzenle' : 'Yeni İstek',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { unit: '' },
      fields: [
        { name: 'materialCodeId', label: 'Malzeme', type: 'fk', fk: materialFk, required: true,
          help: 'Malzeme kod listesinden seçilir; serbest metin girilmez.' },
        { name: 'quantity', label: 'Miktar', type: 'number', step: 'any' },
        { name: 'unit', label: 'Birim', type: 'select', options: UNIT_OPTIONS },
        { name: 'supplier', label: 'Tedarikçi', type: 'text' },
        { name: 'requestDate', label: 'İstek Tarihi', type: 'date' },
        { name: 'expectedDate', label: 'Beklenen Tarih', type: 'date' },
        { name: 'productCodeId', label: 'Ürün (hangi ürün için)', type: 'fk', fk: productFk },
        { name: 'orderId', label: 'Bağlı Sipariş', type: 'fk', fk: orderFk },
        { name: 'note', label: 'Not', type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'İstek güncellendi' : 'İstek eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'İstek silinsin mi?', body: `${products.label(row.materialCodeId)} isteği silinecek.`, confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('İstek silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
