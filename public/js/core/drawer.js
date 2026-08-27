// drawer.js — yan panel form. Alan tanimindan form uretir, kaydeder, dogrulama
// hatalarini alan altinda gosterir. Kaydedilmemis degisiklik varken kapatilmaya
// calisilirsa onay sorar.
//
// Alan tipleri: text, number, date, time, textarea, select ({options:[{value,label}]}),
// bool (Evet/Hayir), fk ({fk: FkSelect ornegi}), password (goster/gizle dugmeli;
// varsayilan gizli, panel kapaninca temizlenir), phone (TR canli bicim; DB'ye yalniz rakam).

import { ValidationError, ConflictError, ApiError } from './api.js';
import { choiceDialog, esc } from './states.js';
import { formatPhone, normalizePhone, attachPhoneFormat } from './phone.js';
import { t, onLangChange } from './i18n.js';

// Etiketler string ya da () => string olabilir — canlı dil değişiminde yeniden çözülür.
const lbl = (v) => (typeof v === 'function' ? v() : (v ?? ''));

// Lucide eye / eye-off — sifre goster/gizle dugmesi (tasarim sisteminde mevcut ikonlar).
const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

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
  const { title, fields, values = {}, submitLabel = () => t('action.save'), onSubmit, onSaved, onClose } = opts;
  let dirty = false;

  const backdrop = h('div', 'drawer-backdrop');
  const drawer = h('div', 'drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');

  // --- baslik ---
  const head = h('div', 'drawer-head');
  const titleEl = h('div', 'drawer-title', esc(lbl(title)));
  head.appendChild(titleEl);
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
  const cancelBtn = h('button', 'btn btn-secondary', esc(t('action.cancel')));
  const saveBtn = h('button', 'btn btn-primary', esc(lbl(submitLabel)));
  actions.append(cancelBtn, saveBtn);
  drawer.appendChild(actions);

  // Dil değişince ETİKETLER güncellenir; form DEĞERLERİ korunur (yalnızca metin değişir).
  const unsubLang = onLangChange(() => {
    titleEl.textContent = lbl(title);
    cancelBtn.textContent = t('action.cancel');
    if (!saveBtn.disabled) saveBtn.textContent = lbl(submitLabel);   // "Kaydediliyor…" sırasında dokunma
    for (const name in controls) controls[name].relabel?.();
  });

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
    saveBtn.textContent = t('action.saving');
    try {
      const saved = await onSubmit(collect());
      dirty = false;
      teardown();
      onSaved && onSaved(saved);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = lbl(submitLabel);
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
        // 422 alan mesajları api.js'te GENELE indiriliyor (çeviri); alan yoksa genel banner.
        const bannerMsg = unknown.length ? unknown.join(' · ') : (Object.keys(err.fields).length ? '' : (err.message || t('err.VALIDATION')));
        if (bannerMsg) showBanner(bannerMsg);
        firstBad?.focus?.();
      } else if (err instanceof ConflictError) {
        showBanner(err.message || t('err.STALE'));
      } else {
        showBanner((err instanceof ApiError ? err.message : '') || t('err.GENERIC'));
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
      title: t('drawer.unsavedTitle'),
      body: t('drawer.unsavedBody'),
      choices: [
        { value: 'save', label: t('action.save'), kind: 'primary' },
        { value: 'discard', label: t('drawer.discard'), kind: 'danger' },
        { value: 'cancel', label: t('action.cancel') }
      ]
    });
    closing = false;

    if (choice === 'save') submit();          // basariliysa submit() kendisi kapatir
    else if (choice === 'discard') teardown(); // degisiklikleri at, kapat
    // 'cancel' / null -> panelde kal
  }

  function teardown() {
    document.removeEventListener('keydown', onKey);
    unsubLang();   // dil aboneliğini bırak (leak yok)
    // Hassas alanları (şifre) kapanışta temizle — DOM kalkacak olsa da değer sızmasın.
    for (const name in controls) controls[name].clear?.();
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
    const h4 = h('h4', '', esc(lbl(f.label)));
    sec.appendChild(h4);
    const secHelp = f.help ? h('small', 'text-muted', esc(lbl(f.help))) : null;
    if (secHelp) sec.appendChild(secHelp);
    const relabel = () => { h4.textContent = lbl(f.label); if (secHelp) secHelp.textContent = lbl(f.help); };
    return { fieldEl: sec, read: () => undefined, relabel, setError() {}, clearError() {}, focus() {} };
  }

  const wrap = h('div', 'field');
  const label = h('label', '');
  const paintLabel = () => { label.innerHTML = esc(lbl(f.label)) + (f.required ? ' <span class="req">*</span>' : ''); };
  paintLabel();
  wrap.appendChild(label);

  let read, clear, phInput = null;   // phInput: placeholder'ı çevrilecek input (varsa)
  let extraRelabel = null;           // tipe özel canlı çeviri (bool Evet/Hayır, password ipuçları)
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
    const boolSpans = [];   // [span, i18nKey] — canlı dil değişiminde güncellenir
    for (const [v, key] of [['1', 'common.yes'], ['0', 'common.no']]) {
      const opt = h('label', 'seg-opt');
      opt.innerHTML = `<input type="radio" name="${esc(f.name)}" value="${v}"${v === cur ? ' checked' : ''}> `;
      const span = document.createElement('span');
      span.textContent = t(key);
      opt.appendChild(span);
      boolSpans.push([span, key]);
      seg.appendChild(opt);
    }
    seg.addEventListener('change', markDirty);
    wrap.appendChild(seg);
    extraRelabel = () => { for (const [span, key] of boolSpans) span.textContent = t(key); };
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
  } else if (f.type === 'password') {
    // Göster/gizle düğmeli şifre alanı. Varsayılan gizli; panel kapanınca temizlenir.
    const pw = h('div', 'pw-wrap');
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = 'password';
    inp.autocomplete = f.autocomplete || 'new-password';
    if (f.placeholder) inp.placeholder = f.placeholder;
    inp.value = value ?? '';
    inp.addEventListener('input', markDirty);
    const toggle = h('button', 'pw-toggle');
    toggle.type = 'button';
    const paint = () => {
      const shown = inp.type === 'text';
      toggle.innerHTML = shown ? EYE_OFF_SVG : EYE_SVG;
      toggle.setAttribute('aria-label', shown ? t('common.hidePassword') : t('common.showPassword'));
      toggle.title = shown ? t('action.hide') : t('action.show');
    };
    toggle.addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      paint();
      inp.focus();
    });
    paint();
    extraRelabel = paint;   // dil değişince aria-label/title güncellensin
    pw.append(inp, toggle);
    wrap.appendChild(pw);
    read = () => inp.value;   // şifre KIRPILMAZ — boşluk anlamlı olabilir
    clear = () => { inp.value = ''; inp.type = 'password'; paint(); };
  } else if (f.type === 'phone') {
    // Telefon alanı — canlı biçimlenir (+90 532 616 40 15), DB'ye yalnız rakam gider.
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = 'tel';
    inp.autocomplete = 'tel';
    inp.inputMode = 'tel';
    inp.placeholder = lbl(f.placeholder) || '+90 5xx xxx xx xx';
    if (f.placeholder) phInput = inp;
    inp.value = formatPhone(value ?? '');   // saklanan haneyi biçimli göster
    inp.addEventListener('input', markDirty);
    attachPhoneFormat(inp);                  // canlı biçimlendirme
    wrap.appendChild(inp);
    read = () => normalizePhone(inp.value);  // yalnız rakam (TR 90 önekli)
  } else {
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = f.type || 'text';
    if (f.placeholder) { inp.placeholder = lbl(f.placeholder); phInput = inp; }
    if (f.type === 'number' && f.step) inp.step = f.step;
    inp.value = value ?? '';
    inp.addEventListener('input', markDirty);
    wrap.appendChild(inp);
    read = () => inp.value.trim();   // baştaki/sondaki boşlukları kırp
  }

  const helpEl = f.help ? h('small', 'text-muted', esc(lbl(f.help))) : null;
  if (helpEl) wrap.appendChild(helpEl);
  const errEl = h('span', 'field-error');
  errEl.style.display = 'none';
  wrap.appendChild(errEl);

  return {
    read,
    clear,   // yalnızca password alanında tanımlı; panel kapanınca çağrılır
    fieldEl: wrap,
    // Dil değişiminde etiket/yardım/placeholder yenilenir; input DEĞERİNE dokunulmaz.
    relabel: () => {
      paintLabel();
      if (helpEl) helpEl.textContent = lbl(f.help);
      if (phInput && f.placeholder) phInput.placeholder = lbl(f.placeholder);
      extraRelabel?.();   // bool Evet/Hayır, password göster/gizle ipuçları
    },
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
