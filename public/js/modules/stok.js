// Stok Durumu — v2 modülü (yeni ekran). Referans mantık: v78 viewStok.
// İki bölüm:
//   1) Hammadde Stok Durumu — onaylı gelen − tüketilen (kesim) = net stok (kg + adet eşd.)
//   2) Sipariş Bazında Üretim Akışı (WIP) — seçili siparişin rota sırasına göre aşama zinciri
//
// SALT görüntüleme (form yok). Veri istemcide türetilir (listAll — yeni BE ucu yok):
//   onaylı gelen  = purchase_receipts, YALNIZCA incoming_inspections.overall_result='Uygun' olanlar
//                   (birim hammaddenin kendi birimi = kg kabul edilir)
//   tüketilen     = kesim operasyonundaki production toplamı × ürün ağacı çarpanı × hammadde ağırlığı
//   bağlı sipariş = purchase_requests.order_id → orders.order_no
//   WIP aşaması   = sipariş → ürün → routes(sequence) → o operasyonda üretilen production toplamı
//
// VERİ GERÇEKLİĞİ (yedekten): 57 üründen tip='Hammadde' olanlar listelenir; yalnızca 14'ünde
// materialWeight var → gerisinde kg↔adet çevrimi yapılamaz, "—" gösterilir (hata değil).
// minStockLevel hiç girilmemiş → "Düşük Stok" uyarısı başta çıkmaz. Ürün ağacı bağlantısı
// çözülemeyen hammaddede tüketilen "—" gösterilir (BOM seyrek — bkz. teslim raporu).
//
// i18n: özel görünüm — bindLang render()'ı VERİ ÇEKMEDEN yeniden çağırır (seçili sipariş
// closure'da korunur). Kod/ad/operasyon adları sunucudan geldiği gibi basılır.

import { resource } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr } from '../core/format.js';

const mapProductFull = (r) => ({
  id: r.id, code: r.code, name: r.name, type: r.type,
  materialWeight: r.materialWeight, minStockLevel: r.minStockLevel, outgoingOperationId: r.outgoingOperationId,
});

const CUT_RE = /kesim|cutting/i;   // kesim operasyonu ad eşleşmesi

