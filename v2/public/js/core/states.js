// states.js — yukleniyor iskeleti, bos liste, hata karti, cakisma uyarisi, onay diyalogu.
// Hepsi DOM elemani doner (olay baglamak icin); caller yerlestirir.

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/** Yukleniyor iskeleti — tablo yuksekligini korur, layout ziplamaz. */
export function skeleton(rows = 8) {
  const n = el('div', 'skeleton');
  for (let i = 0; i < rows; i++) n.appendChild(el('div', 'sk-row'));
  return n;
}

/** Bos liste — cikis yolu sunar (or. "Yeni ekle"). */
export function emptyState({ title = 'Kayıt yok', message = '', actionLabel = '', onAction = null } = {}) {
  const n = el('div', 'state');
  n.appendChild(el('div', 'state-title', esc(title)));
  if (message) n.appendChild(el('div', 'state-msg', esc(message)));
  if (actionLabel && onAction) {
    const b = el('button', 'btn btn-primary', esc(actionLabel));
    b.addEventListener('click', onAction);
    n.appendChild(b);
  }
  return n;
}

/** Hata karti — "Tekrar dene". */
export function errorState({ message = 'Bir şeyler ters gitti', onRetry = null } = {}) {
  const n = el('div', 'state error');
  n.appendChild(el('div', 'state-title', 'Hata'));
  n.appendChild(el('div', 'state-msg', esc(message)));
  if (onRetry) {
    const b = el('button', 'btn btn-secondary', 'Tekrar dene');
    b.addEventListener('click', onRetry);
    n.appendChild(b);
  }
  return n;
}

/**
 * Cakisma uyarisi (409) — fark goster (opsiyonel) + yeniden yukle.
 * onDiff verilmezse yalnizca yeniden yukle gosterilir.
 */
export function conflictState({ message = '', onReload = null, onDiff = null } = {}) {
  const n = el('div', 'state conflict');
  n.appendChild(el('div', 'state-title', 'Çakışma'));
  n.appendChild(el('div', 'state-msg',
    esc(message || 'Bu kayıt siz açtıktan sonra başkası tarafından değiştirildi.')));
  const row = el('div', 'dialog-actions');
  if (onDiff) {
    const d = el('button', 'btn btn-secondary', 'Farkı göster');
    d.addEventListener('click', onDiff);
    row.appendChild(d);
  }
  if (onReload) {
    const r = el('button', 'btn btn-primary', 'Yeniden yükle');
    r.addEventListener('click', onReload);
    row.appendChild(r);
  }
  n.appendChild(row);
  return n;
}

/**
 * Onay diyalogu (silme, kaydedilmemis degisiklik...). Promise<boolean> doner.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = 'Emin misiniz?', body = '', confirmLabel = 'Onayla', cancelLabel = 'Vazgeç', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'dialog-backdrop');
    const dlg = el('div', 'dialog');
    dlg.appendChild(el('div', 'dialog-title', esc(title)));
    if (body) dlg.appendChild(el('div', 'dialog-body', esc(body)));
    const actions = el('div', 'dialog-actions');
    const cancel = el('button', 'btn btn-secondary', esc(cancelLabel));
    const ok = el('button', 'btn ' + (danger ? 'btn-primary' : 'btn-primary'), esc(confirmLabel));
    if (danger) ok.style.cssText = 'background:var(--color-danger);border-color:var(--color-danger)';
    actions.append(cancel, ok);
    dlg.appendChild(actions);
    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    const close = (val) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey);
    ok.focus();
  });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
