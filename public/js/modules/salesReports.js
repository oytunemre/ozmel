// Satış Raporları — v2 modülü (SALT OKUNUR). Ortak core/ katmanı üzerine.
// Tasarım: Satis-Raporlari.dc.html. GET /sales-reports?from=&to=&customer=
//
// ÖNEMLİ: veride sevkiyat/teslimat kaydı YOK — bu rapor ÜRETİLEN miktarı gösterir,
// sevk edileni değil. Etiketler buna göre ("üretim", "üretilen"), "sevkiyat" değil.

import { request } from '../core/api.js';
import { esc } from '../core/states.js';

const nf = new Intl.NumberFormat('tr-TR');
const fmt = (n) => nf.format(Math.round(n ?? 0));
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export async function viewSalesReports(container) {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>Satış Raporları</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">Ürün ve müşteri kırılımında üretilen miktar</div>
      </div>
    </div>
    <form class="rep-filter" id="rep-filter">
      <div class="field"><label>Başlangıç</label><input class="input" type="date" name="from"></div>
      <div class="field"><label>Bitiş</label><input class="input" type="date" name="to"></div>
      <div class="field"><label>Müşteri</label><input class="input" type="text" name="customer" placeholder="Tüm müşteriler"></div>
      <button type="submit" class="btn btn-primary">Filtrele</button>
    </form>
    <div class="rep-note">Üretilen miktarı gösterir (sevk edilen değil). Tarih boş bırakılırsa son 6 ay alınır.</div>
    <div id="rep-out"><div class="loading">Yükleniyor…</div></div>`;

  const form = container.querySelector('#rep-filter');
  const out = container.querySelector('#rep-out');
  const els = form.elements;

  async function load() {
    out.innerHTML = '<div class="loading">Yükleniyor…</div>';
    const params = new URLSearchParams();
    if (els.from.value) params.set('from', els.from.value);
    if (els.to.value) params.set('to', els.to.value);
    const cust = els.customer.value.trim();
    if (cust) params.set('customer', cust);
    const qs = params.toString();
    try {
      const { data, meta } = await request('/sales-reports' + (qs ? '?' + qs : ''));
      // Etkin aralığı (backend varsayılanı dahil) filtre kutularına yansıt.
      if (!els.from.value && meta.from) els.from.value = meta.from;
      if (!els.to.value && meta.to) els.to.value = meta.to;
      renderInto(out, data, meta, { load, clearDates, clearCustomer });
    } catch (err) {
      out.innerHTML = `<div class="state error"><div class="state-title">Rapor alınamadı</div><div class="state-msg">${esc(err.message)}</div></div>`;
    }
  }

  function clearDates() { els.from.value = ''; els.to.value = ''; load(); }
  function clearCustomer() { els.customer.value = ''; load(); }

  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
}

function renderInto(out, data, meta, actions) {
  const empty = !data.monthly.length && !data.byProduct.length && !data.byCustomer.length;
  if (empty) { out.innerHTML = ''; out.appendChild(emptyCard(meta, actions)); return; }

  out.innerHTML = `
    <div class="panels" style="margin-bottom:20px;">
      <div class="panel panel-wide">
        <div class="panel-hd"><h3>Aylık Üretim</h3><span class="sub">${esc(meta.from)} → ${esc(meta.to)}${meta.customer ? ' · ' + esc(meta.customer) : ''}</span></div>
        <div class="panel-bd">${monthlyBars(data.monthly)}</div>
      </div>
    </div>
    <div class="panels">
      <div class="panel panel-wide">
        <div class="panel-hd"><h3>Ürüne Göre</h3></div>
        ${breakdown(data.byProduct.map(p => ({ name: p.code, sub: p.name, value: p.quantity })))}
      </div>
      <div class="panel panel-side">
        <div class="panel-hd"><h3>Müşteriye Göre</h3></div>
        ${breakdown(data.byCustomer.map(x => ({ name: x.customer, value: x.quantity })))}
      </div>
    </div>`;
}

function monthlyBars(rows) {
  if (!rows.length) return '<div class="panel-empty">Bu aralıkta üretim yok.</div>';
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
  if (!items.length) return '<div class="panel-empty">Kayıt yok.</div>';
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
  box.innerHTML = `
    <div class="icon"></div>
    <h3>Seçilen aralıkta kayıt yok</h3>
    <p>${esc(meta.from)} – ${esc(meta.to)} arasında${meta.customer ? ` <b>${esc(meta.customer)}</b> için` : ''} üretim kaydı bulunamadı. Aralığı genişletin ya da müşteri filtresini kaldırın.</p>
    <div class="acts"></div>`;
  const acts = box.querySelector('.acts');
  acts.appendChild(btn('Son 6 aya bak', actions.clearDates));
  if (meta.customer) acts.appendChild(btn('Müşteri filtresini kaldır', actions.clearCustomer));
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

// "2026-07" -> "Tem 26"
function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m) return ym || '—';
  return `${AYLAR[(+m[2]) - 1] || m[2]} ${m[1].slice(2)}`;
}
