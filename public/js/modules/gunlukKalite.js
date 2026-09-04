// Günlük Kalite Raporları v2 — beş modülü tek ekrana toplayan sekmeli çalışma alanı.
// Tasarım: Gunluk-Kalite-Raporlari-v2.dc.html. Referans: v78 viewGunlukKalite/viewGunlukOzet.
//
// Üstte ortak filtre (ürün · operasyon · tarih · vardiya) sekmeler arası KORUNUR
// (localStorage). Sekmeler: Günlük Özet · First Off · Saatlik · Giriş Kalite.
// Bu iş parçalı ilerliyor — Adım 2: kabuk + filtre çubuğu + Sekme 1 (Günlük Özet).
// Sekme 2/3/4 sonraki adımlarda; şimdilik yer tutucu.
//
// Veri istemcide türetilir (listAll — API/tablo/Repository aynen kalır). Enum (karar)
// BE'de TR; gösterim çevrilir. i18n: dil değişince VERİ ÇEKMEDEN yeniden çizilir.

import { resource } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, outOfTolerance } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtDateTR, fmtTr } from '../core/format.js';
import { fmtISO, startOfDay } from '../core/report.js';

const LS = 'ozmel.gkr.';
const TABS = [
  ['ozet', 'gkr.tabSummary'], ['firstoff', 'gkr.tabFirstOff'], ['saatlik', 'gkr.tabHourly'], ['giris', 'gkr.tabIncoming'],
];
const FIXED_HOURS = ['10:30', '12:00', '15:00', '18:00'];   // Saatlik sabit saatler (Adım 4'te kullanılır)

