// Çalışma Saatleri — v2 modülü. TEKİL kaynak: liste yok, doğrudan düzenleme formu.
// Tasarım: Calisma-Saatleri.dc.html — vardiya özeti (net/mola/öğle) + Sabah/Öğleden
// sonra iki kolon + alt not. GET /working-hours, POST ?op=guncelle.

import { request, ValidationError, ConflictError, ApiError } from '../core/api.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';

const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const GROUPS = [
  ['Sabah', [
    ['morningStart', 'Başlangıç'], ['morningBreakStart', 'Mola başlangıcı'],
    ['morningBreakEnd', 'Mola bitişi'], ['morningEnd', 'Bitiş']
  ]],
  ['Öğleden sonra', [
    ['afternoonStart', 'Başlangıç'], ['afternoonBreakStart', 'Mola başlangıcı'],
    ['afternoonBreakEnd', 'Mola bitişi'], ['afternoonEnd', 'Bitiş']
  ]]
];
const FIELDS = GROUPS.flatMap(([, items]) => items.map(([k]) => k));

export async function viewWorkingHours(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let cur;
  try { ({ data: cur } = await request('/working-hours')); }
  catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkingHours(container) }));
    return;
  }
  render(cur);

  function render(data) {
    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>Çalışma Saatleri</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">Firma başına tek kayıt · silinemez</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          ${canWrite ? '' : '<span class="tag tag-warning">Değişiklik yetkiniz yok</span>'}
          <button class="btn btn-primary" id="wh-save"${canWrite ? '' : ' disabled'}>Kaydet</button>
        </div>
      </div>

      <div class="table-wrap" style="padding:20px; max-width:820px;">
        <div class="drawer-error" id="wh-banner" style="display:none"></div>
        <div class="wh-summary" id="wh-summary"></div>
        <div class="wh-cols" id="wh-cols"></div>
        <div class="text-muted" style="font-size:12.5px; margin-top:18px; line-height:1.6; border-top:1px solid var(--color-divider); padding-top:12px;">
          Saatler <b>SS:DD</b> biçiminde girilir. Bitiş saati başlangıçtan önce olamaz ve mola aralığı
          vardiyanın dışına taşamaz — kaydetmede kontrol edilir. Bu ekranın liste görünümü yoktur;
          kayıt her zaman vardır, silinemez.
        </div>
      </div>`;

    const inputs = {};
    const colsEl = container.querySelector('#wh-cols');
    for (const [title, items] of GROUPS) {
      const sec = document.createElement('div');
      sec.className = 'form-section';
      sec.innerHTML = `<h4>${esc(title)}</h4>`;
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:0 16px;';
      for (const [key, label] of items) {
        const field = document.createElement('div');
        field.className = 'field';
        field.innerHTML = `<label>${esc(label)}</label>`;
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.type = 'time';
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
        <div class="wh-timeline">Günlük vardiya</div>
        <div class="wh-stats">
          <span>Net çalışma: <b>${ok ? hrs(net) : '—'}</b></span>
          <span>Mola: <b>${ok ? hrs(brk) : '—'}</b></span>
          <span>Öğle arası: <b>${ok ? hrs(lunch) : '—'}</b></span>
          <span class="text-muted">Kapasite hesapları bu değerden türer.</span>
        </div>`;
    }
    paintSummary();

    if (canWrite) saveBtn.addEventListener('click', async () => {
      clearErrors();
      const body = { updatedAt: data.updatedAt, ...vals() };
      saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor…';
      try {
        const res = await request('/working-hours?op=guncelle', { method: 'POST', body });
        toast('Çalışma saatleri kaydedildi', 'success');
        render(res.data);
      } catch (err) {
        saveBtn.disabled = false; saveBtn.textContent = 'Kaydet';
        if (err instanceof ValidationError) {
          for (const [k, msg] of Object.entries(err.fields))
            if (inputs[k]) { inputs[k].field.classList.add('has-error'); inputs[k].err.textContent = msg; inputs[k].err.style.display = ''; }
        } else if (err instanceof ConflictError) {
          showBanner(err.message + ' — sayfayı yenileyip tekrar deneyin.');
        } else {
          showBanner(err instanceof ApiError ? err.message : 'Kaydedilemedi');
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
function hrs(min) { return (min / 60).toFixed(2).replace('.', ',') + ' sa'; }
