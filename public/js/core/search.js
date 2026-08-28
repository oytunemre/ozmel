// search.js — Global arama paleti (Cmd/Ctrl+K, ayrıca "/"). Üst şeritteki düğme +
// klavye kısayolu açar; yazınca GET api/search?q= (debounce ~200ms) sonuçları modüle
// göre gruplar. Seçince hash router "#<type>?id=<id>" ile o kayda gider (DataTable.focusId).
// Metinler t() ile; kabuğa (index.html) initGlobalSearch() ile bağlanır.

import { request } from './api.js';
import { t } from './i18n.js';
import { esc } from './states.js';

// Grup sırası — BE'nin döndürdüğü type'lar bu sırada gösterilir (etiket: t('menu.'+type)).
const GROUP_ORDER = ['product-codes', 'orders', 'work-orders', 'work-centers', 'operations'];

export function initGlobalSearch() {
  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');
  const btn = document.getElementById('global-search');
  const btnLabel = document.getElementById('ts-label');
  const btnKbd = document.getElementById('ts-kbd');

  function paintBtn() {
    if (btnLabel) btnLabel.textContent = t('action.search');
    if (btnKbd) btnKbd.textContent = isMac ? '⌘K' : 'Ctrl K';
    if (btn) btn.setAttribute('aria-label', t('action.search'));
  }
  paintBtn();

  let overlay = null, input = null, listEl = null;
  let items = [], active = -1, seq = 0, deb = null;

  function open() {
    if (overlay) { input?.focus(); return; }
    overlay = document.createElement('div');
    overlay.className = 'gsearch-backdrop';
    overlay.innerHTML = `
      <div class="gsearch" role="dialog" aria-modal="true">
        <div class="gsearch-head">
          <span class="gsearch-ico">⌕</span>
          <input class="gsearch-input" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(t('search.placeholder'))}">
          <button class="gsearch-esc" type="button">Esc</button>
        </div>
        <div class="gsearch-list" id="gsearch-list"></div>
      </div>`;
    document.body.appendChild(overlay);
    input = overlay.querySelector('.gsearch-input');
    listEl = overlay.querySelector('#gsearch-list');
    renderHint(t('search.minChars'));

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.gsearch-esc').addEventListener('click', close);
    input.focus();
  }

  function close() {
    if (!overlay) return;
    clearTimeout(deb);
    overlay.remove();
    overlay = null; input = null; listEl = null; items = []; active = -1;
  }

  function renderHint(text) {
    items = []; active = -1;
    if (listEl) listEl.innerHTML = `<div class="gsearch-hint">${esc(text)}</div>`;
  }

  function onInput() {
    const q = input.value.trim();
    clearTimeout(deb);
    if (q.length < 2) { renderHint(t('search.minChars')); return; }
    deb = setTimeout(() => runSearch(q), 200);
  }

  async function runSearch(q) {
    const my = ++seq;
    listEl.innerHTML = `<div class="gsearch-hint">${esc(t('common.loading'))}</div>`;
    try {
      const { data } = await request('/search?q=' + encodeURIComponent(q));
      if (my !== seq || !overlay) return;   // eskimiş yanıt ya da palet kapandı
      renderResults(data || [], q);
    } catch {
      if (my !== seq || !overlay) return;
      renderHint(t('err.GENERIC'));
    }
  }

  function renderResults(data, q) {
    if (!data.length) { renderHint(t('common.noResultsFor', { q })); return; }
    const byType = new Map();
    for (const it of data) { if (!byType.has(it.type)) byType.set(it.type, []); byType.get(it.type).push(it); }
    // GROUP_ORDER'da olmayan tipler de sona eklensin (BE ileride yeni tip döndürürse).
    const order = [...GROUP_ORDER, ...[...byType.keys()].filter(k => !GROUP_ORDER.includes(k))];

    items = [];
    let html = '';
    for (const type of order) {
      const list = byType.get(type);
      if (!list || !list.length) continue;
      html += `<div class="gsearch-group">${esc(t('menu.' + type))}</div>`;
      for (const it of list) {
        const idx = items.length;
        items.push(it);
        html += `<div class="gsearch-item" data-idx="${idx}">
          <span class="gs-label">${esc(it.label)}</span>${it.meta ? `<span class="gs-meta">${esc(it.meta)}</span>` : ''}
        </div>`;
      }
    }
    listEl.innerHTML = html;
    active = items.length ? 0 : -1;
    paintActive();
    listEl.querySelectorAll('.gsearch-item').forEach((el) => {
      el.addEventListener('mouseenter', () => { active = +el.dataset.idx; paintActive(); });
      el.addEventListener('click', () => choose(+el.dataset.idx));
    });
  }

  function paintActive() {
    if (!listEl) return;
    listEl.querySelectorAll('.gsearch-item').forEach((el, i) => el.classList.toggle('active', i === active));
    listEl.querySelector('.gsearch-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    close();
    location.hash = `#${it.type}?id=${it.id}`;   // çapraz bağlantı: hedef modül focusId ile açılır
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; paintActive(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; paintActive(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  if (btn) btn.addEventListener('click', open);

  // Global kısayollar: Cmd/Ctrl+K aç/kapa; "/" aç (bir girdi alanında değilken).
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay ? close() : open(); return; }
    if (e.key === '/' && !overlay && !isTypingTarget(e.target)) { e.preventDefault(); open(); }
  });

  // Dil değişince düğme etiketi tazelensin.
  window.addEventListener('langchange', paintBtn);
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
