// Genel Bakış panosu — v2 modülü (SALT OKUNUR). Ortak core/ katmanı üzerine.
// Tasarım: Genel-Bakis.dc.html. Tek GET /dashboard çağrısı üç bölüm döner:
//   cards (3 özet kart) · workCenterLoad (doluluk çubukları) · recentQuality (son ölçümler)
//
// "Min. stok altı" kartı YOK — eldeki stok verisi hesaplanamıyor (backend bu alanı
// döndürmez). Tasarımdaki "Satınalma özeti alınamadı" hata kartı da yok (illüstrasyondu).

import { request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';

const nf = new Intl.NumberFormat('tr-TR');
const fmt = (n) => nf.format(n ?? 0);

export async function viewDashboard(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let data;
  try { ({ data } = await request('/dashboard')); }
  catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewDashboard(container) }));
    return;
  }

  const c = data.cards;
  const tp = c.todayProduction;

  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>Genel Bakış</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">Açık işler, bugünün üretimi ve son kalite ölçümleri</div>
      </div>
    </div>

    <div class="kpis">
      ${kpi('Açık iş emri', fmt(c.openWorkOrders.value), c.openWorkOrders.detail)}
      ${kpi('Bugünkü üretim', fmt(tp.value), `hedef ${fmt(tp.target)} adet`)}
      ${kpi('Tolerans dışı ölçüm', fmt(c.outOfTolerance.value), c.outOfTolerance.detail, c.outOfTolerance.value > 0)}
    </div>

    <div class="panels">
      <div class="panel panel-wide">
        <div class="panel-hd"><h3>İş Merkezi Doluluğu</h3><span class="sub">bu hafta · planlanan / kapasite</span></div>
        ${loadSection(data.workCenterLoad)}
      </div>
      <div class="panel panel-side">
        <div class="panel-hd"><h3>Son Kalite Kayıtları</h3></div>
        ${qualitySection(data.recentQuality)}
      </div>
    </div>`;
}

function kpi(title, value, detail, danger) {
  return `
    <div class="kpi">
      <div class="kpi-title">${esc(title)}</div>
      <div class="kpi-value${danger ? ' danger' : ''}">${esc(String(value))}</div>
      <div class="kpi-detail">${esc(detail || '')}</div>
    </div>`;
}

function loadSection(rows) {
  if (!rows || rows.length === 0) return '<div class="panel-empty">Bu hafta plan yok.</div>';
  const body = rows.map(w => {
    const pct = w.ratio != null ? Math.round(w.ratio * 100) : null;
    const kind = w.ratio == null ? '' : (w.ratio > 1 ? 'over' : (w.ratio > 0.85 ? 'warn' : ''));
    const width = w.ratio != null ? Math.min(100, Math.round(w.ratio * 100)) : 0;
    return `
      <div class="load-row">
        <span class="load-name">${esc(w.name)}</span>
        <span class="load-bar"><i class="${kind}" style="width:${width}%"></i></span>
        <span class="load-val ${kind}">${pct != null ? '%' + pct : '—'}</span>
      </div>`;
  }).join('');
  return `<div class="panel-bd">${body}</div>`;
}

function qualitySection(rows) {
  if (!rows || rows.length === 0) return '<div class="panel-empty">Henüz ölçüm yok.</div>';
  return rows.map(q => {
    // result varsa onu göster; yoksa (saatlik ölçümlerde result NULL) ölçülen değeri göster.
    const hasResult = q.result != null && q.result !== '';
    const text = hasResult ? q.result : (q.value != null ? fmt(q.value) : '—');
    const bad = hasResult && /değil|dışı|red|ret|uygunsuz/i.test(q.result);
    const dot = !hasResult ? '' : (bad ? 'bad' : 'ok');
    return `
      <div class="q-row">
        <span class="q-code">${esc(q.code)}</span>
        <span class="q-measure">${esc(q.measure)}</span>
        <span class="q-result"><i class="q-dot ${dot}"></i>${esc(text)}</span>
      </div>`;
  }).join('');
}
