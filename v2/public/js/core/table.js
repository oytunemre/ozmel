// table.js — liste bileseni. Sutun tanimindan tablo uretir; arama + sayfalama +
// satir aksiyonlari (Duzenle/Sil). Salt okuma kullanicida aksiyonlar devre disi + ipucu.
//
// Veriyi bir kez `load()` ile alir; arama ve sayfalama ISTEMCI tarafinda (backend
// arama parametresi almiyor; master tablolar kucuk). reload() cache'i tazeler.

import { skeleton, emptyState, errorState, esc } from './states.js';
import { flashRow } from './toast.js';

const READONLY_HINT = 'Salt okuma yetkiniz var — değişiklik yapamazsınız';

export class DataTable {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   title: string,
   *   columns: Array<{key?:string, label:string, render?:Function, className?:string}>,
   *   load: () => Promise<Array>,
   *   rowId?: Function, pageSize?: number, searchable?: boolean,
   *   searchText?: (row)=>string, canWrite?: boolean,
   *   addLabel?: string, onAdd?: Function, onEdit?: Function, onDelete?: Function,
   *   emptyMessage?: string
   * }} opts
   */
  constructor(container, opts) {
    this.c = container;
    this.o = Object.assign({
      rowId: (r) => r.id, pageSize: 50, searchable: true, canWrite: true,
      searchText: (r) => Object.values(r).join(' ')
    }, opts);
    this.all = null;
    this.search = '';
    this.page = 1;
    this.activeId = null;
    this.render();
  }

  async render() {
    this.c.innerHTML = '';
    this.c.appendChild(this.head());
    if (this.o.searchable) this.c.appendChild(this.toolbar());
    this.body = document.createElement('div');
    this.c.appendChild(this.body);

    this.body.appendChild(skeleton(8));
    if (this.all === null) {
      try { this.all = await this.o.load(); }
      catch (err) {
        this.body.innerHTML = '';
        this.body.appendChild(errorState({ message: err.message, onRetry: () => this.reload() }));
        return;
      }
    }
    this.paint();
  }

  /** Sunucudan tazeler (create/update/delete sonrasi). */
  async reload() { this.all = null; await this.render(); }

  markActive(id) {
    this.activeId = id == null ? null : String(id);
    this.body?.querySelectorAll('tbody tr').forEach(tr =>
      tr.classList.toggle('is-active', tr.dataset.id === this.activeId));
  }

  flash(id) {
    const tr = this.body?.querySelector(`tbody tr[data-id="${cssEsc(String(id))}"]`);
    flashRow(tr);
  }

  // --- parcalar ---
  head() {
    const head = el('div', 'module-head');
    const left = el('div');
    left.appendChild(el('h2', '', esc(this.o.title)));
    if (this.o.subtitle) {
      const sub = el('div', 'text-muted', esc(this.o.subtitle));
      sub.style.cssText = 'font-size:13.5px; margin-top:6px;';
      left.appendChild(sub);
    }
    head.appendChild(left);
    this.addBtn = null;
    if (this.o.addLabel && this.o.onAdd) {
      const b = el('button', 'btn btn-primary', esc(this.o.addLabel));
      if (!this.o.canWrite) { b.disabled = true; b.title = READONLY_HINT; }
      else b.addEventListener('click', () => this.o.onAdd());
      head.appendChild(b);
      this.addBtn = b;
    }
    return head;
  }

  toolbar() {
    const bar = el('div', 'toolbar');
    const wrap = el('div', 'search');
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = 'search';
    inp.placeholder = 'Ara…';
    inp.value = this.search;
    let t;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { this.search = inp.value; this.page = 1; this.paint(); }, 180);
    });
    wrap.appendChild(inp);
    bar.appendChild(wrap);
    return bar;
  }

  filtered() {
    const q = this.search.trim().toLocaleLowerCase('tr');
    if (!q) return this.all;
    return this.all.filter(r => this.o.searchText(r).toLocaleLowerCase('tr').includes(q));
  }

  paint() {
    this.body.innerHTML = '';
    const rows = this.filtered();

    // Liste TAMAMEN boşken sağ üstteki ekleme butonunu gizle — boş hal kartındaki
    // buton (daha görünür, yönlendirici) yeterli. Arama sonucu boşsa (kayıt var)
    // üstteki buton kalır.
    if (this.addBtn) this.addBtn.style.display = this.all.length === 0 ? 'none' : '';

    if (rows.length === 0) {
      this.body.appendChild(this.all.length === 0
        ? emptyState({
            title: 'Kayıt yok',
            message: this.o.emptyMessage || 'Henüz kayıt eklenmemiş.',
            actionLabel: this.o.canWrite ? this.o.addLabel : '',
            onAction: this.o.canWrite ? this.o.onAdd : null
          })
        : emptyState({ title: 'Sonuç yok', message: `"${this.search}" ile eşleşen kayıt yok.` }));
      return;
    }

    const pageSize = this.o.pageSize;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (this.page > pages) this.page = pages;
    const start = (this.page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);
    const hasActions = this.o.onEdit || this.o.onDelete;

    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `<thead><tr>${
      this.o.columns.map(c => `<th>${esc(c.label)}</th>`).join('')
    }${hasActions ? '<th></th>' : ''}</tr></thead>`;

    const tbody = document.createElement('tbody');
    for (const row of slice) {
      const tr = document.createElement('tr');
      tr.dataset.id = String(this.o.rowId(row));
      if (tr.dataset.id === this.activeId) tr.classList.add('is-active');
      for (const col of this.o.columns) {
        const td = document.createElement('td');
        if (col.className) td.className = col.className;
        if (col.render) td.innerHTML = col.render(row);
        else td.textContent = row[col.key] ?? '';
        tr.appendChild(td);
      }
      if (hasActions) tr.appendChild(this.actionsCell(row));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    this.body.appendChild(wrap);
    this.body.appendChild(this.pager(rows.length, start, slice.length, pages));
  }

  actionsCell(row) {
    const td = el('td', 'actions');
    if (this.o.onEdit) td.appendChild(this.actionBtn('Düzenle', 'btn-ghost', () => this.o.onEdit(row)));
    if (this.o.onDelete) td.appendChild(this.actionBtn('Sil', 'btn-danger', () => this.o.onDelete(row)));
    return td;
  }

  actionBtn(label, kind, on) {
    const b = el('button', `btn ${kind} btn-sm`, esc(label));
    if (!this.o.canWrite) { b.disabled = true; b.title = READONLY_HINT; }
    else b.addEventListener('click', on);
    return b;
  }

  pager(total, start, shown, pages) {
    const p = el('div', 'pager');
    p.appendChild(el('span', 'text-muted',
      total ? `${start + 1}–${start + shown} / ${total}` : '0'));
    p.appendChild(el('span', 'grow'));
    const prev = el('button', 'btn btn-secondary btn-sm', '‹ Önceki');
    const next = el('button', 'btn btn-secondary btn-sm', 'Sonraki ›');
    prev.disabled = this.page <= 1;
    next.disabled = this.page >= pages;
    prev.addEventListener('click', () => { this.page--; this.paint(); });
    next.addEventListener('click', () => { this.page++; this.paint(); });
    p.append(prev, el('span', 'text-muted', ` ${this.page} / ${pages} `), next);
    return p;
  }
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function cssEsc(s) { return s.replace(/["\\]/g, '\\$&'); }
