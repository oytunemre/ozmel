// Denetim soru bankasi — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de audits bagimsiz denetim soru bankasiydi (parca/tedarikci baglantisi yok).

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

export const audits = {
  list:   (page = 1)   => request(`/audits?page=${page}&limit=50`),
  get:    (id)         => request(`/audits/${id}`),
  create: (data)       => request('/audits', { method: 'POST', body: data }),
  update: (id, data)   => request(`/audits/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/audits/${id}?op=sil`, { method: 'POST' })
};

export async function viewAudits(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await audits.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Denetim Soru Bankasi</h2>
        <button id="audit-add" class="btn">Yeni Soru</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Form</th><th>Bolum</th><th>Soru</th><th>Puan</th><th></th></tr></thead>
        <tbody>
          ${data.map(a => `
            <tr data-id="${a.id}" data-updated="${a.updatedAt}">
              <td>${escapeHtml(a.form)}</td>
              <td>${escapeHtml(a.section)}</td>
              <td>${escapeHtml(a.question)}</td>
              <td>${a.score ?? '—'}</td>
              <td>
                <button class="audit-edit" data-id="${a.id}">Duzenle</button>
                <button class="audit-del"  data-id="${a.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="5">Henuz soru eklenmemis. "Yeni Soru" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
