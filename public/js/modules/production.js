// Üretim Girişi — v2 (yeniden yazım). Tasarım: tasarim/Uretim-Girisi-v2.dc.html.
// Referans mantık: v78 viewUretimGirisi. Spec: docs/uretim-girisi-brief.md.
//
// Akış: tarih + vardiya seç → o güne Üretim Planı'nda atanmış işler KART olarak gelir
// (kullanıcı iş emri SEÇMEZ — liste machine_plans'tan). Her karta üretilen/fire/operatör
// + opsiyonel duruş + not girilir, kart başına kaydedilir. Vardiya hedefi Çalışma
// Saatleri'nden süreye orantılı hesaplanır (core/capacity.js), kayda target_quantity
// olarak yazılır. Kayıt anahtarı (iş emri, tarih, vardiya, operatör) — migration 042;
// ProductionRepository::create() upsert yapar, mevcut kayıtta önce onay istenir.
//
// i18n: özel görünüm (DataTable yok) — bindLang ile dil değişince VERİ ÇEKMEDEN yeniden
// çizilir (tarih/vardiya/taslaklar closure'da korunur). Makine/ürün/operasyon adları
// sunucudan geldiği gibi basılır (çevrilmez); etiketler t() ile.

import { resource, request, ValidationError, ApiError, ConflictError } from '../core/api.js';
import { toast } from '../core/toast.js';
import { errorState, esc, confirmDialog } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, getLang, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDuration, fmtDateTR, fmtPct } from '../core/format.js';
import { shiftRatio, shiftTarget, downtimeMinutes } from '../core/capacity.js';

const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const api = resource('production');
const SHIFTS = ['Sabah', 'Öğleden Sonra'];   // Mesai BE enum'unda var ama ekranda seçilmez (veride yok)

