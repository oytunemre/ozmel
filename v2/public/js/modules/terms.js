// Terim cevirileri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce (original/translation/isHidden).
//
// v1'de "gizliTerimler" ayri bir string diziydi; API'de terimin `isHidden`
// alani olur — ayri liste/endpoint yok.

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

export const terms = {
  list:   (page = 1)   => request(`/terms?page=${page}&limit=50`),
  get:    (id)         => request(`/terms/${id}`),
  create: (data)       => request('/terms', { method: 'POST', body: data }),
  update: (id, data)   => request(`/terms/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/terms/${id}?op=sil`, { method: 'POST' })
};

export async function viewTerms(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await terms.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Terim Cevirileri</h2>
        <button id="term-add" class="btn">Yeni Terim</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Orijinal</th><th>Ceviri</th><th>Gizli</th><th></th></tr></thead>
        <tbody>
          ${data.map(t => `
            <tr data-id="${t.id}" data-updated="${t.updatedAt}">
              <td>${escapeHtml(t.original)}</td>
              <td>${t.translation ? escapeHtml(t.translation) : '—'}</td>
              <td>${t.isHidden ? 'Evet' : 'Hayir'}</td>
              <td>
                <button class="term-edit" data-id="${t.id}">Duzenle</button>
                <button class="term-del"  data-id="${t.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="4">Henuz terim eklenmemis. "Yeni Terim" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
