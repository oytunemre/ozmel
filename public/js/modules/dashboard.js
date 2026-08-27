// Genel Bakış panosu — v2 modülü (SALT OKUNUR). Ortak core/ katmanı üzerine.
// Tasarım: Genel-Bakis.dc.html. Tek GET /dashboard çağrısı üç bölüm döner:
//   cards (3 özet kart) · workCenterLoad (doluluk çubukları) · recentQuality (son ölçümler)
// i18n: dil değişince VERİ ÇEKMEDEN yeniden çizilir (bindLang; veri closure'da).
// Kart alt metinleri BE'den ÇEVİRİ KODU olarak gelir ({code, params}); FE t() ile
// dile göre gösterir (bugünkü üretim detayı FE'de kurulur).

import { request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { t, bindLang } from '../core/i18n.js';

const nf = new Intl.NumberFormat('tr-TR');
const fmt = (n) => nf.format(n ?? 0);
// BE'den gelen {code, params} alt metnini çevir (geriye dönük: düz metinse aynen).
const detailText = (d) => !d ? '' : (typeof d === 'string' ? d : (d.code ? t(d.code, d.params || {}) : ''));

export async function viewDashboard(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let data;
  try { ({ data } = await request('/dashboard')); }
  catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewDashboard(container) }));
    return;
  }

  render();
  bindLang(container, render);

  function render() {
    const c = data.cards;
    const tp = c.todayProduction;
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.dashboard'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('db.subtitle'))}</div>
        </div>
      </div>

      <div class="kpis">
        ${kpi(t('db.openWo'), fmt(c.openWorkOrders.value), detailText(c.openWorkOrders.detail))}
        ${kpi(t('db.todayProd'), fmt(tp.value), t('db.targetDetail', { n: fmt(tp.target) }))}
        ${kpi(t('db.outOfTol'), fmt(c.outOfTolerance.value), detailText(c.outOfTolerance.detail), c.outOfTolerance.value > 0)}
      </div>

      <div class="panels">
        <div class="panel panel-wide">
          <div class="panel-hd"><h3>${esc(t('db.wcLoad'))}</h3><span class="sub">${esc(t('db.wcLoadSub'))}</span></div>
          ${loadSection(data.workCenterLoad)}
        </div>
        <div class="panel panel-side">
          <div class="panel-hd"><h3>${esc(t('db.recentQuality'))}</h3></div>
          ${qualitySection(data.recentQuality)}
        </div>
      </div>`;
  }
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
  if (!rows || rows.length === 0) return `<div class="panel-empty">${esc(t('db.noPlan'))}</div>`;
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
  if (!rows || rows.length === 0) return `<div class="panel-empty">${esc(t('db.noQuality'))}</div>`;
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
