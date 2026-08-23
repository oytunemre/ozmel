// Uretim kayitlari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de production workOrderId/operator serbest metindi; API'de FK olur. vardiya
// (Sabah / Öğleden Sonra / Mesai) sabit deger kumesidir.

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

export const production = {
  list:   (page = 1)   => request(`/production?page=${page}&limit=50`),
  get:    (id)         => request(`/production/${id}`),
  create: (data)       => request('/production', { method: 'POST', body: data }),
  update: (id, data)   => request(`/production/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/production/${id}?op=sil`, { method: 'POST' })
};

export async function viewProduction(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await production.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Uretim Kayitlari</h2>
        <button id="prod-add" class="btn">Yeni Kayit</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Is Emri</th><th>Tarih</th><th>Vardiya</th><th>Gercek</th><th>Fire</th><th>Operator</th><th></th></tr></thead>
        <tbody>
          ${data.map(p => `
            <tr data-id="${p.id}" data-updated="${p.updatedAt}">
              <td>${p.workOrderId}</td>
              <td>${escapeHtml(p.date)}</td>
              <td>${escapeHtml(p.shift)}</td>
              <td>${p.actualQuantity}</td>
              <td>${p.scrapQuantity}</td>
              <td>${p.operatorId ?? '—'}</td>
              <td>
                <button class="prod-edit" data-id="${p.id}">Duzenle</button>
                <button class="prod-del"  data-id="${p.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="7">Henuz uretim kaydi eklenmemis. "Yeni Kayit" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
