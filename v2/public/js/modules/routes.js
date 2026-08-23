// Rotalar — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de routes urun/operasyon/isMerkezi serbest metindi; API'de productCodeId /
// operationId / workCenterId FK olur. varyantSecenekleri v1'de string diziydi;
// API'de `variants` ve sunucuda ayri tabloda (v2_route_variants) tutulur.

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

export const routes = {
  list:   (page = 1)   => request(`/routes?page=${page}&limit=50`),
  get:    (id)         => request(`/routes/${id}`),
  create: (data)       => request('/routes', { method: 'POST', body: data }),
  update: (id, data)   => request(`/routes/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/routes/${id}?op=sil`, { method: 'POST' })
};

export async function viewRoutes(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await routes.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Rotalar</h2>
        <button id="route-add" class="btn">Yeni Rota</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Operasyon</th><th>Is Merkezi</th><th>Sira</th><th>Varyantlar</th><th>Aktif</th><th></th></tr></thead>
        <tbody>
          ${data.map(r => `
            <tr data-id="${r.id}" data-updated="${r.updatedAt}">
              <td>${r.productCodeId}</td>
              <td>${r.operationId}</td>
              <td>${r.workCenterId}</td>
              <td>${r.sequence}</td>
              <td>${r.variants.length ? escapeHtml(r.variants.join(', ')) : '—'}</td>
              <td>${r.isActive ? 'Aktif' : 'Pasif'}</td>
              <td>
                <button class="route-edit" data-id="${r.id}">Duzenle</button>
                <button class="route-del"  data-id="${r.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="7">Henuz rota eklenmemis. "Yeni Rota" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
