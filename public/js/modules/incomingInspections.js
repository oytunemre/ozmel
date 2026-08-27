// Giriş Kalite Kontrolleri — v2 modülü. İKİ SEVİYE iç içe: kayıt -> karakteristik[]
// -> değer[]. Karakteristik editörü: her karakteristik bir blok, kendi değerleri
// (TagList; sayı ya da 'Uygun'/'Uygun Değil'). Genel sonuç açılır liste.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { TagList } from '../core/taglist.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, INSPECTION_RESULT_OPTIONS, withCurrent } from '../core/lookups.js';
import { measurementDetail } from './_measDetail.js';

const api = resource('incoming-inspections');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const CHAR_TYPES = [
  { value: '', label: '— Tip —' },
  { value: 'olcusel', label: 'Ölçüsel' },
  { value: 'nitel', label: 'Nitel' }
];

export async function viewIncomingInspections(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, receipts;
  try {
    products = await loadLookup('product-codes', mapProduct);
    receipts = await loadLookup('purchase-receipts', (r) => ({ id: r.id, code: '#' + r.id, name: r.date || '' }));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewIncomingInspections(container) })); return; }

  const table = new DataTable(container, {
    title: 'Giriş Kalite Kontrolleri',
    subtitle: 'Gelen malzeme kontrolü — karakteristikler ve ölçüm değerleri',
    canWrite,
    addLabel: 'Yeni Kontrol',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    // Genişleyen satır: her karakteristik + değerleri + kendi limitlerine göre tolerans.
    expand: (row) => measurementDetail((row.characteristics || []).map(c => ({
      location: c.name || ('#' + c.charNo), lower: c.lowerLimit, upper: c.upperLimit, values: c.values || []
    }))),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.supplier, products.label(r.materialCodeId), r.inspectorName].join(' '),
    emptyMessage: 'Henüz kontrol yok. "Yeni Kontrol" ile başlayın.',
    columns: [
      { label: 'Tedarikçi', render: (r) => esc(r.supplier || '—') },
      { label: 'Malzeme', render: (r) => r.materialCodeId ? esc(products.label(r.materialCodeId)) : '—' },
      { label: 'Kontrol Tarihi', render: (r) => esc(r.inspectionDate || '—') },
      { label: 'Karakteristik', render: (r) => r.characteristics.length, className: 'mono' },
      { label: 'Sonuç', render: (r) => esc(r.overallResult || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: 'Malzeme seçin…' });
    const receiptFk = new FkSelect({ source: receipts.source, rows: receipts.rows, value: row?.purchaseReceiptId ?? null, placeholder: 'Satınalma girişi (opsiyonel)…' });
    const chars = new CharacteristicsEditor();

    openDrawer({
      title: editing ? 'Kontrol Düzenle' : 'Yeni Kontrol',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { overallResult: '' },
      fields: [
        { name: 'secId', type: 'section', label: 'Kontrol' },
        { name: 'supplier', label: 'Tedarikçi', type: 'text' },
        { name: 'materialCodeId', label: 'Malzeme', type: 'fk', fk: materialFk },
        { name: 'purchaseReceiptId', label: 'Satınalma Girişi', type: 'fk', fk: receiptFk },
        { name: 'drawingNo', label: 'Çizim No', type: 'text' },
        { name: 'reason', label: 'Gözlem Nedeni', type: 'text' },
        { name: 'secQty', type: 'section', label: 'Tarih & Adet' },
        { name: 'arrivalDate', label: 'Malzeme Geliş Tarihi', type: 'date' },
        { name: 'inspectionDate', label: 'Kontrol Tarihi', type: 'date' },
        { name: 'receivedQty', label: 'Gelen Adet', type: 'number', step: 'any' },
        { name: 'sampleQty', label: 'Örnek Adedi', type: 'number' },
        { name: 'inspectorName', label: 'Kontrol Eden', type: 'text' },
        { name: 'overallResult', label: 'Genel Sonuç', type: 'select', options: withCurrent(INSPECTION_RESULT_OPTIONS, row?.overallResult) },
        { name: 'secChars', type: 'section', label: 'Karakteristikler' },
        { name: 'characteristics', type: 'component', component: chars }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Kontrol güncellendi' : 'Kontrol eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Kontrol silinsin mi?', body: 'Bu giriş kontrolü, karakteristikleri ve değerleri silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Kontrol silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// Karakteristik editörü: her karakteristik bir blok + kendi değerleri (TagList).
class CharacteristicsEditor {
  constructor() {
    this.blocks = [];
    this.cb = null;
    this.el = document.createElement('div');
    this.body = el('div', '');
    this.el.appendChild(this.body);
    const add = el('button', 'btn btn-secondary btn-sm rows-ed-add', '+ Karakteristik ekle');
    add.type = 'button';
    add.addEventListener('click', () => { this.addBlock({}); this.emit(); });
    this.el.appendChild(add);
    this.paintEmpty();
  }
  onChange(cb) { this.cb = cb; }
  emit() { this.cb && this.cb(); }
  setValue(list) {
    this.blocks.forEach(b => b.el.remove());
    this.blocks = [];
    for (const c of (list || [])) this.addBlock(c);
    this.paintEmpty();
  }
  getValue() {
    return this.blocks.map(b => ({
      charNo: b.charNo.value, name: b.name.value, specText: b.specText.value, type: b.type.value,
      nominal: b.nominal.value, lowerLimit: b.lower.value, upperLimit: b.upper.value, unit: b.unit.value,
      values: b.values.getValue()
    })).filter(c => c.name);
  }
  addBlock(c) {
    const block = el('div', 'char-block');
    const head = el('div', 'char-head', '<b>Karakteristik</b>');
    const x = el('button', 'row-x', '×'); x.type = 'button';
    head.appendChild(x);
    const body = el('div', 'char-body');
    const charNo = inp('number', c.charNo);
    const name = inp('text', c.name);
    const specText = inp('text', c.specText);
    const type = sel(CHAR_TYPES, c.type);
    const nominal = inp('number', c.nominal), lower = inp('number', c.lowerLimit), upper = inp('number', c.upperLimit);
    const unit = inp('text', c.unit);
    // Karakteristik değerleri tekilleştirilMEZ — 13.28, 13.28, 13.2 gibi tekrarlar normaldir.
    const values = new TagList({ value: (c.values || []).map(v => v == null ? '' : String(v)).filter(Boolean), placeholder: 'Değer (sayı ya da Uygun)…', unique: false });
    body.append(
      fld('No', charNo), fld('Ad', name), fld('Spesifikasyon', specText), fld('Tip', type),
      fld('Nominal', nominal), fld('Alt Limit', lower), fld('Üst Limit', upper), fld('Birim', unit),
      fld('Değerler', values.el, 'char-values')
    );
    block.append(head, body);
    const entry = { el: block, charNo, name, specText, type, nominal, lower, upper, unit, values };
    x.addEventListener('click', () => { block.remove(); this.blocks = this.blocks.filter(b => b !== entry); this.emit(); this.paintEmpty(); });
    for (const ctrl of [charNo, name, specText, nominal, lower, upper, unit]) ctrl.addEventListener('input', () => this.emit());
    type.addEventListener('change', () => this.emit());
    values.onChange(() => this.emit());
    this.body.appendChild(block);
    this.blocks.push(entry);
    this.paintEmpty();
  }
  paintEmpty() {
    let e = this.body.querySelector('.rows-empty');
    if (this.blocks.length === 0) { if (!e) { e = el('div', 'rows-empty', 'Karakteristik eklenmedi.'); this.body.appendChild(e); } }
    else if (e) e.remove();
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function inp(type, value) { const i = document.createElement('input'); i.className = 'input'; i.type = type; if (type === 'number') i.step = 'any'; i.value = value ?? ''; return i; }
function sel(options, value) {
  const s = document.createElement('select'); s.className = 'input';
  for (const o of options) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; if (String(value ?? '') === String(o.value)) op.selected = true; s.appendChild(op); }
  return s;
}
function fld(label, control, extraCls) {
  const w = el('div', 'field' + (extraCls ? ' ' + extraCls : ''));
  w.innerHTML = `<label>${esc(label)}</label>`;
  w.appendChild(control);
  return w;
}
