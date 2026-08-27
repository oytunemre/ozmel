// Kod Tanımları — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// 21 alanlı form; TİP seçimine göre ölçü alanları görünür/gizli olur:
// dış çap / iç çap / malzeme uzunluğu / malzeme ağırlığı YALNIZCA Hammadde'de.
// Tip Hammadde'den başkasına çevrilince bu alanlar doluysa sunucu 422 döner;
// drawer o alanları hatalı olarak yeniden gösterir (temizlenene kadar).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { UNIT_OPTIONS } from '../core/lookups.js';
import { childFields } from './_childDetail.js';

const api = resource('product-codes');
const operationsApi = resource('operations');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const TYPES = [
  { value: '', label: '— Tip seçin —' },
  { value: 'Hammadde', label: 'Hammadde' },
  { value: 'Yarı Mamül', label: 'Yarı Mamül' },
  { value: 'Ürün', label: 'Ürün' }
];
const isRaw = (v) => v.type === 'Hammadde';   // ölçü alanları yalnızca Hammadde

export async function viewProductCodes(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';

  // Çıkan operasyon FK'si için operasyonlar bir kez çekilir.
  let operations;
  try {
    operations = (await operationsApi.list({ limit: 200 })).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProductCodes(container) }));
    return;
  }
  const opsRows = operations.map(o => ({ id: o.id, name: o.name }));
  const opName = new Map(operations.map(o => [o.id, o.name]));
  const opsSource = async () => ({ rows: opsRows, total: opsRows.length });

  const table = new DataTable(container, {
    title: 'Kod Tanımları',
    canWrite,
    addLabel: 'Yeni Kod',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.code, r.name, r.type, r.unit].join(' '),
    emptyMessage: 'Henüz kod tanımı eklenmemiş. "Yeni Kod" ile başlayın.',
    // Genişleyen satır: tabloda görünmeyen alanlar (ölçüler, stok, tedarik, çizim…).
    expand: (r) => childFields([
      { label: 'Çizim No', value: r.drawingNo, mono: true },
      { label: 'Revizyon', value: r.revision },
      { label: 'Dış Çap', value: r.outerDiameter, mono: true },
      { label: 'İç Çap', value: r.innerDiameter, mono: true },
      { label: 'Malzeme Uzunluğu', value: r.materialLength, mono: true },
      { label: 'Malzeme Ağırlığı', value: r.materialWeight, mono: true },
      { label: 'Min. Stok', value: r.minStockLevel, mono: true },
      { label: 'Tedarik Süresi (gün)', value: r.supplyDays, mono: true },
      { label: 'Koli Adedi', value: r.boxQuantity, mono: true },
      { label: 'Kategori', value: r.category },
      { label: 'Tedarikçiler', value: r.suppliers },
      { label: 'Müşteri', value: r.customer },
      { label: 'Çıkan Operasyon', value: r.outgoingOperationId ? opName.get(r.outgoingOperationId) : null },
      { label: 'Ana Ürün Kodu', value: r.parentProductCode, mono: true },
      { label: 'Not', value: r.note }
    ], 'Ek bilgi girilmemiş.'),
    columns: [
      { label: 'Kod', key: 'code', className: 'mono' },
      { label: 'Ad', key: 'name' },
      { label: 'Tip', render: (r) => `<span class="tag tag-neutral">${esc(r.type)}</span>` },
      { label: 'Birim', render: (r) => esc(r.unit ?? '—') },
      { label: 'Durum', render: (r) => esc(r.status ?? '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);

    const opFk = new FkSelect({
      source: opsSource, rows: opsRows,
      value: row?.outgoingOperationId ?? null, placeholder: 'Operasyon seçin…'
    });

    openDrawer({
      title: editing ? 'Kod Tanımı Düzenle' : 'Yeni Kod Tanımı',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { type: '' },
      fields: [
        { name: 'secId', type: 'section', label: 'Kimlik' },
        { name: 'code', label: 'Kod', type: 'text', required: true },
        { name: 'name', label: 'Ad', type: 'text', required: true },
        { name: 'type', label: 'Tip', type: 'select', required: true, options: TYPES },
        { name: 'unit', label: 'Birim', type: 'select', options: UNIT_OPTIONS },
        { name: 'status', label: 'Durum', type: 'text' },
        { name: 'category', label: 'Kategori', type: 'text' },

        { name: 'secDrawing', type: 'section', label: 'Çizim & Revizyon' },
        { name: 'drawingNo', label: 'Çizim No', type: 'text' },
        { name: 'revision', label: 'Revizyon', type: 'text' },
        { name: 'revisionDate', label: 'Revizyon Tarihi', type: 'date' },

        { name: 'secMeasures', type: 'section', label: 'Ölçüler (yalnızca Hammadde)', showIf: isRaw },
        { name: 'outerDiameter', label: 'Dış Çap', type: 'number', step: 'any', showIf: isRaw },
        { name: 'innerDiameter', label: 'İç Çap', type: 'number', step: 'any', showIf: isRaw },
        { name: 'materialLength', label: 'Malzeme Uzunluğu', type: 'number', step: 'any', showIf: isRaw },
        { name: 'materialWeight', label: 'Malzeme Ağırlığı', type: 'number', step: 'any', showIf: isRaw },

        { name: 'secStock', type: 'section', label: 'Stok & Tedarik' },
        { name: 'minStockLevel', label: 'Min. Stok Seviyesi', type: 'number', step: 'any' },
        { name: 'supplyDays', label: 'Tedarik Süresi (gün)', type: 'number', step: 'any' },
        { name: 'boxQuantity', label: 'Koli Adedi', type: 'number', step: 'any' },
        { name: 'suppliers', label: 'Tedarikçiler', type: 'text' },
        { name: 'customer', label: 'Müşteri', type: 'text' },

        { name: 'secRel', type: 'section', label: 'İlişkiler' },
        { name: 'outgoingOperationId', label: 'Çıkan Operasyon', type: 'fk', fk: opFk },
        { name: 'parentProductCode', label: 'Ana Ürün Kodu', type: 'text', help: 'Bağlı olduğu üst ürünün kodu.' },

        { name: 'note', label: 'Not', type: 'textarea' }
      ],
      // v: tüm alanlar (gizli ölçüler dahil) + updatedAt. Backend bilmediği anahtarları yok sayar.
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Kod tanımı güncellendi' : 'Kod tanımı eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Kod tanımı silinsin mi?',
      body: `"${row.code} — ${row.name}" kalıcı olarak silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast('Kod tanımı silindi', 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
