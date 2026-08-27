// Üretim Girişi — v2 modülü. Tasarım: Uretim-Girisi.dc.html.
// Sol: "Yeni Giriş" formu; sağ: "Bugünkü Girişler" listesi. Vardiya sonu giriş ekranı.
// i18n: özel görünüm (DataTable yok) — dil değişince bindLang render()'ı VERİ ÇEKMEDEN
// yeniden çağırır. NOT: dil ACIKKEN form yeniden kurulur, yarım kalan giriş sıfırlanır
// (kenar durum; toggle mid-entry nadir). Etiketler t() ile.

import { resource, ValidationError, ApiError } from '../core/api.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';

const api = resource('production');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const shiftOptions = () => [
  { value: 'Sabah', label: t('shift.Sabah') },
  { value: 'Öğleden Sonra', label: t('shift.Öğleden Sonra') },
  { value: 'Mesai', label: t('shift.Mesai') }
];

export async function viewProduction(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, woRows, woTarget, woLabel, operators, entries;
  try {
    products = await loadLookup('product-codes', mapProduct);
    const woData = (await resource('work-orders').listAll()).data;
    woRows = woData.map(w => ({ id: w.id, code: w.woNo, name: products.label(w.productCodeId) }));
    woTarget = new Map(woData.map(w => [w.id, w.targetQuantity]));
    woLabel = new Map(woData.map(w => [w.id, w.woNo]));
    operators = await loadLookup('operators', (o) => ({ id: o.id, code: o.badgeNo, name: o.fullName }));
    entries = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewProduction(container) }));
    return;
  }

  const producedByWo = () => {
    const m = new Map();
    for (const p of entries) m.set(p.workOrderId, (m.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
    return m;
  };

  const woSource = async () => ({ rows: woRows, total: woRows.length });

  render();
  bindLang(container, render);   // dil değişince yeniden çiz (veri closure'da, çekilmez)

  function render() {
    container.innerHTML = `
      <div class="module-head"><div>
        <h2>${esc(t('menu.production'))}</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('prod.subtitle'))}</div>
      </div></div>
      <div class="split">
        <div class="panel"><div class="panel-head">${esc(t('prod.newEntry'))}</div><div class="panel-body" id="pr-form"></div></div>
        <div class="panel">
          <div class="panel-head">${esc(t('prod.today'))} <span class="sub" id="pr-count"></span></div>
          <div id="pr-today"></div>
        </div>
      </div>`;
    renderForm();
    renderToday();
  }

  function renderForm() {
    const host = container.querySelector('#pr-form');
    if (!canWrite) { host.innerHTML = `<div class="text-muted">${esc(t('prod.needEdit'))}</div>`; return; }

    const woFk = new FkSelect({ source: woSource, rows: woRows, placeholder: t('prod.selectWo') });
    const opFk = new FkSelect({ source: operators.source, rows: operators.rows, placeholder: t('prod.selectOp') });

    const F = {};
    host.innerHTML = '';
    const banner = div('drawer-error'); banner.style.display = 'none'; host.appendChild(banner);

    const woField = field(t('prod.woField'), woFk.el, true);
    const remain = div('text-muted'); remain.style.cssText = 'font-size:12px; margin-top:4px;';
    woField.appendChild(remain);
    host.appendChild(woField);
    F.workOrderId = { read: () => woFk.getValue(), field: woField, err: errSpan(woField) };
    woFk.onChange((id) => {
      const tgt = woTarget.get(id); const done = producedByWo().get(id) || 0;
      remain.textContent = (tgt != null) ? t('prod.remaining', { n: Math.max(0, tgt - done) }) : '';
    });

    F.date = input(t('field.date'), 'date', todayStr(), host);
    F.shift = select(t('field.shift'), shiftOptions(), 'Sabah', host);
    const opField = field(t('prod.operatorField'), opFk.el, false);
    host.appendChild(opField);
    F.operatorId = { read: () => opFk.getValue(), field: opField, err: errSpan(opField) };
    F.actualQuantity = input(t('prod.actualField'), 'number', '', host, true);
    F.scrapQuantity = input(t('prod.scrapField'), 'number', '', host);
    F.note = textarea(t('field.note'), host);

    const actions = div('drawer-actions'); actions.style.cssText = 'border:0; padding:8px 0 0;';
    const clearBtn = btn(t('action.clear'), 'btn-secondary', reset);
    const saveBtn = btn(t('prod.saveNew'), 'btn-primary', save);
    actions.append(clearBtn, saveBtn);
    host.appendChild(actions);

    function reset() {
      for (const k of ['actualQuantity', 'scrapQuantity', 'note']) if (F[k].inp) F[k].inp.value = '';
      clearErrors();
    }
    function clearErrors() {
      banner.style.display = 'none';
      for (const k in F) { F[k].field.classList.remove('has-error'); if (F[k].err) F[k].err.style.display = 'none'; }
    }
    async function save() {
      clearErrors();
      const body = {};
      for (const k in F) body[k] = F[k].read ? F[k].read() : F[k].inp.value;
      saveBtn.disabled = true; saveBtn.textContent = t('action.saving');
      try {
        const { data } = await api.create(body);
        toast(t('prod.savedToast', { n: data.actualQuantity, s: data.scrapQuantity }), 'success');
        entries.unshift(data);
        reset();
        renderToday();
        const tgt = woTarget.get(data.workOrderId); const done = producedByWo().get(data.workOrderId) || 0;
        if (tgt != null) remain.textContent = t('prod.remaining', { n: Math.max(0, tgt - done) });
      } catch (err) {
        if (err instanceof ValidationError) {
          for (const [k, msg] of Object.entries(err.fields)) if (F[k]) { F[k].field.classList.add('has-error'); if (F[k].err) { F[k].err.textContent = msg; F[k].err.style.display = ''; } }
        } else { banner.textContent = err instanceof ApiError ? err.message : t('err.GENERIC'); banner.style.display = ''; }
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = t('prod.saveNew');
      }
    }
  }

  function renderToday() {
    const today = todayStr();
    const list = entries.filter(e => e.date === today);
    container.querySelector('#pr-count').textContent = t('prod.count', { n: list.length });
    const host = container.querySelector('#pr-today');
    if (list.length === 0) { host.innerHTML = `<div class="panel-body text-muted">${esc(t('prod.noToday'))}</div>`; return; }
    host.innerHTML = `<table class="table"><thead><tr>
        <th>${esc(t('prod.colTime'))}</th><th>${esc(t('field.workOrderNo'))}</th><th>${esc(t('prod.operatorField'))}</th><th>${esc(t('field.quantity'))}</th><th>${esc(t('field.scrap'))}</th></tr></thead>
      <tbody>${list.map(e => `<tr>
        <td class="mono">${esc((e.updatedAt || '').slice(11, 16) || '—')}</td>
        <td>${esc(woLabel.get(e.workOrderId) || '#' + e.workOrderId)}</td>
        <td>${esc(operators.label(e.operatorId) || '—')}</td>
        <td class="mono">${e.actualQuantity}</td>
        <td class="mono">${e.scrapQuantity}</td></tr>`).join('')}</tbody></table>`;
  }
}

// --- küçük DOM yardımcıları ---
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function div(cls) { const n = document.createElement('div'); if (cls) n.className = cls; return n; }
function errSpan(fieldEl) { const s = document.createElement('span'); s.className = 'field-error'; s.style.display = 'none'; fieldEl.appendChild(s); return s; }
function field(label, controlEl, req) {
  const w = div('field');
  w.innerHTML = `<label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>`;
  w.appendChild(controlEl);
  return w;
}
function input(label, type, value, host, req) {
  const w = field(label, document.createElement('input'), req);
  const inp = w.querySelector('input'); inp.className = 'input'; inp.type = type; inp.value = value;
  if (type === 'number') inp.step = 'any';
  host.appendChild(w);
  return { inp, field: w, err: errSpan(w) };
}
function textarea(label, host) {
  const ta = document.createElement('textarea'); ta.className = 'input';
  const w = field(label, ta, false); host.appendChild(w);
  return { inp: ta, field: w, err: errSpan(w) };
}
function select(label, options, value, host) {
  const sel = document.createElement('select'); sel.className = 'input';
  for (const o of options) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; sel.appendChild(op); }
  const w = field(label, sel, false); host.appendChild(w);
  return { inp: sel, field: w, err: errSpan(w) };
}
function btn(label, kind, on) { const b = document.createElement('button'); b.className = `btn ${kind}`; b.textContent = label; b.addEventListener('click', on); return b; }
