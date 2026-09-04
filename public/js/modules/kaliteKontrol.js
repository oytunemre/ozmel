// Kalite Kontrol — v2 modülü (yeni ekran). Tasarım: Kalite-Kontrol-v2.dc.html.
// Referans mantık: v78 viewKalite / kontrolPlaniForUrun / orderQualityStats.
//
// Sipariş bazında kontrol planı: solda kontrol planı OLAN siparişler, sağda seçili
// siparişin plan maddeleri (sıra + operasyon bazında gruplu). Ölçüsel maddeye değer,
// nitel maddeye Uygun / Uygun Değil girilir. Sonuç ölçüselde otomatik: alt ≤ değer ≤ üst.
//
// APPEND-ONLY: her giriş quality_measurements'a YENİ satır (üzerine yazmaz). Ekranda
// (sipariş, madde) için EN SON ölçüm gösterilir; geçmiş korunur. Satır içi anlık kayıt,
// toast'suz sessiz; hata olursa uyarı. Kaydedilen ölçüm yerel diziye eklenip yeniden çizilir.
//
// Veri istemcide türetilir (listAll — yeni BE ucu yok): control_plans + quality_measurements
// + orders + product_codes. Grup başlığı operationLabel (ham metin) ile — operation_id çoğu
// rota-dışı maddede (Hammadde Kabul) NULL.
//
// i18n: özel görünüm — bindLang render()'ı VERİ ÇEKMEDEN yeniden çağırır (seçili sipariş +
// vardiya + eklenen ölçümler closure'da korunur). Karakteristik/spesifikasyon metni ham basılır.

import { resource } from '../core/api.js';
import { errorState, emptyState, esc } from '../core/states.js';
import { toast } from '../core/toast.js';
import { loadLookup, mapProduct } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDateTR } from '../core/format.js';
import { fmtISO } from '../core/report.js';

const PASS = 'Uygun';
const FAIL = 'Uygun Değil';
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Sıra sıralaması: G (Girdi) başta, sayılar, S (Sevk) sonda.
const seqRank = (s) => s === 'G' ? -1 : s === 'S' ? 1000 : (isFinite(+s) ? +s : 999);

