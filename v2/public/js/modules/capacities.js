// Kapasiteler — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de capacity urun/isMerkezi serbest metindi; API'de productCodeId /
// workCenterId FK olur. Bir urun-is merkezi cifti icin tek kapasite kaydi vardir.

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

export const capacities = {
  list:   (page = 1)   => request(`/capacities?page=${page}&limit=50`),
  get:    (id)         => request(`/capacities/${id}`),
  create: (data)       => request('/capacities', { method: 'POST', body: data }),
  update: (id, data)   => request(`/capacities/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/capacities/${id}?op=sil`, { method: 'POST' })
};

export async function viewCapacities(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await capacities.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Kapasiteler</h2>
        <button id="cap-add" class="btn">Yeni Kapasite</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Is Merkezi</th><th>Kapasite (vardiya)</th><th>Dakika</th><th></th></tr></thead>
        <tbody>
          ${data.map(c => `
            <tr data-id="${c.id}" data-updated="${c.updatedAt}">
              <td>${c.productCodeId}</td>
              <td>${c.workCenterId}</td>
              <td>${c.capacityPerShift}</td>
              <td>${c.minutes ?? '—'}</td>
              <td>
                <button class="cap-edit" data-id="${c.id}">Duzenle</button>
                <button class="cap-del"  data-id="${c.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="5">Henuz kapasite eklenmemis. "Yeni Kapasite" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
