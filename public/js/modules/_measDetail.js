// _measDetail.js — genişleyen satır ölçüm detayı (First-Off / Saatlik / Giriş Kontrol).
// items: [{ location, lower, upper, values:[...] }]. Değerler nokta limitleriyle
// karşılaştırılır; dışarıda kalanlar (ya da 'Uygun Değil') kırmızı gösterilir.

import { fmtMeasure, outOfTolerance } from '../core/lookups.js';
import { esc } from '../core/states.js';
import { t } from '../core/i18n.js';

export function measurementDetail(items) {
  const box = el('div', 'meas-detail');
  if (!items || items.length === 0) { box.innerHTML = `<div class="empty">${esc(t('meas.empty'))}</div>`; return box; }

  for (const it of items) {
    const lo = it.lower, hi = it.upper;
    const hasLimits = (lo != null && lo !== '') || (hi != null && hi !== '');
    const mrow = el('div', 'mrow');

    const loc = el('div', 'mloc');
    loc.innerHTML = esc(it.location || '—') +
      (hasLimits ? `<span class="limits">${esc(fmtMeasure(lo))} – ${esc(fmtMeasure(hi))}</span>` : '');

    const vals = el('div', 'mvals');
    let out = 0;
    const list = it.values || [];
    for (const v of list) {
      const bad = outOfTolerance(v, lo, hi) || String(v).trim() === 'Uygun Değil';
      if (bad) out++;
      const disp = (v == null || v === '') ? '—' : (isFinite(Number(v)) ? fmtMeasure(v) : String(v));
      vals.innerHTML += `<span class="v${bad ? ' out' : ''}">${esc(disp)}</span>`;
    }
    if (list.length === 0) vals.innerHTML = '<span class="v">—</span>';

    const stat = el('div', 'mstat ' + (out ? 'bad' : 'ok'), out ? esc(t('meas.out', { n: out })) : esc(t('meas.in')));
    mrow.append(loc, vals, stat);
    box.appendChild(mrow);
  }
  return box;
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
