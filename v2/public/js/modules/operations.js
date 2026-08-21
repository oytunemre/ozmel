// Operasyonlar — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri t() ile Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de operasyonlarListesi routes'tan otomatik dolan {id, ad} listesiydi;
// burada kendi master tablosu (v2_operations) ve tek alani `name` var.

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

export const operations = {
  list:   (page = 1)   => request(`/operations?page=${page}&limit=50`),
  get:    (id)         => request(`/operations/${id}`),
  create: (data)       => request('/operations', { method: 'POST', body: data }),
  update: (id, data)   => request(`/operations/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/operations/${id}?op=sil`, { method: 'POST' })
};

export async function viewOperations(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await operations.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Operasyonlar</h2>
        <button id="operation-add" class="btn">Yeni Operasyon</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Ad</th><th></th></tr></thead>
        <tbody>
          ${data.map(op => `
            <tr data-id="${op.id}" data-updated="${op.updatedAt}">
              <td>${escapeHtml(op.name)}</td>
              <td>
                <button class="operation-edit" data-id="${op.id}">Duzenle</button>
                <button class="operation-del"  data-id="${op.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="2">Henuz operasyon eklenmemis. "Yeni Operasyon" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
