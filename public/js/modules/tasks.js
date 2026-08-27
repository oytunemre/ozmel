// Görevler (Görev Takibi) — v2 modülü. Sorumlular task_people'a FK.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapNamed, TASK_STATUS_OPTIONS, withCurrent } from '../core/lookups.js';

const api = resource('tasks');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewTasks(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let people;
  try { people = await loadLookup('task-people', mapNamed); }
  catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewTasks(container) })); return; }

  const table = new DataTable(container, {
    title: 'Görev Takibi',
    subtitle: 'Kalite bulgularından ve tedarikçi denetimlerinden açılan görevler',
    canWrite,
    addLabel: 'Yeni Görev',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.description, r.department, people.label(r.primaryAssigneeId)].join(' '),
    emptyMessage: 'Henüz görev yok. "Yeni Görev" ile başlayın.',
    columns: [
      { label: 'Sıra', render: (r) => r.sequence ?? '—', className: 'mono' },
      { label: 'Konu', key: 'description' },
      { label: 'Departman', render: (r) => esc(r.department || '—') },
      { label: 'Atanan', render: (r) => r.primaryAssigneeId ? esc(people.label(r.primaryAssigneeId)) : '—' },
      { label: 'Termin', render: (r) => esc(r.dueDate || '—') },
      { label: 'Durum', render: (r) => esc(r.status || '—') },
      { label: 'Tamamlanma', render: (r) => r.completionRatio != null ? Math.round(r.completionRatio * 100) + '%' : '—', className: 'mono' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const primaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.primaryAssigneeId ?? null, placeholder: 'Kişi seçin…' });
    const secondaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.secondaryAssigneeId ?? null, placeholder: 'Kişi seçin…' });
    openDrawer({
      title: editing ? 'Görev Düzenle' : 'Yeni Görev',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { status: 'Başlamadı' },
      fields: [
        { name: 'secId', type: 'section', label: 'Görev' },
        { name: 'sequence', label: 'Sıra', type: 'number' },
        { name: 'description', label: 'Görev Tanımı', type: 'textarea', required: true },
        { name: 'department', label: 'Departman', type: 'text' },
        { name: 'priority', label: 'Öncelik', type: 'text' },
        { name: 'secAssign', type: 'section', label: 'Atama & Durum' },
        { name: 'primaryAssigneeId', label: 'Ana Sorumlu', type: 'fk', fk: primaryFk },
        { name: 'secondaryAssigneeId', label: 'Yardımcı', type: 'fk', fk: secondaryFk },
        { name: 'dueDate', label: 'Termin', type: 'date' },
        { name: 'status', label: 'Durum', type: 'select', options: withCurrent(TASK_STATUS_OPTIONS, row?.status) },
        { name: 'completionRatio', label: 'Tamamlanma (0–1)', type: 'number', step: 'any', help: '1 = %100' },
        { name: 'notes', label: 'Notlar', type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Görev güncellendi' : 'Görev eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Görev silinsin mi?', body: 'Bu görev silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Görev silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
