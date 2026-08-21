// Is Merkezleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri t() ile Turkce,
// kod ve API anahtarlari Ingilizce.

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

export const workCenters = {
  list:   (page = 1)   => request(`/work-centers?page=${page}&limit=50`),
  get:    (id)         => request(`/work-centers/${id}`),
  create: (data)       => request('/work-centers', { method: 'POST', body: data }),
  update: (id, data)   => request(`/work-centers/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/work-centers/${id}?op=sil`, { method: 'POST' })
};

export async function viewWorkCenters(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await workCenters.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Is Merkezleri</h2>
        <button id="wc-add" class="btn">Yeni Is Merkezi</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Ad</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          ${data.map(wc => `
            <tr data-id="${wc.id}" data-updated="${wc.updatedAt}">
              <td>${escapeHtml(wc.name)}</td>
              <td>${wc.isActive ? 'Aktif' : 'Pasif'}</td>
              <td>
                <button class="wc-edit" data-id="${wc.id}">Duzenle</button>
                <button class="wc-del"  data-id="${wc.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="3">Henuz is merkezi eklenmemis. "Yeni Is Merkezi" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
