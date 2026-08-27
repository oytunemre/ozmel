// Saatlik Kayıtlar — v2 modülü. Parent + çocuk ölçümler; her nokta DEĞİŞKEN sayıda
// değer tutar. Editör: nokta seçici + değerler (TagList, sırayla). API şekli:
// measurements = [{ pointId, values:[...] }].

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { TagList } from '../core/taglist.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { measurementDetail } from './_measDetail.js';

const api = resource('hourly-records');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewHourlyRecords(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, pointRows, pointsById;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    const pts = (await resource('hourly-points').listAll()).data;
    pointRows = pts.map(p => ({ id: p.id, code: products.byId.get(p.productCodeId)?.code || '', name: p.measureLocation }));
    pointsById = new Map(pts.map(p => [p.id, p]));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewHourlyRecords(container) })); return; }

  // Genişleyen satır: her nokta için ölçüm yeri + değerler (sırayla) + tolerans.
  const expand = (row) => measurementDetail(row.measurements.map(m => {
    const p = pointsById.get(m.pointId) || {};
    return { location: p.measureLocation || ('#' + m.pointId), lower: p.lowerLimit, upper: p.upperLimit, values: m.values };
  }));

  const table = new DataTable(container, {
    title: 'Saatlik Kayıtlar',
    subtitle: 'Saatlik kontrol kayıtları — nokta başına ölçüm dizisi',
    canWrite,
    addLabel: 'Yeni Kayıt',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    expand,
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [products.label(r.productCodeId), ops.label(r.operationId), r.personnelName, r.machineName].join(' '),
    emptyMessage: 'Henüz kayıt yok. "Yeni Kayıt" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Operasyon', render: (r) => esc(ops.label(r.operationId)) },
      { label: 'Tarih', render: (r) => esc(r.date || '—') },
      { label: 'Saat', render: (r) => esc(r.hour || '—') },
      { label: 'Personel', render: (r) => esc(r.personnelName || '—') },
      { label: 'Nokta', render: (r) => r.measurements.length, className: 'mono' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    const meas = new HourlyMeasurementsEditor(pointRows);

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
        { name: 'hour', label: 'Saat', type: 'time' },
        { name: 'personnelName', label: 'Personel', type: 'text' },
        { name: 'machineName', label: 'Makina', type: 'text' },
        { name: 'productionCount', label: 'Üretim Adedi', type: 'number' },
        { name: 'secMeas', type: 'section', label: 'Ölçümler' },
        { name: 'measurements', type: 'component', component: meas }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Kayıt güncellendi' : 'Kayıt eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Kayıt silinsin mi?', body: 'Bu saatlik kayıt ve ölçümleri silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Kayıt silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// Ölçüm editörü: her satır bir nokta + değişken sayıda değer (TagList).
class HourlyMeasurementsEditor {
  constructor(pointRows) {
    this.pointRows = pointRows;
    this.rows = [];
    this.cb = null;
    this.el = document.createElement('div');
    this.box = el('div', 'rows-ed');
    this.head = el('div', 'rows-head');
    this.head.style.gridTemplateColumns = '220px 1fr 24px';
    this.head.innerHTML = '<span>Nokta</span><span>Değerler (sırayla)</span><span></span>';
    this.body = el('div', '');
    this.box.append(this.head, this.body);
    this.el.appendChild(this.box);
    const add = el('button', 'btn btn-secondary btn-sm rows-ed-add', '+ Nokta ekle');
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
    return this.rows.map(r => ({ pointId: r.fk.getValue(), values: r.values.getValue() }))
      .filter(m => m.pointId);
  }
  addRow(m) {
    const line = el('div', 'row-line');
    line.style.gridTemplateColumns = '220px 1fr 24px';
    const fk = new FkSelect({ source: async () => ({ rows: this.pointRows, total: this.pointRows.length }), rows: this.pointRows, value: m.pointId ?? null, placeholder: 'Nokta…' });
    // Ölçüm değerleri tekilleştirilMEZ — 8.88, 8.88, 8.9 gibi tekrarlar normaldir (sequence korur).
    const values = new TagList({ value: (m.values || []).map(String), placeholder: 'Değer yaz ve Enter…', unique: false });
    const x = el('button', 'row-x', '×'); x.type = 'button';
    fk.onChange(() => this.emit()); values.onChange(() => this.emit());
    const entry = { fk, values, line };
    x.addEventListener('click', () => { line.remove(); this.rows = this.rows.filter(r => r !== entry); this.emit(); this.paintEmpty(); });
    line.append(fk.el, values.el, x);
    this.body.appendChild(line);
    this.rows.push(entry);
    this.paintEmpty();
  }
  paintEmpty() {
    let e = this.body.querySelector('.rows-empty');
    if (this.rows.length === 0) { if (!e) { e = el('div', 'rows-empty', 'Nokta eklenmedi.'); this.body.appendChild(e); } }
    else if (e) e.remove();
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
