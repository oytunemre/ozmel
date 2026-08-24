// Genel Bakis panosu — v2 modulu (SALT OKUNUR).
//
// Bu modul VERI TUTMAZ. Tek GET cagrisiyla dort bolum ceker: kartlar, is merkezi
// yuku, son kalite olcumleri. CRUD yok. Ekran metinleri Turkce.
//
// "Min. stok alti" karti YOK — eldeki stok verisi olmadigindan sunucu bu alani
// dondurmez (uretim hangi hammaddeyi tukettigini kaydetmiyor).

const API = '../api/index.php';

async function request(path) {
  const res = await fetch(API + path, {
    headers: { 'X-Session-Token': window.SESSION_TOKEN || '' }
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const message = json.errors?._ || Object.values(json.errors || {})[0] || 'Bilinmeyen hata';
    throw Object.assign(new Error(message), { status: res.status });
  }
  return json;
}

export const dashboard = {
  get: () => request('/dashboard')
};

export async function viewDashboard(container) {
  container.innerHTML = '<div class="loading">Yukleniyor…</div>';

  try {
    const { data } = await dashboard.get();
    const c = data.cards;

    const cards = `
      <div class="cards">
        ${card('Acik Is Emirleri', c.openWorkOrders.value, c.openWorkOrders.detail)}
        ${card('Bugunun Uretimi', `${fmt(c.todayProduction.value)} / ${fmt(c.todayProduction.target)}`,
                'gerceklesen / hedef')}
        ${card('Tolerans Disi', c.outOfTolerance.value, c.outOfTolerance.detail)}
      </div>`;

    const load = `
      <h3>Is Merkezi Yuku (bu hafta)</h3>
      <table class="tbl">
        <thead><tr><th>Is Merkezi</th><th>Planlanan</th><th>Kapasite</th><th>Doluluk</th></tr></thead>
        <tbody>
          ${data.workCenterLoad.map(w => `
            <tr>
              <td>${escapeHtml(w.name)}</td>
              <td>${fmt(w.planned)}</td>
              <td>${fmt(w.capacity)}</td>
              <td>${w.ratio !== null ? Math.round(w.ratio * 100) + '%' : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="4">Bu hafta plan yok.</td></tr>'}
        </tbody>
      </table>`;

    const quality = `
      <h3>Son Kalite Olcumleri</h3>
      <table class="tbl">
        <thead><tr><th>Urun</th><th>Olcum</th><th>Deger</th><th>Sonuc</th><th>Zaman</th></tr></thead>
        <tbody>
          ${data.recentQuality.map(q => `
            <tr>
              <td>${escapeHtml(q.code)}</td>
              <td>${escapeHtml(q.measure)}</td>
              <td>${q.value ?? '—'}</td>
              <td>${q.result ? escapeHtml(q.result) : '—'}</td>
              <td>${escapeHtml(q.at)}</td>
            </tr>`).join('') || '<tr><td colspan="5">Henuz olcum yok.</td></tr>'}
        </tbody>
      </table>`;

    container.innerHTML = `<div class="module-head"><h2>Genel Bakis</h2></div>${cards}${load}${quality}`;
  } catch (err) {
    container.innerHTML = `<div class="error">Pano alinamadi: ${escapeHtml(err.message)}</div>`;
  }
}

function card(title, value, detail) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-value">${escapeHtml(String(value))}</div>
      <div class="card-detail">${escapeHtml(detail || '')}</div>
    </div>`;
}

function fmt(n) {
  return new Intl.NumberFormat('tr-TR').format(n ?? 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
