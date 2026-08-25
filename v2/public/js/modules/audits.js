// Denetim Soruları — v2 modülü. Bağımsız denetim soru bankası.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';

const api = resource('audits');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewAudits(container) {
  const table = new DataTable(container, {
    title: 'Denetim Soruları',
    subtitle: 'Denetim soru bankası',
    canWrite,
    addLabel: 'Yeni Soru',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.form, r.section, r.question].join(' '),
    emptyMessage: 'Henüz soru yok. "Yeni Soru" ile başlayın.',
    columns: [
      { label: 'Form', render: (r) => esc(r.form || '—') },
      { label: 'Bölüm', key: 'section' },
      { label: 'Soru', key: 'question' },
      { label: 'Puan', render: (r) => r.score ?? '—', className: 'mono' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: editing ? 'Soru Düzenle' : 'Yeni Soru',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { form: 'TQS' },
      fields: [
        { name: 'form', label: 'Form', type: 'text' },
        { name: 'section', label: 'Bölüm', type: 'text', required: true },
        { name: 'question', label: 'Soru', type: 'textarea', required: true },
        { name: 'score', label: 'Puan', type: 'number', step: 'any' },
        { name: 'evidence', label: 'Kanıt', type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Soru güncellendi' : 'Soru eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Soru silinsin mi?', body: 'Bu denetim sorusu silinecek.', confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Soru silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
