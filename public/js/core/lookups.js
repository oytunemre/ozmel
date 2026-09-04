// lookups.js — FK kaynak listelerini bir kez yükler; FkSelect kaynağı, satırlar ve
// id->kayıt haritası döner. FK id'lerini tabloda ad/kod olarak göstermek için kullanılır.

import { resource } from './api.js';
import { t } from './i18n.js';

// In-flight deduplication: aynı kaynağa EŞZAMANLI istekler tek fetch'i paylaşır.
// (Kalıcı cache değil — çözülünce silinir, düzenleme sonrası taze veri gelir.)
const inflight = new Map();
function fetchList(name) {
  if (inflight.has(name)) return inflight.get(name);
  const p = resource(name).listAll()
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
      // FK boş (null/0/undefined) -> "seçilmedi/Not selected"; dolu ama yüklenmemiş -> '#id'.
      // Geçerli id'ler >=1 olduğundan 0'ı da boş sayarız (NULL FK'nin '#0' görünmesini önler).
      if (!r) return !id ? t('common.notSelected') : '#' + id;
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

// Ölçüm birimi (kalite noktaları) — gerçek veride yalnızca mm (+ boş). Backend VARCHAR.
export const MEASURE_UNIT_OPTIONS = [
  { value: '', label: '— Birim —' },
  { value: 'mm', label: 'mm' }
];

// Nokta/karakteristik tipi — backend değeri olcusel/nitel, ekranda Türkçe etiket.
export const POINT_TYPE_OPTIONS = [
  { value: 'olcusel', label: 'Ölçüsel' },
  { value: 'nitel', label: 'Nitel' }
];

/** Bir değerin listedeki etiketi (yoksa ham değer). Tabloda ham ENUM göstermemek için. */
export function optionLabel(options, value) {
  const o = options.find(x => x.value === value);
  return o ? o.label : (value ?? '');
}

/**
 * Ölçüm sayısı biçimi: en az bir ondalık, sondaki gereksiz sıfırlar kırpılır.
 *   183 -> 183.0 · 13.2800 -> 13.28 · 8.9 -> 8.9 · boş/null -> '—'
 * Sadece ölçüm alanları için (nominal/limitler) — miktar/adet DEĞİL.
 */
export function fmtMeasure(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  let s = n.toFixed(4).replace(/(\.\d*?)0+$/, '$1');
  if (s.endsWith('.')) s += '0';
  return s;
}

/** Değer tolerans dışında mı? Sayı değilse (or. 'Uygun') tolerans yok -> false. */
export function outOfTolerance(v, lower, upper) {
  const n = Number(v);
  if (v == null || v === '' || !isFinite(n)) return false;
  if (lower != null && lower !== '' && n < Number(lower)) return true;
  if (upper != null && upper !== '' && n > Number(upper)) return true;
  return false;
}

// Durum seçenekleri (backend VARCHAR; kısıt yalnızca arayüzde). Gerçek veriden.
export const ORDER_STATUS_OPTIONS = [
  { value: 'Aktif', label: 'Aktif' },
  { value: 'Tamamlandı', label: 'Tamamlandı' },
  { value: 'İptal', label: 'İptal' }
];
export const TASK_STATUS_OPTIONS = [
  { value: 'Başlamadı', label: 'Başlamadı' },
  { value: 'Devam Ediyor', label: 'Devam Ediyor' },
  { value: 'Beklemede', label: 'Beklemede' },
  { value: 'Tamamlandı', label: 'Tamamlandı' }
];
// Görev önceliği — BE'de TR; ekranda prio.* ile gösterilir (kısıt yalnızca arayüzde).
export const TASK_PRIORITY_OPTIONS = [
  { value: 'Yüksek', label: 'Yüksek' },
  { value: 'Orta', label: 'Orta' },
  { value: 'Düşük', label: 'Düşük' }
];
export const INSPECTION_RESULT_OPTIONS = [
  { value: '', label: '— Sonuç —' },
  { value: 'Kabul', label: 'Kabul' },
  { value: 'Red', label: 'Red' },
  { value: 'Şartlı Kabul', label: 'Şartlı Kabul' }
];
// First-Off kontrol gerekçeleri — fabrikadaki resmi formdaki sabit yedi seçenek.
// Çoklu seçim; first_off_reasons çocuk tablosuna yazılır. Listede olmayan
// serbest metin gerekçe de eklenebilir (ReasonChecklist bileşeni).
export const FIRST_OFF_REASON_OPTIONS = [
  'Yeni iş emri / seri başlangıcı',
  'Setup / kurulum sonrası',
  'Vardiya değişimi',
  'Uzun duruş sonrası',
  'Ayar / parametre değişimi',
  'Malzeme / lot değişimi',
  'Düzeltici faaliyet sonrası'
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
