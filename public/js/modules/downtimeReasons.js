// Duruş Nedenleri — v2 modülü (Tanımlar). Ad + aktif/pasif. Basit CRUD, terms deseni.
// Neden production kayıtlarında kullanıldığında silinemez (FK RESTRICT → IN_USE) — pasife alınır.
// i18n: etiketler () => t(...); neden ADI veri olduğu gibi gösterilir.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, esc } from '../core/states.js';
import { t } from '../core/i18n.js';

const api = resource('downtime-reasons');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewDowntimeReasons(container) {
  const table = new DataTable(container, {
    title: () => t('menu.downtime-reasons'),
    subtitle: () => t('dtr.subtitle'),
    canWrite,
    addLabel: () => t('dtr.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => r.name,
    emptyMessage: () => t('dtr.empty'),
    columns: [
      { label: () => t('field.name'), key: 'name' },
      { label: () => t('dtr.status'), render: (r) => r.isActive
        ? `<span class="tag tag-success">${esc(t('dtr.active'))}</span>`
        : `<span class="tag tag-neutral">${esc(t('dtr.passive'))}</span>` }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'dtr.editTitle' : 'dtr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'name', label: () => t('field.name'), type: 'text', required: true },
        { name: 'isActive', label: () => t('dtr.activeField'), type: 'bool' }
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
      title: t('dtr.deleteTitle'), body: t('common.deleteBody', { name: row.name }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}
