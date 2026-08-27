// Üretim Girişi — v2 modülü. Tasarım: Uretim-Girisi.dc.html.
// Sol: "Yeni Giriş" formu; sağ: "Bugünkü Girişler" listesi. Vardiya sonu giriş ekranı.

import { resource, ValidationError, ApiError } from '../core/api.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct } from '../core/lookups.js';

const api = resource('production');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const SHIFTS = [
  { value: 'Sabah', label: 'Sabah' },
  { value: 'Öğleden Sonra', label: 'Öğleden Sonra' },
  { value: 'Mesai', label: 'Mesai' }
];

export async function viewProduction(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
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

  // NOT: render()'dan ÖNCE tanımlanmalı — renderForm() bunu kullanıyor; const olduğu
  // için sonra tanımlanırsa "temporal dead zone" ReferenceError'ı verir (panel boş kalır).
  const woSource = async () => ({ rows: woRows, total: woRows.length });

  render();

  function render() {
    container.innerHTML = `
      <div class="module-head"><div>
        <h2>Üretim Girişi</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">Vardiya sonunda iş emri başına üretilen ve fire adedi girilir</div>
      </div></div>
      <div class="split">
        <div class="panel"><div class="panel-head">Yeni Giriş</div><div class="panel-body" id="pr-form"></div></div>
        <div class="panel">
          <div class="panel-head">Bugünkü Girişler <span class="sub" id="pr-count"></span></div>
          <div id="pr-today"></div>
        </div>
      </div>`;
    renderForm();
    renderToday();
  }

  function renderForm() {
    const host = container.querySelector('#pr-form');
    if (!canWrite) { host.innerHTML = '<div class="text-muted">Giriş için düzenleme yetkisi gerekiyor.</div>'; return; }

    const woFk = new FkSelect({ source: woSource, rows: woRows, placeholder: 'İş emri seçin…' });
    const opFk = new FkSelect({ source: operators.source, rows: operators.rows, placeholder: 'Operatör seçin…' });

    const F = {};
    host.innerHTML = '';
    const banner = div('drawer-error'); banner.style.display = 'none'; host.appendChild(banner);

    // İş emri + kalan hedef
    const woField = field('İş emri', woFk.el, true);
    const remain = div('text-muted'); remain.style.cssText = 'font-size:12px; margin-top:4px;';
    woField.appendChild(remain);
    host.appendChild(woField);
    F.workOrderId = { read: () => woFk.getValue(), field: woField, err: errSpan(woField) };
    woFk.onChange((id) => {
      const t = woTarget.get(id); const done = producedByWo().get(id) || 0;
      remain.textContent = (t != null) ? `Kalan hedef: ${Math.max(0, t - done)} adet` : '';
    });

    // Tarih + Vardiya
    F.date = input('Tarih', 'date', todayStr(), host);
    F.shift = select('Vardiya', SHIFTS, 'Sabah', host);
    // Operatör
    const opField = field('Operatör', opFk.el, false);
    host.appendChild(opField);
    F.operatorId = { read: () => opFk.getValue(), field: opField, err: errSpan(opField) };
    // Üretilen + Fire
    F.actualQuantity = input('Üretilen adet', 'number', '', host, true);
    F.scrapQuantity = input('Fire adet', 'number', '', host);
    F.note = textarea('Not', host);

    const actions = div('drawer-actions'); actions.style.cssText = 'border:0; padding:8px 0 0;';
    const clearBtn = btn('Temizle', 'btn-secondary', reset);
    const saveBtn = btn('Kaydet ve yeni', 'btn-primary', save);
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
      saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor…';
      try {
        const { data } = await api.create(body);
        toast(`Giriş kaydedildi · ${data.actualQuantity} adet · ${data.scrapQuantity} fire`, 'success');
        entries.unshift(data);
        reset();
        renderToday();
        // kalan hedefi güncelle
        const t = woTarget.get(data.workOrderId); const done = producedByWo().get(data.workOrderId) || 0;
        if (t != null) remain.textContent = `Kalan hedef: ${Math.max(0, t - done)} adet`;
      } catch (err) {
        if (err instanceof ValidationError) {
          for (const [k, msg] of Object.entries(err.fields)) if (F[k]) { F[k].field.classList.add('has-error'); if (F[k].err) { F[k].err.textContent = msg; F[k].err.style.display = ''; } }
        } else { banner.textContent = err instanceof ApiError ? err.message : 'Kaydedilemedi'; banner.style.display = ''; }
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = 'Kaydet ve yeni';
      }
    }
  }

  function renderToday() {
    const today = todayStr();
    const list = entries.filter(e => e.date === today);
    container.querySelector('#pr-count').textContent = `${list.length} kayıt`;
    const host = container.querySelector('#pr-today');
    if (list.length === 0) { host.innerHTML = '<div class="panel-body text-muted">Bugün henüz giriş yok.</div>'; return; }
    host.innerHTML = `<table class="table"><thead><tr>
        <th>Saat</th><th>İş Emri</th><th>Operatör</th><th>Adet</th><th>Fire</th></tr></thead>
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
