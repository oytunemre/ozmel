// Urun agaclari — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de urunAgaclari oz-referansli agacti (parentId -> id). Urun ve hammadde
// referanslari serbest metindi; API'de productCodeId / materialCodeId FK olur.
// Bir dugum silinince alt agaci da gider (sunucuda cascade).

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

export const productTrees = {
  list:   (page = 1)   => request(`/product-trees?page=${page}&limit=50`),
  get:    (id)         => request(`/product-trees/${id}`),
  create: (data)       => request('/product-trees', { method: 'POST', body: data }),
  update: (id, data)   => request(`/product-trees/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/product-trees/${id}?op=sil`, { method: 'POST' })
};

export async function viewProductTrees(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await productTrees.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Urun Agaclari</h2>
        <button id="ptree-add" class="btn">Yeni Dugum</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Urun Kodu</th><th>Malzeme Kodu</th><th>Aciklama</th><th>Ust Dugum</th><th></th></tr></thead>
        <tbody>
          ${data.map(n => `
            <tr data-id="${n.id}" data-updated="${n.updatedAt}">
              <td>${n.productCodeId}</td>
              <td>${n.materialCodeId ?? '—'}</td>
              <td>${n.description ? escapeHtml(n.description) : '—'}</td>
              <td>${n.parentId ?? '—'}</td>
              <td>
                <button class="ptree-edit" data-id="${n.id}">Duzenle</button>
                <button class="ptree-del"  data-id="${n.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="5">Henuz agac dugumu eklenmemis. "Yeni Dugum" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
