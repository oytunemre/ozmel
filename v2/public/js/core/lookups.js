// lookups.js — FK kaynak listelerini bir kez yükler; FkSelect kaynağı, satırlar ve
// id->kayıt haritası döner. FK id'lerini tabloda ad/kod olarak göstermek için kullanılır.

import { resource } from './api.js';

// In-flight deduplication: aynı kaynağa EŞZAMANLI istekler tek fetch'i paylaşır.
// (Kalıcı cache değil — çözülünce silinir, düzenleme sonrası taze veri gelir.)
const inflight = new Map();
function fetchList(name) {
  if (inflight.has(name)) return inflight.get(name);
  const p = resource(name).list({ limit: 200 })
    .then(r => r.data)
    .finally(() => inflight.delete(name));
  inflight.set(name, p);
  return p;
}

/**
 * @param {string} name kaynak adı (or. 'product-codes')
 * @param {(row)=>{id:any, code?:string, name?:string}} mapRow
 * @returns {Promise<{rows:Array, source:Function, byId:Map, label:(id)=>string}>}
 */
export async function loadLookup(name, mapRow) {
  const data = await fetchList(name);
  const rows = data.map(mapRow);
  const byId = new Map(rows.map(r => [r.id, r]));
  return {
    rows,
    byId,
    source: async () => ({ rows, total: rows.length }),
    label: (id) => {
      const r = byId.get(id);
      if (!r) return id == null ? '—' : '#' + id;
      return [r.code, r.name].filter(Boolean).join(' · ');
    }
  };
}

// Sık kullanılan eşlemeler
export const mapProduct = (r) => ({ id: r.id, code: r.code, name: r.name });
export const mapNamed = (r) => ({ id: r.id, name: r.name });

// Birim seçenekleri — gerçek veride yalnızca adet/kg kullanılıyor. Kısıt SADECE
// arayüzde; backend VARCHAR kalır, ileride yeni birim migration'sız eklenebilir.
export const UNIT_OPTIONS = [
  { value: '', label: '— Birim —' },
  { value: 'adet', label: 'adet' },
  { value: 'kg', label: 'kg' }
];

// Durum seçenekleri (backend VARCHAR; kısıt yalnızca arayüzde). Gerçek veriden.
export const ORDER_STATUS_OPTIONS = [
  { value: 'Aktif', label: 'Aktif' },
  { value: 'Tamamlandı', label: 'Tamamlandı' },
  { value: 'İptal', label: 'İptal' }
];
export const TASK_STATUS_OPTIONS = [
  { value: 'Başlamadı', label: 'Başlamadı' },
  { value: 'Devam Ediyor', label: 'Devam Ediyor' },
  { value: 'Tamamlandı', label: 'Tamamlandı' }
];
export const INSPECTION_RESULT_OPTIONS = [
  { value: '', label: '— Sonuç —' },
  { value: 'Kabul', label: 'Kabul' },
  { value: 'Red', label: 'Red' },
  { value: 'Şartlı Kabul', label: 'Şartlı Kabul' }
];

/**
 * Mevcut değer listede yoksa başa ekler — beklenmedik bir eski değer (or. ETL'den)
 * select'te sessizce KAYBOLMASIN/DEĞİŞMESİN. Düzenlemede güvenli.
 */
export function withCurrent(options, current) {
  if (current && !options.some(o => o.value === current)) {
    return [{ value: current, label: current + ' (mevcut)' }, ...options];
  }
  return options;
}
