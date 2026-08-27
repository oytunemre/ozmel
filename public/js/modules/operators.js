// Operatorler — v2 modulu. Ortak FE katmani (core/) uzerine TAM baglanmis ornek:
// liste + ekleme + duzenleme + silme + yetkinlik FK secici.
// i18n: etiketler () => t(...); veri değerleri (ad/sicil) çevrilmez.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { childChips } from './_childDetail.js';
import { t } from '../core/i18n.js';

const operatorsApi = resource('operators');
const operationsApi = resource('operations');

// Salt okuma mu? Oturum rolu editor degilse yazma kapali (aksiyonlar devre disi + ipucu).
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewOperators(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  // Operasyonlar bir kez cekilir: hem yetkinlik adlarini gostermek hem FK secici icin.
  let operations;
  try {
    operations = (await operationsApi.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewOperators(container) }));
    return;
  }
  const opName = new Map(operations.map(o => [o.id, o.name]));
  const opsSource = async () => ({
    rows: operations.map(o => ({ id: o.id, name: o.name })),
    total: operations.length
  });

  const table = new DataTable(container, {
    title: () => t('menu.operators'),
    canWrite,
    addLabel: () => t('opr.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => operatorsApi.listAll().then(r => r.data),
    rowId: (r) => r.id,
    searchText: (r) => [r.fullName, r.badgeNo, r.skills.map(id => opName.get(id) || '').join(' ')].join(' '),
    emptyMessage: () => t('opr.empty'),
    // Genişleyen satır: operatörün yetkin olduğu operasyonlar (satırda yalnız sayısı).
    expand: (r) => childChips(r.skills.map(id => opName.get(id) || ('#' + id)), t('opr.noSkills')),
    columns: [
      { label: () => t('field.nameSurname'), key: 'fullName' },
      { label: () => t('field.badgeNo'), key: 'badgeNo' },
      {
        label: () => t('opr.skills'),
        render: (r) => r.skills.length
          ? `<span class="mono">${r.skills.length}</span> ${esc(t('word.operations'))}`
          : '<span class="text-muted">—</span>'
      },
      {
        label: () => t('field.status'),
        render: (r) => r.isActive
          ? `<span class="tag tag-success">${esc(t('common.active'))}</span>`
          : `<span class="tag tag-neutral">${esc(t('common.inactive'))}</span>`
      }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);   // panjur aciykken ilgili satir vurgulu

    const skillsFk = new FkSelect({
      source: opsSource, multiple: true, value: row?.skills ?? [],
      rows: operations.map(o => ({ id: o.id, name: o.name }))   // etiketler hemen cozulsun
    });

    openDrawer({
      title: () => t(editing ? 'opr.editTitle' : 'opr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'fullName', label: () => t('field.nameSurname'), type: 'text', required: true },
        { name: 'badgeNo', label: () => t('field.badgeNo'), type: 'text', required: true },
        { name: 'isActive', label: () => t('field.status'), type: 'bool' },
        { name: 'skills', label: () => t('opr.skills'), type: 'fk', fk: skillsFk,
          help: () => t('opr.skillsHelp') }
      ],
      onSubmit: async (v) => {
        const payload = { fullName: v.fullName, badgeNo: v.badgeNo, isActive: v.isActive, skills: v.skills };
        const { data } = editing
          ? await operatorsApi.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await operatorsApi.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(t(editing ? 'opr.updated' : 'opr.added'), 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('opr.deleteTitle'),
      body: t('opr.deleteBody', { name: row.fullName }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try {
      await operatorsApi.remove(row.id);
      toast(t('opr.deleted'), 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
