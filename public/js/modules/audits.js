// Denetim Soruları — v2 modülü. Bağımsız denetim soru bankası.
// i18n: etiketler () => t(...). Form değeri (or. 'TQS') veri, çevrilmez.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';
import { t } from '../core/i18n.js';

const api = resource('audits');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewAudits(container) {
  const table = new DataTable(container, {
    title: () => t('menu.audits'),
    subtitle: () => t('aud.subtitle'),
    canWrite,
    addLabel: () => t('aud.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.form, r.section, r.question].join(' '),
    emptyMessage: () => t('aud.empty'),
    columns: [
      { label: () => t('aud.form'), render: (r) => esc(r.form || '—') },
      { label: () => t('aud.section'), key: 'section' },
      { label: () => t('aud.question'), key: 'question' },
      { label: () => t('aud.score'), render: (r) => r.score ?? '—', className: 'mono' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'aud.editTitle' : 'aud.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { form: 'TQS' },
      fields: [
        { name: 'form', label: () => t('aud.form'), type: 'text' },
        { name: 'section', label: () => t('aud.section'), type: 'text', required: true },
        { name: 'question', label: () => t('aud.question'), type: 'textarea', required: true },
        { name: 'score', label: () => t('aud.score'), type: 'number', step: 'any' },
        { name: 'evidence', label: () => t('aud.evidence'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t(editing ? 'aud.updated' : 'aud.added'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: t('aud.deleteTitle'), body: t('aud.deleteBody'), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('aud.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
