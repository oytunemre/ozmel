// Çalışma Saatleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// TEKİL kaynak: liste yok, doğrudan düzenleme formu. GET /working-hours tek nesne,
// POST /working-hours?op=guncelle günceller. Sekiz zaman alanı.

import { request, ValidationError, ConflictError, ApiError } from '../core/api.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';

const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const GROUPS = [
  ['Sabah', [
    ['morningStart', 'Başlangıç'],
    ['morningBreakStart', 'Mola Başlangıç'],
    ['morningBreakEnd', 'Mola Bitiş'],
    ['morningEnd', 'Bitiş']
  ]],
  ['Öğleden Sonra', [
    ['afternoonStart', 'Başlangıç'],
    ['afternoonBreakStart', 'Mola Başlangıç'],
    ['afternoonBreakEnd', 'Mola Bitiş'],
    ['afternoonEnd', 'Bitiş']
  ]]
];
const FIELDS = GROUPS.flatMap(([, items]) => items.map(([k]) => k));

export async function viewWorkingHours(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let cur;
  try {
    ({ data: cur } = await request('/working-hours'));
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkingHours(container) }));
    return;
  }
  render(cur);

  function render(data) {
    container.innerHTML = `
      <div class="module-head"><h2>Çalışma Saatleri</h2></div>
      <div class="table-wrap" style="padding: 20px; max-width: 640px;">
        <div class="drawer-error" id="wh-banner" style="display:none"></div>
        <div id="wh-groups"></div>
        <div class="drawer-actions" style="border:0; padding:16px 0 0;">
          <button class="btn btn-primary" id="wh-save"${canWrite ? '' : ' disabled title="Salt okuma yetkiniz var"'}>Kaydet</button>
        </div>
      </div>`;

    const groupsEl = container.querySelector('#wh-groups');
    const inputs = {};
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
        inp.value = (data[key] || '');
        if (!canWrite) inp.disabled = true;
        field.appendChild(inp);
        const err = document.createElement('span');
        err.className = 'field-error';
        err.style.display = 'none';
        field.appendChild(err);
        grid.appendChild(field);
        inputs[key] = { field, inp, err };
      }
      sec.appendChild(grid);
      groupsEl.appendChild(sec);
    }

    const banner = container.querySelector('#wh-banner');
    const saveBtn = container.querySelector('#wh-save');

    function clearErrors() {
      banner.style.display = 'none';
      for (const k in inputs) { inputs[k].field.classList.remove('has-error'); inputs[k].err.style.display = 'none'; }
    }

    saveBtn.addEventListener('click', async () => {
      clearErrors();
      const body = { updatedAt: data.updatedAt };
      for (const k of FIELDS) body[k] = inputs[k].inp.value;
      saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor…';
      try {
        const res = await request('/working-hours?op=guncelle', { method: 'POST', body });
        toast('Çalışma saatleri kaydedildi', 'success');
        render(res.data);   // taze updatedAt ile yeniden çiz
      } catch (err) {
        saveBtn.disabled = false; saveBtn.textContent = 'Kaydet';
        if (err instanceof ValidationError) {
          for (const [k, msg] of Object.entries(err.fields)) {
            if (inputs[k]) { inputs[k].field.classList.add('has-error'); inputs[k].err.textContent = msg; inputs[k].err.style.display = ''; }
          }
        } else if (err instanceof ConflictError) {
          banner.textContent = err.message + ' — sayfayı yenileyip tekrar deneyin.';
          banner.style.display = '';
        } else {
          banner.textContent = (err instanceof ApiError ? err.message : 'Kaydedilemedi');
          banner.style.display = '';
        }
      }
    });
  }
}
