// Saatlik kontrol noktalari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de saatlikNoktalari urun/operasyon serbest metindi; API'de FK olur.
// saatlik kayitlar bu noktalarin id'sine olcum baglar.

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

export const hourlyPoints = {
  list:   (page = 1)   => request(`/hourly-points?page=${page}&limit=50`),
  get:    (id)         => request(`/hourly-points/${id}`),
  create: (data)       => request('/hourly-points', { method: 'POST', body: data }),
  update: (id, data)   => request(`/hourly-points/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/hourly-points/${id}?op=sil`, { method: 'POST' })
};

export async function viewHourlyPoints(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await hourlyPoints.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Saatlik Kontrol Noktalari</h2>
        <button id="hop-add" class="btn">Yeni Nokta</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Operasyon</th><th>Olcum Yeri</th><th>Tip</th><th>Birim</th><th></th></tr></thead>
        <tbody>
          ${data.map(p => `
            <tr data-id="${p.id}" data-updated="${p.updatedAt}">
              <td>${p.productCodeId}</td>
              <td>${p.operationId}</td>
              <td>${escapeHtml(p.measureLocation)}</td>
              <td>${escapeHtml(p.type)}</td>
              <td>${p.unit ? escapeHtml(p.unit) : '—'}</td>
              <td>
                <button class="hop-edit" data-id="${p.id}">Duzenle</button>
                <button class="hop-del"  data-id="${p.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="6">Henuz nokta eklenmemis. "Yeni Nokta" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
