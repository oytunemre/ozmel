// Görev Kişileri — v2 modülü. Paylaşımlı kişi dizini (görevler buna atanır).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';
import { formatPhone } from '../core/phone.js';

const api = resource('task-people');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewTaskPeople(container) {
  const table = new DataTable(container, {
    title: 'Görev Kişileri',
    subtitle: 'Görevlerin atanacağı kişiler',
    canWrite,
    addLabel: 'Yeni Kişi',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.name, r.email, r.phone].join(' '),
    emptyMessage: 'Henüz kişi yok. "Yeni Kişi" ile başlayın.',
    columns: [
      { label: 'İsim', key: 'name' },
      { label: 'E-posta', render: (r) => esc(r.email || '—') },
      { label: 'Telefon', render: (r) => r.phone ? esc(formatPhone(r.phone)) : '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: editing ? 'Kişi Düzenle' : 'Yeni Kişi',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'name', label: 'İsim', type: 'text', required: true },
        { name: 'email', label: 'E-posta', type: 'text' },
        { name: 'phone', label: 'Telefon', type: 'phone' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(editing ? 'Kişi güncellendi' : 'Kişi eklendi', 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Kişi silinsin mi?', body: `"${row.name}" silinecek.`, confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await api.remove(row.id); toast('Kişi silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
