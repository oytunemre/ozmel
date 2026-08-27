// Rotalar — v2 modülü. Tasarım: Rotalar.dc.html — ürüne göre GRUPLU, açılır/kapanır
// kartlar; her grup o ürünün operasyon sırası. (Tasarımdaki hazırlık/birim dk/fire%
// kolonları veri modelinde yok; onların yerine Varyantlar/Aktif gösterilir.)
//
// urun/operasyon/isMerkezi FK; varyantlar çocuk tablo (serbest metin çoklu giriş).

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { TagList } from '../core/taglist.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { childChips } from './_childDetail.js';

const api = resource('routes');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewRoutes(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let products, ops, centers, rows;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    rows = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewRoutes(container) }));
    return;
  }

  const collapsed = new Set();
  const expanded = new Set();   // varyantları açık rota id'leri
  let search = '';

  const rowMatches = (r) => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return true;
    return [products.label(r.productCodeId), ops.label(r.operationId), centers.label(r.workCenterId)]
      .some(s => s.toLocaleLowerCase('tr').includes(q));
  };

  render();

  function render() {
    const shown = rows.filter(rowMatches);
    const groups = new Map();  // productCodeId -> [routes]
    for (const r of shown) { if (!groups.has(r.productCodeId)) groups.set(r.productCodeId, []); groups.get(r.productCodeId).push(r); }
    for (const list of groups.values()) list.sort((a, b) => a.sequence - b.sequence);

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>Rotalar</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${rows.length} rota · ${groups.size} ürün · operasyon sırası üretim planını belirler</div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" id="rt-collapse">Tümünü daralt</button>
          <button class="btn btn-primary" id="rt-add"${canWrite ? '' : ' disabled title="Salt okuma"'}>Yeni Rota</button>
        </div>
      </div>
      <div class="toolbar"><div class="search">
        <input class="input" type="search" id="rt-search" placeholder="Ürün / parça veya operasyon ara…" value="${esc(search)}">
      </div></div>
      <div id="rt-body"></div>`;

    const body = container.querySelector('#rt-body');
    if (groups.size === 0) {
      body.innerHTML = `<div class="state"><div class="state-title">${search ? 'Sonuç yok' : 'Rota yok'}</div>
        <div class="state-msg">${search ? 'Aramayla eşleşen rota yok.' : 'Henüz rota eklenmemiş.'}</div></div>`;
    } else {
      for (const [productId, list] of groups) body.appendChild(groupEl(productId, list));
    }

    const s = container.querySelector('#rt-search');
    s.addEventListener('input', () => { search = s.value; render(); const el = container.querySelector('#rt-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    container.querySelector('#rt-collapse').addEventListener('click', () => { for (const id of groups.keys()) collapsed.add(id); render(); });
    const add = container.querySelector('#rt-add');
    if (canWrite) add.addEventListener('click', () => openForm(null, null));
  }

  function groupEl(productId, list) {
    const g = document.createElement('div');
    g.className = 'rgroup' + (collapsed.has(productId) ? ' collapsed' : '');
    const p = products.byId.get(productId) || {};
    const head = document.createElement('div');
    head.className = 'rgroup-head';
    head.innerHTML = `
      <span class="chev">${collapsed.has(productId) ? '▸' : '▾'}</span>
      <span class="code">${esc(p.code || '#' + productId)}</span>
      <span class="rname">${esc(p.name || '')}</span>
      <span class="count">${list.length} operasyon</span>
      <span class="grow"></span>`;
    head.addEventListener('click', () => { if (collapsed.has(productId)) collapsed.delete(productId); else collapsed.add(productId); render(); });
    if (canWrite) {
      const addOp = document.createElement('button');
      addOp.className = 'btn btn-ghost btn-sm';
      addOp.textContent = '+ Operasyon';
      addOp.addEventListener('click', (e) => { e.stopPropagation(); openForm(null, productId); });
      head.appendChild(addOp);
    }
    g.appendChild(head);

    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `<thead><tr>
      <th class="expander"></th><th>Sıra</th><th>Operasyon</th><th>İş Merkezi</th><th>Varyantlar</th><th>Aktif</th><th></th></tr></thead>`;
    const tb = document.createElement('tbody');
    for (const r of list) {
      const isOpen = expanded.has(r.id);
      const tr = document.createElement('tr');
      const exp = document.createElement('td');
      exp.className = 'expander';
      const tog = document.createElement('button');
      tog.className = 'tree-toggle';
      tog.textContent = isOpen ? '▾' : '▸';
      tog.addEventListener('click', () => { if (isOpen) expanded.delete(r.id); else expanded.add(r.id); render(); });
      exp.appendChild(tog);
      tr.appendChild(exp);
      tr.insertAdjacentHTML('beforeend', `
        <td class="mono">${r.sequence}</td>
        <td>${esc(ops.label(r.operationId))}</td>
        <td>${esc(centers.label(r.workCenterId))}</td>
        <td>${r.variants.length ? `<span class="mono">${r.variants.length}</span> varyant` : '—'}</td>
        <td>${r.isActive ? '<span class="tag tag-success">Aktif</span>' : '<span class="tag tag-neutral">Pasif</span>'}</td>`);
      const act = document.createElement('td');
      act.className = 'actions';
      if (canWrite) {
        act.append(
          btn('Düzenle', 'btn-ghost', () => openForm(r, null)),
          btn('Sil', 'btn-danger', () => remove(r))
        );
      }
      tr.appendChild(act);
      tb.appendChild(tr);
      if (isOpen) {
        const dr = document.createElement('tr');
        dr.className = 'detail-row';
        const dc = document.createElement('td');
        dc.className = 'detail-cell';
        dc.colSpan = 7;
        dc.appendChild(childChips(r.variants, 'Varyant seçeneği tanımlı değil.'));
        dr.appendChild(dc);
        tb.appendChild(dr);
      }
    }
    table.appendChild(tb);
    g.appendChild(table);
    return g;
  }

  function openForm(row, presetProductId) {
    const editing = !!row;
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: editing ? row.productCodeId : (presetProductId ?? null), placeholder: 'Ürün seçin…' });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: 'Operasyon seçin…' });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: row?.workCenterId ?? null, placeholder: 'İş merkezi seçin…' });
    const variants = new TagList({ value: row?.variants ?? [], placeholder: 'Varyant yaz ve Enter…' });

    openDrawer({
      title: editing ? 'Rota Düzenle' : 'Yeni Rota',
      submitLabel: editing ? 'Güncelle' : 'Ekle',
      values: editing ? { ...row } : { sequence: 0, isActive: 1, productCodeId: presetProductId ?? null },
      fields: [
        { name: 'productCodeId', label: 'Ürün', type: 'fk', fk: productFk, required: true },
        { name: 'operationId', label: 'Operasyon', type: 'fk', fk: opFk, required: true },
        { name: 'workCenterId', label: 'İş Merkezi', type: 'fk', fk: centerFk, required: true },
        { name: 'sequence', label: 'Sıra', type: 'number', required: true },
        { name: 'variantLabel', label: 'Varyant Etiketi', type: 'text' },
        { name: 'variants', label: 'Varyant Seçenekleri', type: 'tags', tags: variants, help: 'Serbest metin; yaz ve Enter ile ekle.' },
        { name: 'isActive', label: 'Aktif', type: 'bool' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async () => { toast(editing ? 'Rota güncellendi' : 'Rota eklendi', 'success'); await reload(); },
      onClose: () => {}
    });
  }

  async function reload() { rows = (await api.listAll()).data; render(); }

  async function remove(row) {
    const ok = await confirmDialog({
      title: 'Rota silinsin mi?',
      body: `${products.label(row.productCodeId)} · ${ops.label(row.operationId)} rotası silinecek.`,
      confirmLabel: 'Sil', danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast('Rota silindi', 'success'); await reload(); }
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
