// Giris kalite kontrolleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de girisKaliteKontrolleri IKI SEVIYE ic ice yapiydi: kayit -> karakteristik[]
// -> degerler[]. API'de `characteristics: [{..., values:[...]}]` seklinde gelir;
// sunucuda iki cocuk tabloda (karakteristik + deger) tek transaction'da tutulur.
// malzeme materialCodeId FK; satinalma girisi referansi Faz 7'ye kadar metin.

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

export const incomingInspections = {
  list:   (page = 1)   => request(`/incoming-inspections?page=${page}&limit=50`),
  get:    (id)         => request(`/incoming-inspections/${id}`),
  create: (data)       => request('/incoming-inspections', { method: 'POST', body: data }),
  update: (id, data)   => request(`/incoming-inspections/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/incoming-inspections/${id}?op=sil`, { method: 'POST' })
};

export async function viewIncomingInspections(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await incomingInspections.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Giris Kalite Kontrolleri</h2>
        <button id="ii-add" class="btn">Yeni Kontrol</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Tedarikci</th><th>Malzeme</th><th>Kontrol Tarihi</th><th>Karakteristik</th><th>Sonuc</th><th></th></tr></thead>
        <tbody>
          ${data.map(i => `
            <tr data-id="${i.id}" data-updated="${i.updatedAt}">
              <td>${i.supplier ? escapeHtml(i.supplier) : '—'}</td>
              <td>${i.materialCodeId ?? '—'}</td>
              <td>${i.inspectionDate ? escapeHtml(i.inspectionDate) : '—'}</td>
              <td>${i.characteristics.length}</td>
              <td>${i.overallResult ? escapeHtml(i.overallResult) : '—'}</td>
              <td>
                <button class="ii-edit" data-id="${i.id}">Duzenle</button>
                <button class="ii-del"  data-id="${i.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="6">Henuz giris kontrolu eklenmemis. "Yeni Kontrol" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
