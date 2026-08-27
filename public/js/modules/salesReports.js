// Satış Raporları — v2 modülü (SALT OKUNUR). Ortak core/ katmanı üzerine.
// Tasarım: Satis-Raporlari.dc.html. GET /sales-reports?from=&to=&customer=
//
// ÖNEMLİ: veride sevkiyat/teslimat kaydı YOK — bu rapor ÜRETİLEN miktarı gösterir,
// sevk edileni değil. Etiketler buna göre ("üretim", "üretilen"), "sevkiyat" değil.
// i18n: dil değişince filtreler + son sonuç KORUNUR, veri YENİDEN ÇEKİLMEZ (bindLang).
// Sayı biçimi (tr-TR) korunur; yalnızca metinler + ay kısaltmaları çevrilir.

import { request } from '../core/api.js';
import { esc } from '../core/states.js';
import { t, getLang, bindLang } from '../core/i18n.js';

const nf = new Intl.NumberFormat('tr-TR');
const fmt = (n) => nf.format(Math.round(n ?? 0));
const MONTHS = () => getLang() === 'en'
  ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  : ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export async function viewSalesReports(container) {
  // Filtreler + en son sonuç closure'da tutulur (dil değişiminde korunur, refetch yok).
  const state = { from: '', to: '', customer: '', last: null };

  render();
  bindLang(container, render);

  function render() {
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.sales'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('sr.subtitle'))}</div>
        </div>
      </div>
      <form class="rep-filter" id="rep-filter">
        <div class="field"><label>${esc(t('sr.from'))}</label><input class="input" type="date" name="from" value="${esc(state.from)}"></div>
        <div class="field"><label>${esc(t('sr.to'))}</label><input class="input" type="date" name="to" value="${esc(state.to)}"></div>
        <div class="field"><label>${esc(t('field.customer'))}</label><input class="input" type="text" name="customer" value="${esc(state.customer)}" placeholder="${esc(t('sr.allCustomers'))}"></div>
        <button type="submit" class="btn btn-primary">${esc(t('action.filter'))}</button>
      </form>
      <div class="rep-note">${esc(t('sr.note'))}</div>
      <div id="rep-out"><div class="loading">${t('common.loading')}</div></div>`;

    const form = container.querySelector('#rep-filter');
    const out = container.querySelector('#rep-out');
    const els = form.elements;

    function sync() { state.from = els.from.value; state.to = els.to.value; state.customer = els.customer.value.trim(); }
    function clearDates() { state.from = ''; state.to = ''; els.from.value = ''; els.to.value = ''; load(); }
    function clearCustomer() { state.customer = ''; els.customer.value = ''; load(); }

    async function load() {
      sync();
      out.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
      const params = new URLSearchParams();
      if (state.from) params.set('from', state.from);
      if (state.to) params.set('to', state.to);
      if (state.customer) params.set('customer', state.customer);
      const qs = params.toString();
      try {
        const { data, meta } = await request('/sales-reports' + (qs ? '?' + qs : ''));
        // Etkin aralığı (backend varsayılanı dahil) filtre kutularına yansıt.
        if (!state.from && meta.from) { state.from = meta.from; els.from.value = meta.from; }
        if (!state.to && meta.to) { state.to = meta.to; els.to.value = meta.to; }
        state.last = { data, meta };
        renderInto(out, data, meta, { load, clearDates, clearCustomer });
      } catch (err) {
        state.last = null;
        out.innerHTML = `<div class="state error"><div class="state-title">${esc(t('sr.loadError'))}</div><div class="state-msg">${esc(err.message)}</div></div>`;
      }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); load(); });

    // Dil değişiminde: veriyi tekrar çekme — son sonucu yeni dilde yeniden çiz.
    if (state.last) renderInto(out, state.last.data, state.last.meta, { load, clearDates, clearCustomer });
    else load();
  }
}

function renderInto(out, data, meta, actions) {
  const empty = !data.monthly.length && !data.byProduct.length && !data.byCustomer.length;
  if (empty) { out.innerHTML = ''; out.appendChild(emptyCard(meta, actions)); return; }

  out.innerHTML = `
    <div class="panels" style="margin-bottom:20px;">
      <div class="panel panel-wide">
        <div class="panel-hd"><h3>${esc(t('sr.monthly'))}</h3><span class="sub">${esc(meta.from)} → ${esc(meta.to)}${meta.customer ? ' · ' + esc(meta.customer) : ''}</span></div>
        <div class="panel-bd">${monthlyBars(data.monthly)}</div>
      </div>
    </div>
    <div class="panels">
      <div class="panel panel-wide">
        <div class="panel-hd"><h3>${esc(t('sr.byProduct'))}</h3></div>
        ${breakdown(data.byProduct.map(p => ({ name: p.code, sub: p.name, value: p.quantity })))}
      </div>
      <div class="panel panel-side">
        <div class="panel-hd"><h3>${esc(t('sr.byCustomer'))}</h3></div>
        ${breakdown(data.byCustomer.map(x => ({ name: x.customer, value: x.quantity })))}
      </div>
    </div>`;
}

function monthlyBars(rows) {
  if (!rows.length) return `<div class="panel-empty">${esc(t('sr.noProduction'))}</div>`;
  const max = Math.max(...rows.map(r => r.quantity), 1);
  return `<div class="bars">${rows.map(r => {
    const h = Math.max(3, Math.round((r.quantity / max) * 100));
    return `<div class="bar-col">
      <span class="bar-val">${fmt(r.quantity)}</span>
      <div class="bar-fill" style="height:${h}%"></div>
      <span class="bar-label">${esc(monthLabel(r.month))}</span>
    </div>`;
  }).join('')}</div>`;
}

function breakdown(items) {
  if (!items.length) return `<div class="panel-empty">${esc(t('cd.noRecords'))}</div>`;
  const max = Math.max(...items.map(i => i.value), 1);
  const body = items.map(i => {
    const w = Math.max(2, Math.round((i.value / max) * 100));
    return `
      <div class="brk-row">
        <span class="brk-name">${esc(i.name || '—')}${i.sub ? ` <small>${esc(i.sub)}</small>` : ''}</span>
        <span class="brk-bar"><i style="width:${w}%"></i></span>
        <span class="brk-val">${fmt(i.value)}</span>
      </div>`;
  }).join('');
  return `<div class="panel-bd">${body}</div>`;
}

function emptyCard(meta, actions) {
  const box = document.createElement('div');
  box.className = 'rep-empty';
  const body = meta.customer
    ? t('sr.emptyBodyCust', { from: esc(meta.from), to: esc(meta.to), customer: esc(meta.customer) })
    : t('sr.emptyBody', { from: esc(meta.from), to: esc(meta.to) });
  box.innerHTML = `
    <div class="icon"></div>
    <h3>${esc(t('sr.emptyTitle'))}</h3>
    <p>${body}</p>
    <div class="acts"></div>`;
  const acts = box.querySelector('.acts');
  acts.appendChild(btn(t('sr.last6'), actions.clearDates));
  if (meta.customer) acts.appendChild(btn(t('sr.clearCustomer'), actions.clearCustomer));
  return box;
}

function btn(label, on) {
  const b = document.createElement('button');
  b.className = 'btn btn-secondary';
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', on);
  return b;
}

// "2026-07" -> "Tem 26" / "Jul 26"
function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m) return ym || '—';
  return `${MONTHS()[(+m[2]) - 1] || m[2]} ${m[1].slice(2)}`;
}
