// İş Emirleri — v2 modülü. Tasarım: Is-Emirleri.dc.html.
// Tablo + drawer. "Üretilen / Hedef" ve ilerleme, üretim kayıtlarından toplanır.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, ORDER_STATUS_OPTIONS, withCurrent } from '../core/lookups.js';
import { childTable } from './_childDetail.js';

const api = resource('work-orders');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const SHIFT_LABEL = { Sabah: 'Sabah', Aksam: 'Akşam', Gece: 'Gece' };

export async function viewWorkOrders(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, centers, orders, producedByWo, prodByWo;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    orders = await loadLookup('orders', (o) => ({ id: o.id, code: o.orderNo, name: products.label(o.productCodeId) }));
    ({ producedByWo, prodByWo } = await loadProduction());
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkOrders(container) }));
    return;
  }

  // Üretim kayıtları bir kez çekilir: hem üretilen adet toplamı hem iş emri bazında liste.
  async function loadProduction() {
    const { data } = await resource('production').listAll();
    const producedByWo = new Map();
    const prodByWo = new Map();
    for (const p of data) {
      producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
      if (!prodByWo.has(p.workOrderId)) prodByWo.set(p.workOrderId, []);
      prodByWo.get(p.workOrderId).push(p);
    }
    return { producedByWo, prodByWo };
  }

  const table = new DataTable(container, {
    title: 'İş Emirleri',
    subtitle: 'Üretim siparişinin rotadaki her operasyonu için bir iş emri açılır',
    canWrite,
    addLabel: 'İş Emri Aç',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.woNo, products.label(r.productCodeId), centers.label(r.workCenterId)].join(' '),
    emptyMessage: 'Henüz iş emri yok. "İş Emri Aç" ile başlayın.',
    // Genişleyen satır: bu iş emrine ait üretim kayıtları (tarih, vardiya, gerçek adet, fire).
    expand: (r) => childTable([
      { label: 'Tarih', key: 'date' },
      { label: 'Vardiya', render: (p) => esc(SHIFT_LABEL[p.shift] || p.shift || '—') },
      { label: 'Gerçek Adet', render: (p) => esc(String(p.actualQuantity ?? '—')), mono: true },
      { label: 'Fire', render: (p) => esc(String(p.scrapQuantity ?? '—')), mono: true }
    ], prodByWo.get(r.id) || [], 'Üretim kaydı yok.'),
    columns: [
      { label: 'İş Emri', key: 'woNo', className: 'mono' },
      { label: 'Ürün / Parça', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => r.operationId ? esc(ops.label(r.operationId)) : '—' },
      { label: 'İş Merkezi', render: (r) => r.workCenterId ? esc(centers.label(r.workCenterId)) : '—' },
      { label: 'Üretilen / Hedef', render: (r) => `<span class="mono">${producedByWo.get(r.id) || 0} / ${r.targetQuantity}</span>` },
      { label: 'İlerleme', render: (r) => progress(producedByWo.get(r.id) || 0, r.targetQuantity) },
      { label: 'Durum', render: (r) => esc(r.status || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const orderFk = new FkSelect({ source: orders.source, rows: orders.rows, value: row?.orderId ?? null, placeholder: 'Sipariş seçin…' });
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: 'İş merkezi seçin…' });
    openDrawer({
      title: editing ? 'İş Emri Düzenle' : 'İş Emri Aç',
      submitLabel: editing ? 'Güncelle' : 'Aç',
      values: editing ? { ...row } : { status: 'Aktif' },
      fields: [
        { name: 'woNo', label: 'İş Emri No', type: 'text', required: true },
        { name: 'orderId', label: 'Sipariş', type: 'fk', fk: orderFk, required: true },
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: 'Operasyon', type: 'fk', fk: opFk },
        { name: 'workCenterId', label: 'İş Merkezi', type: 'fk', fk: centerFk },
        { name: 'sequence', label: 'Sıra', type: 'number' },
        { name: 'targetQuantity', label: 'Hedef Miktar', type: 'number', step: 'any', required: true },
        { name: 'status', label: 'Durum', type: 'select', required: true, options: withCurrent(ORDER_STATUS_OPTIONS, row?.status) },
        { name: 'splitLabel', label: 'Split Etiketi', type: 'text' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'İş emri güncellendi' : 'İş emri açıldı', 'success'); ({ producedByWo, prodByWo } = await loadProduction()); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'İş emri silinsin mi?',
      body: `"${row.woNo}" ve BAĞLI üretim kayıtları silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('İş emri silindi', 'success'); ({ producedByWo, prodByWo } = await loadProduction()); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

function progress(done, target) {
  const t = Number(target) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((done / t) * 100)) : 0;
  return `<span class="progress"><span class="bar"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></span><span class="pct">${pct}%</span></span>`;
}
