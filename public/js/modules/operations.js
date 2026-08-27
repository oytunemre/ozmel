// Operasyonlar — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Bu modül VERİ TUTMAZ. Her render veriyi API'den çeker. Tek anlamlı alan: name.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/states.js';

const api = resource('operations');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewOperations(container) {
  const table = new DataTable(container, {
    title: 'Operasyonlar',
    canWrite,
    addLabel: 'Yeni Operasyon',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => r.name,
    emptyMessage: 'Henüz operasyon eklenmemiş. "Yeni Operasyon" ile başlayın.',
    columns: [
      { label: 'Ad', key: 'name' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: editing ? 'Operasyon Düzenle' : 'Yeni Operasyon',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'name', label: 'Ad', type: 'text', required: true }
      ],
      onSubmit: async (v) => {
        const payload = { name: v.name };
        const { data } = editing
          ? await api.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await api.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Operasyon güncellendi' : 'Operasyon eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Operasyon silinsin mi?',
      body: `"${row.name}" kalıcı olarak silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast('Operasyon silindi', 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
