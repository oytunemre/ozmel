// Satınalma İstekleri — v2 modülü. Ortak FE katmanı (core/) üzerine.
//
// Malzeme/ürün kodu listeden seçilir (material_code_id FK, YALNIZ tip='Hammadde', alfabetik).
// Kod seçilince Malzeme Adı (product_codes.name) ve Birim (product_codes.unit) otomatik dolar;
// ikisi de elle değiştirilebilir (referans satinalmaKoduSecildi). Serbest metin malzeme adı
// material_description sütununda tutulur (migration 044). Birim açılır liste (adet/kg).
// i18n: kullanıcıya görünen metinler t() ile; etiketler () => t(...) (canlı dil değişimi).

import { resource } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, UNIT_OPTIONS } from '../core/lookups.js';
import { childTable } from './_childDetail.js';
import { t } from '../core/i18n.js';

const api = resource('purchase-requests');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewPurchaseRequests(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, orders, receiptsByReq;
  try {
    // products + girişler paralel; orders lookup'ı products.label kullandığından SONRA.
    [products, receiptsByReq] = await Promise.all([
      loadLookup('product-codes', (p) => ({ id: p.id, code: p.code, name: p.name, type: p.type, unit: p.unit })),
      loadReceipts(),
    ]);
    orders = await loadLookup('orders', (o) => ({ id: o.id, code: o.orderNo, name: products.label(o.productCodeId) }));
  } catch (err) { container.innerHTML = ''; container.appendChild(errorState({ message: err.message, onRetry: () => viewPurchaseRequests(container) })); return; }

  // Satınalma girişleri istek bazında gruplanır (genişleyen satır için).
  async function loadReceipts() {
    const { data } = await resource('purchase-receipts').listAll();
    const m = new Map();
    for (const g of data) { if (!m.has(g.purchaseRequestId)) m.set(g.purchaseRequestId, []); m.get(g.purchaseRequestId).push(g); }
    return m;
  }

  const matCode = (r) => products.byId.get(r.materialCodeId)?.code || ('#' + r.materialCodeId);

  const table = new DataTable(container, {
    title: () => t('menu.purchase-requests'),
    subtitle: () => t('pr.subtitle'),
    canWrite,
    addLabel: () => t('action.newRequest'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => api.listAll().then(r => r.data),
    // Arama hem kodda hem açıklamada (ürün adı + serbest malzeme adı) hem tedarikçide.
    searchText: (r) => [
      r.materialCodeId ? matCode(r) : '', products.byId.get(r.materialCodeId)?.name,
      r.materialDescription, r.supplier,
    ].filter(Boolean).join(' '),
    emptyMessage: () => t('pr.empty'),
    // Malzemesi seçilmemiş (ETL'de koda çözülemeyen) istekler işaretlenir.
    rowClass: (r) => r.materialCodeId ? '' : 'row-warn',
    flagFilter: { test: (r) => !r.materialCodeId, label: (n) => t('pr.noMaterialCount', { n }) },
    // Genişleyen satır: bu isteğe bağlı satınalma girişleri (expand her çizimde t() yeniden çözer).
    expand: (r) => childTable(
      [{ label: t('field.date'), key: 'date' },
       { label: t('field.quantity'), render: (g) => esc(String(g.quantity ?? '—')), mono: true },
       { label: t('field.note'), render: (g) => esc(g.note || '—') }],
      receiptsByReq.get(r.id) || [], t('pr.noReceipts')),
    columns: [
      // Malzeme: iki satır — üstte kod (mono), altında açıklama (küçük, gri). Açıklama yoksa yalnız kod.
      { label: () => t('field.material'), render: (r) => {
          if (!r.materialCodeId) return `<span class="cell-empty">${esc(t('common.notSelected'))}</span>`;
          const desc = r.materialDescription || '';
          return `<div class="mono">${esc(matCode(r))}</div>`
            + (desc ? `<div class="text-muted" style="font-size:12px;">${esc(desc)}</div>` : '');
        } },
      { label: () => t('field.quantity'), render: (r) => r.quantity ?? '—', className: 'mono' },
      { label: () => t('field.unit'), render: (r) => esc(r.unit || '—') },
      { label: () => t('field.supplier'), render: (r) => esc(r.supplier || '—') },
      { label: () => t('field.requestDate'), render: (r) => esc(r.requestDate || '—') },
      { label: () => t('field.expectedDate'), render: (r) => esc(r.expectedDate || '—') }
    ]
  });

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);

    // Malzeme seçici: yalnız Hammadde, koda göre alfabetik. Düzenlenen kaydın malzemesi
    // (eski veri) hammadde değilse listeye ekle — etiket/seçim kaybolmasın.
    const hammadde = products.rows.filter(r => r.type === 'Hammadde')
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'tr'));
    if (row?.materialCodeId && !hammadde.some(r => r.id === row.materialCodeId)) {
      const cur = products.byId.get(row.materialCodeId);
      if (cur) hammadde.unshift(cur);
    }
    const materialFk = new FkSelect({ source: async () => ({ rows: hammadde, total: hammadde.length }), rows: hammadde, value: row?.materialCodeId ?? null, placeholder: t('pr.selectMaterial') });
    const orderFk = new FkSelect({ source: orders.source, rows: orders.rows, value: row?.orderId ?? null, placeholder: t('pr.selectOrderOpt') });

    // Malzeme Adı (metin) + Birim (select) — kod seçilince otomatik dolar; ayrı editör
    // (component) olduklarından materialFk.onChange içinden setValue ile yazılabilir.
    const nameComp = textComponent(t('pr.materialNamePlaceholder'));
    const unitComp = selectComponent(UNIT_OPTIONS);

    openDrawer({
      title: () => t(editing ? 'pr.editTitle' : 'pr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { unit: '' },
      fields: [
        { name: 'materialCodeId', label: () => t('pr.materialField'), type: 'fk', fk: materialFk, required: true,
          help: () => t('pr.materialHelp'),
          // Kod seçilince ad + birim otomatik dolar (elle değiştirilebilir).
          onChange: (id) => {
            const p = id ? products.byId.get(id) : null;
            if (!p) return;
            nameComp.setValue(p.name || '');
            unitComp.setValue(p.unit || '');
          } },
        { name: 'materialDescription', label: () => t('pr.materialName'), type: 'component', component: nameComp },
        { name: 'quantity', label: () => t('field.quantity'), type: 'number', step: 'any', required: true },
        { name: 'unit', label: () => t('field.unit'), type: 'component', component: unitComp },
        { name: 'supplier', label: () => t('field.supplier'), type: 'text' },
        { name: 'requestDate', label: () => t('field.requestDate'), type: 'date' },
        { name: 'expectedDate', label: () => t('field.expectedDate'), type: 'date' },
        { name: 'orderId', label: () => t('pr.linkedOrder'), type: 'fk', fk: orderFk },
        { name: 'note', label: () => t('field.note'), type: 'textarea' }
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => { toast(t('toast.saved'), 'success'); await table.reload(); table.flash(saved.id); },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('pr.deleteTitle'),
      body: t('pr.deleteBody', { name: row.materialCodeId ? matCode(row) : (row.materialDescription || t('common.notSelected')) }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('toast.deleted'), 'success'); await table.reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// --- drawer için basit özel editörler ({ el, getValue, setValue, onChange }) ---
// Malzeme Adı: kod seçilince otomatik dolan ama elle düzenlenebilir metin.
function textComponent(placeholder = '') {
  const inp = document.createElement('input');
  inp.className = 'input'; inp.type = 'text';
  if (placeholder) inp.placeholder = placeholder;
  let cb = null;
  inp.addEventListener('input', () => cb && cb());
  return {
    el: inp,
    getValue: () => inp.value.trim(),
    setValue: (v) => { inp.value = v ?? ''; },
    onChange: (f) => { cb = f; },
  };
}
// Birim: kod seçilince otomatik dolan açılır liste. Değer listede yoksa (eski veri) eklenir.
function selectComponent(options) {
  const sel = document.createElement('select');
  sel.className = 'input';
  for (const o of options) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.appendChild(op); }
  let cb = null;
  sel.addEventListener('change', () => cb && cb());
  return {
    el: sel,
    getValue: () => sel.value,
    setValue: (v) => {
      const val = v ?? '';
      if (val !== '' && !options.some(o => String(o.value) === String(val)) && ![...sel.options].some(o => o.value === String(val))) {
        const op = document.createElement('option'); op.value = String(val); op.textContent = String(val); sel.appendChild(op);
      }
      sel.value = String(val);
    },
    onChange: (f) => { cb = f; },
  };
}
