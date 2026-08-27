// Operasyonlar — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Bu modül VERİ TUTMAZ. Her render veriyi API'den çeker. Tek anlamlı alan: name.
// i18n: etiketler () => t(...) — canlı dil değişiminde DataTable veri çekmeden yeniden çizer.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/states.js';
import { t } from '../core/i18n.js';

const api = resource('operations');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewOperations(container) {
  const table = new DataTable(container, {
    title: () => t('menu.operations'),
    canWrite,
    addLabel: () => t('op.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => r.name,
    emptyMessage: () => t('op.empty'),
    columns: [
      { label: () => t('field.name'), key: 'name' }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'op.editTitle' : 'op.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'name', label: () => t('field.name'), type: 'text', required: true }
      ],
      onSubmit: async (v) => {
        const payload = { name: v.name };
        const { data } = editing
          ? await api.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await api.create(payload);
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
      title: t('op.deleteTitle'),
      body: t('common.deleteBody', { name: row.name }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast(t('toast.deleted'), 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
