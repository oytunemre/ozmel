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
import { toast } from '../core/toast.js';
import { loadLookup, mapProduct, mapNamed, outOfTolerance, fmtMeasure, FIRST_OFF_REASON_OPTIONS } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtDateTR, fmtTr } from '../core/format.js';
import { fmtISO, startOfDay } from '../core/report.js';
import { viewIncomingInspections } from './incomingInspections.js';   // Giriş Kalite sekmesi — mevcut modül yeniden kullanılır (taşındı)

const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const SAMPLES = 6;   // "İlk 6 Parça" — sabit numune sütunu (tasarım)
const PASS = 'Uygun', FAIL = 'Uygun Değil';
// Sabit gerekçenin gösterim etiketi (değer BE'de TR kalır).
const reasonLabel = (v) => { const k = 'reason.' + v; const s = t(k); return s === k ? v : s; };

const LS = 'ozmel.gkr.';
const TABS = [
  ['ozet', 'gkr.tabSummary'], ['firstoff', 'gkr.tabFirstOff'], ['saatlik', 'gkr.tabHourly'], ['giris', 'gkr.tabIncoming'],
];
const FIXED_HOURS = ['10:30', '12:00', '15:00', '18:00'];   // Saatlik sabit saatler (Adım 4'te kullanılır)

