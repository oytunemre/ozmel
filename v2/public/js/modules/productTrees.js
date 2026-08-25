// Ürün Ağaçları — v2 modülü. Tasarım: Urun-Agaclari.dc.html.
// Açılır/kapanır hiyerarşik ağaç (chevron, tümünü daralt). Kolonlar: Düğüm / Miktar /
// Birim / Tip. Öz-referanslı; parentId kendi tablosundan seçilir (kendini seçemez).

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast, flashRow } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';

const api = resource('product-trees');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewProductTrees(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, nodes;
  try {
    products = await loadLookup('product-codes', mapProduct);
    nodes = (await api.list({ limit: 200 })).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProductTrees(container) }));
    return;
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  const childrenOf = (pid) => nodes.filter(n => (n.parentId ?? null) === pid);
  const rootNodes = () => nodes.filter(n => n.parentId == null || !byId.has(n.parentId));
  const collapsed = new Set();
  let search = '';
  let activeId = null;

  const pc = (n) => products.byId.get(n.productCodeId) || {};
  const nodeMatches = (n) => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return true;
    return [pc(n).code, n.description].some(s => (s || '').toLocaleLowerCase('tr').includes(q));
  };
  const subtreeMatches = (n) => nodeMatches(n) || childrenOf(n.id).some(subtreeMatches);

  render();

  function render() {
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>Ürün Ağaçları</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">Bir düğüm başka bir düğümün altında durur · miktarlar üst düğümün bir adedi içindir</div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" id="pt-collapse">Tümünü daralt</button>
          <button class="btn btn-primary" id="pt-add"${canWrite ? '' : ' disabled title="Salt okuma"'}>Yeni Düğüm</button>
        </div>
      </div>
      <div class="toolbar"><div class="search">
        <input class="input" type="search" id="pt-search" placeholder="Ürün kodu veya açıklama ara…" value="${esc(search)}">
      </div></div>
      <div class="tree-wrap">
        <div class="tree-head"><div>Düğüm</div><div>Miktar</div><div>Birim</div><div>Tip</div><div></div></div>
        <div id="pt-body"></div>
      </div>`;

    const body = container.querySelector('#pt-body');
    const visibleRoots = rootNodes().filter(subtreeMatches);
    if (visibleRoots.length === 0) {
      body.innerHTML = `<div class="tree-row"><div class="text-muted" style="grid-column:1/-1">${
        search ? 'Eşleşen düğüm yok.' : 'Henüz ağaç düğümü yok.'}</div></div>`;
    } else {
      for (const r of visibleRoots) renderNode(body, r, 0);
    }

    const searchEl = container.querySelector('#pt-search');
    searchEl.addEventListener('input', () => { search = searchEl.value; render(); searchEl.focus();
      searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length); });
    container.querySelector('#pt-collapse').addEventListener('click', () => {
      nodes.forEach(n => { if (childrenOf(n.id).length) collapsed.add(n.id); }); render();
    });
    const addBtn = container.querySelector('#pt-add');
    if (canWrite) addBtn.addEventListener('click', () => openForm(null, null));
  }

  function renderNode(body, node, depth) {
    if (search && !subtreeMatches(node)) return;
    const kids = childrenOf(node.id);
    const isOpen = search ? true : !collapsed.has(node.id);
    const p = pc(node);
    const row = document.createElement('div');
    row.className = 'tree-row' + (String(node.id) === String(activeId) ? ' is-active' : '');
    row.dataset.id = node.id;
    row.innerHTML = `
      <div class="tree-node" style="padding-left:${12 + depth * 20}px">
        <button class="tree-toggle${kids.length ? '' : ' leaf'}">${kids.length ? (isOpen ? '▾' : '▸') : '•'}</button>
        <span class="tree-code">${esc(p.code || '#' + node.productCodeId)}</span>
        <span class="tree-name">${esc(node.description || p.name || '')}</span>
      </div>
      <div class="tree-num">${node.unitQuantity ?? '—'}</div>
      <div>${esc(p.unit || '—')}</div>
      <div>${esc(p.type || '—')}</div>
      <div class="tree-actions"></div>`;

    if (kids.length) row.querySelector('.tree-toggle').addEventListener('click', () => {
      if (collapsed.has(node.id)) collapsed.delete(node.id); else collapsed.add(node.id); render();
    });
    const actions = row.querySelector('.tree-actions');
    if (canWrite) {
      actions.append(
        btn('Alt Ekle', 'btn-ghost', () => openForm(null, node.id)),
        btn('Düzenle', 'btn-ghost', () => openForm(node, null)),
        btn('Sil', 'btn-danger', () => remove(node))
      );
    }
    body.appendChild(row);

    if (isOpen) for (const c of kids) renderNode(body, c, depth + 1);
  }

  function openForm(row, presetParentId) {
    const editing = !!row;
    activeId = editing ? row.id : null; markActive();

    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: 'Ürün seçin…' });
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: 'Hammadde seçin…' });
    const parentRows = nodes.filter(t => !editing || t.id !== row.id)
      .map(t => ({ id: t.id, code: pc(t).code || '', name: t.description || '' }));
    const parentFk = new FkSelect({
      source: async () => ({ rows: parentRows, total: parentRows.length }), rows: parentRows,
      value: editing ? (row.parentId ?? null) : (presetParentId ?? null), placeholder: 'Üst düğüm seçin…'
    });

    openDrawer({
      title: editing ? 'Düğüm Düzenle' : (presetParentId ? 'Alt Düğüm Ekle' : 'Yeni Düğüm'),
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { parentId: presetParentId ?? null },
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
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => {
        toast(editing ? 'Düğüm güncellendi' : 'Düğüm eklendi', 'success');
        await reloadNodes();
        activeId = saved.id;
        render();
        flashRow(container.querySelector(`.tree-row[data-id="${saved.id}"]`));
      },
      onClose: () => { activeId = null; markActive(); }
    });
  }

  function markActive() {
    container.querySelectorAll('.tree-row').forEach(r =>
      r.classList.toggle('is-active', String(r.dataset.id) === String(activeId)));
  }

  async function reloadNodes() {
    nodes = (await api.list({ limit: 200 })).data;
    byId.clear(); nodes.forEach(n => byId.set(n.id, n));
  }

  async function remove(node) {
    const ok = await confirmDialog({
      title: 'Düğüm silinsin mi?',
      body: `"${pc(node).code || node.productCodeId}" ve ALT düğümleri kalıcı olarak silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(node.id); toast('Düğüm silindi', 'success'); await reloadNodes(); render(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

function btn(label, kind, on) {
  const b = document.createElement('button');
  b.className = `btn ${kind} btn-sm`;
  b.textContent = label;
  b.addEventListener('click', on);
  return b;
}