const DAY_NAMES = {
  tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export async function viewProduction(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let products, centers, ops, operators, reasons, workOrders, plans, entries, wh;
  try {
    [products, centers, ops, operators, reasons, workOrders, plans, entries, wh] = await Promise.all([
      loadLookup('product-codes', mapProduct),
      loadLookup('work-centers', mapNamed),
      loadLookup('operations', mapNamed),
      loadLookup('operators', (o) => ({ id: o.id, code: o.badgeNo, name: o.fullName })),
      loadLookup('downtime-reasons', (r) => ({ id: r.id, name: r.name, isActive: r.isActive })),
      resource('work-orders').listAll().then(r => r.data),
      resource('machine-plans').listAll().then(r => r.data),
      api.listAll().then(r => r.data),
      request('/working-hours').then(r => r.data),
    ]);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProduction(container) }));
    return;
  }

  const woById = new Map(workOrders.map(w => [w.id, w]));
  const reasonName = (id) => { const r = reasons.byId.get(id); return r ? r.name : ''; };

  // --- görünüm durumu (oturum boyu; render kapanışta korunur) ---
  const now = new Date();
  const autoShift = () => now.getHours() < 13 ? 'Sabah' : 'Öğleden Sonra';
  let date = todayISO();
  let shift = autoShift();
  let shiftManual = false;
  const drafts = new Map();       // 'woId|date|shift' -> form taslağı
  const openDt = new Map();       // 'woId|date|shift' -> duruş bölümü açık mı (elle)
  const errors = new Map();       // 'woId|date|shift' -> { title, sol }

  // --- türetmeler ---
  const producedByWo = () => {
    const m = new Map();
    for (const e of entries) m.set(e.workOrderId, (m.get(e.workOrderId) || 0) + (e.actualQuantity || 0));
    return m;
  };
  // O gün + o vardiyaya ait, iş emri bağı olan planlar (her biri bir kart). İş emri
  // silinmişse kart gösterilemez (kalan/operasyon çözülemez) → atlanır.
  const dayPlans = () => plans
    .filter(p => p.date === date && p.workOrderId != null && woById.has(p.workOrderId))
    .sort((a, b) => centers.label(a.workCenterId).localeCompare(centers.label(b.workCenterId), 'tr'));
  // Bir iş emrinin bu tarih+vardiyadaki kayıtları (farklı operatörler → birden çok olabilir).
  const recordsFor = (woId) => entries.filter(e => e.workOrderId === woId && e.date === date && e.shift === shift);

  const key = (plan) => plan.workOrderId + '|' + date + '|' + shift;
  const blankForm = () => ({ uretilen: '', fire: '', operatorId: '', downtimeStart: '', downtimeEnd: '', downtimeReasonId: '', note: '' });
  const recToForm = (r) => ({
    uretilen: r.actualQuantity == null ? '' : String(r.actualQuantity),
    fire: r.scrapQuantity == null ? '' : String(r.scrapQuantity),
    operatorId: r.operatorId != null ? String(r.operatorId) : '',
    downtimeStart: r.downtimeStart || '', downtimeEnd: r.downtimeEnd || '',
    downtimeReasonId: r.downtimeReasonId != null ? String(r.downtimeReasonId) : '',
    note: r.note || '',
  });
  // Kartta gösterilen/kaydedilecek kayıt: seçili operatörün kaydı; operatör seçilmemişse
  // (ilk açılış) bu iş emrinin tek kaydı — genelde makine başına vardiyada tek operatör.
  const matchRecord = (plan, operatorId) => {
    const recs = recordsFor(plan.workOrderId);
    if (operatorId) return recs.find(e => String(e.operatorId) === String(operatorId)) || null;
    return recs[0] || null;
  };
  const form = (plan) => {
    const k = key(plan);
    if (drafts.has(k)) return drafts.get(k);
    const rec = matchRecord(plan, null);
    return rec ? recToForm(rec) : blankForm();
  };
  const setDraft = (plan, patch) => { const k = key(plan); drafts.set(k, { ...form(plan), ...patch }); };

  render();
  bindLang(container, render);

  function render() {
    const lang = getLang();
    const isToday = date === todayISO();
    const dName = DAY_NAMES[lang === 'en' ? 'en' : 'tr'][new Date(date + 'T00:00:00').getDay()];
    const dayTag = (isToday ? t('ug.todayBadge') + ' · ' : '') + fmtDateTR(date) + ' · ' + dName;

    const gunun = dayPlans();
    const totTarget = gunun.reduce((s, p) => s + (shiftTarget(wh, shift, p.targetQuantity) || 0), 0);
    const woIds = new Set(gunun.map(p => p.workOrderId));
    const totDone = entries
      .filter(e => e.date === date && e.shift === shift && woIds.has(e.workOrderId))
      .reduce((s, e) => s + (e.actualQuantity || 0), 0);
    const gunPct = totTarget > 0 ? Math.round(totDone / totTarget * 100) : 0;
    const [pctC, pctF] = statusColors(gunPct);

    container.innerHTML = `
      <div class="module-head"><div>
        <h2>${esc(t('menu.production'))}</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('ug.subtitle'))}</div>
      </div></div>

      <div style="background:#fff; border:1px solid var(--color-neutral-400); padding:12px 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" id="ug-prev">← ${esc(t('ug.prevDay'))}</button>
        <input type="date" id="ug-date" value="${esc(date)}" style="width:170px; box-sizing:border-box; height:38px; padding:0 10px; font-family:'IBM Plex Mono',monospace; font-size:14.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
        <button type="button" class="btn btn-secondary" id="ug-next">${esc(t('ug.nextDay'))} →</button>
        <span style="flex:none; padding:3px 9px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; border:1px solid ${isToday ? 'var(--color-success)' : 'var(--color-neutral-600)'}; background:${isToday ? 'var(--color-success-fill)' : 'var(--color-neutral-100)'}; color:${isToday ? 'var(--color-success)' : 'var(--color-neutral-600)'};">${esc(dayTag.toLocaleUpperCase(lang === 'en' ? 'en' : 'tr'))}</span>

        <div id="ug-shifts" style="flex:none; display:flex; border:1px solid var(--color-neutral-400); margin-left:8px;">
          ${SHIFTS.map((s, i) => {
            const on = s === shift;
            return `<button type="button" class="ug-shift" data-shift="${esc(s)}" style="height:38px; padding:0 18px; font-size:14.5px; border:0; border-left:${i === 0 ? '0' : '1px solid var(--color-neutral-400)'}; cursor:pointer; background:${on ? 'var(--color-accent-900)' : 'transparent'}; color:${on ? '#fff' : 'var(--color-text)'}; font-weight:${on ? '600' : '400'}; white-space:nowrap;">${esc(t('shift.' + s))}</button>`;
          }).join('')}
        </div>
        <span style="flex:none; font-size:12.5px; color:var(--color-neutral-600);">${esc(shiftManual ? t('ug.shiftManual') : t('ug.shiftAuto'))}</span>

        <div style="margin-left:auto; flex:none; display:flex; align-items:baseline; gap:12px; font-family:'IBM Plex Mono',monospace; font-size:13.5px;">
          <span style="color:var(--color-neutral-700);">${esc(t('ug.daySummary', { n: gunun.length, target: fmtTr(totTarget, '0'), done: fmtTr(totDone, '0') }))}</span>
          <span style="padding:3px 10px; border:1px solid ${pctC}; background:${pctF}; color:${pctC}; font-size:14px;">${esc(fmtPct(gunPct))}</span>
        </div>
      </div>

      <div id="ug-body" style="margin-top:18px;"></div>`;

    container.querySelector('#ug-prev').addEventListener('click', () => changeDate(addDaysISO(date, -1)));
    container.querySelector('#ug-next').addEventListener('click', () => changeDate(addDaysISO(date, 1)));
    container.querySelector('#ug-date').addEventListener('change', (e) => { if (e.target.value) changeDate(e.target.value); });
    container.querySelectorAll('.ug-shift').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.shift === shift) return;
      shift = b.dataset.shift; shiftManual = shift !== autoShift(); render();
    }));

    renderBody(gunun);
  }

  function changeDate(next) {
    date = next;
    // Vardiya seçimi kullanıcı elle değiştirmediyse bugüne dönünce saate göre kalsın.
    if (!shiftManual) shift = autoShift();
    render();
  }

  function renderBody(gunun) {
    const host = container.querySelector('#ug-body');
    host.innerHTML = '';

    if (!canWrite) {
      const note = document.createElement('div');
      note.className = 'text-muted';
      note.style.cssText = 'margin-bottom:12px; font-size:13px;';
      note.textContent = t('common.readonlyHint');
      host.appendChild(note);
    }

    if (gunun.length === 0) {
      const st = document.createElement('div');
      st.style.cssText = 'background:#fff; border:1px solid var(--color-neutral-400); padding:56px 32px; text-align:center;';
      st.innerHTML = `
        <div style="font-family:var(--font-heading); font-size:24px; font-weight:600;">${esc(t('ug.emptyTitle'))}</div>
        <p style="margin:10px auto 0; max-width:46ch; font-size:14.5px; line-height:1.6; color:var(--color-neutral-700);">${esc(t('ug.emptyBody'))}</p>`;
      const go = document.createElement('button');
      go.className = 'btn btn-primary'; go.style.marginTop = '18px';
      go.textContent = t('ug.goPlan');
      go.addEventListener('click', () => { location.hash = '#machine-plans'; });
      st.appendChild(go);
      host.appendChild(st);
      return;
    }

    const grid = document.createElement('div');
    // align-items:stretch → aynı satırdaki kartlar en uzuna göre eşit yükseklik; kart
    // içi flex kolon + Kaydet'te margin-top:auto ile düğmeler hizalanır (aşağıda).
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:18px; align-items:stretch;';
    for (const plan of gunun) grid.appendChild(buildCard(plan));
    host.appendChild(grid);

    host.appendChild(buildEntriesTable(gunun));
  }

  // ------- Kart -------
  function buildCard(plan) {
    const wo = woById.get(plan.workOrderId);
    const f = form(plan);
    // Gösterilecek/güncellenecek kayıt: taslak varsa YALNIZ seçili operatörünki (operatör
    // seçilmediyse yeni giriş → yok); taslak yoksa ilk mevcut kayıt (açılış ön dolumu).
    const rec = drafts.has(key(plan))
      ? (f.operatorId ? recordsFor(plan.workOrderId).find(e => String(e.operatorId) === String(f.operatorId)) || null : null)
      : (recordsFor(plan.workOrderId)[0] || null);
    const target = shiftTarget(wh, shift, plan.targetQuantity);
    const produced = producedByWo().get(plan.workOrderId) || 0;
    // Bu kaydın kendi katkısını düşerek "kalan" (bu giriş olmasaydı ne kalırdı).
    const kalan = Math.max(0, (Number(wo.targetQuantity) || 0) - produced + (rec?.actualQuantity || 0));

    const dtOpenKey = key(plan);
    const dtOpen = openDt.has(dtOpenKey) ? openDt.get(dtOpenKey)
      : !!(f.downtimeStart || f.downtimeEnd || f.downtimeReasonId);

    // durum şeridi + rozet — kayda göre (girilmemiş/altında/ulaşıldı/duruş)
    const recDt = rec ? downtimeMinutes(rec.downtimeStart, rec.downtimeEnd, wh) : 0;
    const reached = rec && target != null && rec.actualQuantity >= target;
    const seritRenk = !rec ? 'var(--color-neutral-300)'
      : recDt > 0 ? 'var(--color-warning)'
      : reached ? 'var(--color-success)' : 'var(--color-warning)';

    const el = document.createElement('div');
    el.style.cssText = `background:#fff; border:1px solid var(--color-neutral-400); border-left:4px solid ${seritRenk}; padding:15px 18px 18px; min-width:0; display:flex; flex-direction:column;`;

    const opts = (list, sel, ph) =>
      `<option value="">${esc(ph)}</option>` +
      list.map(o => `<option value="${esc(String(o.id))}"${String(o.id) === String(sel) ? ' selected' : ''}>${esc(labelOf(o))}</option>`).join('');

    const dis = canWrite ? '' : ' disabled';
    el.innerHTML = `
      <div style="display:flex; align-items:baseline; gap:10px;">
        <span title="${esc(centers.label(plan.workCenterId))}" style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-heading); font-size:24px; font-weight:600; line-height:1.1;">${esc(centers.label(plan.workCenterId))}</span>
        <span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--color-neutral-600); white-space:nowrap;">İE-${esc(wo.woNo)} · ${esc(products.byId.get(plan.productCodeId)?.code || '')}</span>
      </div>
      <div style="font-size:13.5px; color:var(--color-neutral-600); margin-top:2px;">${esc([ops.label(wo.operationId), products.byId.get(plan.productCodeId)?.name].filter(Boolean).join(' · '))}</div>

      <div class="ug-strip" style="display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; min-height:${rec ? '22px' : '0'};">
        ${rec ? `<span style="flex:none; padding:2px 8px; font-size:12px; border:1px solid ${reached ? 'var(--color-success)' : 'var(--color-warning)'}; background:${reached ? 'var(--color-success-fill)' : 'var(--color-warning-fill)'}; color:${reached ? 'var(--color-success)' : 'var(--color-warning)'};">${esc((reached ? t('ug.badgeReached') : t('ug.badgeBelow')) + ' · ' + fmtTr(rec.actualQuantity))}</span>` : ''}
        ${recDt > 0 ? `<span style="flex:none; padding:2px 8px; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid var(--color-warning); background:var(--color-warning-fill); color:var(--color-warning);">⏱ ${esc(t('ug.downtimeBadge', { n: recDt }))}</span>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin-top:12px; border:1px solid var(--color-neutral-300); background:var(--color-neutral-100); padding:10px 12px;">
        ${stat(t('ug.dailyTarget'), fmtTr(plan.targetQuantity), 'var(--color-text)')}
        ${stat(t('ug.shiftTarget'), target == null ? '—' : fmtTr(target), 'var(--color-accent-800)')}
        ${stat(t('ug.remaining'), fmtTr(kalan), kalan < (target || 0) ? 'var(--color-warning)' : 'var(--color-text)')}
      </div>
      <div style="font-size:12px; color:var(--color-neutral-600); margin-top:5px;">${esc(shiftHint())}</div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <div style="flex:1 1 120px; min-width:110px;">
          <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.produced'))}</label>
          <input type="number" step="any" min="0" class="ug-uretilen" value="${esc(f.uretilen)}" placeholder="0"${dis} style="width:100%; height:46px; padding:0 12px; font-family:'IBM Plex Mono',monospace; font-size:21px; font-weight:500; text-align:right; border:1px solid var(--color-neutral-500); background:#fff; color:var(--color-text); box-sizing:border-box;">
        </div>
        <div style="flex:1 1 100px; min-width:90px;">
          <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.scrap'))}</label>
          <input type="number" step="any" min="0" class="ug-fire" value="${esc(f.fire)}" placeholder="0"${dis} style="width:100%; height:46px; padding:0 12px; font-family:'IBM Plex Mono',monospace; font-size:21px; text-align:right; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text); box-sizing:border-box;">
        </div>
        <div style="flex:1 1 100%; min-width:160px;">
          <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.operator'))}</label>
          <select class="ug-operator" ${dis} style="width:100%; box-sizing:border-box; height:46px; padding:0 10px; font-size:15px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">${opts(operators.rows, f.operatorId, t('ug.selectPlaceholder'))}</select>
        </div>
      </div>

      <div style="margin-top:14px;">
        <button type="button" class="ug-dt-toggle" ${dis} style="height:38px; padding:0 14px; font-size:14px; background:transparent; border:1px dashed ${dtOpen ? 'var(--color-warning)' : 'var(--color-neutral-400)'}; color:${dtOpen ? 'var(--color-warning)' : 'var(--color-neutral-700)'}; cursor:pointer;">${esc(dtOpen ? t('ug.downtimeRemove') : t('ug.downtimeAdd'))}</button>
        <div class="ug-dt-body" style="display:${dtOpen ? 'flex' : 'none'}; margin-top:10px; border:1px solid var(--color-neutral-300); background:var(--color-neutral-100); padding:12px; flex-direction:column; gap:10px;">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1 1 120px; min-width:110px;">
              <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.dtStart'))}</label>
              <input type="time" class="ug-dt-start" value="${esc(f.downtimeStart)}"${dis} style="width:100%; box-sizing:border-box; height:42px; padding:0 10px; font-family:'IBM Plex Mono',monospace; font-size:15px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
            </div>
            <div style="flex:1 1 120px; min-width:110px;">
              <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.dtEnd'))}</label>
              <input type="time" class="ug-dt-end" value="${esc(f.downtimeEnd)}"${dis} style="width:100%; box-sizing:border-box; height:42px; padding:0 10px; font-family:'IBM Plex Mono',monospace; font-size:15px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
            </div>
            <div style="flex:none; padding-bottom:6px;">
              <div style="font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:0.1em; color:var(--color-neutral-600);">${esc(t('ug.dtDuration'))}</div>
              <div class="ug-dt-dur" style="font-family:'IBM Plex Mono',monospace; font-size:18px; font-weight:500;"></div>
            </div>
          </div>
          <div>
            <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.downtimeReason'))}</label>
            <select class="ug-dt-reason" ${dis} style="width:100%; box-sizing:border-box; height:42px; padding:0 10px; font-size:14.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">${opts(reasons.rows.filter(r => r.isActive || String(r.id) === String(f.downtimeReasonId)), f.downtimeReasonId, t('ug.selectPlaceholder'))}</select>
          </div>
          <div style="font-size:12px; color:var(--color-neutral-600);">${esc(t('ug.dtBreakNote'))}</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <label style="display:block; font-size:12.5px; color:var(--color-neutral-700); margin-bottom:4px;">${esc(t('ug.note'))}</label>
        <input type="text" class="ug-note" value="${esc(f.note)}" placeholder="${esc(t('ug.notePlaceholder'))}"${dis} style="width:100%; box-sizing:border-box; height:42px; padding:0 12px; font-size:14px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
      </div>

      <div class="ug-warn" style="display:none; margin-top:12px; border:1px solid var(--color-warning); border-left:4px solid var(--color-warning); background:var(--color-warning-fill); padding:9px 12px; font-size:12.5px; color:var(--color-warning);"></div>
      <div class="ug-err" style="display:none; margin-top:12px; border:1px solid var(--color-danger); border-left:4px solid var(--color-danger); background:var(--color-danger-fill); padding:10px 12px;">
        <div class="ug-err-title" style="font-size:13.5px; font-weight:500; color:var(--color-danger);"></div>
        <div class="ug-err-sol" style="font-size:12.5px; color:var(--color-neutral-700); margin-top:2px;"></div>
      </div>

      <div style="flex:1 1 auto;"></div>
      ${canWrite ? `<button type="button" class="ug-save" style="width:100%; height:48px; margin-top:14px; font-family:var(--font-heading); font-size:17px; font-weight:600; cursor:pointer; background:${rec ? 'transparent' : 'var(--color-accent)'}; border:1px solid var(--color-accent-700); color:${rec ? 'var(--color-accent-800)' : '#fff'};">${esc(rec ? t('ug.update') : t('ug.save'))}</button>` : ''}
    `;

    // --- referanslar + olaylar ---
    const q = (s) => el.querySelector(s);
    const elUret = q('.ug-uretilen'), elFire = q('.ug-fire'), elOp = q('.ug-operator');
    const elNote = q('.ug-note'), elDtS = q('.ug-dt-start'), elDtE = q('.ug-dt-end'), elDtR = q('.ug-dt-reason');
    const errBox = q('.ug-err'), warnBox = q('.ug-warn'), durEl = q('.ug-dt-dur');

    const clearErr = () => { errors.delete(key(plan)); errBox.style.display = 'none'; };
    const paintDuration = () => {
      const m = downtimeMinutes(elDtS.value, elDtE.value, wh);
      durEl.textContent = m > 0 ? fmtDuration(m) : '—';
      durEl.style.color = m > 0 ? 'var(--color-warning)' : 'var(--color-neutral-500)';
    };
    const paintWarn = () => {
      const v = elUret.value === '' ? null : Number(elUret.value);
      if (v != null && isFinite(v) && v > kalan) {
        warnBox.textContent = t('ug.overWarn', { n: fmtTr(kalan) });
        warnBox.style.display = '';
      } else warnBox.style.display = 'none';
    };
    paintDuration(); paintWarn();
    // Kaydetme öncesi hata varsa göster (dil değişimi/yeniden çizimde korunur).
    const savedErr = errors.get(key(plan));
    if (savedErr) showErr(savedErr);

    function showErr(e) {
      q('.ug-err-title').textContent = e.title;
      q('.ug-err-sol').textContent = e.sol;
      errBox.style.display = '';
      elUret.style.borderColor = /ug\.errNoQty|ug\.errZero/.test(e.code) ? 'var(--color-danger)' : 'var(--color-neutral-500)';
      elOp.style.borderColor = e.code === 'ug.errNoOp' ? 'var(--color-danger)' : '';
    }

    if (canWrite) {
      elUret.addEventListener('input', () => { setDraft(plan, { uretilen: elUret.value }); clearErr(); paintWarn(); elUret.style.borderColor = 'var(--color-neutral-500)'; });
      elFire.addEventListener('input', () => setDraft(plan, { fire: elFire.value }));
      elNote.addEventListener('input', () => setDraft(plan, { note: elNote.value }));
      elDtS.addEventListener('change', () => { setDraft(plan, { downtimeStart: elDtS.value }); clearErr(); paintDuration(); });
      elDtE.addEventListener('change', () => { setDraft(plan, { downtimeEnd: elDtE.value }); clearErr(); paintDuration(); });
      elDtR.addEventListener('change', () => { setDraft(plan, { downtimeReasonId: elDtR.value }); clearErr(); });
      // Operatör değişince o operatörün mevcut kaydı varsa forma yükle (prefill), yoksa
      // yalnız operatörü ayarla → kartı yeniden çiz (rozet/buton/kalan güncellensin).
      elOp.addEventListener('change', () => {
        const opId = elOp.value;
        const other = opId ? recordsFor(plan.workOrderId).find(e => String(e.operatorId) === String(opId)) : null;
        drafts.set(key(plan), other ? { ...recToForm(other), operatorId: opId } : { ...form(plan), operatorId: opId });
        openDt.delete(key(plan)); clearErr();
        el.replaceWith(buildCard(plan));
      });
      q('.ug-dt-toggle').addEventListener('click', () => {
        const open = !dtOpen;
        openDt.set(key(plan), open);
        if (!open) setDraft(plan, { downtimeStart: '', downtimeEnd: '', downtimeReasonId: '' });
        clearErr();
        el.replaceWith(buildCard(plan));
      });
      q('.ug-save').addEventListener('click', () => save(plan, el, {
        elUret, elFire, elOp, elNote, elDtS, elDtE, elDtR, kalan,
      }));
    }

    return el;
  }

  // ------- Kaydetme + doğrulama -------
  async function save(plan, el, F) {
    const k = key(plan);
    const dtOpen = openDt.has(k) ? openDt.get(k) : !!(F.elDtS.value || F.elDtE.value || F.elDtR.value);
    const uretilenRaw = F.elUret.value.trim();
    const uretilen = uretilenRaw === '' ? null : Number(uretilenRaw);
    const fire = F.elFire.value.trim() === '' ? 0 : Number(F.elFire.value);
    const operatorId = F.elOp.value || '';
    const dtStart = dtOpen ? F.elDtS.value : '';
    const dtEnd = dtOpen ? F.elDtE.value : '';
    const dtReason = dtOpen ? F.elDtR.value : '';

    let err = null;
    if (uretilen === null || !isFinite(uretilen)) err = { code: 'ug.errNoQty', title: t('ug.errNoQtyTitle'), sol: t('ug.errNoQtySol') };
    else if (uretilen <= 0) err = { code: 'ug.errZero', title: t('ug.errZeroTitle'), sol: t('ug.errZeroSol') };
    else if (!operatorId) err = { code: 'ug.errNoOp', title: t('ug.errNoOpTitle'), sol: t('ug.errNoOpSol') };
    else if ((dtStart || dtEnd) && !(dtStart && dtEnd)) err = { code: 'ug.errDtHalf', title: t('ug.errDtHalfTitle'), sol: t('ug.errDtHalfSol') };
    else if (dtStart && dtEnd && toMin(dtEnd) <= toMin(dtStart)) err = { code: 'ug.errDtOrder', title: t('ug.errDtOrderTitle'), sol: t('ug.errDtOrderSol') };
    else if (dtStart && dtEnd && !dtReason) err = { code: 'ug.errDtReason', title: t('ug.errDtReasonTitle'), sol: t('ug.errDtReasonSol') };

    if (err) {
      errors.set(k, err);
      el.replaceWith(buildCard(plan));
      return;
    }
    // uretilen > kalan → engelleme YOK (uyarı zaten kartta gösterildi); meşru durum.

    const body = {
      workOrderId: plan.workOrderId, date, shift,
      targetQuantity: shiftTarget(wh, shift, plan.targetQuantity),
      actualQuantity: uretilen, scrapQuantity: fire,
      operatorId: Number(operatorId),
      downtimeStart: dtStart || null, downtimeEnd: dtEnd || null,
      downtimeReasonId: dtReason ? Number(dtReason) : null,
      note: F.elNote.value.trim(),
    };

    // Mükerrer koruması: (iş emri, tarih, vardiya, operatör) tekildir (migration 042).
    const dup = recordsFor(plan.workOrderId).find(e => String(e.operatorId) === String(operatorId));
    if (dup) {
      const ok = await confirmDialog({
        title: t('ug.dupTitle'),
        body: t('ug.dupBody', { date: fmtDateTR(date), shift: t('shift.' + shift), n: fmtTr(dup.actualQuantity) }),
        confirmLabel: t('action.overwrite'),
      });
      if (!ok) return;
    }

    const saveBtn = el.querySelector('.ug-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = t('action.saving'); }
    try {
      let data;
      if (dup) {
        ({ data } = await api.update(dup.id, { ...body, updatedAt: dup.updatedAt }));
        const i = entries.findIndex(e => e.id === dup.id);
        if (i >= 0) entries[i] = data; else entries.unshift(data);
        toast(t('ug.updatedToast', { n: fmtTr(data.actualQuantity) }), 'success');
      } else {
        ({ data } = await api.create(body));   // BE upsert eder; anahtar çarpışmasında mevcut döner
        const i = entries.findIndex(e => e.id === data.id);
        if (i >= 0) entries[i] = data; else entries.unshift(data);
        toast(t('ug.savedToast', { n: fmtTr(data.actualQuantity) }), 'success');
      }
      drafts.delete(k); openDt.delete(k); errors.delete(k);
      render();
    } catch (e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = dup ? t('ug.update') : t('ug.save'); }
      if (e instanceof ValidationError) toast(t('err.VALIDATION'), 'danger');
      else if (e instanceof ConflictError) toast(t('err.STALE'), 'danger');
      else toast(e instanceof ApiError ? e.message : t('err.GENERIC'), 'danger');
    }
  }

  // ------- Bugünkü Girişler tablosu (her iki vardiya) -------
  function buildEntriesTable(gunun) {
    const woIds = new Set(gunun.map(p => p.workOrderId));
    const rows = entries
      .filter(e => e.date === date && woIds.has(e.workOrderId))
      .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')));

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:22px; background:#fff; border:1px solid var(--color-neutral-400);';

    const cols = [
      ['ug.colTime', 'left', '90px'], ['ug.colWo', 'left', '110px'], ['ug.colProduct', 'left', '140px'],
      ['ug.colShift', 'left', '130px'], ['ug.colOperator', 'left', '150px'], ['ug.colProduced', 'right', '110px'],
      ['ug.colScrap', 'right', '90px'], ['ug.colDowntime', 'right', '180px'], ['ug.colNote', 'left', 'auto'],
    ];

    let bodyHtml;
    if (rows.length === 0) {
      bodyHtml = `<div style="padding:28px 24px; text-align:center; color:var(--color-neutral-600); font-size:14px;">${esc(t('ug.entriesEmpty'))}</div>`;
    } else {
      bodyHtml = `<div style="overflow-x:auto;"><table style="width:100%; min-width:980px; border-collapse:collapse; font-size:14px;">
        <thead><tr style="background:var(--color-neutral-100);">
          ${cols.map(([kk, hz, w]) => `<th style="text-align:${hz}; padding:9px 12px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:0.12em; color:var(--color-neutral-700); font-weight:500; border-bottom:1px solid var(--color-neutral-300); width:${w}; white-space:nowrap;">${esc(t(kk))}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table></div>`;
    }

    wrap.innerHTML = `
      <div style="padding:13px 18px 11px; border-bottom:1px solid var(--color-neutral-300); display:flex; align-items:baseline; gap:12px; flex-wrap:wrap;">
        <span style="font-family:var(--font-heading); font-size:19px; font-weight:600;">${esc(t('ug.entriesTitle'))}</span>
        <span style="font-size:13px; color:var(--color-neutral-600);">${esc(t('ug.entriesSummary', { date: fmtDateTR(date), n: rows.length }))}</span>
      </div>
      ${bodyHtml}`;
    return wrap;

    function rowHtml(e) {
      const wo = woById.get(e.workOrderId);
      const dt = downtimeMinutes(e.downtimeStart, e.downtimeEnd, wh);
      const dtTxt = dt > 0 ? fmtDuration(dt) + (e.downtimeReasonId ? ' · ' + reasonName(e.downtimeReasonId) : '') : '—';
      const note = e.note || '';
      const td = (extra = '') => `padding:9px 12px; border-bottom:1px solid var(--color-neutral-200);${extra}`;
      const mono = "font-family:'IBM Plex Mono',monospace;";
      return `<tr>
        <td style="${td(mono + 'font-size:13px;')}">${esc((e.updatedAt || '').slice(11, 16) || '—')}</td>
        <td style="${td(mono + 'font-size:13px;')}">İE-${esc(wo ? wo.woNo : '#' + e.workOrderId)}</td>
        <td style="${td(mono + 'font-size:13px;')}">${esc(wo ? (products.byId.get(wo.productCodeId)?.code || '') : '')}</td>
        <td style="${td('white-space:nowrap;')}">${esc(t('shift.' + e.shift))}</td>
        <td style="${td('white-space:nowrap;')}">${esc(operators.label(e.operatorId))}</td>
        <td style="${td('text-align:right;' + mono + 'font-size:14px; font-weight:500;')}">${esc(fmtTr(e.actualQuantity))}</td>
        <td style="${td('text-align:right;' + mono + 'font-size:13px;')}">${e.scrapQuantity ? esc(fmtTr(e.scrapQuantity)) : '—'}</td>
        <td style="${td('text-align:right; white-space:nowrap;' + mono + 'font-size:13px; color:' + (dt > 0 ? 'var(--color-warning)' : 'var(--color-neutral-500)') + ';')}">${esc(dtTxt)}</td>
        <td title="${esc(note)}" style="${td('font-size:13px; color:var(--color-neutral-700); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}">${esc(note || '—')}</td>
      </tr>`;
    }
  }

  // ------- küçük yardımcılar -------
  function lang() { return getLang() === 'en' ? 'en' : 'tr'; }
  function labelOf(o) { return [o.code, o.name].filter(Boolean).join(' · ') || ('#' + o.id); }
  function stat(label, value, color) {
    return `<div style="min-width:0;">
      <div style="font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:0.1em; color:var(--color-neutral-600); white-space:nowrap;">${esc(label)}</div>
      <div style="font-family:'IBM Plex Mono',monospace; font-size:21px; font-weight:500; line-height:1.2; margin-top:2px; color:${color};">${esc(value)}</div>
    </div>`;
  }
  function shiftHint() {
    const lg = lang();
    const [from, to] = shift === 'Sabah'
      ? [wh?.morningStart, wh?.morningEnd]
      : [wh?.afternoonStart, wh?.afternoonEnd];
    const pct = fmtPct(shiftRatio(wh, shift) * 100);
    const times = (from && to) ? ` (${from}–${to}, ${t('ug.breakDeducted')})` : '';
    return t('ug.shiftHint', { shift: t('shift.' + shift).toLocaleLowerCase(lg), pct }) + times;
  }
}

// "HH:MM" → dakika (doğrulama karşılaştırması için); boş → -1.
function toMin(hhmm) { if (!hhmm) return -1; const [h, m] = String(hhmm).split(':').map(Number); return (isFinite(h) && isFinite(m)) ? h * 60 + m : -1; }
function statusColors(pct) {
  if (pct >= 90) return ['var(--color-success)', 'var(--color-success-fill)'];
  if (pct >= 60) return ['var(--color-warning)', 'var(--color-warning-fill)'];
  return ['var(--color-danger)', 'var(--color-danger-fill)'];
}
function todayISO() { const d = new Date(); return isoOf(d); }
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDaysISO(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
