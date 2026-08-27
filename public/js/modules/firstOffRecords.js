// First-Off Kayıtları — v2 modülü. Parent + iki çocuk (ölçümler + gerekçeler).
// Ölçümler: nokta seçici + değer + sonuç satırları. Gerekçeler: resmi formdaki
// yedi sabit seçenek (çoklu kutucuk) + listede olmayanlar için serbest metin.
// i18n: etiketler () => t(...). Gerekçe DEĞERLERİ BE'de TR saklanır (child tablo);
// yalnızca GÖSTERİM t('reason.<değer>') ile çevrilir — getValue() TR değer döner.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, FIRST_OFF_REASON_OPTIONS } from '../core/lookups.js';
import { measurementDetail } from './_measDetail.js';
import { t } from '../core/i18n.js';

const api = resource('first-off-records');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Sabit gerekçenin GÖSTERİM etiketi (değer TR kalır). Anahtar yoksa ham değer.
const reasonLabel = (v) => { const k = 'reason.' + v; const s = t(k); return s === k ? v : s; };

export async function viewFirstOffRecords(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
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
    title: () => t('menu.first-off-records'),
    subtitle: () => t('fr.subtitle'),
    canWrite,
    addLabel: () => t('fr.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    expand,
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.operatorName].join(' '),
    emptyMessage: () => t('fr.empty'),
    columns: [
      { label: () => t('field.productShort'), render: (r) => esc(products.label(r.productCodeId)) },
      { label: () => t('field.operation'), render: (r) => esc(ops.label(r.operationId)) },
      { label: () => t('field.date'), render: (r) => esc(r.date || '—') },
      { label: () => t('field.shift'), render: (r) => esc(r.shift || '—') },
      { label: () => t('field.measurement'), render: (r) => r.measurements.length, className: 'mono' },
      { label: () => t('field.decision'), render: (r) => esc(r.overallResult || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: t('wo.selectOperation') });
    const meas = new MeasurementsEditor(pointRows);
    const reasons = new ReasonChecklist(FIRST_OFF_REASON_OPTIONS);

    openDrawer({
      title: () => t(editing ? 'fr.editTitle' : 'fr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'secId', type: 'section', label: () => t('fr.secRecord') },
        { name: 'productCodeId', label: () => t('field.productShort'), type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: () => t('field.operation'), type: 'fk', fk: opFk, required: true },
        { name: 'date', label: () => t('field.date'), type: 'date', required: true },
        { name: 'shift', label: () => t('field.shift'), type: 'text', required: true },
        { name: 'operatorName', label: () => t('fr.operatorName'), type: 'text' },
        { name: 'woNo', label: () => t('fr.woNo'), type: 'text' },
        { name: 'sampleCount', label: () => t('fr.sampleCount'), type: 'number' },
        { name: 'checkTime', label: () => t('fr.checkTime'), type: 'time' },
        { name: 'overallResult', label: () => t('fr.overallResult'), type: 'text' },
        { name: 'secMeas', type: 'section', label: () => t('fr.secMeas') },
        { name: 'measurements', type: 'component', component: meas },
        { name: 'secReasons', type: 'section', label: () => t('fr.secReasons') },
        { name: 'reasons', type: 'component', component: reasons, help: () => t('fr.reasonsHelp') }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'fr.updated' : 'fr.added'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('fr.deleteTitle'), body: t('fr.deleteBody'), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('fr.deleted'), 'success'); await table.reload(); }
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
    this.head.innerHTML = `<span>${esc(t('field.point'))}</span><span>${esc(t('field.value'))}</span><span>${esc(t('field.result'))}</span><span></span>`;
    this.body = el('div', '');
    this.box.append(this.head, this.body);
    this.el.appendChild(this.box);
    const add = el('button', 'btn btn-secondary btn-sm rows-ed-add', esc(t('fr.addMeas')));
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
    const fk = new FkSelect({ source: async () => ({ rows: this.pointRows, total: this.pointRows.length }), rows: this.pointRows, value: m.pointId ?? null, placeholder: t('fr.selectPoint') });
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
    if (this.rows.length === 0) { if (!e) { e = el('div', 'rows-empty', esc(t('fr.noMeas'))); this.body.appendChild(e); } }
    else if (e) e.remove();
  }
}

// Gerekçe seçici: sabit seçenekler için kutucuk + listede olmayanlar için serbest
// metin (eklenen serbest gerekçeler silinebilir çip olarak görünür). getValue():
// işaretli sabit seçenekler (liste sırasında) + serbest gerekçeler (ekleme sırasında).
// selected/customs/getValue HEP ham TR değeri tutar; yalnızca kutucuk metni çevrilir.
class ReasonChecklist {
  constructor(options) {
    this.options = options;
    this.selected = new Set();   // işaretli sabit seçenek değerleri (TR)
    this.customs = [];           // serbest metin gerekçeler
    this.cb = null;
    this.boxes = new Map();      // değer -> checkbox input

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
      opt.append(box, document.createTextNode(' ' + reasonLabel(label)));
      list.appendChild(opt);
      this.boxes.set(label, box);
    }
    this.el.appendChild(list);

    const add = el('div', 'chk-custom');
    this.input = document.createElement('input');
    this.input.className = 'input';
    this.input.placeholder = t('fr.reasonCustom');
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addCustom(); } });
    const addBtn = el('button', 'btn btn-secondary btn-sm', esc(t('action.add')));
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
