// Çeviri Sözlüğü (Terimler) — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// original (benzersiz), translation, isHidden. v1'deki gizliTerimler burada boolean.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';

const api = resource('terms');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewTerms(container) {
  const table = new DataTable(container, {
    title: 'Çeviri Sözlüğü',
    canWrite,
    addLabel: 'Yeni Terim',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.list({ limit: 200 }).then(r => r.data),
    searchText: (r) => [r.original, r.translation].join(' '),
    emptyMessage: 'Henüz terim eklenmemiş. "Yeni Terim" ile başlayın.',
    columns: [
      { label: 'Orijinal', key: 'original' },
      { label: 'Çeviri', render: (r) => esc(r.translation || '—') },
      { label: 'Gizli', render: (r) => r.isHidden ? '<span class="tag tag-neutral">Gizli</span>' : '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: editing ? 'Terim Düzenle' : 'Yeni Terim',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { isHidden: 0 },
      fields: [
        { name: 'original', label: 'Orijinal', type: 'text', required: true },
        { name: 'translation', label: 'Çeviri', type: 'text' },
        { name: 'isHidden', label: 'Gizli', type: 'bool' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Terim güncellendi' : 'Terim eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Terim silinsin mi?', body: `"${row.original}" silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Terim silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
