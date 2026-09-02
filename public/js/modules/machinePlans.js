// Üretim Planı (Haftalık Makine Planlama) — v2 modülü. Tasarım: Uretim-Plani-v2.dc.html.
// Spec: docs/Uretim-Plani.md. Gözlem + planlama aracı; iş emri açmaz.
//
// Izgara: satır = makine (routes.work_center distinct), kolon = 7 gün. Her hücre TEK
// plan (migration 033: (tarih, iş merkezi) tekil). Hücre = <select> (açık iş emri /
// plansız ürün) + hedef <input> + iş emri no notu. Kaydetme satır içi, upsert:
// varsa güncelle / yoksa oluştur (repo) / seçim temizlenirse sil. Çakışma: mevcut
// 409 STALE deseni + "Yeniden yükle" (değiştiren kişi/saat ve fark YOK).
//
// i18n: özel görünüm — bindLang ile dil değişince VERİ ÇEKMEDEN yeniden çizilir
// (hafta/gruplama closure'da korunur). Makine/ürün/operasyon adları sunucudan geldiği
// gibi basılır (çevrilmez).

import { resource, request } from '../core/api.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, getLang, bindLang } from '../core/i18n.js';
import { netWorkMinutes, resolveCapacity } from '../core/capacity.js';

const api = resource('machine-plans');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';
const DAYS = () => getLang() === 'en'
  ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  : ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// Operasyon sırası sabit öncelik; kalanlar alfabetik (ada göre, tr). Sabit liste İngilizce
// adlar içerir — veride Türkçe operasyonlar eşleşmez, alfabetiğe düşer (bilinçli, liste genişletilmez).
const OP_ORDER = ['Cutting', 'Countersink', 'Marking', 'Pressing', 'Packaging'];
const COLLAPSED_LS = 'ozmel.mp.collapsedOps';   // kullanıcı başına kapalı operasyon grupları

