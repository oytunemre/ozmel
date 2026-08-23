// Siparisler — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de order urun serbest metindi; API'de productCodeId FK olur. kaynak
// ('satis'/'stok') sabit deger kumesidir. Siparis silinince is emirleri ve
// uretim kayitlari da gider (sunucuda kaskad, transaction icinde).

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

export const orders = {
  list:   (page = 1)   => request(`/orders?page=${page}&limit=50`),
  get:    (id)         => request(`/orders/${id}`),
  create: (data)       => request('/orders', { method: 'POST', body: data }),
  update: (id, data)   => request(`/orders/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/orders/${id}?op=sil`, { method: 'POST' })
};

export async function viewOrders(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await orders.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Siparisler</h2>
        <button id="order-add" class="btn">Yeni Siparis</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Siparis No</th><th>Kaynak</th><th>Urun</th><th>Hedef</th><th>Durum</th><th>Musteri</th><th></th></tr></thead>
        <tbody>
          ${data.map(o => `
            <tr data-id="${o.id}" data-updated="${o.updatedAt}">
              <td>${escapeHtml(o.orderNo)}</td>
              <td>${o.source === 'satis' ? 'Satis' : 'Stok'}</td>
              <td>${o.productCodeId}</td>
              <td>${o.targetQuantity}</td>
              <td>${escapeHtml(o.status)}</td>
              <td>${o.customer ? escapeHtml(o.customer) : '—'}</td>
              <td>
                <button class="order-edit" data-id="${o.id}">Duzenle</button>
                <button class="order-del"  data-id="${o.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="7">Henuz siparis eklenmemis. "Yeni Siparis" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
