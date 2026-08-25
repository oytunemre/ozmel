// _childDetail.js — genişleyen satır çocuk-kayıt detayları (chevron deseni).
// Üç görünüm:
//   childTable(columns, rows, empty) — bağlı kayıtların mini tablosu
//   childFields(pairs, empty)        — tabloda görünmeyen alanların etiket/değer ızgarası
//   childChips(items, empty)         — serbest etiket/çoklu değer listesi
// Ölçüm/tolerans detayı için ayrıca _measDetail.js kullanılır.

import { esc } from '../core/states.js';

// columns: [{ label, key?, render?(row), mono? }]
export function childTable(columns, rows, empty) {
  const box = el('div', 'child-detail');
  if (!rows || rows.length === 0) { box.appendChild(el('div', 'cd-empty', esc(empty || 'Bağlı kayıt yok.'))); return box; }
  const t = document.createElement('table');
  t.className = 'cd-table';
  t.innerHTML = `<thead><tr>${columns.map(c => `<th${c.mono ? ' class="mono"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>`;
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(c => {
      const v = c.render ? c.render(r) : esc(r[c.key] ?? '—');
      return `<td${c.mono ? ' class="mono"' : ''}>${v}</td>`;
    }).join('');
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  box.appendChild(t);
  return box;
}

// pairs: [{ label, value, mono?, html? }] — value null/'' olanlar atlanır (0 gösterilir).
export function childFields(pairs, empty) {
  const shown = pairs.filter(p => p.value != null && p.value !== '');
  const box = el('div', 'child-detail');
  if (shown.length === 0) { box.appendChild(el('div', 'cd-empty', esc(empty || 'Ek bilgi yok.'))); return box; }
  const grid = el('div', 'cd-fields');
  for (const p of shown) {
    const cell = el('div', 'cd-field');
    cell.innerHTML = `<span class="cd-k">${esc(p.label)}</span>` +
      `<span class="cd-v${p.mono ? ' mono' : ''}">${p.html ? p.value : esc(String(p.value))}</span>`;
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  return box;
}

export function childChips(items, empty) {
  const box = el('div', 'child-detail');
  const list = (items || []).filter(v => v != null && v !== '');
  if (list.length === 0) { box.appendChild(el('div', 'cd-empty', esc(empty || 'Kayıt yok.'))); return box; }
  const wrap = el('div', 'cd-chips');
  wrap.innerHTML = list.map(it => `<span class="tag tag-accent">${esc(String(it))}</span>`).join('');
  box.appendChild(wrap);
  return box;
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
