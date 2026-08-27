// Çalışma Saatleri — v2 modülü. TEKİL kaynak: liste yok, doğrudan düzenleme formu.
// Tasarım: Calisma-Saatleri.dc.html — vardiya özeti (net/mola/öğle) + Sabah/Öğleden
// sonra iki kolon + alt not. GET /working-hours, POST ?op=guncelle.
// i18n: metinler t(); dil değişince VERİ ÇEKMEDEN yeniden çizilir (girilen saatler
// data-key üzerinden korunur — kaydedilmemiş düzenleme kaybolmaz).

import { request, ValidationError, ConflictError, ApiError } from '../core/api.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { t, bindLang } from '../core/i18n.js';

const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// [grup i18n anahtarı, [[alan, etiket anahtarı], …]]
const GROUPS = [
  ['shift.Sabah', [
    ['morningStart', 'wh.start'], ['morningBreakStart', 'wh.breakStart'],
    ['morningBreakEnd', 'wh.breakEnd'], ['morningEnd', 'wh.end']
  ]],
  ['shift.Öğleden Sonra', [
    ['afternoonStart', 'wh.start'], ['afternoonBreakStart', 'wh.breakStart'],
    ['afternoonBreakEnd', 'wh.breakEnd'], ['afternoonEnd', 'wh.end']
  ]]
];
const FIELDS = GROUPS.flatMap(([, items]) => items.map(([k]) => k));

export async function viewWorkingHours(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let cur;
  try { ({ data: cur } = await request('/working-hours')); }
  catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkingHours(container) }));
    return;
  }
  let latest = cur;   // en son KAYITLI veri (dil değişiminde girdilerle birleşir)
  render(latest);
  // Dil değişince: mevcut girdileri anlık al, kaydedilmiş veriyle birleştir, yeniden çiz.
  bindLang(container, () => render(snapshot()));

  // DOM'daki güncel saat girdilerini kaydedilmiş veriyle birleştirir (edit korunur).
  function snapshot() {
    const v = { ...latest };
    container.querySelectorAll('input[data-key]').forEach(el => { v[el.dataset.key] = el.value; });
    return v;
  }

  function render(data) {
    container.innerHTML = `
      <div class="wh-view">
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.working-hours'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('wh.subtitle'))}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          ${canWrite ? '' : `<span class="tag tag-warning">${esc(t('wh.readonlyTag'))}</span>`}
          <button class="btn btn-primary" id="wh-save"${canWrite ? '' : ' disabled'}>${esc(t('action.save'))}</button>
        </div>
      </div>

      <div class="wh-center">
      <div class="table-wrap wh-card">
        <div class="drawer-error" id="wh-banner" style="display:none"></div>
        <div class="wh-summary" id="wh-summary"></div>
        <div class="wh-cols" id="wh-cols"></div>
        <div class="text-muted" style="font-size:12.5px; margin-top:18px; line-height:1.6; border-top:1px solid var(--color-divider); padding-top:12px;">
          ${t('wh.help')}
        </div>
      </div>
      </div>
      </div>`;

    const inputs = {};
    const colsEl = container.querySelector('#wh-cols');
    for (const [titleKey, items] of GROUPS) {
      const sec = document.createElement('div');
      sec.className = 'form-section';
      sec.innerHTML = `<h4>${esc(t(titleKey))}</h4>`;
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:0 16px;';
      for (const [key, labelKey] of items) {
        const field = document.createElement('div');
        field.className = 'field';
        field.innerHTML = `<label>${esc(t(labelKey))}</label>`;
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.type = 'time';
        inp.dataset.key = key;
        inp.value = data[key] || '';
        if (!canWrite) inp.disabled = true;
        inp.addEventListener('input', paintSummary);
        field.appendChild(inp);
        const err = document.createElement('span');
        err.className = 'field-error'; err.style.display = 'none';
        field.appendChild(err);
        grid.appendChild(field);
        inputs[key] = { field, inp, err };
      }
      sec.appendChild(grid);
      colsEl.appendChild(sec);
    }

    const banner = container.querySelector('#wh-banner');
    const saveBtn = container.querySelector('#wh-save');
    const summaryEl = container.querySelector('#wh-summary');

    function vals() { const v = {}; for (const k of FIELDS) v[k] = inputs[k].inp.value; return v; }

    function paintSummary() {
      const v = vals();
      const mWork = span(v.morningEnd, v.morningStart) - span(v.morningBreakEnd, v.morningBreakStart);
      const aWork = span(v.afternoonEnd, v.afternoonStart) - span(v.afternoonBreakEnd, v.afternoonBreakStart);
      const net = mWork + aWork;
      const brk = span(v.morningBreakEnd, v.morningBreakStart) + span(v.afternoonBreakEnd, v.afternoonBreakStart);
      const lunch = span(v.afternoonStart, v.morningEnd);
      const ok = [mWork, aWork, lunch].every(x => x != null && x >= 0);
      summaryEl.innerHTML = `
        <div class="wh-timeline">${esc(t('wh.dailyShift'))}</div>
        <div class="wh-stats">
          <span>${esc(t('wh.net'))}: <b>${ok ? hrs(net) : '—'}</b></span>
          <span>${esc(t('wh.break'))}: <b>${ok ? hrs(brk) : '—'}</b></span>
          <span>${esc(t('wh.lunch'))}: <b>${ok ? hrs(lunch) : '—'}</b></span>
          <span class="text-muted">${esc(t('wh.capacityNote'))}</span>
        </div>`;
    }
    paintSummary();

    if (canWrite) saveBtn.addEventListener('click', async () => {
      clearErrors();
      const body = { updatedAt: data.updatedAt, ...vals() };
      saveBtn.disabled = true; saveBtn.textContent = t('action.saving');
      try {
        const res = await request('/working-hours?op=guncelle', { method: 'POST', body });
        toast(t('wh.saved'), 'success');
        latest = res.data;
        render(latest);
      } catch (err) {
        saveBtn.disabled = false; saveBtn.textContent = t('action.save');
        if (err instanceof ValidationError) {
          // BE'nin TR metnini basma — alan başına genel çeviri (api.js deseni).
          for (const [k, msg] of Object.entries(err.fields))
            if (inputs[k]) {
              inputs[k].field.classList.add('has-error');
              inputs[k].err.textContent = /zorunlu|gerekli|required/i.test(msg) ? t('err.REQUIRED') : t('err.VALIDATION');
              inputs[k].err.style.display = '';
            }
        } else if (err instanceof ConflictError) {
          showBanner(t('err.STALE'));
        } else {
          showBanner(err instanceof ApiError ? t('err.GENERIC') : t('err.GENERIC'));
        }
      }
    });

    function clearErrors() {
      banner.style.display = 'none';
      for (const k in inputs) { inputs[k].field.classList.remove('has-error'); inputs[k].err.style.display = 'none'; }
    }
    function showBanner(msg) { banner.textContent = msg; banner.style.display = ''; }
  }
}

// 'HH:MM' -> dakika; iki saat farkı (dakika). Geçersizse null.
function toMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function span(end, start) { const a = toMin(end), b = toMin(start); return (a == null || b == null) ? null : a - b; }
function hrs(min) { return (min / 60).toFixed(2).replace('.', ',') + ' ' + t('wh.hoursShort'); }
