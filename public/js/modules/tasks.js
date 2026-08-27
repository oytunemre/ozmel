// Görevler (Görev Takibi) — v2 modülü. Sorumlular task_people'a FK.
// i18n: etiketler () => t(...); görev durumu BE'de TR (ts.* ile gösterilir).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapNamed, TASK_STATUS_OPTIONS, withCurrent } from '../core/lookups.js';
import { t } from '../core/i18n.js';

const api = resource('tasks');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Görev durumu: BE değeri TR; ekranda dile göre (anahtar yoksa ham değer).
const statusLabel = (v) => { if (!v) return '—'; const k = 'ts.' + v; const s = t(k); return s === k ? v : s; };
const statusOptions = (cur) => withCurrent(TASK_STATUS_OPTIONS.map(o => ({ value: o.value, label: t('ts.' + o.value) })), cur);

export async function viewTasks(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let people;
  try { people = await loadLookup('task-people', mapNamed); }
  catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewTasks(container) })); return; }

  const table = new DataTable(container, {
    title: () => t('tsk.title'),
    subtitle: () => t('tsk.subtitle'),
    canWrite,
    addLabel: () => t('tsk.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.description, r.department, people.label(r.primaryAssigneeId)].join(' '),
    emptyMessage: () => t('tsk.empty'),
    columns: [
      { label: () => t('field.sequence'), render: (r) => r.sequence ?? '—', className: 'mono' },
      { label: () => t('tsk.subject'), key: 'description' },
      { label: () => t('tsk.department'), render: (r) => esc(r.department || '—') },
      { label: () => t('tsk.assignee'), render: (r) => r.primaryAssigneeId ? esc(people.label(r.primaryAssigneeId)) : '—' },
      { label: () => t('field.dueDate'), render: (r) => esc(r.dueDate || '—') },
      { label: () => t('field.status'), render: (r) => esc(statusLabel(r.status)) },
      { label: () => t('tsk.completion'), render: (r) => r.completionRatio != null ? Math.round(r.completionRatio * 100) + '%' : '—', className: 'mono' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    const primaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.primaryAssigneeId ?? null, placeholder: t('tsk.selectPerson') });
    const secondaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.secondaryAssigneeId ?? null, placeholder: t('tsk.selectPerson') });
    openDrawer({
      title: () => t(editing ? 'tsk.editTitle' : 'tsk.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { status: 'Başlamadı' },
      fields: [
        { name: 'secId', type: 'section', label: () => t('tsk.secTask') },
        { name: 'sequence', label: () => t('field.sequence'), type: 'number' },
        { name: 'description', label: () => t('tsk.description'), type: 'textarea', required: true },
        { name: 'department', label: () => t('tsk.department'), type: 'text' },
        { name: 'priority', label: () => t('tsk.priority'), type: 'text' },
        { name: 'secAssign', type: 'section', label: () => t('tsk.secAssign') },
        { name: 'primaryAssigneeId', label: () => t('tsk.primary'), type: 'fk', fk: primaryFk },
        { name: 'secondaryAssigneeId', label: () => t('tsk.secondary'), type: 'fk', fk: secondaryFk },
        { name: 'dueDate', label: () => t('field.dueDate'), type: 'date' },
        { name: 'status', label: () => t('field.status'), type: 'select', options: statusOptions(row?.status) },
        { name: 'completionRatio', label: () => t('tsk.completionRatio'), type: 'number', step: 'any', help: () => t('tsk.completionHelp') },
        { name: 'notes', label: () => t('tsk.notes'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'tsk.updated' : 'tsk.added'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('tsk.deleteTitle'), body: t('tsk.deleteBody'), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('tsk.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
