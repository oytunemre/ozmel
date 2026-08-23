// Kod tanimlari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce (code/name/type/...).
//
// v1'de kodTanimlari `kod`u dogal anahtar olan tek listeydi; hammadde/yari
// mamul/urun tek tabloda (type ile) durur. Olcu alanlari (disCap/icCap/...)
// yalnizca Hammadde tipinde anlamli; sunucu digerlerinde reddeder.

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

export const productCodes = {
  list:   (page = 1)   => request(`/product-codes?page=${page}&limit=50`),
  get:    (id)         => request(`/product-codes/${id}`),
  create: (data)       => request('/product-codes', { method: 'POST', body: data }),
  update: (id, data)   => request(`/product-codes/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/product-codes/${id}?op=sil`, { method: 'POST' })
};

export async function viewProductCodes(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await productCodes.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Kod Tanimlari</h2>
        <button id="prodcode-add" class="btn">Yeni Kod</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Kod</th><th>Ad</th><th>Tip</th><th>Birim</th><th></th></tr></thead>
        <tbody>
          ${data.map(pc => `
            <tr data-id="${pc.id}" data-updated="${pc.updatedAt}">
              <td>${escapeHtml(pc.code)}</td>
              <td>${escapeHtml(pc.name)}</td>
              <td>${escapeHtml(pc.type)}</td>
              <td>${escapeHtml(pc.unit ?? '—')}</td>
              <td>
                <button class="prodcode-edit" data-id="${pc.id}">Duzenle</button>
                <button class="prodcode-del"  data-id="${pc.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="5">Henuz kod tanimi eklenmemis. "Yeni Kod" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
