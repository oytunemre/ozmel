// Ilk parca (first-off) kayitlari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de firstOffKayitlari iki ic ice koleksiyon tutuyordu: degerler{} (nokta ->
// olcum) ve gerekce[] (string dizisi). API'de `measurements` ve `reasons` olarak
// gelir; sunucuda ayri cocuk tablolarda tutulur (tek transaction).

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

export const firstOffRecords = {
  list:   (page = 1)   => request(`/first-off-records?page=${page}&limit=50`),
  get:    (id)         => request(`/first-off-records/${id}`),
  create: (data)       => request('/first-off-records', { method: 'POST', body: data }),
  update: (id, data)   => request(`/first-off-records/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/first-off-records/${id}?op=sil`, { method: 'POST' })
};

export async function viewFirstOffRecords(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await firstOffRecords.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>First-Off Kayitlari</h2>
        <button id="for-add" class="btn">Yeni Kayit</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Operasyon</th><th>Tarih</th><th>Vardiya</th><th>Olcum</th><th>Karar</th><th></th></tr></thead>
        <tbody>
          ${data.map(r => `
            <tr data-id="${r.id}" data-updated="${r.updatedAt}">
              <td>${r.productCodeId}</td>
              <td>${r.operationId}</td>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.shift)}</td>
              <td>${r.measurements.length}</td>
              <td>${r.overallResult ? escapeHtml(r.overallResult) : '—'}</td>
              <td>
                <button class="for-edit" data-id="${r.id}">Duzenle</button>
                <button class="for-del"  data-id="${r.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="7">Henuz kayit eklenmemis. "Yeni Kayit" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
