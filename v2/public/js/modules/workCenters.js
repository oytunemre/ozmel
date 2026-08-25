// İş Merkezleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Bu modül VERİ TUTMAZ. Her render veriyi API'den çeker. Ekran metinleri Türkçe,
// API anahtarları İngilizce (name/isActive).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/states.js';

const api = resource('work-centers');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewWorkCenters(container) {
  const table = new DataTable(container, {
    title: 'İş Merkezleri',
    canWrite,
    addLabel: 'Yeni İş Merkezi',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => r.name,
    emptyMessage: 'Henüz iş merkezi eklenmemiş. "Yeni İş Merkezi" ile başlayın.',
    columns: [
      { label: 'Ad', key: 'name' },
      {
        label: 'Durum',
        render: (r) => r.isActive
          ? '<span class="tag tag-success">Aktif</span>'
          : '<span class="tag tag-neutral">Pasif</span>'
      }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: editing ? 'İş Merkezi Düzenle' : 'Yeni İş Merkezi',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'name', label: 'Ad', type: 'text', required: true },
        { name: 'isActive', label: 'Durum', type: 'bool' }
      ],
      onSubmit: async (v) => {
        const payload = { name: v.name, isActive: v.isActive };
        const { data } = editing
          ? await api.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await api.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'İş merkezi güncellendi' : 'İş merkezi eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'İş merkezi silinsin mi?',
      body: `"${row.name}" kalıcı olarak silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast('İş merkezi silindi', 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