export async function viewKaliteKontrol(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let products, plans, measurements, orders;
  try {
    products = await loadLookup('product-codes', mapProduct);
    plans = (await resource('control-plans').listAll()).data;
    measurements = (await resource('quality-measurements').listAll()).data;
    orders = (await resource('orders').listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewKaliteKontrol(container) }));
    return;
  }

  // Ürün başına plan maddeleri; yalnızca planı olan ürünlerin siparişleri listelenir.
  const plansByProduct = new Map();
  for (const p of plans) {
    if (!plansByProduct.has(p.productCodeId)) plansByProduct.set(p.productCodeId, []);
    plansByProduct.get(p.productCodeId).push(p);
  }
  const planOrders = orders.filter(o => plansByProduct.has(o.productCodeId));

  let selectedOrderId = planOrders[0]?.id ?? null;
  let shift = '1';

  // (sipariş, madde) için EN SON ölçüm — append-only, en yüksek id son kayıt.
  function latestByPlan(orderId) {
    const m = new Map();
    for (const q of measurements) {
      if (q.orderId !== orderId) continue;
      const prev = m.get(q.controlPlanId);
      if (!prev || q.id > prev.id) m.set(q.controlPlanId, q);
    }
    return m;
  }

  // Ölçüsel sonuç: alt ≤ değer ≤ üst (eksik limit tolerans sınırı sayılmaz). Değer yoksa null.
  function resultFor(item, meas) {
    if (item.type === 'nitel') return meas?.result ?? null;
    const v = meas ? meas.value : null;
    if (v == null) return null;
    const okLow = item.lowerLimit == null || v >= item.lowerLimit;
    const okUp = item.upperLimit == null || v <= item.upperLimit;
    return okLow && okUp ? PASS : FAIL;
  }

  // Sipariş özeti: girilen/toplam madde + uygunsuz sayısı.
  function statsFor(order) {
    const items = plansByProduct.get(order.productCodeId) || [];
    const latest = latestByPlan(order.id);
    let done = 0, bad = 0;
    for (const it of items) {
      const s = resultFor(it, latest.get(it.id));
      if (s) { done++; if (s === FAIL) bad++; }
    }
    return { total: items.length, done, bad };
  }

  async function saveMeasurement(item, value, result) {
    const payload = {
      orderId: selectedOrderId, controlPlanId: item.id,
      measuredAt: fmtISO(new Date()), shift,
      value: item.type === 'nitel' ? null : value, result,
    };
    try {
      const saved = await resource('quality-measurements').create(payload);
      const row = saved?.data ?? saved;   // Response::created -> { data }
      if (row && row.id != null) measurements.push(row);
      render();
    } catch (err) {
      toast(err?.message || t('kk.saveError'), 'error');
    }
  }

  render();
  bindLang(container, render);

  function render() {
    if (!planOrders.length) {
      container.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'module-head';
      head.innerHTML = `<div><h2>${esc(t('menu.kalite-kontrol'))}</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('kk.subtitle'))}</div></div>`;
      container.appendChild(head);
      container.appendChild(emptyState({ title: t('kk.emptyTitle'), message: t('kk.emptyBody') }));
      return;
    }
    if (selectedOrderId == null || !planOrders.some(o => o.id === selectedOrderId)) selectedOrderId = planOrders[0].id;
    const order = planOrders.find(o => o.id === selectedOrderId);
    const prod = products.byId.get(order.productCodeId) || {};

    // Sol liste
    const ordersHTML = planOrders.map(o => {
      const on = o.id === selectedOrderId;
      const st = statsFor(o);
      const p = products.byId.get(o.productCodeId) || {};
      return `
        <div class="kk-ord${on ? ' on' : ''}" data-oid="${o.id}">
          <div class="mono kk-ord-code">${esc(p.code || ('#' + o.productCodeId))}</div>
          <div class="kk-ord-meta">${esc((o.orderNo || '') + ' · ' + fmtTr(o.targetQuantity) + ' ' + t('kk.piece') + (o.requestedDeliveryDate ? ' · ' + t('kk.due') + ' ' + fmtDateTR(o.requestedDeliveryDate) : ''))}</div>
          <div class="kk-ord-prog">
            <span class="mono">${esc(t('kk.progress', { done: st.done, total: st.total }))}</span>
            ${st.bad > 0 ? `<span class="kk-badge-bad">${esc(t('kk.nonconforming', { n: st.bad }))}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    // Sağ panel — maddeler sıra + operasyon bazında gruplu
    const items = (plansByProduct.get(order.productCodeId) || []).slice();
    const latest = latestByPlan(order.id);
    const groups = new Map();   // key -> { rank, seq, op, items: [] }
    for (const it of items) {
      const key = (it.sequenceLabel ?? '') + '|' + (it.operationLabel ?? '');
      if (!groups.has(key)) groups.set(key, { rank: seqRank(it.sequenceLabel), seq: it.sequenceLabel ?? '', op: it.operationLabel ?? '', items: [] });
      groups.get(key).items.push(it);
    }
    const groupList = [...groups.values()].sort((a, b) => a.rank - b.rank || String(a.op).localeCompare(String(b.op), 'tr'));

    const st = statsFor(order);
    const groupsHTML = groupList.map(g => {
      const heading = [g.seq, g.op].filter(s => s !== '' && s != null).join('. ') || t('common.dash');
      const rows = g.items.map(it => renderItem(it, latest.get(it.id))).join('');
      return `<div class="kk-group"><div class="kk-group-head">${esc(heading)}</div>${rows}</div>`;
    }).join('');

    container.innerHTML = `
      <div class="module-head kk-head">
        <div>
          <h2>${esc(t('kk.title'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('kk.subtitle'))}</div>
        </div>
        <div class="kk-shift">
          <span class="kk-shift-lbl">${esc(t('kk.shift'))}</span>
          <div class="kk-shift-seg">
            ${['1', '2', '3'].map(v => `<button type="button" class="kk-shift-btn${v === shift ? ' on' : ''}" data-shift="${v}">${v}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="kk-grid">
        <div class="panel kk-orders">
          <div class="kk-orders-head">${esc(t('kk.ordersHead'))}</div>
          <div class="kk-orders-body">${ordersHTML}</div>
        </div>

        <div class="panel kk-items">
          <div class="kk-items-head">
            <span class="mono kk-h-code">${esc(prod.code || '')}</span>
            <span class="kk-h-name">— ${esc(prod.name || '')}</span>
            <a class="xlink kk-h-order" href="#orders?id=${order.id}">${esc(order.orderNo || '')}</a>
            <span class="kk-h-sum">${esc(t('kk.summary', { done: st.done, total: st.total, bad: st.bad, shift }))}</span>
          </div>
          <div class="kk-items-body">${groupsHTML || `<div class="text-muted" style="padding:16px 0;">${esc(t('kk.noItems'))}</div>`}</div>
        </div>
      </div>`;

    // olaylar
    container.querySelectorAll('.kk-shift-btn').forEach(b =>
      b.addEventListener('click', () => { shift = b.dataset.shift; render(); }));
    container.querySelectorAll('.kk-ord').forEach(el =>
      el.addEventListener('click', (e) => { if (e.target.closest('a')) return; selectedOrderId = Number(el.dataset.oid); render(); }));
    if (canWrite) {
      container.querySelectorAll('.kk-num').forEach(inp => inp.addEventListener('change', () => {
        const id = Number(inp.dataset.pid);
        const it = items.find(x => x.id === id);
        const raw = inp.value.trim();
        if (it == null || raw === '' || isNaN(parseFloat(raw))) return;
        const v = parseFloat(raw);
        saveMeasurement(it, v, resultFor(it, { value: v }));
      }));
      container.querySelectorAll('.kk-nitel-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = items.find(x => x.id === Number(btn.dataset.pid));
        if (it) saveMeasurement(it, null, btn.dataset.result === 'pass' ? PASS : FAIL);
      }));
    }
  }

  function badge(result) {
    if (result === PASS) return `<span class="kk-res kk-res-pass">${esc(t('kk.pass'))}</span>`;
    if (result === FAIL) return `<span class="kk-res kk-res-fail">${esc(t('kk.fail'))}</span>`;
    return `<span class="kk-res kk-res-none">${esc(t('common.dash'))}</span>`;
  }

  function renderItem(it, meas) {
    const result = resultFor(it, meas);
    const disAttr = canWrite ? '' : ' disabled';
    if (it.type === 'nitel') {
      const spec = it.specificationRaw || '';
      const pass = result === PASS, fail = result === FAIL;
      return `
        <div class="kk-item">
          <div class="kk-item-info">
            <div class="kk-item-char">${esc(it.characteristic)}</div>
            ${spec ? `<div class="mono kk-item-spec">${esc(spec)}</div>` : ''}
          </div>
          <div class="kk-nitel">
            <button type="button" class="kk-nitel-btn kk-nitel-pass${pass ? ' on' : ''}" data-pid="${it.id}" data-result="pass"${disAttr}>${esc(t('kk.pass'))}</button>
            <button type="button" class="kk-nitel-btn kk-nitel-fail${fail ? ' on' : ''}" data-pid="${it.id}" data-result="fail"${disAttr}>${esc(t('kk.fail'))}</button>
          </div>
        </div>`;
    }
    // ölçüsel
    const lo = it.lowerLimit, up = it.upperLimit;
    const hasRange = lo != null && up != null && up > lo;
    const ratio = (v) => Math.min(1, Math.max(0, (v - lo) / (up - lo)));
    const has = meas && meas.value != null;
    const specParts = [];
    if (it.nominal != null) specParts.push(fmtTr(it.nominal) + (it.unit ? ' ' + it.unit : ''));
    if (lo != null || up != null) specParts.push('(' + (lo != null ? fmtTr(lo) : '') + ' … ' + (up != null ? fmtTr(up) : '') + (it.unit ? ' ' + it.unit : '') + ')');
    const spec = specParts.join('  ') || (it.specificationRaw || '');
    const markerColor = result === FAIL ? 'var(--color-danger)' : 'var(--color-success)';
    const frame = result === FAIL ? 'var(--color-danger)' : 'var(--color-neutral-400)';
    const nominalPos = hasRange && it.nominal != null ? (ratio(it.nominal) * 100) + '%' : '50%';
    const markerPos = hasRange && has ? (ratio(meas.value) * 100) + '%' : '0%';
    return `
      <div class="kk-item">
        <div class="kk-item-info">
          <div class="kk-item-char">${esc(it.characteristic)}</div>
          <div class="mono kk-item-spec">${esc(spec)}</div>
        </div>
        <div class="kk-olcusel">
          <input type="number" step="any" class="kk-num mono" data-pid="${it.id}" value="${has ? esc(String(meas.value)) : ''}" placeholder="${esc(t('kk.valuePlaceholder'))}" style="border-color:${frame};"${disAttr}>
          <span class="kk-bar">
            <i class="kk-bar-track"></i>
            <i class="kk-bar-nominal" style="left:${nominalPos};"></i>
            <i class="kk-bar-marker" style="left:${markerPos}; background:${markerColor}; display:${hasRange && has ? 'block' : 'none'};"></i>
          </span>
          <span class="kk-res-wrap">${badge(result)}</span>
        </div>
      </div>`;
  }
}
