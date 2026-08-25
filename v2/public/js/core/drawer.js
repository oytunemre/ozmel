// drawer.js — yan panel form. Alan tanimindan form uretir, kaydeder, dogrulama
// hatalarini alan altinda gosterir. Kaydedilmemis degisiklik varken kapatilmaya
// calisilirsa onay sorar.
//
// Alan tipleri: text, number, date, time, textarea, select ({options:[{value,label}]}),
// bool (Evet/Hayir), fk ({fk: FkSelect ornegi}).

import { ValidationError, ConflictError, ApiError } from './api.js';
import { choiceDialog, esc } from './states.js';

/**
 * @param {{
 *   title: string,
 *   fields: Array,
 *   values?: object,
 *   submitLabel?: string,
 *   onSubmit: (values:object) => Promise<any>,   // ValidationError/ConflictError firlatabilir
 *   onSaved?: (saved:any) => void,               // basarili kayit + kapanis sonrasi
 *   onClose?: () => void                         // her kapanista (kaydetsin ya da vazgecsin)
 * }} opts
 * @returns {{ close: Function, el: HTMLElement }}
 */
export function openDrawer(opts) {
  const { title, fields, values = {}, submitLabel = 'Kaydet', onSubmit, onSaved, onClose } = opts;
  let dirty = false;

  const backdrop = h('div', 'drawer-backdrop');
  const drawer = h('div', 'drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');

  // --- baslik ---
  const head = h('div', 'drawer-head');
  head.appendChild(h('div', 'drawer-title', esc(title)));
  const closeX = h('button', 'btn btn-ghost', '×');
  head.appendChild(closeX);
  drawer.appendChild(head);

  // --- govde: alanlar ---
  const bodyEl = h('div', 'drawer-body');
  const banner = h('div', 'drawer-error');
  banner.style.display = 'none';
  bodyEl.appendChild(banner);

  const controls = {};   // name -> { read(), setError(msg), clearError(), fieldEl }
  const forceShow = new Set();  // showIf ile gizliyken sunucu hatasi alan alanlar gorunur kalir
  const form = h('form');
  for (const f of fields) {
    const ctl = buildField(f, values[f.name], onFieldChange, form);
    controls[f.name] = ctl;
    form.appendChild(ctl.fieldEl);   // alanı forma ekle (yoksa panel boş açılır)
  }
  bodyEl.appendChild(form);
  drawer.appendChild(bodyEl);
  applyVisibility();  // tipe bagli (showIf) alanlarin ilk gorunurlugu

  // Panel açılır açılmaz tüm FK kaynaklarını ön-yükle: kullanıcı seçiciyi açtığında
  // liste dolu olsun (yarış durumu yok). ensureLoaded dedup'lı — tekrar istek atmaz.
  for (const f of fields) if (f.type === 'fk') f.fk?.ensureLoaded?.();

  // --- aksiyonlar ---
  const actions = h('div', 'drawer-actions');
  const cancelBtn = h('button', 'btn btn-secondary', 'Vazgeç');
  const saveBtn = h('button', 'btn btn-primary', esc(submitLabel));
  actions.append(cancelBtn, saveBtn);
  drawer.appendChild(actions);

  backdrop.appendChild(drawer);
  document.body.appendChild(backdrop);

  // ilk alani odakla
  const firstInput = form.querySelector('input, textarea, select, .fk-control');
  firstInput?.focus();

  function onFieldChange() { dirty = true; applyVisibility(); }

  /** Anlik alan degerleri (showIf icin). Bolum alanlari (section) atlanir. */
  function currentValues() {
    const v = {};
    for (const f of fields) if (f.type !== 'section') v[f.name] = controls[f.name].read();
    return v;
  }

  /** showIf'e gore alanlari goster/gizle. forceShow'daki alanlar (hatali) gorunur kalir. */
  function applyVisibility() {
    const v = currentValues();
    for (const f of fields) {
      if (!f.showIf) continue;
      const show = forceShow.has(f.name) || f.showIf(v);
      controls[f.name].fieldEl.style.display = show ? '' : 'none';
    }
  }

  function collect() {
    const out = {};
    // Gizli alanlar da GONDERILIR: tip degisince eski olcu degerleri kalirsa
    // sunucu 422 dondurur ve bunu gostermek isteriz (alanlar temizlenene kadar).
    for (const f of fields) if (f.type !== 'section') out[f.name] = controls[f.name].read();
    // Eszamanlilik: mevcut kaydin updatedAt'i degismeden geri gonderilir.
    if (values.updatedAt != null) out.updatedAt = values.updatedAt;
    return out;
  }

  function clearErrors() {
    banner.style.display = 'none';
    banner.textContent = '';
    forceShow.clear();
    for (const name in controls) controls[name].clearError();
    applyVisibility();
  }

  async function submit() {
    clearErrors();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Kaydediliyor…';
    try {
      const saved = await onSubmit(collect());
      dirty = false;
      teardown();
      onSaved && onSaved(saved);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = submitLabel;
      if (err instanceof ValidationError) {
        let firstBad = null;
        for (const [name, msg] of Object.entries(err.fields)) {
          if (controls[name]) {
            controls[name].setError(msg);
            forceShow.add(name);   // showIf ile gizliyse bile hatayi gorunur kil
            firstBad = firstBad || controls[name];
          }
        }
        applyVisibility();   // hatali gizli alanlar (or. tip degisince olculer) ortaya cikar
        // Hangi alana ait olmayan hatalar banner'a.
        const unknown = Object.entries(err.fields).filter(([n]) => !controls[n]).map(([, m]) => m);
        const bannerMsg = unknown.length ? unknown.join(' · ') : (Object.keys(err.fields).length ? '' : err.message);
        if (bannerMsg) showBanner(bannerMsg);
        firstBad?.focus?.();
      } else if (err instanceof ConflictError) {
        showBanner(err.message + ' — paneli kapatıp listeyi yenileyin.');
      } else {
        showBanner((err instanceof ApiError ? err.message : 'Beklenmeyen hata') || 'Kaydedilemedi');
      }
    }
  }

  function showBanner(msg) { banner.textContent = msg; banner.style.display = ''; }

  // Kapatmanin TEK yolu. Dort kapatma tetikleyicisi de (X, Vazgeç, backdrop, Esc)
  // buradan gecer; kaydedilmemis degisiklik varsa uc secenekli onay sorar.
  let closing = false;
  async function requestClose() {
    if (closing) return;              // ust uste tetiklenmeyi engelle (or. Esc x2)
    if (!dirty) { teardown(); return; }

    closing = true;
    const choice = await choiceDialog({
      title: 'Kaydedilmemiş değişiklikler',
      body: 'Bu panelde kaydedilmemiş değişiklikler var. Ne yapmak istersiniz?',
      choices: [
        { value: 'save', label: 'Kaydet', kind: 'primary' },
        { value: 'discard', label: 'Kaydetme', kind: 'danger' },
        { value: 'cancel', label: 'İptal' }
      ]
    });
    closing = false;

    if (choice === 'save') submit();          // basariliysa submit() kendisi kapatir
    else if (choice === 'discard') teardown(); // degisiklikleri at, kapat
    // 'cancel' / null -> panelde kal
  }

  function teardown() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose && onClose();
  }

  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); requestClose(); } }

  saveBtn.addEventListener('click', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  cancelBtn.addEventListener('click', requestClose);
  closeX.addEventListener('click', requestClose);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) requestClose(); });
  document.addEventListener('keydown', onKey);

  return { close: teardown, el: drawer };
}

