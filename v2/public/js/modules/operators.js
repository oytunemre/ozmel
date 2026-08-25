// Operatorler — v2 modulu. Ortak FE katmani (core/) uzerine TAM baglanmis ornek:
// liste + ekleme + duzenleme + silme + yetkinlik FK secici. Diger 23 modul bunu ornek alir.
//
// Bu modul VERI TUTMAZ. Her render veriyi API'den ceker. Ekran metinleri Turkce,
// API anahtarlari Ingilizce (fullName/badgeNo/isActive/skills).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { childChips } from './_childDetail.js';

const operatorsApi = resource('operators');
const operationsApi = resource('operations');

// Salt okuma mu? Oturum rolu editor degilse yazma kapali (aksiyonlar devre disi + ipucu).
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewOperators(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';

  // Operasyonlar bir kez cekilir: hem yetkinlik adlarini gostermek hem FK secici icin.
  let operations;
  try {
    operations = (await operationsApi.list({ limit: 200 })).data;
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
    title: 'Operatörler',
    canWrite,
    addLabel: 'Yeni Operatör',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => operatorsApi.list({ limit: 200 }).then(r => r.data),
    rowId: (r) => r.id,
    searchText: (r) => [r.fullName, r.badgeNo, r.skills.map(id => opName.get(id) || '').join(' ')].join(' '),
    emptyMessage: 'Henüz operatör eklenmemiş. "Yeni Operatör" ile başlayın.',
    // Genişleyen satır: operatörün yetkin olduğu operasyonlar (satırda yalnız sayısı).
    expand: (r) => childChips(r.skills.map(id => opName.get(id) || ('#' + id)), 'Yetkin operasyon tanımlı değil.'),
    columns: [
      { label: 'Ad Soyad', key: 'fullName' },
      { label: 'Sicil No', key: 'badgeNo' },
      {
        label: 'Yetkin Operasyonlar',
        render: (r) => r.skills.length
          ? `<span class="mono">${r.skills.length}</span> operasyon`
          : '<span class="text-muted">—</span>'
      },
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
    if (editing) table.markActive(row.id);   // panjur aciykken ilgili satir vurgulu

    const skillsFk = new FkSelect({
      source: opsSource, multiple: true, value: row?.skills ?? [],
      rows: operations.map(o => ({ id: o.id, name: o.name }))   // etiketler hemen cozulsun
    });

    openDrawer({
      title: editing ? 'Operatör Düzenle' : 'Yeni Operatör',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'fullName', label: 'Ad Soyad', type: 'text', required: true },
        { name: 'badgeNo', label: 'Sicil No', type: 'text', required: true },
        { name: 'isActive', label: 'Durum', type: 'bool' },
        { name: 'skills', label: 'Yetkin Operasyonlar', type: 'fk', fk: skillsFk,
          help: 'Bu operatörün yetkin olduğu operasyonlar (çoklu seçim).' }
      ],
      onSubmit: async (v) => {
        const payload = { fullName: v.fullName, badgeNo: v.badgeNo, isActive: v.isActive, skills: v.skills };
        const { data } = editing
          ? await operatorsApi.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await operatorsApi.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Operatör güncellendi' : 'Operatör eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Operatör silinsin mi?',
      body: `"${row.fullName}" ve yetkinlikleri kalıcı olarak silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try {
      await operatorsApi.remove(row.id);
      toast('Operatör silindi', 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
