// Kod Tanımları — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// 21 alanlı form; TİP seçimine göre ölçü alanları görünür/gizli olur:
// dış çap / iç çap / malzeme uzunluğu / malzeme ağırlığı YALNIZCA Hammadde'de.
// Tip Hammadde'den başkasına çevrilince bu alanlar doluysa sunucu 422 döner;
// drawer o alanları hatalı olarak yeniden gösterir (temizlenene kadar).
// i18n: etiketler () => t(...); tip değeri BE'de TR (Hammadde/Yarı Mamül/Ürün).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { childFields } from './_childDetail.js';
import { t } from '../core/i18n.js';

const api = resource('product-codes');
const operationsApi = resource('operations');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const isRaw = (v) => v.type === 'Hammadde';   // ölçü alanları yalnızca Hammadde
// Malzeme tipi: BE değeri TR; ekranda dile göre etiket (anahtar yoksa ham değer).
const typeLabel = (v) => { if (!v) return '—'; const k = 'mt.' + v; const s = t(k); return s === k ? v : s; };
const typeOptions = () => [
  { value: '', label: t('mt.selectType') },
  { value: 'Hammadde', label: t('mt.Hammadde') },
  { value: 'Yarı Mamül', label: t('mt.Yarı Mamül') },
  { value: 'Ürün', label: t('mt.Ürün') }
];
const unitOptions = () => [
  { value: '', label: t('qc.unitPlaceholder') }, { value: 'adet', label: 'adet' }, { value: 'kg', label: 'kg' }
];

export async function viewProductCodes(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  // Çıkan operasyon FK'si için operasyonlar bir kez çekilir.
  let operations;
  try {
    operations = (await operationsApi.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProductCodes(container) }));
    return;
  }
  const opsRows = operations.map(o => ({ id: o.id, name: o.name }));
  const opName = new Map(operations.map(o => [o.id, o.name]));
  const opsSource = async () => ({ rows: opsRows, total: opsRows.length });

  const table = new DataTable(container, {
    title: () => t('menu.product-codes'),
    focusId: params?.id,   // çapraz bağlantı: #product-codes?id=… geldiğinde o satıra git
    canWrite,
    addLabel: () => t('pc.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.code, r.name, r.type, r.unit].join(' '),
    emptyMessage: () => t('pc.empty'),
    // Genişleyen satır: tabloda görünmeyen alanlar (ölçüler, stok, tedarik, çizim…).
    expand: (r) => childFields([
      { label: t('ii.drawingNo'), value: r.drawingNo, mono: true },
      { label: t('field.revision'), value: r.revision },
      { label: t('field.outerDiameter'), value: r.outerDiameter, mono: true },
      { label: t('field.innerDiameter'), value: r.innerDiameter, mono: true },
      { label: t('field.materialLength'), value: r.materialLength, mono: true },
      { label: t('field.materialWeight'), value: r.materialWeight, mono: true },
      { label: t('pc.minStock'), value: r.minStockLevel, mono: true },
      { label: t('pc.supplyDays'), value: r.supplyDays, mono: true },
      { label: t('pc.boxQty'), value: r.boxQuantity, mono: true },
      { label: t('pc.category'), value: r.category },
      { label: t('pc.suppliers'), value: r.suppliers },
      { label: t('field.customer'), value: r.customer },
      { label: t('pc.outgoingOp'), value: r.outgoingOperationId ? opName.get(r.outgoingOperationId) : null },
      { label: t('pc.parentCode'), value: r.parentProductCode, mono: true },
      { label: t('field.note'), value: r.note }
    ], t('pc.noExtra')),
    columns: [
      { label: () => t('field.code'), key: 'code', className: 'mono' },
      { label: () => t('field.name'), key: 'name' },
      { label: () => t('field.type'), render: (r) => `<span class="tag tag-neutral">${esc(typeLabel(r.type))}</span>` },
      { label: () => t('field.unit'), render: (r) => esc(r.unit ?? '—') },
      { label: () => t('field.status'), render: (r) => esc(r.status ?? '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);

    const opFk = new FkSelect({
      source: opsSource, rows: opsRows,
      value: row?.outgoingOperationId ?? null, placeholder: t('wo.selectOperation')
    });

    openDrawer({
      title: () => t(editing ? 'pc.editTitle' : 'pc.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { type: '' },
      fields: [
        { name: 'secId', type: 'section', label: () => t('tree.secId') },
        { name: 'code', label: () => t('field.code'), type: 'text', required: true },
        { name: 'name', label: () => t('field.name'), type: 'text', required: true },
        { name: 'type', label: () => t('field.type'), type: 'select', required: true, options: typeOptions() },
        { name: 'unit', label: () => t('field.unit'), type: 'select', options: unitOptions() },
        { name: 'status', label: () => t('field.status'), type: 'text' },
        { name: 'category', label: () => t('pc.category'), type: 'text' },

        { name: 'secDrawing', type: 'section', label: () => t('pc.secDrawing') },
        { name: 'drawingNo', label: () => t('ii.drawingNo'), type: 'text' },
        { name: 'revision', label: () => t('field.revision'), type: 'text' },
        { name: 'revisionDate', label: () => t('field.revisionDate'), type: 'date' },

        { name: 'secMeasures', type: 'section', label: () => t('pc.secMeasures'), showIf: isRaw },
        { name: 'outerDiameter', label: () => t('field.outerDiameter'), type: 'number', step: 'any', showIf: isRaw },
        { name: 'innerDiameter', label: () => t('field.innerDiameter'), type: 'number', step: 'any', showIf: isRaw },
        { name: 'materialLength', label: () => t('field.materialLength'), type: 'number', step: 'any', showIf: isRaw },
        { name: 'materialWeight', label: () => t('field.materialWeight'), type: 'number', step: 'any', showIf: isRaw },

        { name: 'secStock', type: 'section', label: () => t('pc.secStock') },
        { name: 'minStockLevel', label: () => t('pc.minStockLevel'), type: 'number', step: 'any' },
        { name: 'supplyDays', label: () => t('pc.supplyDays'), type: 'number', step: 'any' },
        { name: 'boxQuantity', label: () => t('pc.boxQty'), type: 'number', step: 'any' },
        { name: 'suppliers', label: () => t('pc.suppliers'), type: 'text' },
        { name: 'customer', label: () => t('field.customer'), type: 'text' },

        { name: 'secRel', type: 'section', label: () => t('pc.secRel') },
        { name: 'outgoingOperationId', label: () => t('pc.outgoingOp'), type: 'fk', fk: opFk },
        { name: 'parentProductCode', label: () => t('pc.parentCode'), type: 'text', help: () => t('pc.parentCodeHelp') },

        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      // v: tüm alanlar (gizli ölçüler dahil) + updatedAt. Backend bilmediği anahtarları yok sayar.
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(t(editing ? 'pc.updated' : 'pc.added'), 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('pc.deleteTitle'),
      body: t('common.deleteBody', { name: `${row.code} — ${row.name}` }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast(t('pc.deleted'), 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
