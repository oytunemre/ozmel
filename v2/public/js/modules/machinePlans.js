// Makine planlari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de makinePlani isMerkezi/urun/workOrderId serbest metindi; API'de FK olur.
// Is emri silinince plan kalir, yalnizca workOrderId bagi kopar (SET NULL).

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

export const machinePlans = {
  list:   (page = 1)   => request(`/machine-plans?page=${page}&limit=50`),
  get:    (id)         => request(`/machine-plans/${id}`),
  create: (data)       => request('/machine-plans', { method: 'POST', body: data }),
  update: (id, data)   => request(`/machine-plans/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/machine-plans/${id}?op=sil`, { method: 'POST' })
};

export async function viewMachinePlans(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await machinePlans.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Makine Planlari</h2>
        <button id="mplan-add" class="btn">Yeni Plan</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Tarih</th><th>Is Merkezi</th><th>Urun</th><th>Is Emri</th><th>Hedef</th><th></th></tr></thead>
        <tbody>
          ${data.map(m => `
            <tr data-id="${m.id}" data-updated="${m.updatedAt}">
              <td>${escapeHtml(m.date)}</td>
              <td>${m.workCenterId}</td>
              <td>${m.productCodeId}</td>
              <td>${m.workOrderId ?? '—'}</td>
              <td>${m.targetQuantity ?? '—'}</td>
              <td>
                <button class="mplan-edit" data-id="${m.id}">Duzenle</button>
                <button class="mplan-del"  data-id="${m.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="6">Henuz makine plani eklenmemis. "Yeni Plan" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