export async function viewMachinePlans(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, centers, ops, workOrders, routes, caps, wh, plans;
  const producedByWo = new Map();
  try {
    products = await loadLookup('product-codes', mapProduct);
    centers  = await loadLookup('work-centers', mapNamed);
    ops      = await loadLookup('operations', mapNamed);
    workOrders = (await resource('work-orders').listAll()).data;
    routes   = (await resource('routes').listAll()).data;
    caps     = (await resource('capacities').listAll()).data;
    plans    = (await api.listAll()).data;
    const production = (await resource('production').listAll()).data;
    for (const p of production) producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
    ({ data: wh } = await request('/working-hours'));
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewMachinePlans(container) }));
    return;
  }

  const netMin = netWorkMinutes(wh);

  // --- türetmeler (routes'tan) ---
  const machineIds = [...new Set(routes.map(r => r.workCenterId))].filter(v => v != null);
  const productsByWc = new Map();   // wcId -> sıralı ürün kodu id'leri
  const opCountByWc = new Map();    // wcId -> Map(opId -> adet)  → tek operasyon seçimi
  for (const r of routes) {
    if (!productsByWc.has(r.workCenterId)) productsByWc.set(r.workCenterId, new Set());
    productsByWc.get(r.workCenterId).add(r.productCodeId);
    if (r.operationId != null) {
      if (!opCountByWc.has(r.workCenterId)) opCountByWc.set(r.workCenterId, new Map());
      const m = opCountByWc.get(r.workCenterId);
      m.set(r.operationId, (m.get(r.operationId) || 0) + 1);
    }
  }
  for (const [wc, set] of productsByWc) {
    productsByWc.set(wc, [...set].sort((a, b) => (products.byId.get(a)?.code || '').localeCompare(products.byId.get(b)?.code || '', 'tr')));
  }
  // makinenin (tek) operasyonu: rotalarında en sık geçen; yoksa null.
  const opOfWc = new Map();
  for (const wc of machineIds) {
    const m = opCountByWc.get(wc);
    let best = null, bestN = -1;
    if (m) for (const [opId, n] of m) if (n > bestN) { best = opId; bestN = n; }
    opOfWc.set(wc, best);
  }
  const remaining = (wo) => (Number(wo.targetQuantity) || 0) - (producedByWo.get(wo.id) || 0);
  const openWosByWc = new Map();    // wcId -> açık iş emirleri (Aktif, kalan>0)
  for (const wo of workOrders) {
    if (wo.status !== 'Aktif' || wo.workCenterId == null || remaining(wo) <= 0) continue;
    if (!openWosByWc.has(wo.workCenterId)) openWosByWc.set(wo.workCenterId, []);
    openWosByWc.get(wo.workCenterId).push(wo);
  }
  const woById = new Map(workOrders.map(w => [w.id, w]));

  // --- görünüm durumu (oturum boyu; kapalı gruplar localStorage'da) ---
  let weekStart = mondayOf(new Date());
  let groupMode = 'wc';            // 'wc' (İş Merkezine Göre) | 'op' (Operasyona Göre)
  let onlyPlanned = false;         // "Sadece bu hafta planlı makineleri göster"
  let byCell = indexPlans();

  function indexPlans() {
    const m = new Map();
    for (const p of plans) m.set(p.workCenterId + '|' + p.date, p);   // (tarih,wc) tekil → tek plan
    return m;
  }
  function planFor(wc, date) { return byCell.get(wc + '|' + date); }
  function weekDates() { return Array.from({ length: 7 }, (_, i) => fmtISO(addDays(weekStart, i))); }
  function collapsedOps() { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_LS) || '[]')); } catch { return new Set(); } }
  function setCollapsedOps(s) { localStorage.setItem(COLLAPSED_LS, JSON.stringify([...s])); }

  render();
  bindLang(container, render);

  // makine sırası (ada göre); "sadece planlı" işaretliyse haftada planı olanlar.
  function machineRows(dates) {
    let ids = machineIds.slice();
    if (onlyPlanned) ids = ids.filter(wc => dates.some(d => planFor(wc, d)));
    return ids.sort((a, b) => centers.label(a).localeCompare(centers.label(b), 'tr'));
  }

  function render() {
    const dates = weekDates();
    const days = DAYS();
    const todayISO = fmtISO(new Date());
    const label = `${fmtTR(weekStart)} – ${fmtTR(addDays(weekStart, 6))}`;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.machine-plans'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('mp.subtitle'))}</div>
        </div>
      </div>
      <div class="mp-weekbar">
        <button class="btn btn-ghost btn-sm" id="mp-prev">← ${esc(t('mp.prevWeek'))}</button>
        <span class="mp-weeklabel">${esc(label)}</span>
        <button class="btn btn-ghost btn-sm" id="mp-next">${esc(t('mp.nextWeek'))} →</button>
        <span class="grow"></span>
        <button class="btn btn-ghost btn-sm" id="mp-today">${esc(t('mp.thisWeek'))}</button>
      </div>`;

    if (machineIds.length === 0) {          // Rota tanımlı makine yok
      const st = document.createElement('div');
      st.className = 'state';
      st.innerHTML = `<div class="state-title">${esc(t('mp.noMachines'))}</div><div class="state-msg">${esc(t('mp.noMachinesMsg'))}</div>`;
      const go = document.createElement('button');
      go.className = 'btn btn-secondary'; go.style.marginTop = '10px';
      go.textContent = t('mp.goRoutes');
      go.addEventListener('click', () => { location.hash = '#routes'; });
      st.appendChild(go);
      container.appendChild(st);
      wireWeekNav();
      return;
    }

    // panel başlığı + kontroller
    const panel = document.createElement('div');
    panel.className = 'mp-panel';
    panel.innerHTML = `
      <div class="mp-panel-hd">
        <h3>${esc(t('mp.gridTitle'))}</h3>
        <span class="grow"></span>
        <label class="mp-check"><input type="checkbox" id="mp-onlyplanned"${onlyPlanned ? ' checked' : ''}> ${esc(t('mp.onlyPlanned'))}</label>
        <div class="mp-group-toggle">
          <button type="button" class="mp-grp-btn${groupMode === 'wc' ? ' on' : ''}" data-mode="wc">${esc(t('mp.byWorkCenter'))}</button>
          <button type="button" class="mp-grp-btn${groupMode === 'op' ? ' on' : ''}" data-mode="op">${esc(t('mp.byOperation'))}</button>
        </div>
      </div>`;
    container.appendChild(panel);

    // ızgara
    const grid = document.createElement('div');
    grid.className = 'wgrid mp-grid';
    const table = document.createElement('table');
    const colCls = (d, i) => d === todayISO ? 'mp-today' : (i >= 5 ? 'mp-weekend' : '');
    table.innerHTML = `<thead><tr>
        <th class="mp-mcol">${esc(t('field.workCenter'))}</th>
        ${dates.map((d, i) => `<th class="${colCls(d, i)}">${days[i]}<span class="date">${d.slice(8)}.${d.slice(5, 7)}</span></th>`).join('')}
      </tr></thead>`;
    const tbody = document.createElement('tbody');

    const rows = machineRows(dates);
    if (groupMode === 'op') appendOpGroups(tbody, rows, dates, colCls);
    else for (const wc of rows) tbody.appendChild(machineRow(wc, dates, colCls, true));

    table.appendChild(tbody);
    grid.appendChild(table);
    container.appendChild(grid);

    // özet tabloları
    container.appendChild(summaries(dates, days));

    wireWeekNav();
    panel.querySelector('#mp-onlyplanned').addEventListener('change', (e) => { onlyPlanned = e.target.checked; render(); });
    panel.querySelectorAll('.mp-grp-btn').forEach(b => b.addEventListener('click', () => { groupMode = b.dataset.mode; render(); }));
  }

  function wireWeekNav() {
    container.querySelector('#mp-prev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); render(); });
    container.querySelector('#mp-next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); render(); });
    container.querySelector('#mp-today').addEventListener('click', () => { weekStart = mondayOf(new Date()); render(); });
  }

  // Operasyona göre gruplu satırlar
  function appendOpGroups(tbody, rows, dates, colCls) {
    const collapsed = collapsedOps();
    const byOp = new Map();          // opLabel -> { opId, machines[] }
    for (const wc of rows) {
      const opId = opOfWc.get(wc);
      const key = opId != null ? ops.label(opId) : t('mp.opNone');
      if (!byOp.has(key)) byOp.set(key, { opId, machines: [] });
      byOp.get(key).machines.push(wc);
    }
    const orderedKeys = [...byOp.keys()].sort(opSort);
    for (const key of orderedKeys) {
      const { machines } = byOp.get(key);
      const isCollapsed = collapsed.has(key);
      const hd = document.createElement('tr');
      hd.className = 'mp-opgroup';
      const th = document.createElement('td');
      th.colSpan = 8;
      th.innerHTML = `<span class="mp-caret">${isCollapsed ? '▸' : '▾'}</span> ${esc(key.toLocaleUpperCase('tr'))} <span class="mp-opcount">(${machines.length} ${esc(t('mp.machineWord'))})</span>`;
      th.addEventListener('click', () => {
        const s = collapsedOps();
        if (s.has(key)) s.delete(key); else s.add(key);
        setCollapsedOps(s); render();
      });
      hd.appendChild(th);
      tbody.appendChild(hd);
      if (!isCollapsed) for (const wc of machines) tbody.appendChild(machineRow(wc, dates, colCls, false));
    }
  }

  // Bir makine satırı. showOp: makine adı altında operasyon alt-satırı (yalnız iş merkezi modunda).
  function machineRow(wc, dates, colCls, showOp) {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.className = 'mp-mcol' + (showOp ? '' : ' mp-indent');
    const opId = opOfWc.get(wc);
    nameTd.innerHTML = `<div class="mp-mname">${esc(centers.label(wc))}</div>` +
      (showOp && opId != null ? `<div class="mp-mop">${esc(ops.label(opId))}</div>` : '');
    tr.appendChild(nameTd);
    for (let i = 0; i < dates.length; i++) tr.appendChild(cellTd(wc, dates[i], colCls(dates[i], i)));
    return tr;
  }

  // Hücre: <select> + hedef <input> + iş emri no notu. Plan yoksa yalnız — seçili select.
  function cellTd(wc, date, cls) {
    const td = document.createElement('td');
    td.className = 'mp-cell' + (cls ? ' ' + cls : '');
    const plan = planFor(wc, date);

    const sel = document.createElement('select');
    sel.className = 'mp-sel';
    if (!canWrite) { sel.disabled = true; sel.title = t('mp.readOnly'); }
    sel.appendChild(optEl('', '—'));

    // Açık İş Emirleri grubu (seçili iş emri açık değilse yine de görünsün)
    const openWos = (openWosByWc.get(wc) || []).slice();
    if (plan && plan.workOrderId && !openWos.some(w => w.id === plan.workOrderId)) {
      const w = woById.get(plan.workOrderId);
      if (w) openWos.unshift(w);
    }
    if (openWos.length) {
      const g = document.createElement('optgroup'); g.label = t('mp.grpOpenWo');
      for (const wo of openWos) {
        const code = products.byId.get(wo.productCodeId)?.code || '';
        g.appendChild(optEl('wo:' + wo.id, `IE-${wo.woNo} — ${code} (${fmtTr(remaining(wo))} ${t('mp.remainingWord')})`));
      }
      sel.appendChild(g);
    }
    // Ürün (plansız) grubu
    const prods = productsByWc.get(wc) || [];
    if (prods.length) {
      const g = document.createElement('optgroup'); g.label = t('mp.grpProduct');
      for (const pid of prods) g.appendChild(optEl('pr:' + pid, products.byId.get(pid)?.code || ('#' + pid)));
      sel.appendChild(g);
    }
    sel.value = plan ? (plan.workOrderId ? 'wo:' + plan.workOrderId : 'pr:' + plan.productCodeId) : '';
    sel.addEventListener('change', () => onSelect(wc, date, sel.value));
    td.appendChild(sel);

    if (plan) {
      // kapasite (hedef aşımı için): iş emri operasyonu, yoksa makine operasyonu
      const opId = plan.workOrderId ? (woById.get(plan.workOrderId)?.operationId ?? null) : opOfWc.get(wc);
      const cap = resolveCapacity(caps, plan.productCodeId, wc, opId, netMin);
      const over = cap != null && plan.targetQuantity != null && Number(plan.targetQuantity) > cap;

      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = 'any'; inp.className = 'mp-target' + (over ? ' mp-over' : '');
      inp.value = plan.targetQuantity != null ? String(plan.targetQuantity) : '';
      if (!canWrite) { inp.disabled = true; inp.title = t('mp.readOnly'); }
      inp.addEventListener('change', () => onTarget(wc, date, inp.value));
      td.appendChild(inp);

      if (plan.workOrderId) {
        const wo = woById.get(plan.workOrderId);
        if (wo) { const n = document.createElement('div'); n.className = 'mp-wonote'; n.textContent = `IE-${wo.woNo}`; td.appendChild(n); }
      }
      if (over) { const n = document.createElement('div'); n.className = 'mp-capnote'; n.textContent = t('mp.overCap', { n: fmtTr(cap) }); td.appendChild(n); }
    }
    return td;
  }

  // --- kaydetme (upsert / sil) ---
  function onSelect(wc, date, val) {
    if (!canWrite) return;
    if (val === '') return removeCell(wc, date);
    if (val.startsWith('wo:')) {
      const wo = woById.get(Number(val.slice(3)));
      if (!wo) return;
      const cap = resolveCapacity(caps, wo.productCodeId, wc, wo.operationId ?? null, netMin);
      return persist(wc, date, { productCodeId: wo.productCodeId, workOrderId: wo.id, targetQuantity: cap });
    }
    if (val.startsWith('pr:')) {
      const pid = Number(val.slice(3));
      const prev = planFor(wc, date);                 // plansız: hedef elle → varsa koru
      return persist(wc, date, { productCodeId: pid, workOrderId: null, targetQuantity: prev?.targetQuantity ?? null });
    }
  }
  function onTarget(wc, date, raw) {
    const plan = planFor(wc, date);
    if (!plan) return;
    const v = raw.trim() === '' ? null : Number(raw);
    persist(wc, date, { productCodeId: plan.productCodeId, workOrderId: plan.workOrderId ?? null, targetQuantity: v });
  }

  async function persist(wc, date, f) {
    const existing = planFor(wc, date);
    try {
      if (existing) {
        await api.update(existing.id, {
          date, workCenterId: wc, productCodeId: f.productCodeId,
          workOrderId: f.workOrderId ?? null, targetQuantity: f.targetQuantity ?? null,
          note: existing.note ?? '', updatedAt: existing.updatedAt,
        });
      } else {
        await api.create({
          date, workCenterId: wc, productCodeId: f.productCodeId,
          workOrderId: f.workOrderId ?? null, targetQuantity: f.targetQuantity ?? null, note: '',
        });
      }
      await reload();
    } catch (err) { onError(err); }
  }
  async function removeCell(wc, date) {
    const existing = planFor(wc, date);
    if (!existing) return;
    try { await api.remove(existing.id); await reload(); }
    catch (err) { onError(err); }
  }
  function onError(err) {
    // Çakışma sadeleştirilmiş: 409 STALE → uyarı + yeniden yükle (kişi/saat, fark YOK).
    if (err && (err.status === 409 || err.code === 'STALE')) { toast(t('err.STALE'), 'danger'); reload(); }
    else toast(err?.message || t('err.GENERIC'), 'danger');
  }
  async function reload() { plans = (await api.listAll()).data; byCell = indexPlans(); render(); }

  // --- üç özet tablosu (İş Merkezi / Operasyon / Ürün) ---
  function summaries(dates, days) {
    const wrap = document.createElement('div');
    wrap.className = 'mp-summaries';
    const byWc = new Map(), byOp = new Map(), byPr = new Map();
    const add = (map, key, di, qty) => {
      if (!map.has(key)) map.set(key, new Array(7).fill(0));
      map.get(key)[di] += qty;
    };
    dates.forEach((d, di) => {
      for (const wc of machineIds) {
        const p = planFor(wc, d);
        if (!p || p.targetQuantity == null) continue;
        const qty = Number(p.targetQuantity) || 0;
        add(byWc, centers.label(wc), di, qty);
        const opId = opOfWc.get(wc);
        add(byOp, opId != null ? ops.label(opId) : t('mp.opNone'), di, qty);
        add(byPr, products.byId.get(p.productCodeId)?.code || ('#' + p.productCodeId), di, qty);
      }
    });
    wrap.appendChild(summaryTable(t('mp.sumWorkCenter'), t('field.workCenter'), byWc, days, (a, b) => a.localeCompare(b, 'tr')));
    wrap.appendChild(summaryTable(t('mp.sumOperation'), t('field.operation'), byOp, days, opSort));
    wrap.appendChild(summaryTable(t('mp.sumProduct'), t('field.productShort'), byPr, days, (a, b) => a.localeCompare(b, 'tr')));
    return wrap;
  }
  function summaryTable(title, firstCol, map, days, keySort) {
    const panel = document.createElement('div');
    panel.className = 'mp-sum';
    const keys = [...map.keys()].sort(keySort);
    let bodyHtml;
    if (keys.length === 0) {
      bodyHtml = `<tr><td class="mp-sum-empty" colspan="9">${esc(t('mp.noPlansYet'))}</td></tr>`;
    } else {
      bodyHtml = keys.map(k => {
        const arr = map.get(k);
        const total = arr.reduce((a, b) => a + b, 0);
        return `<tr><td>${esc(k)}</td>${arr.map(v => `<td class="mono">${v ? esc(fmtTr(v)) : '—'}</td>`).join('')}<td class="mono mp-sum-total">${esc(fmtTr(total))}</td></tr>`;
      }).join('');
    }
    panel.innerHTML = `
      <div class="mp-sum-title">${esc(title)}</div>
      <table>
        <thead><tr><th>${esc(firstCol)}</th>${days.map(d => `<th>${esc(d)}</th>`).join('')}<th>${esc(t('mp.weekTotal'))}</th></tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>`;
    return panel;
  }

  // Operasyon sıralaması: sabit öncelik, sonra alfabetik (tr). opNone en sona.
  function opSort(a, b) {
    const none = t('mp.opNone');
    if (a === none) return 1;
    if (b === none) return -1;
    const ia = OP_ORDER.indexOf(a), ib = OP_ORDER.indexOf(b);
    const ra = ia === -1 ? OP_ORDER.length : ia;
    const rb = ib === -1 ? OP_ORDER.length : ib;
    return ra - rb || a.localeCompare(b, 'tr');
  }
}

// --- yardımcılar ---
function optEl(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
function fmtTr(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 3 }); }
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtTR(d) { return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
