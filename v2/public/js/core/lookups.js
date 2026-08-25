// lookups.js — FK kaynak listelerini bir kez yükler; FkSelect kaynağı, satırlar ve
// id->kayıt haritası döner. FK id'lerini tabloda ad/kod olarak göstermek için kullanılır.

import { resource } from './api.js';

/**
 * @param {string} name kaynak adı (or. 'product-codes')
 * @param {(row)=>{id:any, code?:string, name?:string}} mapRow
 * @returns {Promise<{rows:Array, source:Function, byId:Map, label:(id)=>string}>}
 */
export async function loadLookup(name, mapRow) {
  const { data } = await resource(name).list({ limit: 200 });
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
