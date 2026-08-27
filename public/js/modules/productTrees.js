// Ürün Ağaçları — v2 modülü. Tasarım: Urun-Agaclari.dc.html.
// Açılır/kapanır hiyerarşik ağaç (chevron, tümünü daralt). Kolonlar: Düğüm / Miktar /
// Birim / Tip. Öz-referanslı; parentId kendi tablosundan seçilir (kendini seçemez).
// i18n: özel görünüm — bindLang render()'ı veri çekmeden yeniden çağırır (search/açık
// düğümler/aktif kayıt korunur, closure'da). Drawer kendi relabel'ıyla (drawer.js) çevrilir.

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast, flashRow } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';

const mapProductFull = (r) => ({ id: r.id, code: r.code, name: r.name, unit: r.unit, type: r.type });

const api = resource('product-trees');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewProductTrees(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, nodes;
  try {
    products = await loadLookup('product-codes', mapProductFull);
    nodes = (await api.listAll()).data;
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
  bindLang(container, render);   // dil değişince yeniden çiz (search/açık düğümler korunur)

  function render() {
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.product-trees'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('tree.subtitle'))}</div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" id="pt-collapse">${esc(t('tree.collapseAll'))}</button>
          <button class="btn btn-primary" id="pt-add"${canWrite ? '' : ` disabled title="${esc(t('common.readonlyHint'))}"`}>${esc(t('tree.new'))}</button>
        </div>
      </div>
      <div class="toolbar"><div class="search">
        <input class="input" type="search" id="pt-search" placeholder="${esc(t('tree.search'))}" value="${esc(search)}">
      </div></div>
      <div class="tree-wrap">
        <div class="tree-head"><div>${esc(t('tree.colNode'))}</div><div>${esc(t('field.quantity'))}</div><div>${esc(t('field.unit'))}</div><div>${esc(t('field.type'))}</div><div></div></div>
        <div id="pt-body"></div>
      </div>`;

    const body = container.querySelector('#pt-body');
    const visibleRoots = rootNodes().filter(subtreeMatches);
    if (visibleRoots.length === 0) {
      body.innerHTML = `<div class="tree-row"><div class="text-muted" style="grid-column:1/-1">${
        esc(search ? t('tree.noMatch') : t('tree.empty'))}</div></div>`;
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
        btn(t('tree.addChild'), 'btn-ghost', () => openForm(null, node.id)),
        btn(t('action.edit'), 'btn-ghost', () => openForm(node, null)),
        btn(t('action.delete'), 'btn-danger', () => remove(node))
      );
    }
    body.appendChild(row);

    if (isOpen) for (const c of kids) renderNode(body, c, depth + 1);
  }

  function openForm(row, presetParentId) {
    const editing = !!row;
    activeId = editing ? row.id : null; markActive();

    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('tree.selectProduct') });
    const materialFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.materialCodeId ?? null, placeholder: t('tree.selectMaterial') });
    const parentRows = nodes.filter(n => !editing || n.id !== row.id)
      .map(n => ({ id: n.id, code: pc(n).code || '', name: n.description || '' }));
    const parentFk = new FkSelect({
      source: async () => ({ rows: parentRows, total: parentRows.length }), rows: parentRows,
      value: editing ? (row.parentId ?? null) : (presetParentId ?? null), placeholder: t('tree.selectParent')
    });

    openDrawer({
      title: () => t(editing ? 'tree.editTitle' : (presetParentId ? 'tree.addChildTitle' : 'tree.newTitle')),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { parentId: presetParentId ?? null },
      fields: [
        { name: 'secId', type: 'section', label: () => t('tree.secId') },
        { name: 'productCodeId', label: () => t('field.product'), type: 'fk', fk: productFk, required: true },
        { name: 'description', label: () => t('field.description'), type: 'text' },
        { name: 'parentId', label: () => t('field.parentNode'), type: 'fk', fk: parentFk, help: () => t('tree.parentHelp') },
        { name: 'secMat', type: 'section', label: () => t('tree.secMat') },
        { name: 'materialCodeId', label: () => t('tree.materialField'), type: 'fk', fk: materialFk },
        { name: 'materialDescription', label: () => t('tree.materialDesc'), type: 'text' },
        { name: 'secMeasures', type: 'section', label: () => t('tree.secMeasures') },
        { name: 'unitQuantity', label: () => t('field.unitQuantity'), type: 'number', step: 'any' },
        { name: 'outerDiameter', label: () => t('field.outerDiameter'), type: 'number', step: 'any' },
        { name: 'innerDiameter', label: () => t('field.innerDiameter'), type: 'number', step: 'any' },
        { name: 'materialLength', label: () => t('field.materialLength'), type: 'number', step: 'any' },
        { name: 'materialWeight', label: () => t('field.materialWeight'), type: 'number', step: 'any' },
        { name: 'partLength', label: () => t('tree.partLength'), type: 'number', step: 'any' },
        { name: 'cutLoss', label: () => t('tree.cutLoss'), type: 'number', step: 'any' },
        { name: 'supplierCutLength', label: () => t('tree.supplierCutLength'), type: 'number', step: 'any' },
        { name: 'secRev', type: 'section', label: () => t('tree.secRev') },
        { name: 'revision', label: () => t('field.revision'), type: 'text' },
        { name: 'revisionDate', label: () => t('field.revisionDate'), type: 'date' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => {
        toast(t('toast.saved'), 'success');
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
    nodes = (await api.listAll()).data;
    byId.clear(); nodes.forEach(n => byId.set(n.id, n));
  }

  async function remove(node) {
    const ok = await confirmDialog({
      title: t('tree.deleteTitle'),
      body: t('tree.deleteBody', { name: pc(node).code || node.productCodeId }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(node.id); toast(t('toast.deleted'), 'success'); await reloadNodes(); render(); }
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
