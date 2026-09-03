// report.js — Üretim Raporu ve Verimlilik ekranlarının paylaştığı parçalar:
// dönem şeridi (günlük/haftalık/aylık + gezinme), renk eşiği, KPI kartı.
// Tarih hesabı yerel yapılır (toISOString YOK). Metinler t() ile; ur.* şerit
// anahtarları (daily/weekly/monthly/prev/next/today) iki ekran arasında ortaktır.

import { t, getLang } from './i18n.js';
import { esc } from './states.js';
import { fmtDateTR } from './format.js';

export const DAY_NAMES = () => getLang() === 'en'
  ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  : ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const MONTHS = () => getLang() === 'en'
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// --- yerel tarih yardımcıları (toISOString YOK; hafta başı Pazartesi) ---
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
export function mondayOf(d) { const x = startOfDay(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Renk eşiği: ≥eşik success · ≥eşik−20 warning · altı danger. null → '' (nötr).
export function thresholdClass(pct, threshold) {
  if (pct == null) return '';
  return pct >= threshold ? 'success' : pct >= threshold - 20 ? 'warning' : 'danger';
}

// KPI kartı — etiket + değer(+renk sınıfı) + alt satır. value/detail esc'lenir.
export function kpiCard({ title, value, cls = '', detail = '', style = '' }) {
  return `<div class="kpi"><div class="kpi-title">${esc(title)}</div>
    <div class="kpi-value ${cls}"${style ? ` style="${style}"` : ''}>${esc(value)}</div>
    <div class="kpi-detail">${esc(detail)}</div></div>`;
}

// Dönem şeridi — mod (günlük/haftalık/aylık) + çapa durumunu kapsar. Örneği MODÜL
// düzeyinde bir kez oluşturun; ekrana dönünce seçili dönem korunur.
export function createPeriodStrip(initialMod = 'gunluk') {
  let MOD = initialMod;   // 'gunluk' | 'haftalik' | 'aylik'
  let ANCHOR = null;      // ISO tarih; null → bugün

  function dates() {
    const anchor = ANCHOR ? parseISO(ANCHOR) : startOfDay(new Date());
    if (MOD === 'gunluk') return [fmtISO(anchor)];
    if (MOD === 'haftalik') { const b = mondayOf(anchor); return Array.from({ length: 7 }, (_, i) => fmtISO(addDays(b, i))); }
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => fmtISO(new Date(y, m, i + 1)));
  }
  function shift(dir) {
    const anchor = ANCHOR ? parseISO(ANCHOR) : startOfDay(new Date());
    if (MOD === 'gunluk') anchor.setDate(anchor.getDate() + dir);
    else if (MOD === 'haftalik') anchor.setDate(anchor.getDate() + dir * 7);
    else anchor.setMonth(anchor.getMonth() + dir);
    ANCHOR = fmtISO(anchor);
  }
  function title(ds) {
    if (MOD === 'gunluk') { const d = parseISO(ds[0]); return `${fmtDateTR(ds[0])} · ${DAY_NAMES()[d.getDay()]}`; }
    if (MOD === 'haftalik') return `${fmtDateTR(ds[0])} — ${fmtDateTR(ds[ds.length - 1])}`;
    const d = parseISO(ds[0]); return `${MONTHS()[d.getMonth()]} ${d.getFullYear()}`;
  }
  function barHTML(ds) {
    return `
      <div class="ur-bar">
        <div class="ur-modes">
          <button type="button" class="ur-mode${MOD === 'gunluk' ? ' on' : ''}" data-mod="gunluk">${esc(t('ur.daily'))}</button>
          <button type="button" class="ur-mode${MOD === 'haftalik' ? ' on' : ''}" data-mod="haftalik">${esc(t('ur.weekly'))}</button>
          <button type="button" class="ur-mode${MOD === 'aylik' ? ' on' : ''}" data-mod="aylik">${esc(t('ur.monthly'))}</button>
        </div>
        <div class="ur-nav">
          <button class="btn btn-ghost btn-sm" data-nav="prev">← ${esc(t('ur.prev'))}</button>
          <span class="ur-period">${esc(title(ds))}</span>
          <button class="btn btn-ghost btn-sm" data-nav="next">${esc(t('ur.next'))} →</button>
          <button class="btn btn-ghost btn-sm" data-nav="today">${esc(t('ur.today'))}</button>
        </div>
      </div>`;
  }
  // container.innerHTML barHTML(...) içerdikten sonra çağır; her yeniden çizimde tazele.
  function bind(container, onChange) {
    container.querySelectorAll('.ur-mode').forEach(b =>
      b.addEventListener('click', () => { MOD = b.dataset.mod; onChange(); }));
    container.querySelector('[data-nav="prev"]')?.addEventListener('click', () => { shift(-1); onChange(); });
    container.querySelector('[data-nav="next"]')?.addEventListener('click', () => { shift(1); onChange(); });
    container.querySelector('[data-nav="today"]')?.addEventListener('click', () => { ANCHOR = null; onChange(); });
  }

  return { get mod() { return MOD; }, dates, title, barHTML, bind };
}
