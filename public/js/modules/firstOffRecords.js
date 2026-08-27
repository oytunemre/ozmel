// First-Off Kayıtları — v2 modülü. Parent + iki çocuk (ölçümler + gerekçeler).
// Ölçümler: nokta seçici + değer + sonuç satırları. Gerekçeler: resmi formdaki
// yedi sabit seçenek (çoklu kutucuk) + listede olmayanlar için serbest metin.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, FIRST_OFF_REASON_OPTIONS } from '../core/lookups.js';
import { measurementDetail } from './_measDetail.js';

const api = resource('first-off-records');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewFirstOffRecords(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, pointRows, pointsById;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    const pts = (await resource('first-off-points').listAll()).data;
    pointRows = pts.map(p => ({ id: p.id, code: products.byId.get(p.productCodeId)?.code || '', name: `${p.characteristic} (No:${p.pointNo})` }));
    pointsById = new Map(pts.map(p => [p.id, p]));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewFirstOffRecords(container) })); return; }

  // Genişleyen satır: her nokta için karakteristik + değer/sonuç + tolerans.
  const expand = (row) => measurementDetail(row.measurements.map(m => {
    const p = pointsById.get(m.pointId) || {};
    const shown = (m.value != null && m.value !== '') ? m.value : (m.result || '');
    return { location: p.characteristic || ('#' + m.pointId), lower: p.lowerLimit, upper: p.upperLimit, values: [shown] };
  }));

  const table = new DataTable(container, {
    title: 'First-Off Kayıtları',
    subtitle: 'İlk parça kontrol kayıtları — ölçümler ve gerekçeler',
    canWrite,
    addLabel: 'Yeni Kayıt',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    expand,
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.operatorName].join(' '),
    emptyMessage: 'Henüz kayıt yok. "Yeni Kayıt" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => esc(ops.label(r.operationId)) },
      { label: 'Tarih', render: (r) => esc(r.date || '—') },
      { label: 'Vardiya', render: (r) => esc(r.shift || '—') },
      { label: 'Ölçüm', render: (r) => r.measurements.length, className: 'mono' },
      { label: 'Karar', render: (r) => esc(r.overallResult || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    const meas = new MeasurementsEditor(pointRows);
    const reasons = new ReasonChecklist(FIRST_OFF_REASON_OPTIONS);

    openDrawer({
      title: editing ? 'Kayıt Düzenle' : 'Yeni Kayıt',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'secId', type: 'section', label: 'Kayıt' },
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: 'Operasyon', type: 'fk', fk: opFk, required: true },
        { name: 'date', label: 'Tarih', type: 'date', required: true },
        { name: 'shift', label: 'Vardiya', type: 'text', required: true },
        { name: 'operatorName', label: 'Operatör (isim)', type: 'text' },
        { name: 'woNo', label: 'İş Emri No', type: 'text' },
        { name: 'sampleCount', label: 'Numune Adedi', type: 'number' },
        { name: 'checkTime', label: 'Kontrol Saati', type: 'time' },
        { name: 'overallResult', label: 'Genel Karar', type: 'text' },
        { name: 'secMeas', type: 'section', label: 'Ölçümler' },
        { name: 'measurements', type: 'component', component: meas },
        { name: 'secReasons', type: 'section', label: 'Gerekçeler' },
        { name: 'reasons', type: 'component', component: reasons, help: 'Resmi formdaki gerekçeleri işaretleyin; listede yoksa serbest metin ekleyin.' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Kayıt güncellendi' : 'Kayıt eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Kayıt silinsin mi?', body: 'Bu first-off kaydı ve ölçümleri silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Kayıt silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// Ölçüm editörü: {pointId, value, result} satırları.
class MeasurementsEditor {
  constructor(pointRows) {
    this.pointRows = pointRows;
    this.rows = [];
    this.cb = null;
    this.el = document.createElement('div');
    this.box = el('div', 'rows-ed');
    this.head = el('div', 'rows-head');
    this.head.style.gridTemplateColumns = '1fr 90px 110px 24px';
    this.head.innerHTML = '<span>Nokta</span><span>Değer</span><span>Sonuç</span><span></span>';
    this.body = el('div', '');
    this.box.append(this.head, this.body);
    this.el.appendChild(this.box);
    const add = el('button', 'btn btn-secondary btn-sm rows-ed-add', '+ Ölçüm ekle');
    add.type = 'button';
    add.addEventListener('click', () => { this.addRow({}); this.emit(); });
    this.el.appendChild(add);
    this.paintEmpty();
  }
  onChange(cb) { this.cb = cb; }
  emit() { this.cb && this.cb(); }
  setValue(measurements) {
    this.rows.forEach(r => r.line.remove());
    this.rows = [];
    for (const m of (measurements || [])) this.addRow(m);
    this.paintEmpty();
  }
  getValue() {
    return this.rows.map(r => ({ pointId: r.fk.getValue(), value: r.value.value, result: r.result.value }))
      .filter(m => m.pointId);
  }
  addRow(m) {
    const line = el('div', 'row-line');
    line.style.gridTemplateColumns = '1fr 90px 110px 24px';
    const fk = new FkSelect({ source: async () => ({ rows: this.pointRows, total: this.pointRows.length }), rows: this.pointRows, value: m.pointId ?? null, placeholder: 'Nokta…' });
    const value = inp('number', m.value); const result = inp('text', m.result);
    const x = el('button', 'row-x', '×'); x.type = 'button';
    fk.onChange(() => this.emit()); value.addEventListener('input', () => this.emit()); result.addEventListener('input', () => this.emit());
    const entry = { fk, value, result, line };
    x.addEventListener('click', () => { line.remove(); this.rows = this.rows.filter(r => r !== entry); this.emit(); this.paintEmpty(); });
    line.append(fk.el, value, result, x);
    this.body.appendChild(line);
    this.rows.push(entry);
    this.paintEmpty();
  }
  paintEmpty() {
    let e = this.body.querySelector('.rows-empty');
    if (this.rows.length === 0) { if (!e) { e = el('div', 'rows-empty', 'Ölçüm eklenmedi.'); this.body.appendChild(e); } }
    else if (e) e.remove();
  }
}

// Gerekçe seçici: sabit seçenekler için kutucuk + listede olmayanlar için serbest
// metin (eklenen serbest gerekçeler silinebilir çip olarak görünür). getValue():
// işaretli sabit seçenekler (liste sırasında) + serbest gerekçeler (ekleme sırasında).
class ReasonChecklist {
  constructor(options) {
    this.options = options;
    this.selected = new Set();   // işaretli sabit seçenek etiketleri
    this.customs = [];           // serbest metin gerekçeler
    this.cb = null;
    this.boxes = new Map();      // etiket -> checkbox input

    this.el = el('div', 'chk-wrap');
    const list = el('div', 'chk-list');
    for (const label of options) {
      const opt = el('label', 'chk-opt');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = label;
      box.addEventListener('change', () => {
        if (box.checked) this.selected.add(label); else this.selected.delete(label);
        this.emit();
      });
      opt.append(box, document.createTextNode(' ' + label));
      list.appendChild(opt);
      this.boxes.set(label, box);
    }
    this.el.appendChild(list);

    const add = el('div', 'chk-custom');
    this.input = document.createElement('input');
    this.input.className = 'input';
    this.input.placeholder = 'Listede yok — gerekçe yaz…';
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addCustom(); } });
    const addBtn = el('button', 'btn btn-secondary btn-sm', 'Ekle');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => this.addCustom());
    add.append(this.input, addBtn);
    this.el.appendChild(add);

    this.chips = el('div', 'chk-chips');
    this.el.appendChild(this.chips);
  }
  onChange(cb) { this.cb = cb; }
  emit() { this.cb && this.cb(); }

  addCustom() {
    const val = this.input.value.trim();
    if (!val) return;
    // Sabit seçenekteyse onu işaretle; zaten eklenmişse yok say.
    if (this.options.includes(val)) { this.selected.add(val); this.boxes.get(val).checked = true; }
    else if (!this.customs.includes(val)) this.customs.push(val);
    this.input.value = '';
    this.renderChips();
    this.emit();
  }
  renderChips() {
    this.chips.innerHTML = '';
    for (const label of this.customs) {
      const chip = el('span', 'fk-chip', esc(label));
      const x = el('button', 'fk-chip-x', '×'); x.type = 'button';
      x.addEventListener('click', () => { this.customs = this.customs.filter(c => c !== label); this.renderChips(); this.emit(); });
      chip.appendChild(x);
      this.chips.appendChild(chip);
    }
  }
  setValue(list) {
    this.selected = new Set();
    this.customs = [];
    for (const box of this.boxes.values()) box.checked = false;
    for (const v of (list || [])) {
      if (v == null || v === '') continue;
      const s = String(v);
      if (this.options.includes(s)) { this.selected.add(s); this.boxes.get(s).checked = true; }
      else if (!this.customs.includes(s)) this.customs.push(s);
    }
    this.renderChips();
  }
  getValue() {
    return [...this.options.filter(o => this.selected.has(o)), ...this.customs];
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function inp(type, value) { const i = document.createElement('input'); i.className = 'input'; i.type = type; if (type === 'number') i.step = 'any'; i.value = value ?? ''; return i; }
