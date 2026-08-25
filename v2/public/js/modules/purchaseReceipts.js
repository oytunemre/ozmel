// Satınalma Girişleri — v2 modülü. Bir satınalma isteğine bağlıdır (malzeme oradan gelir).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';

const api = resource('purchase-receipts');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewPurchaseReceipts(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, requests;
  try {
    products = await loadLookup('product-codes', mapProduct);
    requests = await loadLookup('purchase-requests', (r) => ({ id: r.id, code: '#' + r.id, name: products.label(r.materialCodeId) }));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewPurchaseReceipts(container) })); return; }

  const table = new DataTable(container, {
    title: 'Satınalma Girişleri',
    subtitle: 'Teslim alınan sevkiyatlar · bir satınalma isteğine bağlıdır',
    canWrite,
    addLabel: 'Giriş Kaydet',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => requests.label(r.purchaseRequestId),
    emptyMessage: 'Henüz giriş yok. "Giriş Kaydet" ile başlayın.',
    columns: [
      { label: 'İstek (Malzeme)', render: (r) => esc(requests.label(r.purchaseRequestId)) },
      { label: 'Tarih', render: (r) => esc(r.date || '—') },
      { label: 'Miktar', render: (r) => r.quantity ?? '—', className: 'mono' },
      { label: 'Not', render: (r) => esc(r.note || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const requestFk = new FkSelect({ source: requests.source, rows: requests.rows, value: row?.purchaseRequestId ?? null, placeholder: 'Satınalma isteği seçin…' });
    openDrawer({
      title: editing ? 'Giriş Düzenle' : 'Yeni Giriş',
      submitLabel: editing ? 'Güncelle' : 'Kaydet',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'purchaseRequestId', label: 'Satınalma İsteği', type: 'fk', fk: requestFk, required: true,
          help: 'Malzeme bilgisi bağlı istekten gelir.' },
        { name: 'date', label: 'Tarih', type: 'date' },
        { name: 'quantity', label: 'Miktar', type: 'number', step: 'any' },
        { name: 'note', label: 'Not', type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Giriş güncellendi' : 'Giriş kaydedildi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Giriş silinsin mi?', body: 'Bu satınalma girişi silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Giriş silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
