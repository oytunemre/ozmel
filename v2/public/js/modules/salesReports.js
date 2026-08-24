// Satis Raporlari — v2 modulu (SALT OKUNUR).
//
// Bu modul VERI TUTMAZ. from/to/customer filtreleriyle GET yapar; aya/urune/
// musteriye gore URETILEN miktari gosterir. CRUD yok.
//
// Not: veride sevkiyat/teslimat kaydi yok — bu rapor URETILEN miktardir, sevk
// edilen degil. Alan adlari `quantity` (yaniltici olmasin).

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

export const salesReports = {
  get: ({ from = '', to = '', customer = '' } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (customer) q.set('customer', customer);
    const qs = q.toString();
    return request('/sales-reports' + (qs ? `?${qs}` : ''));
  }
};

export async function viewSalesReports(container) {
  container.innerHTML = `
    <div class="module-head"><h2>Satis Raporlari</h2></div>
    <form id="sales-filter" class="form-inline">
      <label>Baslangic <input type="date" name="from"></label>
      <label>Bitis <input type="date" name="to"></label>
      <label>Musteri <input type="text" name="customer" placeholder="tumu"></label>
      <button type="submit" class="btn">Filtrele</button>
    </form>
    <p class="note">Uretilen miktari gosterir (sevk edilen degil). Bos birakilirsa son 6 ay.</p>
    <div id="sales-out"><div class="loading">Yukleniyor…</div></div>`;

  const out = container.querySelector('#sales-out');
  const form = container.querySelector('#sales-filter');

  async function load() {
    out.innerHTML = '<div class="loading">Yukleniyor…</div>';
    try {
      const { data, meta } = await salesReports.get({
        from: form.elements.from.value,
        to: form.elements.to.value,
        customer: form.elements.customer.value.trim()
      });
      out.innerHTML = render(data, meta);
    } catch (err) {
      out.innerHTML = `<div class="error">Rapor alinamadi: ${escapeHtml(err.message)}</div>`;
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); load(); });
  load();
}

function render(data, meta) {
  const monthly = table('Aya Gore', ['Ay', 'Miktar'],
    data.monthly.map(m => [m.month, fmt(m.quantity)]));
  const byProduct = table('Urune Gore', ['Kod', 'Ad', 'Miktar'],
    data.byProduct.map(p => [p.code, p.name, fmt(p.quantity)]));
  const byCustomer = table('Musteriye Gore', ['Musteri', 'Miktar'],
    data.byCustomer.map(c => [c.customer, fmt(c.quantity)]));

  return `<p class="meta">${escapeHtml(meta.from)} → ${escapeHtml(meta.to)}`
    + `${meta.customer ? ' · ' + escapeHtml(meta.customer) : ''}</p>${monthly}${byProduct}${byCustomer}`;
}

function table(title, headers, rows) {
  return `
    <h3>${escapeHtml(title)}</h3>
    <table class="tbl">
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${headers.length}">Kayit yok.</td></tr>`}
      </tbody>
    </table>`;
}

function fmt(n) {
  return new Intl.NumberFormat('tr-TR').format(n ?? 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
