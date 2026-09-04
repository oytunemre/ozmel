// Tedarikçi & Site Yönetimi — v2 modülü (yeni). Tasarım: Tedarikci-Site-v2.dc.html.
// Basit CRUD; kolon başlığına tıklayınca sıralanan tablo + arama + drawer form.
// Sıralama localeCompare(…, "tr", { numeric: true }). Form için ortak core/drawer.js.
// Not: tasarımdaki "VİNFAST SQE/SQM" müşteriye özel — sözlükte SQE/SQM olarak bırakıldı.
// SONRASI: Genel Bakış'a "Tedarikçi Dağılımı — Ülke" bu modül oturunca eklenebilir (ayrı iş).
//
// Arama girişi odağı korunsun diye kabuk bir kez çizilir; tablo + sayaç paint() ile tazelenir.

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { t, bindLang } from '../core/i18n.js';

const api = resource('sites');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// [alan, i18n etiket anahtarı, genişlik] — sıralama alan adına göre.
const COLUMNS = [
  ['supplier', 'site.colSupplier', 'auto'],
  ['trigoRE', 'site.colTrigoRE', '150px'],
  ['sqe', 'site.colSqe', '220px'],
  ['sqm', 'site.colSqm', '220px'],
  ['country', 'site.colCountry', '120px'],
  ['city', 'site.colCity', '130px'],
  ['siteCode', 'site.colCode', '150px'],
];
const SEARCH_FIELDS = ['supplier', 'trigoRE', 'sqe', 'sqm', 'country', 'city', 'siteCode'];

export async function viewTedarikciSite(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let rows;
  try {
    rows = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewTedarikciSite(container) }));
    return;
  }

  let search = '';
  let sortKey = 'supplier';
  let sortDir = 1;

  render();
  bindLang(container, render);

  function visibleRows() {
    const q = search.trim().toLocaleLowerCase('tr');
    const filtered = q
      ? rows.filter(s => SEARCH_FIELDS.some(k => (s[k] || '').toLocaleLowerCase('tr').includes(q)))
      : rows.slice();
    return filtered.sort((a, b) => sortDir * (a[sortKey] || '').localeCompare(b[sortKey] || '', 'tr', { numeric: true }));
  }

  function render() {
    const countries = new Set(rows.map(s => s.country).filter(Boolean)).size;
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.sites'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('site.subtitle', { sites: rows.length, countries }))}</div>
        </div>
        <button class="btn btn-primary" id="site-add"${canWrite ? '' : ` disabled title="${esc(t('common.readonlyHint'))}"`}>${esc(t('site.new'))}</button>
      </div>
      <div class="toolbar" style="align-items:center; gap:12px;">
        <div class="search"><input class="input" type="search" id="site-search" placeholder="${esc(t('site.searchPlaceholder'))}" value="${esc(search)}"></div>
        <span class="mono text-muted" id="site-count" style="font-size:12px;"></span>
      </div>
      <div id="site-table"></div>`;

    const input = container.querySelector('#site-search');
    input.addEventListener('input', () => { search = input.value; paint(); });
    container.querySelector('#site-add').addEventListener('click', () => { if (canWrite) openForm(null); });
    paint();
  }

  function paint() {
    const list = visibleRows();
    container.querySelector('#site-count').textContent = t('site.counter', { shown: list.length, total: rows.length });

    const arrow = (key) => sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    const head = COLUMNS.map(([key, lbl, w]) =>
      `<th class="site-th${sortKey === key ? ' on' : ''}" data-key="${key}" style="width:${w};">${esc(t(lbl))}${arrow(key)}</th>`).join('')
      + '<th class="site-th-actions"></th>';

    const body = list.length
      ? list.map(s => rowHTML(s)).join('')
      : `<tr><td colspan="${COLUMNS.length + 1}" class="site-empty">${esc(rows.length ? t('site.noResults') : t('site.empty'))}</td></tr>`;

    container.querySelector('#site-table').innerHTML = `
      <div class="site-tablewrap">
        <table class="site-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;

    container.querySelectorAll('.site-th').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
      paint();
    }));
    if (canWrite) {
      container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const row = rows.find(r => r.id === Number(b.dataset.edit)); if (row) openForm(row);
      }));
      container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        const row = rows.find(r => r.id === Number(b.dataset.del)); if (row) remove(row);
      }));
    }
  }

  function mailto(email) {
    return email ? `<a class="xlink" href="mailto:${esc(email)}">${esc(email)}</a>` : '';
  }

  function rowHTML(s) {
    const acts = canWrite
      ? `<div class="site-acts">
          <button class="btn btn-ghost btn-sm" data-edit="${s.id}">${esc(t('action.edit'))}</button>
          <button class="btn btn-danger btn-sm" data-del="${s.id}">${esc(t('action.delete'))}</button>
        </div>`
      : '';
    return `
      <tr>
        <td class="site-c-supplier">${esc(s.supplier || '')}</td>
        <td class="text-muted">${esc(s.trigoRE || '')}</td>
        <td><div>${esc(s.sqe || '')}</div><div class="site-mail">${mailto(s.sqeEmail)}</div></td>
        <td><div>${esc(s.sqm || '')}</div><div class="site-mail">${mailto(s.sqmEmail)}</div></td>
        <td>${esc(s.country || '')}</td>
        <td class="text-muted">${esc(s.city || '')}</td>
        <td class="mono">${esc(s.siteCode || '')}</td>
        <td class="site-c-actions">${acts}</td>
      </tr>`;
  }

  function openForm(row) {
    const editing = !!row;
    openDrawer({
      title: () => t(editing ? 'site.editTitle' : 'site.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'supplier', label: () => t('site.supplier'), type: 'text', required: true },
        { name: 'trigoRE', label: () => t('site.trigoRE'), type: 'text' },
        { name: 'sqe', label: () => t('site.sqe'), type: 'text' },
        { name: 'sqeEmail', label: () => t('site.sqeEmail'), type: 'email' },
        { name: 'sqm', label: () => t('site.sqm'), type: 'text' },
        { name: 'sqmEmail', label: () => t('site.sqmEmail'), type: 'email' },
        { name: 'country', label: () => t('site.country'), type: 'text' },
        { name: 'city', label: () => t('site.city'), type: 'text' },
        { name: 'siteCode', label: () => t('site.siteCode'), type: 'text' },
      ],
      onSubmit: async (v) => {
        const payload = {
          supplier: v.supplier, trigoRE: v.trigoRE, sqe: v.sqe, sqeEmail: v.sqeEmail,
          sqm: v.sqm, sqmEmail: v.sqmEmail, country: v.country, city: v.city, siteCode: v.siteCode,
        };
        const { data } = editing
          ? await api.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await api.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(t('toast.saved'), 'success');
        rows = (await api.listAll()).data;
        paint();
      },
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('site.deleteTitle'),
      body: t('site.deleteBody', { name: row.supplier }),
      confirmLabel: t('action.delete'), danger: true,
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      toast(t('toast.deleted'), 'success');
      rows = (await api.listAll()).data;
      paint();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