export async function viewGunlukKalite(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, foPoints, hrPoints, routes, foRecords, hrRecords;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
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

  // First Off sekmesi alt-durumu: liste / form.
  let foView = 'liste';
  let foDraft = null;

  const foApi = resource('first-off-records');
  // (product, operation) için First Off nokta tanımları, nokta no'ya göre.
  const foPointsFor = (pid, opId) => foPoints
    .filter(p => p.productCodeId === pid && p.operationId === opId)
    .sort((a, b) => (a.pointNo || 0) - (b.pointNo || 0));

  const foSampleBad = (pt, v) => {
    if (v == null || v === '') return false;
    if (pt.type === 'nitel') return String(v).trim() === FAIL;
    return outOfTolerance(v, pt.lowerLimit, pt.upperLimit);
  };
  const foPointResult = (pt, vals) => {
    let dolu = 0, bad = 0;
    for (const v of (vals || [])) { if (v == null || v === '') continue; dolu++; if (foSampleBad(pt, v)) bad++; }
    return { dolu, bad };
  };
  const foDecision = (pts, valuesByPoint) => {
    let any = false, bad = false;
    for (const pt of pts) { const r = foPointResult(pt, valuesByPoint[pt.id] || []); if (r.dolu) any = true; if (r.bad) bad = true; }
    return !any ? '' : bad ? FAIL : PASS;
  };
  const foToleransText = (pt) => pt.type === 'nitel' ? 'OK / NOK'
    : `${fmtMeasure(pt.lowerLimit)} … ${fmtMeasure(pt.upperLimit)}${pt.unit ? ' ' + pt.unit : ''}`;

  // Saatlik: sabit saatler + (product, operation) için nokta tanımları + iş merkezi + taslak.
  const hrApi = resource('hourly-records');
  let saatlikDraft = {};   // { [hour]: { recId, updatedAt, personel, values:{[pointId]:[...]} } }
  const hrPointsFor = (pid, opId) => hrPoints
    .filter(p => p.productCodeId === pid && p.operationId === opId)
    .sort((a, b) => a.id - b.id);
  const workCenterFor = (pid, opId) => {
    const rs = routes.filter(r => r.productCodeId === pid && r.operationId === opId);
    const r = rs.find(x => x.isActive) || rs[0];
    return r ? centers.label(r.workCenterId) : null;
  };

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

      <div class="gkr-body">${
        tab === 'ozet' ? tabSummary()
        : tab === 'firstoff' ? tabFirstOff()
        : tab === 'saatlik' ? tabHourly()
        : tab === 'giris' ? '<div id="gkr-giris"></div>'
        : placeholder()
      }</div>`;

    // filtre olayları — bağlam değişince First Off formu listeye döner
    const resetFo = () => { foView = 'liste'; foDraft = null; };
    container.querySelector('#gkr-product')?.addEventListener('change', (e) => { product = Number(e.target.value) || null; operation = null; resetFo(); save(); render(); });
    container.querySelector('#gkr-operation')?.addEventListener('change', (e) => { operation = Number(e.target.value) || null; resetFo(); save(); render(); });
    container.querySelector('#gkr-date')?.addEventListener('change', (e) => { date = e.target.value || date; resetFo(); save(); render(); });
    container.querySelectorAll('.gkr-shift-btn').forEach(b => b.addEventListener('click', () => { shift = b.dataset.shift; save(); render(); }));
    container.querySelectorAll('.gkr-tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; save(); render(); }));

    if (tab === 'firstoff') bindFirstOff();
    if (tab === 'saatlik') bindHourly();
    // Giriş Kalite: mevcut modülü alt kaba göm (iç içe karakteristik editörü korunur).
    // Bu sekmede operasyon filtresi gizli; tarih filtresi görünür ama gömülü modül
    // kendi listesini/aramasını yönetir (bkz. teslim notu).
    if (tab === 'giris') {
      const mount = container.querySelector('#gkr-giris');
      if (mount) viewIncomingInspections(mount);
    }
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

  // ---- Sekme 2: First Off (İlk Parça) — liste + form ----
  function tabFirstOff() {
    return foView === 'form' ? foFormHTML() : foListHTML();
  }

  function foListHTML() {
    const pts = foPointsFor(product, operation);
    const list = foRecords
      .filter(r => r.productCodeId === product && r.operationId === operation && r.date === date)
      .sort((a, b) => (a.checkTime || '').localeCompare(b.checkTime || ''));
    const dash = t('common.dash');
    const decChip = (k) => {
      if (k === PASS) return `<span class="gkr-chip gkr-chip-success">${esc(PASS)}</span>`;
      if (k === FAIL) return `<span class="gkr-chip gkr-chip-danger">${esc(FAIL)}</span>`;
      return `<span class="gkr-chip gkr-chip-neutral">${esc(dash)}</span>`;
    };
    const rows = list.map(r => {
      const valuesByPoint = {};
      for (const m of (r.measurements || [])) valuesByPoint[m.pointId] = m.values || [];
      const karar = r.overallResult || foDecision(pts, valuesByPoint);
      const reasons = (r.reasons || []).map(reasonLabel).join(', ');
      return `
        <tr>
          <td class="mono">${esc(r.checkTime || dash)}</td>
          <td>${esc(r.operatorName || dash)}</td>
          <td class="mono">${esc(r.woNo || dash)}</td>
          <td class="gkr-fo-reason">
            <div>${esc(reasons || dash)}</div>
            ${r.note ? `<div class="gkr-fo-note">${esc(r.note)}</div>` : ''}
          </td>
          <td>${decChip(karar)}</td>
          <td class="gkr-num">${canWrite ? `<button class="btn btn-ghost btn-sm" data-fo-edit="${r.id}">${esc(t('action.edit'))}</button>` : ''}</td>
        </tr>`;
    }).join('');
    const head = `<th>${esc(t('gkr.foColTime'))}</th><th>${esc(t('gkr.foColOperator'))}</th><th>${esc(t('gkr.foColWo'))}</th><th>${esc(t('gkr.foColReason'))}</th><th>${esc(t('gkr.foColDecision'))}</th><th class="gkr-num"></th>`;
    return `
      <div class="panel">
        <div class="gkr-panel-head">
          <span class="gkr-panel-title">${esc(t('gkr.foListTitle'))}</span>
          ${canWrite ? `<button class="btn btn-primary btn-sm" id="fo-new" style="margin-left:auto;">${esc(t('gkr.foNew'))}</button>` : ''}
        </div>
        <div class="gkr-tablewrap">
          <table class="gkr-table" style="min-width:940px;">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${list.length ? '' : `<div class="gkr-empty">${esc(t('gkr.foEmpty'))}</div>`}
      </div>`;
  }

  function foFormHTML() {
    const pts = foPointsFor(product, operation);
    const d = foDraft;
    const meta = [
      { key: 'checkTime', label: t('gkr.foTime'), type: 'time' },
      { key: 'operatorName', label: t('gkr.foOperator'), type: 'text' },
      { key: 'woNo', label: t('gkr.foWo'), type: 'text' },
      { key: 'sampleCount', label: t('gkr.foSampleCount'), type: 'number' },
    ].map(f => `
      <div class="gkr-f" style="min-width:0;">
        <label>${esc(f.label)}</label>
        <input type="${f.type}" class="input" data-fo-meta="${f.key}" value="${esc(d[f.key] == null ? '' : String(d[f.key]))}">
      </div>`).join('');

    const reasons = FIRST_OFF_REASON_OPTIONS.map(r => `
      <button type="button" class="gkr-reason${d.reasons.has(r) ? ' on' : ''}" data-fo-reason="${esc(r)}">
        <i class="gkr-reason-box"></i>${esc(reasonLabel(r))}
      </button>`).join('');

    const sampleHead = Array.from({ length: SAMPLES }, (_, i) => `<th class="gkr-num" style="width:80px;">${i + 1}</th>`).join('');
    const rows = pts.map(pt => {
      const vals = d.values[pt.id] || [];
      const cells = Array.from({ length: SAMPLES }, (_, i) => {
        const v = vals[i] == null ? '' : String(vals[i]);
        if (pt.type === 'nitel') {
          return `<td class="gkr-cell"><select class="gkr-scell" data-fo-cell="${pt.id}-${i}">
            <option value=""${v === '' ? ' selected' : ''}>—</option>
            <option value="${PASS}"${v === PASS ? ' selected' : ''}>OK</option>
            <option value="${FAIL}"${v === FAIL ? ' selected' : ''}>NOK</option></select></td>`;
        }
        return `<td class="gkr-cell"><input type="number" step="any" class="gkr-scell mono" data-fo-cell="${pt.id}-${i}" value="${esc(v)}"></td>`;
      }).join('');
      return `
        <tr>
          <td>${esc(pt.characteristic)}</td>
          <td class="mono text-muted">${esc(foToleransText(pt))}</td>
          ${cells}
          <td id="fo-res-${pt.id}">${foResultChip(pt, vals)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="panel">
        <div class="gkr-panel-head">
          <span class="gkr-panel-title">${esc(d.id ? t('gkr.foEditTitle') : t('gkr.foNewTitle'))}</span>
          <button class="btn btn-secondary btn-sm" id="fo-back" style="margin-left:auto;">${esc(t('gkr.foBack'))}</button>
        </div>
        <div style="padding:18px;">
          <div class="gkr-fo-meta">${meta}</div>

          <div class="gkr-fo-sec">${esc(t('gkr.foReasonHead'))}</div>
          <div class="gkr-reasons">${reasons}</div>

          <div class="gkr-fo-sec">${esc(t('gkr.foSamplesHead'))}</div>
          ${pts.length ? `<div class="gkr-tablewrap" style="border:1px solid var(--color-neutral-300);">
            <table class="gkr-table gkr-fo-grid" style="min-width:900px;">
              <thead><tr><th style="min-width:220px;">${esc(t('gkr.foPoint'))}</th><th style="width:150px;">${esc(t('gkr.foTolerance'))}</th>${sampleHead}<th style="width:140px;">${esc(t('gkr.foResult'))}</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>`
          : `<div class="text-muted" style="padding:12px 0;">${esc(t('gkr.foNoPoints'))}</div>`}

          <div class="gkr-fo-bottom">
            <div class="gkr-f" style="flex:1; min-width:0;">
              <label>${esc(t('gkr.foNote'))}</label>
              <input type="text" class="input" data-fo-meta="note" value="${esc(d.note || '')}" placeholder="${esc(t('gkr.foNotePlaceholder'))}">
            </div>
            <div class="gkr-fo-karar" id="fo-karar-box">
              <div class="gkr-fo-karar-lbl">${esc(t('gkr.foAutoDecision'))}</div>
              <div class="gkr-fo-karar-val" id="fo-karar"></div>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:18px;">
            <button class="btn btn-primary" id="fo-save"${canWrite ? '' : ' disabled'}>${esc(t('action.save'))}</button>
            <button class="btn btn-secondary" id="fo-cancel">${esc(t('action.cancel'))}</button>
          </div>
          <div class="text-muted" style="font-size:12.5px; margin-top:8px;">${esc(t('gkr.foDecisionNote'))}</div>
        </div>
      </div>`;
  }

  function foResultChip(pt, vals) {
    const r = foPointResult(pt, vals);
    if (r.dolu === 0) return `<span class="gkr-chip gkr-chip-neutral">${esc(t('common.dash'))}</span>`;
    if (r.bad > 0) return `<span class="gkr-chip gkr-chip-danger">${esc(t('gkr.foNonconf', { n: r.bad }))}</span>`;
    return `<span class="gkr-chip gkr-chip-success">${esc(PASS)}</span>`;
  }

  // Form yeniden çizmeden hücre/sonuç/karar günceller (input odağı korunur).
  function foRecompute() {
    const pts = foPointsFor(product, operation);
    for (const pt of pts) {
      const vals = foDraft.values[pt.id] || [];
      for (let i = 0; i < SAMPLES; i++) {
        const cell = container.querySelector(`[data-fo-cell="${pt.id}-${i}"]`);
        if (!cell) continue;
        const bad = foSampleBad(pt, vals[i]);
        cell.style.borderColor = bad ? 'var(--color-danger)' : '';
        cell.style.background = bad ? 'var(--color-danger-fill)' : '';
      }
      const res = container.querySelector(`#fo-res-${pt.id}`);
      if (res) res.innerHTML = foResultChip(pt, vals);
    }
    const karar = foDecision(pts, foDraft.values);
    const box = container.querySelector('#fo-karar-box');
    const val = container.querySelector('#fo-karar');
    const color = karar === FAIL ? 'var(--color-danger)' : karar === PASS ? 'var(--color-success)' : 'var(--color-neutral-500)';
    const fill = karar === FAIL ? 'var(--color-danger-fill)' : karar === PASS ? 'var(--color-success-fill)' : 'transparent';
    if (val) { val.textContent = karar || t('common.dash'); val.style.color = color; }
    if (box) { box.style.borderColor = color; box.style.background = fill; }
  }

  function bindFirstOff() {
    if (foView === 'liste') {
      container.querySelector('#fo-new')?.addEventListener('click', () => {
        if (!canWrite) return;
        foDraft = { id: null, checkTime: '', operatorName: '', woNo: '', sampleCount: SAMPLES, reasons: new Set(), note: '', values: {} };
        foView = 'form'; render();
      });
      container.querySelectorAll('[data-fo-edit]').forEach(b => b.addEventListener('click', () => {
        const rec = foRecords.find(r => r.id === Number(b.dataset.foEdit));
        if (!rec) return;
        const values = {};
        for (const m of (rec.measurements || [])) values[m.pointId] = (m.values || []).map(v => v == null ? '' : v);
        foDraft = {
          id: rec.id, checkTime: rec.checkTime || '', operatorName: rec.operatorName || '', woNo: rec.woNo || '',
          sampleCount: rec.sampleCount || SAMPLES, reasons: new Set(rec.reasons || []), note: rec.note || '', values,
        };
        foView = 'form'; render();
      }));
      return;
    }
    // form
    container.querySelector('#fo-back')?.addEventListener('click', () => { foView = 'liste'; foDraft = null; render(); });
    container.querySelector('#fo-cancel')?.addEventListener('click', () => { foView = 'liste'; foDraft = null; render(); });
    container.querySelectorAll('[data-fo-meta]').forEach(inp => inp.addEventListener('input', () => {
      foDraft[inp.dataset.foMeta] = inp.value;
    }));
    container.querySelectorAll('[data-fo-reason]').forEach(btn => btn.addEventListener('click', () => {
      const r = btn.dataset.foReason;
      if (foDraft.reasons.has(r)) { foDraft.reasons.delete(r); btn.classList.remove('on'); }
      else { foDraft.reasons.add(r); btn.classList.add('on'); }
    }));
    container.querySelectorAll('[data-fo-cell]').forEach(cell => {
      const [pid, i] = cell.dataset.foCell.split('-').map(Number);
      const ev = cell.tagName === 'SELECT' ? 'change' : 'input';
      cell.addEventListener(ev, () => {
        if (!foDraft.values[pid]) foDraft.values[pid] = [];
        foDraft.values[pid][i] = cell.value;
        foRecompute();
      });
    });
    container.querySelector('#fo-save')?.addEventListener('click', foSave);
    foRecompute();
  }

  async function foSave() {
    if (!canWrite) return;
    const pts = foPointsFor(product, operation);
    const payload = {
      productCodeId: product, operationId: operation, date, shift,
      checkTime: foDraft.checkTime || null,
      operatorName: foDraft.operatorName || null,
      woNo: foDraft.woNo || null,
      sampleCount: foDraft.sampleCount === '' || foDraft.sampleCount == null ? null : Number(foDraft.sampleCount),
      note: foDraft.note || null,
      overallResult: foDecision(pts, foDraft.values) || null,
      measurements: pts.map(pt => ({ pointId: pt.id, values: Array.from({ length: SAMPLES }, (_, i) => (foDraft.values[pt.id] || [])[i] ?? '') })),
      reasons: [...foDraft.reasons],
    };
    const btn = container.querySelector('#fo-save');
    if (btn) btn.disabled = true;
    try {
      if (foDraft.id) await foApi.update(foDraft.id, { ...payload, updatedAt: (foRecords.find(r => r.id === foDraft.id) || {}).updatedAt });
      else await foApi.create(payload);
      toast(t('toast.saved'), 'success');
      foRecords = (await foApi.listAll()).data;
      foView = 'liste'; foDraft = null; render();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast(err.message || t('err.GENERIC'), 'danger');
    }
  }

  // ---- Sekme 3: Saatlik Kontrol — 4 saat bloğu, her biri kendi kaydı ----
  function tabHourly() {
    const pts = hrPointsFor(product, operation);
    const wc = workCenterFor(product, operation);
    // Taslağı mevcut kayıtlardan kur (seçili product/op/date/shift/hour eşleşmesi).
    saatlikDraft = {};
    for (const hour of FIXED_HOURS) {
      const rec = hrRecords.find(r => r.productCodeId === product && r.operationId === operation
        && r.date === date && r.shift === shift && r.hour === hour);
      const values = {};
      for (const m of (rec?.measurements || [])) values[m.pointId] = (m.values || []).map(v => v == null ? '' : v);
      saatlikDraft[hour] = { recId: rec?.id ?? null, updatedAt: rec?.updatedAt ?? null, personel: rec?.personnelName || '', values };
    }

    const blocks = FIXED_HOURS.map(hour => hourBlockHTML(hour, pts)).join('');
    return `
      <div class="panel">
        <div class="gkr-panel-head">
          <span class="gkr-panel-title">${esc(t('gkr.saTitle'))}</span>
          ${wc ? `<span class="gkr-wc" style="margin-left:auto;">${esc(wc)}</span>` : ''}
        </div>
        <div style="padding:18px; display:flex; flex-direction:column; gap:24px;">
          ${pts.length ? blocks : `<div class="text-muted">${esc(t('gkr.saNoPoints'))}</div>`}
        </div>
      </div>`;
  }

  function hourBlockHTML(hour, pts) {
    const draft = saatlikDraft[hour];
    const sampleHead = Array.from({ length: SAMPLES }, (_, i) => `<th class="gkr-num" style="width:80px;">${i + 1}</th>`).join('');
    const rows = pts.map(pt => {
      const vals = draft.values[pt.id] || [];
      const cells = Array.from({ length: SAMPLES }, (_, i) => {
        const v = vals[i] == null ? '' : String(vals[i]);
        if (pt.type === 'nitel') {
          return `<td class="gkr-cell"><select class="gkr-scell" data-sa-cell="${hour}|${pt.id}|${i}">
            <option value=""${v === '' ? ' selected' : ''}>—</option>
            <option value="${PASS}"${v === PASS ? ' selected' : ''}>OK</option>
            <option value="${FAIL}"${v === FAIL ? ' selected' : ''}>NOK</option></select></td>`;
        }
        return `<td class="gkr-cell"><input type="number" step="any" class="gkr-scell mono" data-sa-cell="${hour}|${pt.id}|${i}" value="${esc(v)}"></td>`;
      }).join('');
      return `
        <tr>
          <td>${esc(pt.measureLocation)}</td>
          <td class="mono text-muted">${esc(foToleransText(pt))}</td>
          ${cells}
          <td id="sa-res-${cssId(hour)}-${pt.id}">${foResultChip(pt, vals)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="gkr-hblock" data-sa-block="${hour}">
        <div class="gkr-hblock-head">
          <span class="gkr-hblock-hour">${esc(hour)}</span>
          <input type="text" class="input gkr-hblock-personel" data-sa-personel="${hour}" value="${esc(draft.personel)}" placeholder="${esc(t('gkr.saPersonnel'))}">
          <span class="gkr-chip" id="sa-badge-${cssId(hour)}"></span>
          ${canWrite ? `<button class="btn btn-primary btn-sm" data-sa-save="${hour}">${esc(t('action.save'))}</button>` : ''}
        </div>
        <div class="gkr-tablewrap" style="margin-top:10px;">
          <table class="gkr-table gkr-fo-grid" style="min-width:880px;">
            <thead><tr><th style="min-width:200px;">${esc(t('gkr.saLocation'))}</th><th style="width:140px;">${esc(t('gkr.saNominal'))}</th>${sampleHead}<th style="width:140px;">${esc(t('gkr.foResult'))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // Bir saat bloğu için hücre renkleri + satır sonuçları + durum rozetini günceller.
  function hourRecompute(hour, pts) {
    const draft = saatlikDraft[hour];
    let dolu = 0, bad = 0;
    for (const pt of pts) {
      const vals = draft.values[pt.id] || [];
      for (let i = 0; i < SAMPLES; i++) {
        const cell = container.querySelector(`[data-sa-cell="${hour}|${pt.id}|${i}"]`);
        if (cell) { const b = foSampleBad(pt, vals[i]); cell.style.borderColor = b ? 'var(--color-danger)' : ''; cell.style.background = b ? 'var(--color-danger-fill)' : ''; }
      }
      const r = foPointResult(pt, vals); dolu += r.dolu; bad += r.bad;
      const res = container.querySelector(`#sa-res-${cssId(hour)}-${pt.id}`);
      if (res) res.innerHTML = foResultChip(pt, vals);
    }
    const badge = container.querySelector(`#sa-badge-${cssId(hour)}`);
    if (badge) {
      let txt, cls;
      if (dolu === 0) { txt = t('gkr.saNoRecord'); cls = 'gkr-chip-neutral'; }
      else if (bad > 0) { txt = t('gkr.saSomeBad', { bad, total: dolu }); cls = 'gkr-chip-danger'; }
      else { txt = t('gkr.saAllOk', { n: dolu }); cls = 'gkr-chip-success'; }
      badge.textContent = txt;
      badge.className = 'gkr-chip ' + cls;
    }
  }

  function bindHourly() {
    const pts = hrPointsFor(product, operation);
    for (const hour of FIXED_HOURS) hourRecompute(hour, pts);

    container.querySelectorAll('[data-sa-personel]').forEach(inp => inp.addEventListener('input', () => {
      saatlikDraft[inp.dataset.saPersonel].personel = inp.value;
    }));
    container.querySelectorAll('[data-sa-cell]').forEach(cell => {
      const [hour, pid, i] = cell.dataset.saCell.split('|');
      const ev = cell.tagName === 'SELECT' ? 'change' : 'input';
      cell.addEventListener(ev, () => {
        const d = saatlikDraft[hour];
        if (!d.values[pid]) d.values[pid] = [];
        d.values[pid][Number(i)] = cell.value;
        hourRecompute(hour, pts);
      });
    });
    if (canWrite) container.querySelectorAll('[data-sa-save]').forEach(b =>
      b.addEventListener('click', () => saveHourBlock(b.dataset.saSave, b)));
  }

  async function saveHourBlock(hour, btn) {
    const pts = hrPointsFor(product, operation);
    const d = saatlikDraft[hour];
    const payload = {
      productCodeId: product, operationId: operation, date, shift, hour,
      personnelName: d.personel || null,
      measurements: pts.map(pt => ({ pointId: pt.id, values: Array.from({ length: SAMPLES }, (_, i) => (d.values[pt.id] || [])[i] ?? '') })),
    };
    if (btn) btn.disabled = true;
    try {
      if (d.recId) await hrApi.update(d.recId, { ...payload, updatedAt: d.updatedAt });
      else await hrApi.create(payload);
      toast(t('toast.saved'), 'success');
      hrRecords = (await hrApi.listAll()).data;
      render();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast(err.message || t('err.GENERIC'), 'danger');
    }
  }

  // Saat metni CSS id'de kullanılamaz (":") — güvenli anahtar.
  function cssId(hour) { return String(hour).replace(/[^0-9]/g, ''); }

  // Adım 5'te doldurulacak sekme için geçici yer tutucu.
  function placeholder() {
    return `<div class="panel"><div class="text-muted" style="padding:40px 24px; text-align:center;">${esc(t('gkr.soon'))}</div></div>`;
  }
}
