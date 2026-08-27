// Kullanıcı Yönetimi — v2 modülü. Şimdilik yetki matrisi YOK: tüm kullanıcılar
// yönetici (role='editor'), yalnızca hesap yönetimi. Kimlik kaynağı v1 ile paylaşılan
// `users`/`sessions` tablolarıdır (login.php ortak). Tasarım: Kullanici-Yonetimi.dc.html
// (yetki matrisi bölümü çıkarıldı).
//
// Silme yok — kullanıcı pasife alınır. Bu yüzden ortak DataTable yerine özel liste
// (Düzenle + Şifre sıfırla aksiyonları).

import { resource, request } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';

const api = resource('users');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewUsers(container) {
  container.innerHTML = '<div class="loading">Yükleniyor…</div>';
  let rows;
  try { rows = (await api.list({ limit: 200 })).data; }
  catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewUsers(container) })); return; }

  let search = '';
  render();

  function render() {
    const q = search.trim().toLocaleLowerCase('tr');
    const shown = q ? rows.filter(u => `${u.displayName} ${u.username}`.toLocaleLowerCase('tr').includes(q)) : rows;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>Kullanıcı Yönetimi</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${rows.length} kullanıcı · tüm kullanıcılar yönetici · hesap yönetimi</div>
        </div>
        <button class="btn btn-primary" id="us-add"${canWrite ? '' : ' disabled title="Salt okuma"'}>Yeni Kullanıcı</button>
      </div>
      <div class="toolbar"><div class="search">
        <input class="input" type="search" id="us-search" placeholder="Ad veya kullanıcı adı ara…" value="${esc(search)}">
      </div></div>
      <div id="us-body"></div>`;

    const body = container.querySelector('#us-body');
    if (shown.length === 0) {
      body.innerHTML = `<div class="state"><div class="state-title">${rows.length === 0 ? 'Kullanıcı yok' : 'Sonuç yok'}</div>
        <div class="state-msg">${rows.length === 0 ? 'Henüz kullanıcı eklenmemiş.' : 'Aramayla eşleşen kullanıcı yok.'}</div></div>`;
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
    table.innerHTML = '<thead><tr><th>Ad Soyad</th><th>Kullanıcı adı</th><th>Durum</th><th></th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const u of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(u.displayName)}</td>
        <td class="mono" style="color:var(--color-accent-800)">${esc(u.username)}</td>
        <td>${u.isActive ? '<span class="tag tag-success">Aktif</span>' : '<span class="tag tag-neutral">Pasif</span>'}</td>`;
      const act = document.createElement('td');
      act.className = 'actions';
      if (canWrite) {
        act.append(
          btn('Düzenle', 'btn-ghost', () => openEdit(u)),
          btn('Şifre sıfırla', 'btn-ghost', () => openReset(u))
        );
      }
      tr.appendChild(act);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    return wrap;
  }

  async function reload() { rows = (await api.list({ limit: 200 })).data; render(); }

  function openCreate() {
    openDrawer({
      title: 'Yeni Kullanıcı',
      submitLabel: 'Ekle',
      values: {},
      fields: [
        { name: 'displayName', label: 'Ad Soyad', type: 'text', required: true },
        { name: 'username', label: 'Kullanıcı Adı', type: 'text', required: true,
          help: 'Girişte kullanılır; sonradan değiştirilemez. Harf, rakam ve . _ -' },
        { name: 'password', label: 'Şifre', type: 'password', required: true, help: 'En az 8 karakter.' }
      ],
      onSubmit: async (v) => (await api.create({ displayName: v.displayName, username: v.username, password: v.password })).data,
      onSaved: async () => { toast('Kullanıcı eklendi', 'success'); await reload(); }
    });
  }

  function openEdit(u) {
    openDrawer({
      title: 'Kullanıcı Düzenle',
      submitLabel: 'Güncelle',
      values: { ...u },
      fields: [
        { name: 'secId', type: 'section', label: `${u.username}` },
        { name: 'displayName', label: 'Ad Soyad', type: 'text', required: true },
        { name: 'isActive', label: 'Aktif', type: 'bool',
          help: 'Pasif kullanıcı giriş yapamaz; açık oturumları kapanır. Kendi hesabınızı pasife alamazsınız.' }
      ],
      onSubmit: async (v) => (await api.update(u.id, { displayName: v.displayName, isActive: v.isActive, updatedAt: v.updatedAt })).data,
      onSaved: async () => { toast('Kullanıcı güncellendi', 'success'); await reload(); }
    });
  }

  function openReset(u) {
    openDrawer({
      title: 'Şifre Sıfırla',
      submitLabel: 'Şifreyi Güncelle',
      values: {},
      fields: [
        { name: 'sec', type: 'section', label: `${u.displayName} · ${u.username}` },
        { name: 'password', label: 'Yeni Şifre', type: 'password', required: true, help: 'En az 8 karakter. Kaydettikten sonra tekrar görüntülenemez.' }
      ],
      onSubmit: async (v) => (await request(`/users/${u.id}?op=sifre`, { method: 'POST', body: { password: v.password } })).data,
      onSaved: async () => { toast('Şifre güncellendi', 'success'); }
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
