// taglist.js — serbest metin çoklu giriş (or. rota varyantları). FK değil; kullanıcı
// serbest değer yazar. Enter/virgül ekler, × ya da Backspace siler. getValue() dizi döner.

import { esc } from './states.js';

export class TagList {
  constructor({ value = [], placeholder = 'Yaz ve Enter…' } = {}) {
    this.tags = dedupe(value);
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

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.add(this.input.value); this.input.value = ''; }
      else if (e.key === 'Backspace' && this.input.value === '' && this.tags.length) { this.remove(this.tags.length - 1); }
    });
    this.input.addEventListener('blur', () => { if (this.input.value.trim()) { this.add(this.input.value); this.input.value = ''; } });
    this.control.addEventListener('click', () => this.input.focus());

    this.render();
  }

  onChange(cb) { this.cb = cb; return this; }
  getValue() { return this.tags.slice(); }
  setValue(v) { this.tags = dedupe(v); this.render(); }
  focus() { this.input.focus(); }

  add(raw) {
    const val = String(raw).trim();
    if (!val || this.tags.includes(val)) return;
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
    this.control.innerHTML = '';
    this.tags.forEach((t, i) => {
      const chip = node('span', 'fk-chip', esc(t));
      const x = node('button', '', '×');
      x.type = 'button';
      x.addEventListener('click', (e) => { e.stopPropagation(); this.remove(i); });
      chip.appendChild(x);
      this.control.appendChild(chip);
    });
    this.control.appendChild(this.input);
  }
}

function dedupe(v) {
  const out = [];
  for (const t of (Array.isArray(v) ? v : [])) {
    const s = String(t).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
function node(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