// --- tek alan kurulumu ---
function buildField(f, value, markDirty, form) {
  // Bolum basligi — girdi degil, formu gruplar. read() deger uretmez.
  if (f.type === 'section') {
    const sec = h('div', 'form-section');
    sec.appendChild(h('h4', '', esc(f.label)));
    if (f.help) sec.appendChild(h('small', 'text-muted', esc(f.help)));
    return { fieldEl: sec, read: () => undefined, setError() {}, clearError() {}, focus() {} };
  }

  const wrap = h('div', 'field');
  const label = h('label', '', esc(f.label));
  if (f.required) label.insertAdjacentHTML('beforeend', ' <span class="req">*</span>');
  wrap.appendChild(label);

  let read;
  if (f.type === 'fk') {
    const fk = f.fk;
    if (value != null) fk.setValue(value);
    fk.onChange(markDirty);
    wrap.appendChild(fk.el);
    read = () => fk.getValue();
  } else if (f.type === 'tags') {
    const tl = f.tags;
    if (value != null) tl.setValue(value);
    tl.onChange(markDirty);
    wrap.appendChild(tl.el);
    read = () => tl.getValue();
  } else if (f.type === 'component') {
    // Modülün sağladığı özel alt-editör: { el, getValue(), setValue?(), onChange?() }.
    const c = f.component;
    if (value != null && c.setValue) c.setValue(value);
    c.onChange?.(markDirty);
    wrap.appendChild(c.el);
    read = () => c.getValue();
  } else if (f.type === 'bool') {
    const seg = h('div', 'seg');
    const cur = value ? '1' : '0';
    for (const [v, lbl] of [['1', 'Evet'], ['0', 'Hayır']]) {
      const opt = h('label', 'seg-opt', esc(lbl));
      opt.insertAdjacentHTML('afterbegin',
        `<input type="radio" name="${esc(f.name)}" value="${v}"${v === cur ? ' checked' : ''}>`);
      seg.appendChild(opt);
    }
    seg.addEventListener('change', markDirty);
    wrap.appendChild(seg);
    read = () => Number(form.querySelector(`input[name="${cssEsc(f.name)}"]:checked`)?.value ?? 0);
  } else if (f.type === 'select') {
    const sel = h('select', 'input');
    for (const o of (f.options || [])) {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      if (String(value ?? '') === String(o.value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', markDirty);
    wrap.appendChild(sel);
    read = () => sel.value;
  } else if (f.type === 'textarea') {
    const ta = h('textarea', 'input');
    ta.value = value ?? '';
    ta.addEventListener('input', markDirty);
    wrap.appendChild(ta);
    read = () => ta.value.trim();   // baştaki/sondaki boşlukları kırp
  } else {
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = f.type || 'text';
    if (f.placeholder) inp.placeholder = f.placeholder;
    if (f.type === 'number' && f.step) inp.step = f.step;
    inp.value = value ?? '';
    inp.addEventListener('input', markDirty);
    wrap.appendChild(inp);
    read = () => inp.value.trim();   // baştaki/sondaki boşlukları kırp
  }

  if (f.help) wrap.appendChild(h('small', 'text-muted', esc(f.help)));
  const errEl = h('span', 'field-error');
  errEl.style.display = 'none';
  wrap.appendChild(errEl);

  return {
    read,
    fieldEl: wrap,
    focus: () => wrap.querySelector('input, textarea, select, .fk-control')?.focus(),
    setError: (msg) => { wrap.classList.add('has-error'); errEl.textContent = msg; errEl.style.display = ''; },
    clearError: () => { wrap.classList.remove('has-error'); errEl.textContent = ''; errEl.style.display = 'none'; }
  };
}

function h(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