export async function viewGunlukKalite(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, foPoints, hrPoints, routes, foRecords, hrRecords;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    foPoints = (await resource('first-off-points').listAll()).data;
    hrPoints = (await resource('hourly-points').listAll()).data;
    routes = (await resource('routes').listAll()).data;
    foRecords = (await resource('first-off-records').listAll()).data;
    hrRecords = (await resource('hourly-records').listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewGunlukKalite(container) }));
    return;
  }

  const hrPointById = new Map(hrPoints.map(p => [p.id, p]));

  // --- filtre durumu (localStorage'da korunur) ---
  const productIds = [...new Set(foPoints.map(p => p.productCodeId))]
    .sort((a, b) => (products.byId.get(a)?.code || '').localeCompare(products.byId.get(b)?.code || '', 'tr'));

  let tab = localStorage.getItem(LS + 'tab') || 'ozet';
  if (!TABS.some(([id]) => id === tab)) tab = 'ozet';
  let product = Number(localStorage.getItem(LS + 'product')) || productIds[0] || null;
  if (!productIds.includes(product)) product = productIds[0] || null;
  let operation = Number(localStorage.getItem(LS + 'operation')) || null;
  let date = localStorage.getItem(LS + 'date') || fmtISO(startOfDay(new Date()));
  let shift = localStorage.getItem(LS + 'shift') || '1';

  // Operasyon listesi — üç kademeli geri çekilme (v78 urunOperasyonlari):
  // 1) routes'ta o ürünün operasyonları (sequence sırası) · 2) yoksa first_off_points'teki
  // operasyonlar · 3) o da yoksa operasyon ana listesi (v2 karşılığı "sabit liste").
  function operationOptions(pid) {
    if (pid == null) return [];
    let ids = [...new Set(routes.filter(r => r.productCodeId === pid).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map(r => r.operationId))];
    if (!ids.length) ids = [...new Set(foPoints.filter(p => p.productCodeId === pid).map(p => p.operationId))];
    if (!ids.length) ids = ops.rows.map(o => o.id);
    return ids.map(id => ({ value: id, label: ops.byId.get(id)?.name || ('#' + id) }));
  }

  function syncOperation() {
    const opts = operationOptions(product);
    if (!opts.some(o => o.value === operation)) operation = opts[0]?.value ?? null;
    return opts;
  }
  syncOperation();

  render();
  bindLang(container, render);

  function save() {
    localStorage.setItem(LS + 'tab', tab);
    if (product != null) localStorage.setItem(LS + 'product', String(product));
    if (operation != null) localStorage.setItem(LS + 'operation', String(operation));
    localStorage.setItem(LS + 'date', date);
    localStorage.setItem(LS + 'shift', shift);
  }

  function render() {
    const opOpts = syncOperation();
    const opHidden = tab === 'giris';   // Giriş Kalite'de operasyon filtresi gizli

    const summaryBits = [products.byId.get(product)?.code || '—'];
    if (!opHidden) summaryBits.push(ops.byId.get(operation)?.name || '—');
    summaryBits.push(fmtDateTR(date), t('gkr.shiftN', { n: shift }));

    container.innerHTML = `
      <div class="module-head" style="margin-bottom:16px;">
        <div>
          <h2>${esc(t('menu.gunluk-kalite'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('gkr.subtitle'))}</div>
        </div>
      </div>

      <div class="gkr-filter">
        <div class="gkr-f">
          <label>${esc(t('gkr.filterProduct'))}</label>
          <select class="input mono" id="gkr-product">
            ${productIds.length ? productIds.map(id => `<option value="${id}"${id === product ? ' selected' : ''}>${esc(products.byId.get(id)?.code || ('#' + id))}</option>`).join('')
              : `<option value="">—</option>`}
          </select>
        </div>
        <div class="gkr-f"${opHidden ? ' style="display:none;"' : ''}>
          <label>${esc(t('gkr.filterOperation'))}</label>
          <select class="input" id="gkr-operation">
            ${opOpts.map(o => `<option value="${o.value}"${o.value === operation ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </div>
        <div class="gkr-f">
          <label>${esc(t('field.date'))}</label>
          <input type="date" class="input mono" id="gkr-date" value="${esc(date)}">
        </div>
        <div class="gkr-f">
          <label>${esc(t('field.shift'))}</label>
          <div class="gkr-shift">
            ${['1', '2', '3'].map(v => `<button type="button" class="gkr-shift-btn${v === shift ? ' on' : ''}" data-shift="${v}">${v}</button>`).join('')}
          </div>
        </div>
        <div class="gkr-summary mono">${esc(summaryBits.join(' · '))}</div>
      </div>

      <div class="gkr-tabs">
        ${TABS.map(([id, lbl]) => `<button type="button" class="gkr-tab${id === tab ? ' on' : ''}" data-tab="${id}">${esc(t(lbl))}</button>`).join('')}
      </div>

      <div class="gkr-body">${tab === 'ozet' ? tabSummary() : placeholder()}</div>`;

    // filtre olayları
    container.querySelector('#gkr-product')?.addEventListener('change', (e) => { product = Number(e.target.value) || null; operation = null; save(); render(); });
    container.querySelector('#gkr-operation')?.addEventListener('change', (e) => { operation = Number(e.target.value) || null; save(); render(); });
    container.querySelector('#gkr-date')?.addEventListener('change', (e) => { date = e.target.value || date; save(); render(); });
    container.querySelectorAll('.gkr-shift-btn').forEach(b => b.addEventListener('click', () => { shift = b.dataset.shift; save(); render(); }));
    container.querySelectorAll('.gkr-tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; save(); render(); }));
  }

  // ---- Sekme 1: Günlük Özet — o tarihte fiilen kayıt girilen ürün/operasyonlar ----
  function tabSummary() {
    const foDay = foRecords.filter(r => r.date === date);
    const hrDay = hrRecords.filter(r => r.date === date);

    // combo anahtarı: productCodeId|operationId
    const combos = new Map();
    const touch = (pid, opId) => { const k = pid + '|' + opId; if (!combos.has(k)) combos.set(k, { pid, opId }); return k; };
    for (const r of foDay) touch(r.productCodeId, r.operationId);
    for (const r of hrDay) touch(r.productCodeId, r.operationId);

    const rows = [];
    for (const { pid, opId } of combos.values()) {
      const foList = foDay.filter(r => r.productCodeId === pid && r.operationId === opId);
      const hrList = hrDay.filter(r => r.productCodeId === pid && r.operationId === opId);

      // Karar dağılımı (First Off overallResult'tan)
      const foUygun = foList.filter(r => r.overallResult === 'Uygun').length;
      const foRed = foList.filter(r => r.overallResult === 'Uygun Değil').length;

      // Dolu saatler + saatlik ölçüm + uygunsuz (hourly ölçümleri nokta limitine göre)
      const filledHours = [];
      let measCount = 0, nonconf = 0;
      for (const r of hrList) {
        let any = false;
        for (const m of (r.measurements || [])) {
          const pt = hrPointById.get(m.pointId) || {};
          for (const v of (m.values || [])) {
            if (v == null || v === '') continue;
            any = true; measCount++;
            if (outOfTolerance(v, pt.lowerLimit, pt.upperLimit) || String(v).trim() === 'Uygun Değil') nonconf++;
          }
        }
        if (any && r.hour) filledHours.push(r.hour);
      }
      if (!foList.length && !filledHours.length) continue;   // kaydı olmayan kombinasyon basılmaz

      const hoursSorted = [...new Set(filledHours)].sort();
      const decision = foList.length
        ? t('gkr.decDist', { ok: foUygun, bad: foRed })
        : t('gkr.decNone');
      const decCls = foRed > 0 ? 'danger' : foList.length ? 'success' : 'neutral';
      rows.push({
        code: products.byId.get(pid)?.code || ('#' + pid),
        op: ops.byId.get(opId)?.name || ('#' + opId),
        foCount: foList.length, decision, decCls,
        hours: hoursSorted.length ? hoursSorted.join(', ') : '—',
        measCount, nonconf,
      });
    }
    rows.sort((a, b) => a.code.localeCompare(b.code, 'tr') || a.op.localeCompare(b.op, 'tr'));

    const chip = (txt, cls) => `<span class="gkr-chip gkr-chip-${cls}">${esc(txt)}</span>`;
    const body = rows.map(r => `
      <tr>
        <td class="mono">${esc(r.code)}</td>
        <td>${esc(r.op)}</td>
        <td class="gkr-num mono">${esc(fmtTr(r.foCount))}</td>
        <td>${chip(r.decision, r.decCls)}</td>
        <td class="mono gkr-hours">${esc(r.hours)}</td>
        <td class="gkr-num mono">${esc(fmtTr(r.measCount))}</td>
        <td class="gkr-num">${r.nonconf > 0 ? chip(fmtTr(r.nonconf), 'danger') : `<span class="mono text-muted">0</span>`}</td>
      </tr>`).join('');

    const cols = ['gkr.colProduct', 'gkr.colOperation', 'gkr.colFirstOff', 'gkr.colDecisions', 'gkr.colHours', 'gkr.colMeasurements', 'gkr.colNonconf'];
    const head = cols.map((c, i) => `<th class="${i === 2 || i === 5 || i === 6 ? 'gkr-num' : ''}">${esc(t(c))}</th>`).join('');

    return `
      <div class="panel gkr-panel">
        <div class="gkr-panel-head">
          <span class="gkr-panel-title">${esc(t('gkr.summaryTitle'))}</span>
          <span class="gkr-panel-sub">${esc(t('gkr.summarySub', { date: fmtDateTR(date) }))}</span>
        </div>
        <div class="gkr-tablewrap">
          <table class="gkr-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${rows.length ? '' : `<div class="gkr-empty">${esc(t('gkr.summaryEmpty'))}</div>`}
      </div>`;
  }

  // Adım 3/4/5'te doldurulacak sekmeler için geçici yer tutucu.
  function placeholder() {
    return `<div class="panel"><div class="text-muted" style="padding:40px 24px; text-align:center;">${esc(t('gkr.soon'))}</div></div>`;
  }
}
