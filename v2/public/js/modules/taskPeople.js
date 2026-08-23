// Gorev kisileri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de gorevKisiler paylasimli kisi diziniydi (isim/eposta/telefon). Gorevler
// (tasks) buna FK ile baglanir; gorevin cocuk tablosu DEGIL, bagimsiz kaynaktir.

const API = '../api/index.php';

async function request(path, { method = 'GET', body = null } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': window.SESSION_TOKEN || ''
    },
    body: body ? JSON.stringify(body) : null
  });

  const json = await res.json().catch(() => ({}));

  if (!json.ok) {
    const message = json.errors?._ || Object.values(json.errors || {})[0] || 'Bilinmeyen hata';
    throw Object.assign(new Error(message), { status: res.status, errors: json.errors || {} });
  }
  return json;
}

export const taskPeople = {
  list:   (page = 1)   => request(`/task-people?page=${page}&limit=50`),
  get:    (id)         => request(`/task-people/${id}`),
  create: (data)       => request('/task-people', { method: 'POST', body: data }),
  update: (id, data)   => request(`/task-people/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/task-people/${id}?op=sil`, { method: 'POST' })
};

export async function viewTaskPeople(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await taskPeople.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Gorev Kisileri</h2>
        <button id="tperson-add" class="btn">Yeni Kisi</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Isim</th><th>Eposta</th><th>Telefon</th><th></th></tr></thead>
        <tbody>
          ${data.map(p => `
            <tr data-id="${p.id}" data-updated="${p.updatedAt}">
              <td>${escapeHtml(p.name)}</td>
              <td>${p.email ? escapeHtml(p.email) : '—'}</td>
              <td>${p.phone ? escapeHtml(p.phone) : '—'}</td>
              <td>
                <button class="tperson-edit" data-id="${p.id}">Duzenle</button>
                <button class="tperson-del"  data-id="${p.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="4">Henuz kisi eklenmemis. "Yeni Kisi" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
