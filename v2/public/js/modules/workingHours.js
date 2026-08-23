// Calisma saatleri — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Ekran metinleri Turkce, kod ve API anahtarlari Ingilizce.
//
// v1'de calismaSaatleri bir diziydi ama hep tek eleman kullanilirdi; API'de
// TEK NESNE olarak gelir. Endpoint deseni digerlerinden farkli:
//   GET  /working-hours              -> tek nesne (liste degil)
//   POST /working-hours?op=guncelle  -> gunceller
// Yeni ekleme / silme yoktur — konfig hep vardir (migration tohumlar).

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

export const workingHours = {
  get:    ()     => request('/working-hours'),
  update: (data) => request('/working-hours?op=guncelle', { method: 'POST', body: data })
};

// Alan anahtari -> ekran etiketi. Sira = gun akisi.
const LABELS = {
  morningStart:        'Sabah baslangic',
  morningBreakStart:   'Sabah mola baslangic',
  morningBreakEnd:     'Sabah mola bitis',
  morningEnd:          'Sabah bitis',
  afternoonStart:      'Ogleden sonra baslangic',
  afternoonBreakStart: 'Ogleden sonra mola baslangic',
  afternoonBreakEnd:   'Ogleden sonra mola bitis',
  afternoonEnd:        'Ogleden sonra bitis'
};

export async function viewWorkingHours(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data } = await workingHours.get();

    container.innerHTML = `
      <div class="module-head">
        <h2>Calisma Saatleri</h2>
      </div>
      <form id="wh-form" class="form" data-updated="${data.updatedAt}">
        ${Object.entries(LABELS).map(([key, label]) => `
          <label class="field">
            <span>${label}</span>
            <input type="time" name="${key}" value="${escapeHtml(data[key] || '')}" required>
          </label>`).join('')}
        <button type="submit" class="btn">Kaydet</button>
        <p id="wh-status" class="meta"></p>
      </form>`;
  } catch (err) {
    container.innerHTML = `<div class="error">Konfigurasyon alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

// Formu API'ye gonderir. Eszamanlilik icin okunan updatedAt geri gonderilir.
export async function saveWorkingHours(form) {
  const body = { updatedAt: form.dataset.updated };
  for (const key of Object.keys(LABELS)) {
    body[key] = form.elements[key].value;
  }
  const { data } = await workingHours.update(body);
  form.dataset.updated = data.updatedAt; // yeni damga — sonraki kaydet icin
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
