// Katlanabilir blueprint paneli — ortak bileşen.
// Başlık tıklanınca (veya Enter/Space) açılıp kapanır; katlama durumu localStorage'da
// saklanır. Kutu: hairline kenar + dört köşe aksan registration işareti (v2 blueprint).
// Makine Durumu ve Veri Kontrolü Uyarıları bu bileşeni paylaşır; ileride başka ekranlar da.

import { esc } from './states.js';

const LS_PREFIX = 'ozmel.collapse.';

// Katlanmış mı? Kayıt yoksa defaultCollapsed döner ('1' = kapalı, '0' = açık).
export function isCollapsed(key, defaultCollapsed = true) {
  const v = localStorage.getItem(LS_PREFIX + key);
  return v === null ? defaultCollapsed : v === '1';
}
function setCollapsed(key, val) { localStorage.setItem(LS_PREFIX + key, val ? '1' : '0'); }

// Katlanabilir panel düğümü döndürür.
//   key              : localStorage anahtarı (LS_PREFIX otomatik eklenir)
//   title            : başlık (düz metin — esc'lenir)
//   metaHTML         : başlıkta, başlığın sağında satır içi HTML (özet). Güvenli üretilmeli.
//   rightHTML        : başlıkta sağa yaslı HTML (rozet/durum). Güvenli üretilmeli.
//   defaultCollapsed : ilk açılışta kapalı mı (varsayılan true)
//   body             : () => Node | string — YALNIZCA açıkken çağrılır (tembel üretim)
//   onToggle         : () => void — katlama değişince çağrılır (çağıranın render'ı)
export function collapsiblePanel({ key, title, metaHTML = '', rightHTML = '', defaultCollapsed = true, body, onToggle }) {
  const collapsed = isCollapsed(key, defaultCollapsed);

  const panel = document.createElement('div');
  panel.className = 'cpanel';
  panel.innerHTML =
    `<span class="mreg tl"></span><span class="mreg tr"></span><span class="mreg bl"></span><span class="mreg br"></span>
     <div class="cpanel-head" role="button" tabindex="0" aria-expanded="${collapsed ? 'false' : 'true'}">
       <span class="cpanel-caret">${collapsed ? '▸' : '▾'}</span>
       <h3>${esc(title)}</h3>
       ${metaHTML ? `<span class="cpanel-meta">${metaHTML}</span>` : ''}
       ${rightHTML ? `<span class="cpanel-right">${rightHTML}</span>` : ''}
     </div>`;

  if (!collapsed && body != null) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'cpanel-body';
    const content = typeof body === 'function' ? body() : body;
    if (content instanceof Node) bodyEl.appendChild(content);
    else bodyEl.innerHTML = String(content ?? '');
    panel.appendChild(bodyEl);
  }

  const head = panel.querySelector('.cpanel-head');
  const toggle = () => { setCollapsed(key, !collapsed); if (onToggle) onToggle(); };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  return panel;
}
