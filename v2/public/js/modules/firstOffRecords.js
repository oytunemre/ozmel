// First-Off Kayıtları — v2 modülü. Parent + iki çocuk (ölçümler + gerekçeler).
// Ölçümler: nokta seçici + değer + sonuç satırları. Gerekçeler: serbest metin (TagList).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { TagList } from '../core/taglist.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';

const api = resource('first-off-records');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewFirstOffRecords(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, pointRows;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    const pts = (await resource('first-off-points').list({ limit: 200 })).data;
    pointRows = pts.map(p => ({ id: p.id, code: products.byId.get(p.productCodeId)?.code || '', name: `${p.characteristic} (No:${p.pointNo})` }));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewFirstOffRecords(container) })); return; }

  const table = new DataTable(container, {
    title: 'First-Off Kayıtları',
    subtitle: 'İlk parça kontrol kayıtları — ölçümler ve gerekçeler',
    canWrite,
    addLabel: 'Yeni Kayıt',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
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
    const reasons = new TagList({ placeholder: 'Gerekçe yaz ve Enter…' });

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
        { name: 'reasons', type: 'tags', tags: reasons, help: 'Serbest metin; yaz ve Enter ile ekle.' }
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

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function inp(type, value) { const i = document.createElement('input'); i.className = 'input'; i.type = type; if (type === 'number') i.step = 'any'; i.value = value ?? ''; return i; }
