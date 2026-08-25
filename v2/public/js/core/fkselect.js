// fkselect.js — FK secici. Arama kutulu, kod + ad iki kolon, klavye ile gezinme.
// 200+ sonucta "aramayi daraltin" uyarisi. Coklu secim (operator yetkinlikleri gibi).
//
// source: async () => ({ rows: [{id, code?, name}], total }). Bir kez yuklenir,
// filtreleme istemci tarafinda. total > yuklenen satirdan buyukse uyari cikar.

import { esc } from './states.js';

export class FkSelect {
  /**
   * @param {{ source: Function, multiple?: boolean, value?: any, placeholder?: string,
   *           warnAt?: number, rows?: Array, total?: number }} opts
   * source: async () => ({rows, total}) — ilk acilista yuklenir. rows onceden
   * verilirse (cagiranda zaten varsa) etiketler hemen cozulur, source cagrilmaz.
   */
  constructor({ source, multiple = false, value = null, placeholder = 'Seçin…', warnAt = 200, rows = null, total = 0 }) {
    this.source = source;
    this.multiple = multiple;
    this.placeholder = placeholder;
    this.warnAt = warnAt;
    this.rows = rows;          // yuklenene kadar null (onceden verilebilir)
    this.total = rows ? (total || rows.length) : 0;
    this.selected = new Set(toArray(value));
    this.active = -1;          // klavye ile secili filtreli indeks
    this.changeCb = null;

    this.el = document.createElement('div');
    this.el.className = 'fk';
    this.control = document.createElement('div');
    this.control.className = 'fk-control';
    this.control.tabIndex = 0;
    this.el.appendChild(this.control);

    this.control.addEventListener('click', () => this.open());
    this.control.addEventListener('keydown', (e) => {
      if (!this.pop && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) { e.preventDefault(); this.open(); }
    });
    this._onDocClick = (e) => { if (!this.el.contains(e.target)) this.close(); };

    this.renderControl();
  }

  onChange(cb) { this.changeCb = cb; return this; }
  getValue() { const a = [...this.selected]; return this.multiple ? a : (a[0] ?? null); }
  setValue(v) { this.selected = new Set(toArray(v)); this.renderControl(); }
  focus() { this.control.focus(); }

  // --- secili ozet ---
  renderControl() {
    this.control.innerHTML = '';
    if (this.selected.size === 0) {
      this.control.appendChild(node('span', 'fk-placeholder', esc(this.placeholder)));
      return;
    }
    if (this.multiple) {
      for (const id of this.selected) {
        const chip = node('span', 'fk-chip', esc(this.labelFor(id)));
        const x = node('button', '', '×');
        x.type = 'button';
        x.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(id); });
        chip.appendChild(x);
        this.control.appendChild(chip);
      }
    } else {
      this.control.appendChild(node('span', 'fk-single', esc(this.labelFor([...this.selected][0]))));
    }
  }

  labelFor(id) {
    const r = (this.rows || []).find(x => String(x.id) === String(id));
    if (!r) return '#' + id;                 // henuz yuklenmediyse id
    return [r.code, r.name].filter(Boolean).join(' · ');
  }

  // --- acilir liste ---
  async open() {
    if (this.pop) return;
    this.control.classList.add('open');
    this.pop = node('div', 'fk-pop');
    const searchWrap = node('div', 'fk-search');
    this.search = document.createElement('input');
    this.search.className = 'input';
    this.search.placeholder = 'Ara…';
    searchWrap.appendChild(this.search);
    this.pop.appendChild(searchWrap);
    this.warnEl = node('div', 'fk-warn');
    this.warnEl.style.display = 'none';
    this.pop.appendChild(this.warnEl);
    this.listEl = node('div', 'fk-list');
    this.pop.appendChild(this.listEl);
    this.el.appendChild(this.pop);

    this.search.addEventListener('input', () => this.renderList());
    this.search.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('click', this._onDocClick);

    if (this.rows === null) {
      this.listEl.innerHTML = '<div class="fk-empty">Yükleniyor…</div>';
      try {
        const { rows, total } = await this.source();
        this.rows = rows || [];
        this.total = total ?? this.rows.length;
      } catch {
        this.rows = [];
        this.listEl.innerHTML = '<div class="fk-empty">Liste alınamadı.</div>';
        return;
      }
    }
    this.renderControl();  // etiketler artik cozulebilir
    this.renderList();
    this.search.focus();
  }

  close() {
    if (!this.pop) return;
    this.pop.remove();
    this.pop = null;
    this.active = -1;
    this.control.classList.remove('open');
    document.removeEventListener('click', this._onDocClick);
  }

  filtered() {
    const q = (this.search?.value || '').trim().toLocaleLowerCase('tr');
    if (!q) return this.rows;
    return this.rows.filter(r =>
      (r.code && String(r.code).toLocaleLowerCase('tr').includes(q)) ||
      (r.name && String(r.name).toLocaleLowerCase('tr').includes(q)));
  }

  renderList() {
    const rows = this.filtered();
    // 200+ uyarisi: yuklenen satirdan fazlasi varsa (sunucu-tarafi arama yok).
    if (this.total > this.rows.length && this.total > this.warnAt) {
      this.warnEl.style.display = '';
      this.warnEl.textContent = `${this.total} kayıttan ilk ${this.rows.length} gösteriliyor — aramayı daraltın.`;
    } else {
      this.warnEl.style.display = 'none';
    }
    if (this.active >= rows.length) this.active = rows.length - 1;

    if (rows.length === 0) { this.listEl.innerHTML = '<div class="fk-empty">Sonuç yok.</div>'; return; }
    this.listEl.innerHTML = '';
    rows.forEach((r, i) => {
      const opt = node('div', 'fk-opt' + (i === this.active ? ' active' : '') +
        (this.selected.has(r.id) ? ' selected' : ''));
      opt.append(node('span', 'code', esc(r.code || '')), node('span', 'name', esc(r.name || '')));
      opt.addEventListener('mouseenter', () => { this.active = i; this.paintActive(); });
      opt.addEventListener('click', () => this.pick(r.id));
      this.listEl.appendChild(opt);
    });
  }

  paintActive() {
    [...this.listEl.children].forEach((c, i) => c.classList.toggle('active', i === this.active));
  }

  onKey(e) {
    const rows = this.filtered();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active = Math.min(this.active + 1, rows.length - 1); this.paintActive(); this.scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active = Math.max(this.active - 1, 0); this.paintActive(); this.scrollActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[this.active]) this.pick(rows[this.active].id); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(); this.control.focus(); }
  }

  scrollActive() {
    this.listEl.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  pick(id) {
    if (this.multiple) { this.toggle(id); }
    else { this.selected = new Set([id]); this.emit(); this.renderControl(); this.close(); this.control.focus(); }
  }

  toggle(id) {
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    this.emit();
    this.renderControl();
    if (this.pop) this.renderList();
  }

  emit() { this.changeCb && this.changeCb(this.getValue()); }
}

function toArray(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.slice() : [v];
}
function node(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
