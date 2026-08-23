// Saatlik kontrol kayitlari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de saatlikKayitlari degerler{} nesnesi tutuyordu: nokta -> DEGISKEN uzunlukta
// deger dizisi. API'de `measurements` = [{pointId, values:[...]}]; sunucuda her
// deger ayri satir (sequence sirayi korur), tek transaction'da yazilir.

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

export const hourlyRecords = {
  list:   (page = 1)   => request(`/hourly-records?page=${page}&limit=50`),
  get:    (id)         => request(`/hourly-records/${id}`),
  create: (data)       => request('/hourly-records', { method: 'POST', body: data }),
  update: (id, data)   => request(`/hourly-records/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/hourly-records/${id}?op=sil`, { method: 'POST' })
};

export async function viewHourlyRecords(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await hourlyRecords.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Saatlik Kayitlar</h2>
        <button id="hr-add" class="btn">Yeni Kayit</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Operasyon</th><th>Tarih</th><th>Saat</th><th>Personel</th><th>Nokta</th><th></th></tr></thead>
        <tbody>
          ${data.map(r => `
            <tr data-id="${r.id}" data-updated="${r.updatedAt}">
              <td>${r.productCodeId}</td>
              <td>${r.operationId}</td>
              <td>${escapeHtml(r.date)}</td>
              <td>${r.hour ? escapeHtml(r.hour) : '—'}</td>
              <td>${r.personnelName ? escapeHtml(r.personnelName) : '—'}</td>
              <td>${r.measurements.length}</td>
              <td>
                <button class="hr-edit" data-id="${r.id}">Duzenle</button>
                <button class="hr-del"  data-id="${r.id}">Sil</button>
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
