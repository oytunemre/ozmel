// Çeviri Sözlüğü (Terimler) — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// original (benzersiz), translation, isHidden. v1'deki gizliTerimler burada boolean.
// i18n: etiketler () => t(...); çeviri VERİSİ (original/translation) olduğu gibi gösterilir.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';
import { t } from '../core/i18n.js';

const api = resource('terms');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewTerms(container) {
  const table = new DataTable(container, {
    title: () => t('menu.terms'),
    subtitle: () => t('tm.subtitle'),
    canWrite,
    addLabel: () => t('tm.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => [r.original, r.translation].join(' '),
    emptyMessage: () => t('tm.empty'),
    columns: [
      { label: () => t('field.original'), key: 'original' },
      { label: () => t('field.translation'), render: (r) => esc(r.translation || '—') },
      { label: () => t('field.hidden'), render: (r) => r.isHidden ? `<span class="tag tag-neutral">${t('tm.hiddenTag')}</span>` : '—' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'tm.editTitle' : 'tm.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { isHidden: 0 },
      fields: [
        { name: 'original', label: () => t('field.original'), type: 'text', required: true },
        { name: 'translation', label: () => t('field.translation'), type: 'text' },
        { name: 'isHidden', label: () => t('field.hidden'), type: 'bool' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(t('toast.saved'), 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('tm.deleteTitle'), body: t('common.deleteBody', { name: row.original }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
