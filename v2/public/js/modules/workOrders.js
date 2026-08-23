// Is emirleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de workorder urun/operasyon/isMerkezi serbest metindi; API'de FK olur.
// Is emri silinince uretim kayitlari da gider (sunucuda kaskad, transaction icinde).

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

export const workOrders = {
  list:   (page = 1)   => request(`/work-orders?page=${page}&limit=50`),
  get:    (id)         => request(`/work-orders/${id}`),
  create: (data)       => request('/work-orders', { method: 'POST', body: data }),
  update: (id, data)   => request(`/work-orders/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/work-orders/${id}?op=sil`, { method: 'POST' })
};

export async function viewWorkOrders(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await workOrders.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Is Emirleri</h2>
        <button id="wo-add" class="btn">Yeni Is Emri</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Is Emri No</th><th>Siparis</th><th>Urun</th><th>Sira</th><th>Hedef</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          ${data.map(w => `
            <tr data-id="${w.id}" data-updated="${w.updatedAt}">
              <td>${escapeHtml(w.woNo)}</td>
              <td>${w.orderId ?? '—'}</td>
              <td>${w.productCodeId}</td>
              <td>${w.sequence ?? '—'}</td>
              <td>${w.targetQuantity}</td>
              <td>${escapeHtml(w.status)}</td>
              <td>
                <button class="wo-edit" data-id="${w.id}">Duzenle</button>
                <button class="wo-del"  data-id="${w.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="7">Henuz is emri eklenmemis. "Yeni Is Emri" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
