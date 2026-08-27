// Kullanıcı Yönetimi — v2 modülü. Şimdilik yetki matrisi YOK: tüm kullanıcılar
// yönetici (role='editor'), yalnızca hesap yönetimi. Kimlik kaynağı v1 ile paylaşılan
// `users`/`sessions` tablolarıdır (login.php ortak). Tasarım: Kullanici-Yonetimi.dc.html
// (yetki matrisi bölümü çıkarıldı).
//
// Silme yok — kullanıcı pasife alınır. Bu yüzden ortak DataTable yerine özel liste
// (Düzenle + Şifre sıfırla aksiyonları).
// i18n: özel görünüm — bindLang ile dil değişince VERİ ÇEKMEDEN yeniden çizilir
// (arama korunur). Kullanıcı adı/ad soyad veri, çevrilmez.

import { resource, request } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { t, bindLang } from '../core/i18n.js';

const api = resource('users');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewUsers(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let rows;
  try { rows = (await api.listAll()).data; }
  catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewUsers(container) })); return; }

  let search = '';
  render();
  bindLang(container, render);   // dil değişince yeniden çiz (veri + arama closure'da)

  function render() {
    const q = search.trim().toLocaleLowerCase('tr');
    const shown = q ? rows.filter(u => `${u.displayName} ${u.username}`.toLocaleLowerCase('tr').includes(q)) : rows;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.users'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('us.summary', { n: rows.length }))}</div>
        </div>
        <button class="btn btn-primary" id="us-add"${canWrite ? '' : ' disabled title="' + esc(t('common.readonlyHint')) + '"'}>${esc(t('us.new'))}</button>
      </div>
      <div class="toolbar"><div class="search">
        <input class="input" type="search" id="us-search" placeholder="${esc(t('us.search'))}" value="${esc(search)}">
      </div></div>
      <div id="us-body"></div>`;

    const body = container.querySelector('#us-body');
    if (shown.length === 0) {
      body.innerHTML = `<div class="state"><div class="state-title">${esc(rows.length === 0 ? t('us.emptyTitle') : t('common.noResults'))}</div>
        <div class="state-msg">${esc(rows.length === 0 ? t('us.empty') : t('us.noMatch'))}</div></div>`;
    } else {
      body.appendChild(tableEl(shown));
    }

    const s = container.querySelector('#us-search');
    s.addEventListener('input', () => { search = s.value; render(); const el = container.querySelector('#us-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    const add = container.querySelector('#us-add');
    if (canWrite) add.addEventListener('click', () => openCreate());
  }

  function tableEl(list) {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `<thead><tr><th>${esc(t('field.nameSurname'))}</th><th>${esc(t('us.username'))}</th><th>${esc(t('field.status'))}</th><th></th></tr></thead>`;
    const tb = document.createElement('tbody');
    for (const u of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(u.displayName)}</td>
        <td class="mono" style="color:var(--color-accent-800)">${esc(u.username)}</td>
        <td>${u.isActive ? `<span class="tag tag-success">${esc(t('common.active'))}</span>` : `<span class="tag tag-neutral">${esc(t('common.inactive'))}</span>`}</td>`;
      const act = document.createElement('td');
      act.className = 'actions';
      if (canWrite) {
        act.append(
          btn(t('action.edit'), 'btn-ghost', () => openEdit(u)),
          btn(t('us.resetPw'), 'btn-ghost', () => openReset(u))
        );
      }
      tr.appendChild(act);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    return wrap;
  }

  async function reload() { rows = (await api.listAll()).data; render(); }

  function openCreate() {
    openDrawer({
      title: () => t('us.newTitle'),
      submitLabel: () => t('action.add'),
      values: {},
      fields: [
        { name: 'displayName', label: () => t('field.nameSurname'), type: 'text', required: true },
        { name: 'username', label: () => t('us.usernameField'), type: 'text', required: true,
          help: () => t('us.usernameHelp') },
        { name: 'password', label: () => t('field.password'), type: 'password', required: true, help: () => t('us.pwHelp') }
      ],
      onSubmit: async (v) => (await api.create({ displayName: v.displayName, username: v.username, password: v.password })).data,
      onSaved: async () => { toast(t('us.added'), 'success'); await reload(); }
    });
  }

  function openEdit(u) {
    openDrawer({
      title: () => t('us.editTitle'),
      submitLabel: () => t('action.update'),
      values: { ...u },
      fields: [
        { name: 'secId', type: 'section', label: `${u.username}` },
        { name: 'displayName', label: () => t('field.nameSurname'), type: 'text', required: true },
        { name: 'isActive', label: () => t('common.active'), type: 'bool',
          help: () => t('us.activeHelp') }
      ],
      onSubmit: async (v) => (await api.update(u.id, { displayName: v.displayName, isActive: v.isActive, updatedAt: v.updatedAt })).data,
      onSaved: async () => { toast(t('us.updated'), 'success'); await reload(); }
    });
  }

  function openReset(u) {
    openDrawer({
      title: () => t('us.resetTitle'),
      submitLabel: () => t('us.resetSubmit'),
      values: {},
      fields: [
        { name: 'sec', type: 'section', label: `${u.displayName} · ${u.username}` },
        { name: 'password', label: () => t('us.newPw'), type: 'password', required: true, help: () => t('us.newPwHelp') }
      ],
      onSubmit: async (v) => (await request(`/users/${u.id}?op=sifre`, { method: 'POST', body: { password: v.password } })).data,
      onSaved: async () => { toast(t('us.pwUpdated'), 'success'); }
    });
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
function btn(label, kind, on) {
  const b = document.createElement('button');
  b.className = `btn ${kind} btn-sm`;
  b.textContent = label;
  b.addEventListener('click', on);
  return b;
}
