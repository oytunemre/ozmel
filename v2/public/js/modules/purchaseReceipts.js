// Satinalma girisleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de satinalmaGirisleri malzemeyi kendisi tutmazdi; malzeme bilgisi
// purchaseRequestId -> istek uzerinden gelir. Istek silinince girisleri de gider
// (sunucuda kaskad).

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

export const purchaseReceipts = {
  list:   (page = 1)   => request(`/purchase-receipts?page=${page}&limit=50`),
  get:    (id)         => request(`/purchase-receipts/${id}`),
  create: (data)       => request('/purchase-receipts', { method: 'POST', body: data }),
  update: (id, data)   => request(`/purchase-receipts/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/purchase-receipts/${id}?op=sil`, { method: 'POST' })
};

export async function viewPurchaseReceipts(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await purchaseReceipts.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Satinalma Girisleri</h2>
        <button id="prec-add" class="btn">Yeni Giris</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Istek</th><th>Tarih</th><th>Miktar</th><th></th></tr></thead>
        <tbody>
          ${data.map(r => `
            <tr data-id="${r.id}" data-updated="${r.updatedAt}">
              <td>${r.purchaseRequestId}</td>
              <td>${r.date ? escapeHtml(r.date) : '—'}</td>
              <td>${r.quantity ?? '—'}</td>
              <td>
                <button class="prec-edit" data-id="${r.id}">Duzenle</button>
                <button class="prec-del"  data-id="${r.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="4">Henuz giris eklenmemis. "Yeni Giris" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
