// Görev Kişileri — v2 modülü. Paylaşımlı kişi dizini (görevler buna atanır).
// i18n: etiketler () => t(...).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';
import { formatPhone } from '../core/phone.js';
import { t } from '../core/i18n.js';

const api = resource('task-people');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewTaskPeople(container) {
  const table = new DataTable(container, {
    title: () => t('menu.task-people'),
    subtitle: () => t('tp.subtitle'),
    canWrite,
    addLabel: () => t('tp.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.name, r.email, r.phone].join(' '),
    emptyMessage: () => t('tp.empty'),
    columns: [
      { label: () => t('field.fullName'), key: 'name' },
      { label: () => t('field.email'), render: (r) => esc(r.email || '—') },
      { label: () => t('field.phone'), render: (r) => r.phone ? esc(formatPhone(r.phone)) : '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'tp.editTitle' : 'tp.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'name', label: () => t('field.fullName'), type: 'text', required: true },
        { name: 'email', label: () => t('field.email'), type: 'text' },
        { name: 'phone', label: () => t('field.phone'), type: 'phone' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'tp.updated' : 'tp.added'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('tp.deleteTitle'), body: t('common.deleteShort', { name: row.name }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('tp.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
