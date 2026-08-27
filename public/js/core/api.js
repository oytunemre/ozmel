// api.js — tek fetch sarmalayici. {ok, data, meta, errors} zarfini cozer.
//
// Basari: {data, meta} doner. Hata: DURUMA gore AYRI TIPTE firlatir, boylece cagiran
// ayirt eder (422 alan hatalari, 409 cakisma, 403 yetki, aglar hatasi, ...).
// X-Session-Token otomatik eklenir (window.SESSION_TOKEN).
//
// API yolu, bu modulun konumuna gore cozulur (sayfa nerede olursa olsun dogru):
//   public/js/core/api.js -> ../../api/index.php

const API = new URL('../../api/index.php', import.meta.url).href;

// --- hata tipleri ---
export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
/** 422 — alan bazli dogrulama. `.fields` = { alanAdi: mesaj }. */
export class ValidationError extends ApiError {
  constructor(message, fields = {}) {
    super(message || 'Girdileri kontrol edin', { status: 422 });
    this.name = 'ValidationError';
    this.fields = fields;
  }
}
/** 409 — kayit siz acdiktan sonra baskasi degistirdi (stale). */
export class ConflictError extends ApiError {
  constructor(message) {
    super(message || 'Kayit baskasi tarafindan degistirildi', { status: 409, code: 'STALE' });
    this.name = 'ConflictError';
  }
}
/** 403 / 401 — yetki yok ya da oturum. */
export class AuthError extends ApiError {
  constructor(message, status = 403, code = '') {
    super(message || 'Yetkiniz yok', { status, code });
    this.name = 'AuthError';
  }
}
/** Sunucuya ulasilamadi (fetch firlatti). */
export class NetworkError extends ApiError {
  constructor(message) {
    super(message || 'Sunucuya ulasilamadi — baglantinizi kontrol edin', { status: 0 });
    this.name = 'NetworkError';
  }
}

/**
 * @param {string} path  '/operators', '/operators/12?op=guncelle' ...
 * @param {{method?: string, body?: any}} opts
 * @returns {Promise<{data:any, meta:any}>}
 */
export async function request(path, { method = 'GET', body = null } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': window.SESSION_TOKEN || ''
      },
      body: body != null ? JSON.stringify(body) : null
    });
  } catch {
    throw new NetworkError();
  }

  let json;
  try {
    json = await res.json();
  } catch {
    // Zarf beklerken bozuk/HTML yanit — ag/sunucu sorunu gibi ele al.
    throw new ApiError('Sunucu beklenmeyen bir yanit dondu', { status: res.status });
  }

  if (json && json.ok) {
    return { data: json.data, meta: json.meta || {} };
  }

  // --- hata zarfi -> tipli firlat ---
  const errors = (json && json.errors) || {};
  const code = (json && json.meta && json.meta.code) || '';
  const generic = errors._ || 'Islem basarisiz';

  if (res.status === 422) {
    // _ disindaki anahtarlar alan hatalaridir.
    const fields = {};
    for (const [k, v] of Object.entries(errors)) if (k !== '_') fields[k] = v;
    throw new ValidationError(errors._ || 'Girdileri kontrol edin', fields);
  }
  if (res.status === 409 || code === 'STALE') throw new ConflictError(generic);
  if (res.status === 403 || res.status === 401) throw new AuthError(generic, res.status, code);
  throw new ApiError(generic, { status: res.status, code });
}

// Sunucu tarafi sayfalama YOK; istemci hepsini cekip kendi sayfaliyor. listAll,
// backend'in 200 tavanina takilmadan meta.total'a ulasana kadar tum sayfalari birlestirir.
const PAGE_LIMIT = 200;   // backend tavani ile ayni
const MAX_PAGES  = 50;    // sonsuz donguye karsi: 50 * 200 = 10.000 kayit

/** page=1'den meta.total'a ulasana kadar tum sayfalari cekip birlestirir. */
async function listAll(name, params = {}) {
  const all = [];
  let meta = {};
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const res  = await request('/' + name + qs({ ...params, page, limit: PAGE_LIMIT }));
    const rows = res.data || [];
    meta = res.meta || {};
    all.push(...rows);
    const total = Number(meta.total);
    // Son sayfa: tam sayfadan az geldiyse ya da toplam sayiya ulasildiysa dur.
    if (rows.length < PAGE_LIMIT || (Number.isFinite(total) && all.length >= total)) break;
  }
  if (page > MAX_PAGES) {
    console.warn(`listAll('${name}'): ${MAX_PAGES} sayfa (${MAX_PAGES * PAGE_LIMIT}) siniri asildi — veri EKSIK olabilir (${all.length} kayit alindi).`);
  }
  const total = Number(meta.total);
  return { data: all, meta: { ...meta, total: Number.isFinite(total) ? total : all.length } };
}

/** Kaynak icin kisa CRUD yardimcilari. */
export function resource(name) {
  return {
    list:    (params = {}) => request('/' + name + qs({ page: 1, limit: 50, ...params })),
    listAll: (params = {}) => listAll(name, params),   // tum sayfalar (200 tavanini asar)
    get:     (id)          => request(`/${name}/${id}`),
    create:  (data)        => request('/' + name, { method: 'POST', body: data }),
    update:  (id, data)    => request(`/${name}/${id}?op=guncelle`, { method: 'POST', body: data }),
    remove:  (id)          => request(`/${name}/${id}?op=sil`, { method: 'POST' })
  };
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.set(k, v);
  const s = u.toString();
  return s ? '?' + s : '';
}
