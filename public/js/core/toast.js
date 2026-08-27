// toast.js — kaydetme sonrasi bildirim + satir vurgusu.

let host;
function hostEl() {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Gecici bildirim.
 * @param {string} message
 * @param {'success'|'danger'|''} type
 * @param {number} ms
 */
export function toast(message, type = '', ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  hostEl().appendChild(el);

  const kill = () => {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 320);
  };
  const timer = setTimeout(kill, ms);
  el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return el;
}

/** Bir tablo satirini kisa sure vurgular (kaydetme sonrasi "iste burada"). */
export function flashRow(rowEl) {
  if (!rowEl) return;
  rowEl.classList.remove('flash');
  void rowEl.offsetWidth; // reflow — animasyonu yeniden tetikle
  rowEl.classList.add('flash');
  setTimeout(() => rowEl.classList.remove('flash'), 1700);
}
