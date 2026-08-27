// taglist.js — serbest metin çoklu giriş (or. rota varyantları). FK değil; kullanıcı
// serbest değer yazar. Enter/virgül ekler, × ya da Backspace siler. getValue() dizi döner.

import { esc } from './states.js';
import { t } from './i18n.js';

export class TagList {
  /**
   * @param {{ value?: Array, placeholder?: string, unique?: boolean }} opts
   * unique=true (varsayılan): tekrar eden değer eklenmez (varyantlar için doğru).
   * unique=false: tekrarlara İZİN verilir, sıra korunur (ölçüm değerleri — 8.88, 8.88 normal).
   */
  constructor({ value = [], placeholder = t('tag.placeholder'), unique = true } = {}) {
    this.unique = unique;
    this.tags = clean(value, unique);
    this.placeholder = placeholder;
    this.cb = null;

    this.el = document.createElement('div');
    this.el.className = 'fk';
    this.control = document.createElement('div');
    this.control.className = 'fk-control';
    this.input = document.createElement('input');
    this.input.className = 'taginput';
    this.input.placeholder = placeholder;
    this.el.appendChild(this.control);
    this.control.appendChild(this.input);   // input HEP DOM'da kalsın (render onu çıkarmaz)

    // Değeri ADD'den ÖNCE temizle: render sırasında (ya da başka nedenle) olası bir
    // blur olayı aynı değeri İKİNCİ kez eklemesin.
    const commit = () => { const v = this.input.value; this.input.value = ''; this.add(v); };
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
      else if (e.key === 'Backspace' && this.input.value === '' && this.tags.length) { this.remove(this.tags.length - 1); }
    });
    this.input.addEventListener('blur', () => { if (this.input.value.trim()) commit(); });
    this.control.addEventListener('click', () => this.input.focus());

    this.render();
  }

  onChange(cb) { this.cb = cb; return this; }
  getValue() { return this.tags.slice(); }
  setValue(v) { this.tags = clean(v, this.unique); this.render(); }
  focus() { this.input.focus(); }

  add(raw) {
    const val = String(raw).trim();
    if (!val) return;
    if (this.unique && this.tags.includes(val)) return;  // yalnızca unique modda tekrarı engelle
    this.tags.push(val);
    this.render();
    this.cb && this.cb(this.getValue());
  }
  remove(i) {
    this.tags.splice(i, 1);
    this.render();
    this.cb && this.cb(this.getValue());
  }

  render() {
    // Yalnızca çipleri yenile. Input DOM'dan ÇIKARILMAZ — çıkarılırsa (innerHTML='')
    // odaklı input blur olur, blur handler değeri ikinci kez ekler (çift ekleme bug'ı).
    this.control.querySelectorAll('.fk-chip').forEach(c => c.remove());
    this.tags.forEach((t, i) => {
      const chip = node('span', 'fk-chip', esc(t));
      const x = node('button', '', '×');
      x.type = 'button';
      x.addEventListener('click', (e) => { e.stopPropagation(); this.remove(i); });
      chip.appendChild(x);
      this.control.insertBefore(chip, this.input);   // çipler input'tan önce
    });
  }
}

function clean(v, unique) {
  const out = [];
  for (const t of (Array.isArray(v) ? v : [])) {
    const s = String(t).trim();
    if (!s) continue;
    if (unique && out.includes(s)) continue;
    out.push(s);
  }
  return out;
}
function node(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
