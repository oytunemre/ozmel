// Gorevler — v2 modulu.
//
// Bu modul VERI TUTMAZ. Global bir DB nesnesi yok, seed yok, blob yok.
// Her render kendi verisini API'den ceker. Ekran metinleri Turkce,
// kod ve API anahtarlari Ingilizce.
//
// v1'de gorevler anaSorumlu/yardimci'yi ISIM olarak tutuyordu; API'de
// primaryAssigneeId / secondaryAssigneeId FK olur (v2_task_people). Atama bagi
// opsiyonel — eslesmeyen isim NULL kalir. completionRatio 0–1 kesir (1 = %100).

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

export const tasks = {
  list:   (page = 1)   => request(`/tasks?page=${page}&limit=50`),
  get:    (id)         => request(`/tasks/${id}`),
  create: (data)       => request('/tasks', { method: 'POST', body: data }),
  update: (id, data)   => request(`/tasks/${id}?op=guncelle`, { method: 'POST', body: data }),
  remove: (id)         => request(`/tasks/${id}?op=sil`, { method: 'POST' })
};

export async function viewTasks(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data, meta } = await tasks.list();

    container.innerHTML = `
      <div class="module-head">
        <h2>Gorevler</h2>
        <button id="task-add" class="btn">Yeni Gorev</button>
      </div>
      <table class="tbl">
        <thead><tr><th>Sira</th><th>Tanim</th><th>Departman</th><th>Durum</th><th>Tamamlanma</th><th></th></tr></thead>
        <tbody>
          ${data.map(t => `
            <tr data-id="${t.id}" data-updated="${t.updatedAt}">
              <td>${t.sequence ?? '—'}</td>
              <td>${escapeHtml(t.description)}</td>
              <td>${t.department ? escapeHtml(t.department) : '—'}</td>
              <td>${t.status ? escapeHtml(t.status) : '—'}</td>
              <td>${t.completionRatio !== null ? Math.round(t.completionRatio * 100) + '%' : '—'}</td>
              <td>
                <button class="task-edit" data-id="${t.id}">Duzenle</button>
                <button class="task-del"  data-id="${t.id}">Sil</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="meta">Toplam ${meta.total} kayit</p>`;

    if (data.length === 0) {
      container.querySelector('tbody').innerHTML =
        '<tr><td colspan="6">Henuz gorev eklenmemis. "Yeni Gorev" ile baslayin.</td></tr>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error">Liste alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
