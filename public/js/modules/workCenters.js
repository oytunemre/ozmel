// İş Merkezleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Bu modül VERİ TUTMAZ. Her render veriyi API'den çeker. i18n: kullanıcı metinleri t();
// etiketler () => t(...) (canlı dil değişiminde DataTable yeniden çizer, veri çekmeden).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/states.js';
import { t } from '../core/i18n.js';

const api = resource('work-centers');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewWorkCenters(container, params) {
  const table = new DataTable(container, {
    title: () => t('menu.work-centers'),
    focusId: params?.id,   // arama/çapraz bağlantı hedefi
    canWrite,
    addLabel: () => t('wc.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    searchText: (r) => r.name,
    emptyMessage: () => t('wc.empty'),
    columns: [
      { label: () => t('field.name'), key: 'name' },
      {
        label: () => t('field.status'),
        render: (r) => r.isActive
          ? `<span class="tag tag-success">${t('common.active')}</span>`
          : `<span class="tag tag-neutral">${t('common.inactive')}</span>`
      }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);
    openDrawer({
      title: () => t(editing ? 'wc.editTitle' : 'wc.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'name', label: () => t('field.name'), type: 'text', required: true },
        { name: 'isActive', label: () => t('field.status'), type: 'bool' }
      ],
      onSubmit: async (v) => {
        const payload = { name: v.name, isActive: v.isActive };
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
      title: t('wc.deleteTitle'),
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
