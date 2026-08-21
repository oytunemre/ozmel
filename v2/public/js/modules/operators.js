// Operatorler — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce (fullName/badgeNo/isActive/skills).
//
// yetkinOperasyonlar v1'de bir string diziydi; API'de `skills` olarak gelir
// ve sunucuda ayri bir tabloda (v2_operator_skills) tutulur.

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

export const operators = {
  list:   (page = 1)   => request(`/operators?page=${page}&limit=50`),
  get:    (id)         => request(`/operators/${id}`),
  create: (data)       => request('/operators', { method: 'POST', body: data }),
  update: (id, data)   => request(`/operators/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/operators/${id}?op=sil`, { method: 'POST' })
};

export async function viewOperators(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await operators.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Operatorler</h2>
        <button id="op-add" class="btn">Yeni Operator</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Ad Soyad</th><th>Sicil No</th><th>Yetkin Operasyonlar</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          ${data.map(op => `
            <tr data-id="${op.id}" data-updated="${op.updatedAt}">
              <td>${escapeHtml(op.fullName)}</td>
              <td>${escapeHtml(op.badgeNo)}</td>
              <td>${op.skills.length ? escapeHtml(op.skills.join(', ')) : '—'}</td>
              <td>${op.isActive ? 'Aktif' : 'Pasif'}</td>
              <td>
                <button class="op-edit" data-id="${op.id}">Duzenle</button>
                <button class="op-del"  data-id="${op.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="5">Henuz operator eklenmemis. "Yeni Operator" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
