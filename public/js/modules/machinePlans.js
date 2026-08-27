// Üretim Planı (Haftalık) — v2 modülü. Tasarım: Uretim-Plani.dc.html.
// Gün × iş merkezi ızgarası; hücre = o gün/iş merkezi için planlanan toplam miktar.
// Hücreye tıklayınca o hücrenin planları (ekle/düzenle/sil). Haftalar arası gezinme.
// i18n: özel görünüm — bindLang ile dil değişince VERİ ÇEKMEDEN yeniden çizilir
// (seçili hafta closure'da korunur). Gün kısaltmaları dile göre.

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, getLang, bindLang } from '../core/i18n.js';

const api = resource('machine-plans');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const DAYS = () => getLang() === 'en'
  ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  : ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export async function viewMachinePlans(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, centers, workOrders, plans;
  try {
    products = await loadLookup('product-codes', mapProduct);
    centers = await loadLookup('work-centers', mapNamed);
    workOrders = await loadLookup('work-orders', (w) => ({ id: w.id, code: w.woNo, name: products.label(w.productCodeId) }));
    plans = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewMachinePlans(container) }));
    return;
  }

  let weekStart = mondayOf(new Date());

  render();
  bindLang(container, render);   // dil değişince yeniden çiz (veri + hafta closure'da)

  function weekDates() { return Array.from({ length: 7 }, (_, i) => fmtISO(addDays(weekStart, i))); }
  function plansIn(wcId, date) { return plans.filter(p => p.workCenterId === wcId && p.date === date); }

  function render() {
    const dates = weekDates();
    const days = DAYS();
    const label = `${fmtTR(weekStart)} – ${fmtTR(addDays(weekStart, 6))}`;
    // Bu haftada plan olan iş merkezleri; yoksa hepsi.
    const inWeek = new Set(plans.filter(p => dates.includes(p.date)).map(p => p.workCenterId));
    const wcRows = centers.rows.filter(c => inWeek.has(c.id));
    const showRows = wcRows.length ? wcRows : centers.rows;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.machine-plans'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('mp.subtitle'))}</div>
        </div>
        <div class="week-nav">
          <button class="btn btn-secondary btn-sm" id="mp-prev">‹</button>
          <span class="mono">${esc(label)}</span>
          <button class="btn btn-secondary btn-sm" id="mp-next">›</button>
          <button class="btn btn-primary" id="mp-add"${canWrite ? '' : ' disabled'}>${esc(t('mp.new'))}</button>
        </div>
      </div>
      <div class="wgrid">
        <table>
          <thead><tr><th style="text-align:left">${esc(t('field.workCenter'))}</th>${
            dates.map((d, i) => `<th>${days[i]}<span class="date">${d.slice(8)}.${d.slice(5, 7)}</span></th>`).join('')
          }</tr></thead>
          <tbody id="mp-body"></tbody>
        </table>
      </div>`;

    const body = container.querySelector('#mp-body');
    for (const wc of showRows) {
      const tr = document.createElement('tr');
      tr.appendChild(cellTd('wc', `${esc(wc.name)}`));
      for (const d of dates) {
        const list = plansIn(wc.id, d);
        const sum = list.reduce((a, p) => a + (Number(p.targetQuantity) || 0), 0);
        const td = cellTd('cell' + (list.length ? ' has' : ''), list.length ? String(sum) : '—');
        td.addEventListener('click', () => cellDetail(wc, d, plansIn(wc.id, d)));
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }

    container.querySelector('#mp-prev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); render(); });
    container.querySelector('#mp-next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); render(); });
    const add = container.querySelector('#mp-add');
    if (canWrite) add.addEventListener('click', () => openForm(null, null, null));
  }

  // Hücre detayı: o gün/iş merkezinin planları
  function cellDetail(wc, date, list) {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const dlg = document.createElement('div');
    dlg.className = 'dialog';
    dlg.style.width = 'min(560px, 100%)';
    dlg.innerHTML = `<div class="dialog-title">${esc(wc.name)} · ${esc(date)}</div>`;
    const bodyEl = document.createElement('div');
    if (list.length === 0) bodyEl.innerHTML = `<div class="text-muted" style="padding:6px 0">${esc(t('mp.cellEmpty'))}</div>`;
    else {
      const table = document.createElement('table'); table.className = 'table';
      table.innerHTML = `<thead><tr><th>${esc(t('field.productShort'))}</th><th>${esc(t('field.workOrderNo'))}</th><th>${esc(t('mp.target'))}</th><th></th></tr></thead>`;
      const tb = document.createElement('tbody');
      for (const p of list) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(products.label(p.productCodeId))}</td>
          <td>${p.workOrderId ? esc(workOrders.label(p.workOrderId)) : '—'}</td>
          <td class="mono">${p.targetQuantity ?? '—'}</td>`;
        const act = document.createElement('td'); act.className = 'actions';
        if (canWrite) {
          act.append(
            mini(t('action.edit'), 'btn-ghost', () => { close(); openForm(p, null, null); }),
            mini(t('action.delete'), 'btn-danger', async () => { if (await del(p)) { close(); render(); } })
          );
        }
        tr.appendChild(act); tb.appendChild(tr);
      }
      table.appendChild(tb); bodyEl.appendChild(table);
    }
    dlg.appendChild(bodyEl);
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    if (canWrite) actions.appendChild(mini(t('mp.addPlan'), 'btn-secondary', () => { close(); openForm(null, wc.id, date); }));
    actions.appendChild(mini(t('action.close'), 'btn-primary', close));
    dlg.appendChild(actions);
    backdrop.appendChild(dlg); document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    function close() { backdrop.remove(); }
  }

  function openForm(row, presetWc, presetDate) {
    const editing = !!row;
    const wcFk = new FkSelect({ source: centers.source, rows: centers.rows, value: editing ? row.workCenterId : (presetWc ?? null), placeholder: t('wo.selectCenter') });
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: row?.productCodeId ?? null, placeholder: t('ord.selectProduct') });
    const woFk = new FkSelect({ source: workOrders.source, rows: workOrders.rows, value: row?.workOrderId ?? null, placeholder: t('mp.selectWo') });
    openDrawer({
      title: () => t(editing ? 'mp.editTitle' : 'mp.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { date: presetDate ?? '', workCenterId: presetWc ?? null },
      fields: [
        { name: 'date', label: () => t('field.date'), type: 'date', required: true },
        { name: 'workCenterId', label: () => t('field.workCenter'), type: 'fk', fk: wcFk, required: true },
        { name: 'productCodeId', label: () => t('field.productShort'), type: 'fk', fk: productFk, required: true },
        { name: 'workOrderId', label: () => t('field.workOrderNo'), type: 'fk', fk: woFk },
        { name: 'targetQuantity', label: () => t('field.targetQuantity'), type: 'number', step: 'any' },
        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async () => { toast(t(editing ? 'mp.updated' : 'mp.added'), 'success'); await reload(); },
      onClose: () => {}
    });
  }

  async function reload() { plans = (await api.listAll()).data; render(); }

  async function del(p) {
    const ok = await confirmDialog({ title: t('mp.deleteTitle'), body: t('mp.deleteBody', { name: products.label(p.productCodeId) }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return false;
    try { await api.remove(p.id); plans = plans.filter(x => x.id !== p.id); toast(t('mp.deleted'), 'success'); return true; }
    catch (err) { toast(err.message, 'danger'); return false; }
  }
}

// --- yardımcılar ---
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtTR(d) { return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
function cellTd(cls, html) { const td = document.createElement('td'); td.className = cls; td.innerHTML = html; return td; }
function mini(label, kind, on) { const b = document.createElement('button'); b.className = `btn ${kind} btn-sm`; b.textContent = label; b.addEventListener('click', on); return b; }