export async function viewStok(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let products, operations, trees, receipts, requests, inspections, orders, workOrders, routes, production;
  try {
    products = await loadLookup('product-codes', mapProductFull);
    operations = await loadLookup('operations', mapNamed);
    trees = (await resource('product-trees').listAll()).data;
    receipts = (await resource('purchase-receipts').listAll()).data;
    requests = (await resource('purchase-requests').listAll()).data;
    inspections = (await resource('incoming-inspections').listAll()).data;
    orders = (await resource('orders').listAll()).data;
    workOrders = (await resource('work-orders').listAll()).data;
    routes = (await resource('routes').listAll()).data;
    production = (await resource('production').listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewStok(container) }));
    return;
  }

  // — Ürün ağacı (BOM): hammadde id → Map(bitmiş ürün kodu id → çarpan) —
  const nodeById = new Map(trees.map(n => [n.id, n]));
  const rootProductOf = (n) => { let c = n, g = 0; while (c && c.parentId != null && nodeById.has(c.parentId) && g++ < 100) c = nodeById.get(c.parentId); return c; };
  const multFromRoot = (n) => { let m = 1, c = n, g = 0; while (c && c.parentId != null && nodeById.has(c.parentId) && g++ < 100) { const q = Number(c.unitQuantity); m *= (q > 0 ? q : 1); c = nodeById.get(c.parentId); } return m; };
  const rawToProducts = new Map();   // rawId → Map(finishedProductId → mult)
  const addRaw = (rawId, F, m) => { if (rawId == null || F == null) return; if (!rawToProducts.has(rawId)) rawToProducts.set(rawId, new Map()); const mm = rawToProducts.get(rawId); mm.set(F, (mm.get(F) || 0) + m); };
  for (const n of trees) {
    const F = rootProductOf(n)?.productCodeId;
    const m = multFromRoot(n);
    if (n.materialCodeId != null) addRaw(n.materialCodeId, F, m);
    // Hammadde tipindeki bir kod doğrudan ağaç düğümüyse (kök değilse) onu da say
    if (n.parentId != null && products.byId.get(n.productCodeId)?.type === 'Hammadde') addRaw(n.productCodeId, F, m);
  }

  // — Kesim operasyonu id'leri: ad eşleşmesi; yoksa hammadde "çıkan operasyon"u —
  let cuttingOps = new Set(operations.rows.filter(o => CUT_RE.test(o.name || '')).map(o => o.id));
  if (cuttingOps.size === 0) {
    for (const p of products.rows) if (p.type === 'Hammadde' && p.outgoingOperationId != null) cuttingOps.add(p.outgoingOperationId);
  }

  // — Bitmiş ürün başına kesim üretimi (adet) —
  const woById = new Map(workOrders.map(w => [w.id, w]));
  const orderById = new Map(orders.map(o => [o.id, o]));
  const cutByProduct = new Map();
  for (const p of production) {
    const wo = woById.get(p.workOrderId); if (!wo || !cuttingOps.has(wo.operationId)) continue;
    const ord = orderById.get(wo.orderId); if (!ord) continue;
    cutByProduct.set(ord.productCodeId, (cutByProduct.get(ord.productCodeId) || 0) + (Number(p.actualQuantity) || 0));
  }

  // — Onaylı gelen: incoming_inspections.overallResult='Uygun' olan girişler (Şartlı Kabul SAYILMAZ) —
  const approvedReceiptIds = new Set(inspections.filter(i => i.overallResult === 'Uygun' && i.purchaseReceiptId != null).map(i => i.purchaseReceiptId));
  const reqById = new Map(requests.map(r => [r.id, r]));
  const gelenByMat = new Map();
  const ordersByMat = new Map();
  for (const rc of receipts) {
    if (!approvedReceiptIds.has(rc.id)) continue;
    const req = reqById.get(rc.purchaseRequestId); if (!req || req.materialCodeId == null) continue;
    const mat = req.materialCodeId;
    gelenByMat.set(mat, (gelenByMat.get(mat) || 0) + (Number(rc.quantity) || 0));
    if (req.orderId != null) { if (!ordersByMat.has(mat)) ordersByMat.set(mat, new Set()); ordersByMat.get(mat).add(req.orderId); }
  }

  // — Her hammadde için satır verisi —
  function buildRawRows() {
    return products.rows.filter(p => p.type === 'Hammadde').sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr')).map(H => {
      const W = Number(H.materialWeight) > 0 ? Number(H.materialWeight) : null;
      const gelenKg = gelenByMat.get(H.id) || 0;
      const fmap = rawToProducts.get(H.id);
      const bomLinked = !!(fmap && fmap.size);
      let tuketilenAdet = null;
      if (bomLinked) { tuketilenAdet = 0; for (const [F, mult] of fmap) tuketilenAdet += (cutByProduct.get(F) || 0) * mult; }
      const tuketilenKg = (tuketilenAdet != null && W) ? tuketilenAdet * W : null;
      let netKg = null;
      if (tuketilenKg != null) netKg = gelenKg - tuketilenKg;
      else if (!bomLinked) netKg = gelenKg;                       // bilinen tüketim yok
      // (bomLinked ama ağırlık yoksa netKg kg cinsinden hesaplanamaz → null)
      const urunler = bomLinked ? [...fmap.keys()].map(F => products.byId.get(F)?.code).filter(Boolean) : [];
      const orderIds = [...(ordersByMat.get(H.id) || [])];
      const minStok = H.minStockLevel != null && H.minStockLevel !== '' ? Number(H.minStockLevel) : null;
      let durum = null;   // { text, cls, min }
      if (netKg != null) {
        if (netKg < 0) durum = { key: 'stok.negative', cls: 'danger', min: minStok };
        else if (minStok != null && netKg < minStok) durum = { key: 'stok.low', cls: 'warning', min: minStok };
      }
      return { H, W, gelenKg, tuketilenAdet, tuketilenKg, netKg, urunler, orderIds, durum };
    });
  }

  // — WIP: seçili siparişin aşama zinciri —
  let selectedOrderId = orders[0]?.id ?? null;

  function stagesFor(order) {
    if (!order) return [];
    const steps = routes.filter(r => r.productCodeId === order.productCodeId);
    const bySeq = new Map();   // sequence → operationId (ilk rota)
    for (const r of steps) if (!bySeq.has(r.sequence)) bySeq.set(r.sequence, r.operationId);
    const seqList = [...bySeq.entries()].sort((a, b) => a[0] - b[0]);
    const produced = (opId) => production.reduce((s, p) => {
      const wo = woById.get(p.workOrderId);
      return (wo && wo.orderId === order.id && wo.operationId === opId) ? s + (Number(p.actualQuantity) || 0) : s;
    }, 0);
    const rows = seqList.map(([seq, opId], i) => ({
      sira: i + 1, ad: operations.byId.get(opId)?.name || ('#' + opId), uretilen: produced(opId),
    }));
    return rows.map((r, i) => {
      const next = rows[i + 1];
      const aktarilan = next ? next.uretilen : 0;
      const stok = r.uretilen - aktarilan;
      const son = i === rows.length - 1;
      return { ...r, aktarilan, stok, son, ilk: i === 0 };
    });
  }

  render();
  bindLang(container, render);

  function render() {
    const rawRows = buildRawRows();
    const kg = (v) => fmtTr(Math.round(Number(v))) + ' ' + t('stok.kg');
    const adet = (v, suffix) => fmtTr(Math.round(Number(v))) + ' ' + suffix;

    const rawTable = rawRows.map(r => {
      const H = r.H;
      const codeLink = `<a class="xlink mono" href="#product-codes?id=${H.id}">${esc(H.code || '')}</a>`;
      const gelenAdet = r.W ? adet(r.gelenKg / r.W, t('stok.pieceEq')) : '—';
      const tukKg = r.tuketilenKg != null ? kg(r.tuketilenKg) : '—';
      const tukAdet = r.tuketilenAdet != null ? adet(r.tuketilenAdet, t('stok.piece')) : '—';
      const netStr = r.netKg != null ? kg(r.netKg) : '—';
      const netAdet = (r.netKg != null && r.W) ? adet(r.netKg / r.W, t('stok.pieceEq')) : '—';
      const netColor = r.netKg != null ? (r.netKg < 0 ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--color-neutral-500)';
      const durumHTML = r.durum
        ? `<span class="stok-badge stok-badge-${r.durum.cls}"${r.durum.min != null ? ` title="${esc(t('stok.minLevel', { n: fmtTr(r.durum.min) }))}"` : ''}>${esc(t(r.durum.key))}</span>`
        : '';
      const orders_ = r.orderIds.length
        ? r.orderIds.map(oid => `<a class="xlink" href="#orders?id=${oid}">${esc(orderById.get(oid)?.orderNo || ('#' + oid))}</a>`).join(', ')
        : `<span class="text-muted">${esc(t('stok.generalStock'))}</span>`;
      return `
        <tr>
          <td class="stok-c-prod">
            <div class="mono stok-ellip">${r.urunler.length ? r.urunler.map(esc).join(', ') : '—'}</div>
            <div class="stok-sub stok-ellip">${esc(H.name || '')}</div>
          </td>
          <td>${codeLink}</td>
          <td class="stok-num"><div class="mono">${esc(kg(r.gelenKg))}</div><div class="stok-sub">${esc(gelenAdet)}</div></td>
          <td class="stok-num"><div class="mono">${esc(tukKg)}</div><div class="stok-sub">${esc(tukAdet)}</div></td>
          <td class="stok-num"><div class="mono" style="font-weight:500; color:${netColor};">${esc(netStr)}</div><div class="stok-sub">${esc(netAdet)}</div></td>
          <td>${durumHTML}</td>
          <td class="stok-orders">${orders_}</td>
        </tr>`;
    }).join('');

    const rawSection = `
      <div class="panel stok-panel">
        <div class="stok-panel-head">
          <div class="stok-panel-title">${esc(t('stok.rawTitle'))}</div>
          <div class="stok-panel-sub">${esc(t('stok.rawSubtitle'))}</div>
        </div>
        <div class="stok-tablewrap">
          <table class="stok-table">
            <thead><tr>
              <th class="stok-c-prod">${esc(t('stok.colProduct'))}</th>
              <th>${esc(t('stok.colMaterial'))}</th>
              <th class="stok-num">${esc(t('stok.colIncoming'))}</th>
              <th class="stok-num">${esc(t('stok.colConsumed'))}</th>
              <th class="stok-num">${esc(t('stok.colNet'))}</th>
              <th>${esc(t('stok.colStatus'))}</th>
              <th>${esc(t('stok.colOrders'))}</th>
            </tr></thead>
            <tbody>${rawRows.length ? rawTable : `<tr><td colspan="7" class="text-muted" style="padding:18px;">${esc(t('stok.noRaw'))}</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;

    // — WIP —
    let wipSection = '';
    if (orders.length) {
      if (selectedOrderId == null || !orderById.has(selectedOrderId)) selectedOrderId = orders[0].id;
      const order = orderById.get(selectedOrderId);
      const ordersList = orders.map(o => {
        const on = o.id === selectedOrderId;
        return `
          <div class="stok-ord${on ? ' on' : ''}" data-oid="${o.id}">
            <div class="mono stok-ord-no">${esc(o.orderNo || '')}</div>
            <div class="stok-ord-meta">${esc((products.byId.get(o.productCodeId)?.code || '') + ' · ' + fmtTr(o.targetQuantity) + ' ' + t('stok.piece'))}</div>
          </div>`;
      }).join('');

      const stages = stagesFor(order);
      const stagesHTML = stages.length ? stages.map(s => {
        const dolu = s.stok > 0;
        const numColor = dolu ? 'var(--color-accent-700)' : 'var(--color-neutral-400)';
        const numBg = dolu ? 'var(--color-accent)' : 'var(--color-surface)';
        const numInk = dolu ? '#fff' : 'var(--color-neutral-700)';
        const stokColor = s.stok < 0 ? 'var(--color-danger)' : 'var(--color-success)';
        return `
          <div class="stok-stage">
            <div class="stok-stage-mark">
              <div class="stok-stage-num" style="border-color:${numColor}; background:${numBg}; color:${numInk};">${s.sira}</div>
              <div class="stok-stage-line" style="${s.son ? 'background:transparent;' : ''}"></div>
            </div>
            <div class="stok-stage-body">
              <div class="stok-stage-titlerow">
                <span class="stok-stage-name">${esc(s.ad)}</span>
                ${s.ilk ? `<span class="stok-stage-note">${esc(t('stok.rawSeeTable'))}</span>` : ''}
              </div>
              <div class="stok-stage-nums">
                <div><div class="stok-stage-lbl">${esc(t('stok.stageProduced'))}</div><div class="mono stok-stage-val">${esc(fmtTr(s.uretilen))}</div></div>
                <div><div class="stok-stage-lbl">${esc(s.son ? t('stok.stageConsumeLast') : t('stok.stageTransferred'))}</div><div class="mono stok-stage-val">${esc(fmtTr(s.aktarilan))}</div></div>
                <div><div class="stok-stage-lbl">${esc(s.son ? t('stok.stageFinished') : t('stok.stageWip'))}</div><div class="mono stok-stage-val" style="font-weight:500; color:${stokColor};">${esc(fmtTr(s.stok))}</div></div>
              </div>
            </div>
          </div>`;
      }).join('') : `<div class="text-muted" style="padding:16px 0;">${esc(t('stok.noRoute'))}</div>`;

      wipSection = `
        <div class="stok-wip-label">${esc(t('stok.wipTitle'))}</div>
        <div class="stok-wip">
          <div class="panel stok-ordlist">
            <div class="stok-ordlist-head">${esc(t('stok.ordersHead'))}</div>
            <div class="stok-ordlist-body">${ordersList}</div>
          </div>
          <div class="panel stok-stages">
            <div class="stok-stages-head">
              <span class="mono stok-stages-code">${esc(products.byId.get(order.productCodeId)?.code || '')}</span>
              <span class="stok-stages-sub">${esc((products.byId.get(order.productCodeId)?.name || '') + ' — ' + (order.orderNo || ''))}</span>
            </div>
            <div class="stok-stages-body">${stagesHTML}</div>
          </div>
        </div>`;
    }

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.stok'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('stok.subtitle'))}</div>
        </div>
      </div>
      ${rawSection}
      ${wipSection}
    `;

    // sipariş seçimi (WIP)
    container.querySelectorAll('.stok-ord').forEach(el =>
      el.addEventListener('click', () => { selectedOrderId = Number(el.dataset.oid); render(); }));
  }
}
