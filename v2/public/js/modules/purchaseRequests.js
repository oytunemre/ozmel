// Satinalma istekleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// Ekip karari: malzeme LISTEDEN secilir -> materialCodeId FK (serbest metin degil).
// Malzeme tanimi ayri tutulmaz; sunucuda v2_product_codes.name'den gelir.

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

export const purchaseRequests = {
  list:   (page = 1)   => request(`/purchase-requests?page=${page}&limit=50`),
  get:    (id)         => request(`/purchase-requests/${id}`),
  create: (data)       => request('/purchase-requests', { method: 'POST', body: data }),
  update: (id, data)   => request(`/purchase-requests/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/purchase-requests/${id}?op=sil`, { method: 'POST' })
};

export async function viewPurchaseRequests(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await purchaseRequests.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Satinalma Istekleri</h2>
        <button id="preq-add" class="btn">Yeni Istek</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Malzeme</th><th>Miktar</th><th>Birim</th><th>Tedarikci</th><th>Istek Tarihi</th><th></th></tr></thead>
        <tbody>
          ${data.map(r => `
            <tr data-id="${r.id}" data-updated="${r.updatedAt}">
              <td>${r.materialCodeId}</td>
              <td>${r.quantity ?? '—'}</td>
              <td>${r.unit ? escapeHtml(r.unit) : '—'}</td>
              <td>${r.supplier ? escapeHtml(r.supplier) : '—'}</td>
              <td>${r.requestDate ? escapeHtml(r.requestDate) : '—'}</td>
              <td>
                <button class="preq-edit" data-id="${r.id}">Duzenle</button>
                <button class="preq-del"  data-id="${r.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="6">Henuz istek eklenmemis. "Yeni Istek" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
