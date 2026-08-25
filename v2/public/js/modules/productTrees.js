// Ürün Ağaçları — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Öz-referanslı ağaç: parentId kendi tablosundan seçilir (kendini seçemez; döngüyü
// sunucu engeller). Tablo hiyerarşik sırada, açıklama derinliğe göre girintili.

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';

const api = resource('product-trees');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewProductTrees(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products;
  try {
    products = await loadLookup('product-codes', mapProduct);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProductTrees(container) }));
    return;
  }

  let treeData = [];
  let treeById = new Map();
  async function fetchTree() {
    const { data } = await api.list({ limit: 200 });
    treeData = data;
    treeById = new Map(data.map(t => [t.id, t]));
    return orderTree(data);
  }
  const treeLabel = (id) => {
    if (id == null) return '—';
    const t = treeById.get(id);
    if (!t) return '#' + id;
    const code = products.byId.get(t.productCodeId)?.code || '';
    return [code, t.description].filter(Boolean).join(' · ') || ('#' + id);
  };

  const table = new DataTable(container, {
    title: 'Ürün Ağaçları',
    canWrite,
    addLabel: 'Yeni Düğüm',
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: fetchTree,
    searchText: (r) => [products.label(r.productCodeId), r.description].join(' '),
    emptyMessage: 'Henüz ağaç düğümü eklenmemiş. "Yeni Düğüm" ile başlayın.',
    columns: [
      { label: 'Ürün', render: (r) => esc(products.label(r.productCodeId)) },
      { label: 'Açıklama', render: (r) => '&nbsp;'.repeat((r._depth || 0) * 4) + esc(r.description || '—') },
      { label: 'Malzeme', render: (r) => r.materialCodeId ? esc(products.label(r.materialCodeId)) : '—' },
      { label: 'Üst Düğüm', render: (r) => esc(treeLabel(r.parentId)) }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);

    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: 'Hammadde seçin…' });
    // Üst düğüm: kendi tablosundan; düzenlerken kendini hariç tut.
    const parentRows = treeData
      .filter(t => !editing || t.id !== row.id)
      .map(t => ({ id: t.id, code: products.byId.get(t.productCodeId)?.code || '', name: t.description || '' }));
    const parentFk = new FkSelect({
      source: async () => ({ rows: parentRows, total: parentRows.length }),
      rows: parentRows, value: row?.parentId ?? null, placeholder: 'Üst düğüm seçin…'
    });

    openDrawer({
      title: editing ? 'Düğüm Düzenle' : 'Yeni Düğüm',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : {},
      fields: [
        { name: 'secId', type: 'section', label: 'Kimlik' },
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'description', label: 'Açıklama', type: 'text' },
        { name: 'parentId', label: 'Üst Düğüm', type: 'fk', fk: parentFk, help: 'Boş bırakılırsa kök düğüm.' },

        { name: 'secMat', type: 'section', label: 'Malzeme' },
        { name: 'materialCodeId', label: 'Malzeme (Hammadde)', type: 'fk', fk: materialFk },
        { name: 'materialDescription', label: 'Malzeme Açıklaması', type: 'text' },

        { name: 'secMeasures', type: 'section', label: 'Ölçüler' },
        { name: 'unitQuantity', label: 'Birim Miktar', type: 'number', step: 'any' },
        { name: 'outerDiameter', label: 'Dış Çap', type: 'number', step: 'any' },
        { name: 'innerDiameter', label: 'İç Çap', type: 'number', step: 'any' },
        { name: 'materialLength', label: 'Malzeme Uzunluğu', type: 'number', step: 'any' },
        { name: 'materialWeight', label: 'Malzeme Ağırlığı', type: 'number', step: 'any' },
        { name: 'partLength', label: 'Parça Boyu', type: 'number', step: 'any' },
        { name: 'cutLoss', label: 'Kesim Kaybı', type: 'number', step: 'any' },
        { name: 'supplierCutLength', label: 'Tedarikçi Kesim Uzunluğu', type: 'number', step: 'any' },

        { name: 'secRev', type: 'section', label: 'Revizyon' },
        { name: 'revision', label: 'Revizyon', type: 'text' },
        { name: 'revisionDate', label: 'Revizyon Tarihi', type: 'date' }
      ],
      onSubmit: async (v) => {
        const { data } = editing ? await api.update(row.id, v) : await api.create(v);
        return data;
      },
      onSaved: async (saved) => {
        toast(editing ? 'Düğüm güncellendi' : 'Düğüm eklendi', 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Düğüm silinsin mi?',
      body: `"${products.label(row.productCodeId)}" ve ALT düğümleri silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Düğüm silindi', 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// Ağacı DFS ile sıraya dizer, her satıra _depth verir (girintili gösterim için).
function orderTree(rows) {
  const byParent = new Map();
  for (const r of rows) {
    const p = r.parentId ?? 0;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(r);
  }
  const out = [];
  const seen = new Set();
  const visit = (pid, depth) => {
    for (const r of (byParent.get(pid) || [])) {
      if (seen.has(r.id)) continue;          // döngü koruması
      seen.add(r.id);
      r._depth = depth;
      out.push(r);
      visit(r.id, depth + 1);
    }
  };
  visit(0, 0);  // kökler: parentId null -> 0
  for (const r of rows) if (!seen.has(r.id)) { r._depth = 0; out.push(r); seen.add(r.id); } // öksüzler
  return out;
}
