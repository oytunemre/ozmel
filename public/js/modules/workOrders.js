// İş Emirleri — v2 (yeniden yazım). Tasarım: tasarim/Is-Emirleri-v2.dc.html.
// Referans: v78 viewWorkOrders / viewWorkOrdersSiparisBazli / viewWorkOrdersListe /
// viewDurusKayitlari. Spec: docs/is-emirleri-brief.md. Tutarlılık raporu madde 2.
//
// Üç sekme: Sipariş Bazlı (operasyon zinciri) · Liste · Duruşlar. Sekme seçimi
// localStorage'da. Bu dosya ADIM ADIM yazılıyor — şu an SEKME 1 (Sipariş Bazlı) tam;
// Liste ve Duruşlar sonraki commit'lerde. Hesaplar mevcut core fonksiyonlarıyla:
// eta.js (estimateCompletion), capacity.js (downtimeMinutes), format.js.
//
// i18n: özel görünüm (DataTable yok) — makine/ürün/operasyon adları sunucudan geldiği
// gibi basılır (çevrilmez), etiketler t() ile. focusId (#work-orders?id=<işEmriId>)
// korunur: gelen id bir iş emriyse siparişi seçilir, o adım açılır.

import { resource, request } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { toast } from '../core/toast.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed, withCurrent } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDateTR, fmtDuration } from '../core/format.js';
import { startOfDay, parseISO } from '../core/report.js';
import { estimateCompletion } from '../core/eta.js';
import { downtimeMinutes } from '../core/capacity.js';

const TAB_LS = 'ozmel.wo.tab';
const TABS = [['siparis', 'wo.tabOrder'], ['liste', 'wo.tabList'], ['durus', 'wo.tabDowntime']];
// Sekme 2 (Liste) durum filtresi seçenekleri. MODÜL SEVİYESİNDE — render() ilk çağrıda
// (localStorage'daki sekme 'liste' ise) renderListTab'ı çalıştırır; fonksiyon içinde
// tanımlanırsa kullanımdan önce erişilir ve TDZ hatası verir (node --check yakalamaz).
const LIST_FILTERS = [['hepsi', 'wo.fAll'], ['aktif', 'wo.fActive'], ['tamam', 'wo.fDone']];
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

export async function viewWorkOrders(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let products, ops, centers, operators, reasons, orders, workOrders, production, routes, plans, wh;
  try {
    const d = (n) => resource(n).listAll().then(r => r.data);
    [products, ops, centers, operators, reasons, orders, workOrders, production, routes, plans, wh] = await Promise.all([
      loadLookup('product-codes', mapProduct),
      loadLookup('operations', mapNamed),
      loadLookup('work-centers', mapNamed),
      loadLookup('operators', (o) => ({ id: o.id, code: o.badgeNo, name: o.fullName })),
      loadLookup('downtime-reasons', (r) => ({ id: r.id, name: r.name, isActive: r.isActive })),
      d('orders'), d('work-orders'), d('production'), d('routes'), d('machine-plans'),
      request('/working-hours').then(r => r.data),
    ]);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewWorkOrders(container, params) }));
    return;
  }

  const today = startOfDay(new Date());

  // --- türetmeler ---
  const woByOrder = new Map();        // orderId -> [wo]
  for (const w of workOrders) { if (!woByOrder.has(w.orderId)) woByOrder.set(w.orderId, []); woByOrder.get(w.orderId).push(w); }
  const producedByWo = new Map();     // woId -> toplam üretilen
  const prodByWo = new Map();         // woId -> [üretim kaydı]
  for (const p of production) {
    producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
    if (!prodByWo.has(p.workOrderId)) prodByWo.set(p.workOrderId, []);
    prodByWo.get(p.workOrderId).push(p);
  }
  const planDatesByWo = new Map();    // woId -> Set(tarih) (machine_plans)
  for (const pl of plans) {
    if (pl.workOrderId == null || !pl.date) continue;
    if (!planDatesByWo.has(pl.workOrderId)) planDatesByWo.set(pl.workOrderId, new Set());
    planDatesByWo.get(pl.workOrderId).add(pl.date);
  }
  const orderById = new Map(orders.map(o => [o.id, o]));
  const woById = new Map(workOrders.map(w => [w.id, w]));
  const reasonName = (id) => { const r = reasons.byId.get(id); return r ? r.name : ''; };
  const produced = (w) => producedByWo.get(w.id) || 0;

  // Bir siparişin iş emirlerini sıraya (sequence) göre adımlara böler; aynı sırada birden
  // çok iş emri (farklı makine) → bölünmüş adım (A/B).
  function stepsOf(o) {
    const wos = (woByOrder.get(o.id) || []).slice()
      .sort((a, b) => (a.sequence ?? 1e9) - (b.sequence ?? 1e9) || String(a.woNo).localeCompare(String(b.woNo), 'tr'));
    const bySeq = new Map();
    for (const w of wos) { const s = w.sequence ?? 0; if (!bySeq.has(s)) bySeq.set(s, []); bySeq.get(s).push(w); }
    return [...bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([sequence, group]) => {
      const target = group.reduce((s, w) => s + (Number(w.targetQuantity) || 0), 0);
      const done = group.reduce((s, w) => s + produced(w), 0);
      return { sequence, group, target, done, split: group.length > 1 };
    });
  }

  // Sipariş özeti: ilerleme (zincir min(üretilen,hedef)/hedef), hesaplanan durum, termin riski.
  function summaryOf(o) {
    const wos = woByOrder.get(o.id) || [];
    const hedef = wos.reduce((s, w) => s + (Number(w.targetQuantity) || 0), 0);
    const uretilen = wos.reduce((s, w) => s + Math.min(produced(w), Number(w.targetQuantity) || 0), 0);
    const pct = hedef > 0 ? Math.min(100, Math.round(uretilen / hedef * 100)) : 0;
    const tamamMi = o.status === 'Tamamlandı' || (hedef > 0 && uretilen >= hedef);
    const due = o.requestedDeliveryDate ? parseISO(o.requestedDeliveryDate) : null;
    let eta = null;
    if (wos.length && !tamamMi) {
      const lastSeq = wos.reduce((m, w) => Math.max(m, w.sequence ?? 0), 0);
      for (const w of wos.filter(w => (w.sequence ?? 0) === lastSeq)) {
        const e = estimateCompletion(w, production, { today });
        if (e.etaDate && (!eta || e.etaDate > eta)) eta = e.etaDate;
      }
    }
    const riskli = !!(eta && due && eta > due);
    const status = !wos.length ? 'waiting'
      : o.status === 'İptal' ? 'stopped'
      : tamamMi ? 'done'
      : riskli ? 'risk' : 'active';
    return { wos, hedef, uretilen, pct, tamamMi, due, eta, riskli, status };
  }
  const summaries = new Map(orders.map(o => [o.id, summaryOf(o)]));

  // --- görünüm durumu ---
  let tab = readTab();
  let secili = null;                  // seçili sipariş id
  let arama = '';
  let planTarihi = '';                // sol kolon plan tarihi filtresi
  const acikAdim = new Map();         // 'orderId|sequence' -> açık mı (elle override)
  // Sekme 2 (Liste) durumu
  let listeArama = '';
  let listeFiltre = 'hepsi';          // hepsi | aktif | tamam
  let listeTarihi = '';
  // Sekme 3 (Duruşlar) durumu
  let durusTarihi = '';

  // focusId: gelen id bir iş emriyse → siparişini seç, sekmeyi Sipariş Bazlı yap, adımı aç.
  if (params?.id != null) {
    const w = workOrders.find(x => String(x.id) === String(params.id));
    if (w && w.orderId != null) {
      tab = 'siparis'; secili = w.orderId;
      acikAdim.set(w.orderId + '|' + (w.sequence ?? 0), true);
    }
  }

  render();
  bindLang(container, render);

  // ---------- kabuk ----------
  function render() {
    const woCount = workOrders.length;
    // .content flex:1 + padding:24px verir; burada height:100% ile onu doldururuz
    // (kaydırma panellerin/sekmenin kendi içinde). Yatay/dikey ek padding EKLENMEZ.
    container.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; min-height:0;">
        <div style="flex:none; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; padding-bottom:14px;">
          <div style="min-width:0;">
            <h2 style="margin:0;">${esc(t('menu.work-orders'))}</h2>
            <div style="font-size:13.5px; color:var(--color-neutral-600); margin-top:5px;">${esc(t('wo.subtitleV2', { orders: orders.length, wos: woCount }))}</div>
          </div>
          <div id="wo-tabs" style="margin-left:auto; flex:none; display:flex; border:1px solid var(--color-neutral-400);">
            ${TABS.map(([id, key], i) => {
              const on = id === tab;
              return `<button type="button" class="wo-tab" data-tab="${id}" style="height:40px; padding:0 20px; font-size:14.5px; border:0; border-left:${i === 0 ? '0' : '1px solid var(--color-neutral-400)'}; cursor:pointer; background:${on ? 'var(--color-accent-900)' : 'transparent'}; color:${on ? '#fff' : 'var(--color-text)'}; font-weight:${on ? '600' : '400'}; white-space:nowrap;">${esc(t(key))}</button>`;
            }).join('')}
          </div>
        </div>
        <div id="wo-body" style="flex:1; min-height:0;"></div>
      </div>`;

    container.querySelectorAll('.wo-tab').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.tab === tab) return;
      tab = b.dataset.tab; writeTab(tab); render();
    }));

    if (tab === 'siparis') renderOrderTab();
    else if (tab === 'liste') renderListTab();
    else renderDowntimeTab();
  }

  // ---------- SEKME 3: Duruşlar ----------
  // Duruşu olan üretim kayıtları (downtime_start + downtime_end dolu). Bir veri temizleme
  // aracı: nedeni girilmemiş duruşları bulup Düzenle ile tamamlamak için.
  function downtimeRows() {
    const rows = production
      .filter(r => r.downtimeStart && r.downtimeEnd)
      .filter(r => !durusTarihi || r.date === durusTarihi);
    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return rows;
  }

  function renderDowntimeTab() {
    const host = container.querySelector('#wo-body');
    host.style.cssText = 'flex:1; min-height:0; overflow-y:auto;';
    host.innerHTML = `
      <div style="background:#fff; border:1px solid var(--color-neutral-400);">
        <div style="padding:13px 18px 12px; border-bottom:1px solid var(--color-neutral-300); display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <span style="font-family:var(--font-heading); font-size:19px; font-weight:600;">${esc(t('wo.dtTitle'))}</span>
          <span id="wo-dtcount" style="flex:none; padding:2px 8px; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid var(--color-neutral-400); background:var(--color-neutral-100); color:var(--color-neutral-700);"></span>
          <span id="wo-dtmissing" style="flex:none; padding:2px 8px; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid var(--color-danger); background:var(--color-danger-fill); color:var(--color-danger); display:none;"></span>
          <div style="margin-left:auto; flex:none; display:flex; align-items:center; gap:8px;">
            <input type="date" id="wo-dtdate" value="${esc(durusTarihi)}" style="box-sizing:border-box; height:38px; padding:0 10px; font-family:'IBM Plex Mono',monospace; font-size:13.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
            <button type="button" id="wo-dtall" style="height:38px; padding:0 12px; font-size:13.5px; background:transparent; border:1px solid var(--color-neutral-400); cursor:pointer;">${esc(t('wo.allBtn'))}</button>
          </div>
        </div>
        <div style="padding:10px 18px 0; font-size:12.5px; color:var(--color-neutral-600);">${esc(t('wo.dtDesc'))}</div>
        <div id="wo-dtbody" style="margin-top:10px;"></div>
      </div>`;

    host.querySelector('#wo-dtdate').addEventListener('change', (e) => { durusTarihi = e.target.value; renderDowntimeBody(); });
    host.querySelector('#wo-dtall').addEventListener('click', () => { durusTarihi = ''; renderDowntimeBody(); });
    renderDowntimeBody();
  }

  function renderDowntimeBody() {
    const rows = downtimeRows();
    const missing = rows.filter(r => !r.downtimeReasonId).length;

    const countEl = container.querySelector('#wo-dtcount');
    if (countEl) countEl.textContent = t('wo.recordCount', { n: rows.length });
    const missEl = container.querySelector('#wo-dtmissing');
    if (missEl) { missEl.style.display = missing ? '' : 'none'; missEl.textContent = t('wo.dtMissing', { n: missing }); }

    const body = container.querySelector('#wo-dtbody');
    if (rows.length === 0) {
      body.innerHTML = `<div style="padding:40px 24px; text-align:center; font-size:14px; color:var(--color-neutral-600);">${esc(durusTarihi ? t('wo.dtEmptyDate') : t('wo.dtEmpty'))}</div>`;
      return;
    }
    const cols = [
      ['wo.colDate', 'left', '110px'], ['wo.colWo', 'left', '120px'], ['wo.colProduct', 'left', '110px'],
      ['wo.colOperation', 'left', '160px'], ['wo.colShift', 'left', '140px'], ['wo.colDuration', 'right', '110px'],
      ['wo.colReason', 'left', 'auto'], ['', 'right', '110px'],
    ];
    body.innerHTML = `<div style="overflow-x:auto;">
      <table style="width:100%; min-width:1060px; border-collapse:collapse; font-size:14px;">
        <thead><tr style="background:var(--color-neutral-100);">
          ${cols.map(([k, hz, w]) => `<th style="text-align:${hz}; padding:8px 12px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:0.12em; color:var(--color-neutral-700); font-weight:500; border-bottom:1px solid var(--color-neutral-300); width:${w}; white-space:nowrap;">${k ? esc(t(k)) : ''}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.map(dtRowHtml).join('')}</tbody>
      </table></div>`;
    body.querySelectorAll('.wo-dtedit').forEach(b => b.addEventListener('click', () => {
      const r = production.find(x => String(x.id) === b.dataset.id);
      if (r) openDowntimeEdit(r);
    }));
  }

  function dtRowHtml(r) {
    const w = woById.get(r.workOrderId);
    const p = w ? products.byId.get(w.productCodeId) : null;
    const dt = downtimeMinutes(r.downtimeStart, r.downtimeEnd, wh);
    const hasReason = !!r.downtimeReasonId;
    const rowBg = hasReason ? '#fff' : 'var(--color-danger-fill)';
    const td = (hz, extra = '') => `padding:9px 12px; text-align:${hz}; border-bottom:1px solid var(--color-neutral-200);${extra}`;
    const mono = "font-family:'IBM Plex Mono',monospace;";
    const nedenCell = hasReason
      ? `<span style="font-size:13.5px;">${esc(reasonName(r.downtimeReasonId))}</span>`
      : `<span style="display:inline-block; padding:2px 8px; font-size:12.5px; border:1px solid var(--color-danger); background:var(--color-danger-fill); color:var(--color-danger); white-space:nowrap;">${esc(t('wo.reasonMissing'))}</span>`;
    return `<tr style="background:${rowBg};">
      <td style="${td('left', mono + 'font-size:13px;')}">${esc(fmtDateTR(r.date) || '—')}</td>
      <td style="${td('left', mono + 'font-size:13px;')}">${esc(w ? woLabelFull(w) : '#' + r.workOrderId)}</td>
      <td style="${td('left', mono + 'font-size:13px;')}">${esc(p?.code || '—')}</td>
      <td style="${td('left', 'white-space:nowrap;')}">${esc(w && w.operationId ? ops.label(w.operationId) : '—')}</td>
      <td style="${td('left', 'white-space:nowrap;')}">${esc(r.shift ? t('shift.' + r.shift) : '—')}</td>
      <td style="${td('right', mono + 'font-size:13.5px; font-weight:500; white-space:nowrap;')}">${dt > 0 ? esc(fmtDuration(dt)) : '—'}</td>
      <td style="${td('left')}">${nedenCell}</td>
      <td style="${td('right', 'white-space:nowrap;')}">${canWrite ? `<button type="button" class="wo-dtedit" data-id="${esc(String(r.id))}" style="height:30px; padding:0 12px; font-size:13px; cursor:pointer; background:transparent; border:1px solid var(--color-neutral-400); color:var(--color-text);">${esc(t('wo.edit'))}</button>` : ''}</td>
    </tr>`;
  }

  // Yerinde düzenleme: nedeni (ve gerekirse saatleri/notu) tamamla, üretim kaydını güncelle.
  function openDowntimeEdit(r) {
    const reasonOpts = withCurrent(
      [{ value: '', label: t('wo.reasonNone') }, ...reasons.rows.filter(x => x.isActive).map(x => ({ value: String(x.id), label: x.name }))],
      r.downtimeReasonId != null ? String(r.downtimeReasonId) : null
    );
    openDrawer({
      title: () => t('wo.dtEditTitle'),
      submitLabel: () => t('action.update'),
      values: {
        downtimeStart: r.downtimeStart || '', downtimeEnd: r.downtimeEnd || '',
        downtimeReasonId: r.downtimeReasonId != null ? String(r.downtimeReasonId) : '',
        note: r.note || '', updatedAt: r.updatedAt,
      },
      fields: [
        { name: 'downtimeStart', label: () => t('ug.dtStart'), type: 'time' },
        { name: 'downtimeEnd', label: () => t('ug.dtEnd'), type: 'time' },
        { name: 'downtimeReasonId', label: () => t('ug.downtimeReason'), type: 'select', options: reasonOpts },
        { name: 'note', label: () => t('field.note'), type: 'text' },
      ],
      onSubmit: async (v) => {
        const body = {
          workOrderId: r.workOrderId, date: r.date, shift: r.shift,
          actualQuantity: r.actualQuantity, scrapQuantity: r.scrapQuantity, operatorId: r.operatorId,
          downtimeStart: v.downtimeStart || null, downtimeEnd: v.downtimeEnd || null,
          downtimeReasonId: v.downtimeReasonId ? Number(v.downtimeReasonId) : null,
          note: (v.note || '').trim(), updatedAt: v.updatedAt,
        };
        const { data } = await resource('production').update(r.id, body);
        // Yerel veriyi tazele: production dizisi + prodByWo'daki kaydı değiştir (miktar değişmez).
        const i = production.findIndex(x => x.id === data.id);
        if (i >= 0) production[i] = data;
        const arr = prodByWo.get(data.workOrderId);
        if (arr) { const j = arr.findIndex(x => x.id === data.id); if (j >= 0) arr[j] = data; }
        return data;
      },
      onSaved: () => { toast(t('toast.saved'), 'success'); renderDowntimeBody(); },
    });
  }

  // ---------- SEKME 1: Sipariş Bazlı ----------
  function renderOrderTab() {
    const host = container.querySelector('#wo-body');
    host.style.cssText = 'flex:1; overflow:hidden; min-height:0; display:grid; grid-template-columns:280px minmax(520px, 1fr); gap:18px;';
    host.innerHTML = `
      <div style="background:#fff; border:1px solid var(--color-neutral-400); display:flex; flex-direction:column; min-height:0;">
        <div style="flex:none; padding:10px 12px; border-bottom:1px solid var(--color-neutral-300); background:var(--color-neutral-100);">
          <input type="text" id="wo-search" value="${esc(arama)}" placeholder="${esc(t('wo.searchOrders'))}" style="width:100%; box-sizing:border-box; height:38px; padding:0 10px; font-size:13.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
          <div style="display:flex; gap:6px; align-items:center; margin-top:8px;">
            <input type="date" id="wo-plandate" value="${esc(planTarihi)}" style="flex:1; min-width:0; box-sizing:border-box; height:36px; padding:0 8px; font-family:'IBM Plex Mono',monospace; font-size:13px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
            <button type="button" id="wo-planall" style="flex:none; height:36px; padding:0 10px; font-size:13px; background:transparent; border:1px solid var(--color-neutral-400); cursor:pointer;">${esc(t('wo.allBtn'))}</button>
          </div>
          <div id="wo-datenote" style="font-size:12px; color:var(--color-neutral-600); margin-top:6px;"></div>
        </div>
        <div id="wo-orderlist" style="flex:1; overflow-y:auto; min-height:0;"></div>
      </div>
      <div id="wo-right" style="background:#fff; border:1px solid var(--color-neutral-400); display:flex; flex-direction:column; min-height:0; min-width:0;"></div>`;

    const search = host.querySelector('#wo-search');
    search.addEventListener('input', () => { arama = search.value; renderOrderList(); });
    host.querySelector('#wo-plandate').addEventListener('change', (e) => { planTarihi = e.target.value; renderOrderList(); });
    host.querySelector('#wo-planall').addEventListener('click', () => { planTarihi = ''; render(); });

    renderOrderList();
    renderRightPanel();
  }

  function filteredOrders() {
    const q = arama.trim().toLocaleLowerCase('tr');
    const rows = orders.filter(o => {
      const p = products.byId.get(o.productCodeId);
      if (q && ![o.orderNo, p?.code, p?.name].some(v => v && String(v).toLocaleLowerCase('tr').includes(q))) return false;
      if (planTarihi) {
        const wos = woByOrder.get(o.id) || [];
        if (!wos.some(w => planDatesByWo.get(w.id)?.has(planTarihi))) return false;
      }
      return true;
    });
    const rank = (o) => { const s = summaries.get(o.id).status; return s === 'done' ? 2 : s === 'stopped' ? 1 : 0; };
    return rows.sort((a, b) => rank(a) - rank(b)
      || String(a.requestedDeliveryDate || '~').localeCompare(String(b.requestedDeliveryDate || '~')));
  }

  function renderOrderList() {
    const list = filteredOrders();
    // seçili sipariş süzgeçle uyumlu değilse ilk satıra düş
    if (!secili || !list.some(o => o.id === secili)) secili = list[0]?.id ?? null;

    const note = container.querySelector('#wo-datenote');
    if (note) note.textContent = planTarihi
      ? t('wo.dateNoteFiltered', { n: list.length, date: fmtDateTR(planTarihi) })
      : t('wo.dateNoteAll', { n: list.length });

    const host = container.querySelector('#wo-orderlist');
    if (list.length === 0) {
      host.innerHTML = `<div style="padding:28px 16px; text-align:center; font-size:13.5px; color:var(--color-neutral-600);">${esc(t('wo.searchEmpty'))}</div>`;
      renderRightPanel();
      return;
    }
    host.innerHTML = list.map(o => {
      const z = summaries.get(o.id);
      const p = products.byId.get(o.productCodeId);
      const on = o.id === secili;
      const [dc, df] = statusStyle(z.status);
      const barColor = z.riskli ? 'var(--color-danger)' : 'var(--color-success)';
      return `<button type="button" class="wo-orow" data-id="${o.id}" style="width:100%; display:block; text-align:left; padding:12px 14px; border:0; border-bottom:1px solid var(--color-neutral-200); border-left:3px solid ${on ? 'var(--color-accent)' : 'transparent'}; background:${on ? 'var(--color-accent-100)' : '#fff'}; cursor:pointer;">
        <div style="display:flex; align-items:baseline; gap:8px;">
          <span style="font-family:'IBM Plex Mono',monospace; font-size:15px; font-weight:500; color:var(--color-accent-800);">${esc(p?.code || '—')}</span>
          <span style="font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--color-neutral-600);">${esc(o.orderNo)}</span>
        </div>
        <div style="font-size:12.5px; color:var(--color-neutral-700); margin-top:3px;">${esc(t('wo.orderMeta', { qty: fmtTr(o.targetQuantity), date: fmtDateTR(o.requestedDeliveryDate) || '—' }))}</div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:7px;">
          <span style="display:block; flex:1; height:8px; background:var(--color-neutral-200); position:relative; min-width:60px;">
            <i style="position:absolute; left:0; top:0; bottom:0; width:${z.pct}%; background:${barColor};"></i>
          </span>
          <span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--color-neutral-700);">%${z.pct}</span>
        </div>
        <span style="display:inline-block; margin-top:7px; padding:2px 8px; font-size:12px; border:1px solid ${dc}; background:${df}; color:${dc};">${esc(statusLabel(z.status))}</span>
      </button>`;
    }).join('');
    host.querySelectorAll('.wo-orow').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id);
      if (id === secili) return;
      secili = id;
      host.querySelectorAll('.wo-orow').forEach(x => {
        const sel = Number(x.dataset.id) === secili;
        x.style.borderLeftColor = sel ? 'var(--color-accent)' : 'transparent';
        x.style.background = sel ? 'var(--color-accent-100)' : '#fff';
      });
      renderRightPanel();
    }));
    renderRightPanel();
  }

  function renderRightPanel() {
    const host = container.querySelector('#wo-right');
    if (!host) return;
    const o = secili != null ? orderById.get(secili) : null;
    if (!o) { host.innerHTML = ''; return; }
    const p = products.byId.get(o.productCodeId);
    const steps = stepsOf(o);

    const headHtml = `
      <div style="flex:none; padding:13px 18px 12px; border-bottom:1px solid var(--color-neutral-300); display:flex; align-items:flex-start; gap:14px; flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-family:var(--font-heading); font-size:23px; font-weight:600; line-height:1.15;">${esc([p?.code, p?.name].filter(Boolean).join(' — '))}</div>
          <div style="font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--color-neutral-600); margin-top:3px;">${esc(t('wo.meta', { orderNo: o.orderNo, qty: fmtTr(o.targetQuantity), n: steps.length }))}</div>
        </div>
      </div>`;

    if (steps.length === 0) {
      host.innerHTML = headHtml + `
        <div style="flex:1; overflow-y:auto; min-height:0; padding:8px 18px 22px;">
          <div style="padding:56px 24px; text-align:center;">
            <div style="font-family:var(--font-heading); font-size:24px; font-weight:600;">${esc(t('wo.noWoTitle'))}</div>
            <p style="margin:8px auto 0; max-width:46ch; font-size:14px; line-height:1.6; color:var(--color-neutral-700);">${esc(t('wo.noWoBody'))}</p>
            <button type="button" id="wo-goorders" style="margin-top:18px; height:42px; padding:0 18px; font-size:14.5px; font-weight:500; background:var(--color-accent); border:1px solid var(--color-accent-700); color:#fff; cursor:pointer;">${esc(t('wo.goOrders'))}</button>
          </div>
        </div>`;
      host.querySelector('#wo-goorders')?.addEventListener('click', () => { location.hash = '#orders'; });
      return;
    }

    const firstOpen = steps.find(s => s.done < s.target) || null;
    const body = document.createElement('div');
    body.style.cssText = 'flex:1; overflow-y:auto; min-height:0; padding:8px 18px 22px;';
    steps.forEach((s, i) => body.appendChild(buildStep(o, s, i, steps.length, firstOpen)));

    host.innerHTML = headHtml;
    host.appendChild(body);
  }

  function buildStep(o, s, i, total, firstOpen) {
    const pct = s.target > 0 ? Math.min(100, Math.round(s.done / s.target * 100)) : 0;
    const tamam = s.target > 0 && s.done >= s.target;
    const devam = !tamam && s.done > 0;
    const rep = s.group[0];
    const due = o.requestedDeliveryDate ? parseISO(o.requestedDeliveryDate) : null;

    // adım ETA'sı: adımdaki iş emirlerinin en geç tahmini bitişi
    let eta = null, allComplete = true;
    for (const w of s.group) {
      const e = estimateCompletion(w, production, { today });
      if (!e.complete) allComplete = false;
      if (e.etaDate && (!eta || e.etaDate > eta)) eta = e.etaDate;
    }
    const gecikmeGun = (!tamam && eta && due && eta > due) ? daysBetween(due, eta) : 0;
    const gecikme = gecikmeGun > 0;

    const key = o.id + '|' + s.sequence;
    const acik = acikAdim.has(key) ? acikAdim.get(key) : (firstOpen && firstOpen.sequence === s.sequence);
    const [pc] = pctStyle(pct, gecikme);

    const isaret = tamam ? '✓' : String(s.sequence);
    const isaretZemin = tamam ? 'var(--color-success)' : devam ? 'var(--color-accent)' : '#fff';
    const isaretRenk = (tamam || devam) ? '#fff' : 'var(--color-neutral-700)';
    const isaretCerceve = gecikme ? 'var(--color-danger)' : tamam ? 'var(--color-success)' : devam ? 'var(--color-accent-700)' : 'var(--color-neutral-400)';
    const cizgi = i === total - 1 ? 'transparent' : 'var(--color-neutral-300)';

    const machines = [...new Set(s.group.map(w => centers.label(w.workCenterId)).filter(Boolean))].join(' / ');
    const opName = ops.label(rep.operationId) || '—';
    const woLabel = (w) => 'İE-' + w.woNo + (w.splitLabel ? '/' + w.splitLabel : '');

    const row = document.createElement('div');
    row.style.cssText = 'display:grid; grid-template-columns:34px minmax(0, 1fr); gap:12px;';
    row.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; padding-top:14px;">
        <div style="width:28px; height:28px; flex:none; display:grid; place-items:center; font-family:'IBM Plex Mono',monospace; font-size:12.5px; font-weight:500; border:1px solid ${isaretCerceve}; background:${isaretZemin}; color:${isaretRenk};">${esc(isaret)}</div>
        <div style="flex:1; width:1px; background:${cizgi}; min-height:14px;"></div>
      </div>
      <div style="min-width:0; border-bottom:1px solid var(--color-neutral-200); padding-bottom:12px;">
        <button type="button" class="wo-step-toggle" style="width:100%; text-align:left; background:transparent; border:0; padding:12px 0 0; cursor:pointer; display:flex; align-items:baseline; gap:12px; flex-wrap:wrap;">
          <span style="font-family:var(--font-heading); font-size:19px; font-weight:600;">${esc(opName)}</span>
          <span style="font-size:13px; color:var(--color-neutral-600);">${esc(machines)}</span>
          ${gecikme ? `<span style="flex:none; padding:2px 8px; font-size:12px; border:1px solid var(--color-danger); background:var(--color-danger-fill); color:var(--color-danger); white-space:nowrap;">⚠ ${esc(t('wo.delayDays', { n: gecikmeGun }))}</span>` : ''}
          <span style="margin-left:auto; flex:none; display:flex; align-items:baseline; gap:12px;">
            <span style="font-family:'IBM Plex Mono',monospace; font-size:14px;">${esc(fmtTr(s.done))} / ${esc(fmtTr(s.target))}</span>
            <span style="font-family:'IBM Plex Mono',monospace; font-size:14px; font-weight:500; width:52px; text-align:right; color:${pc};">%${pct}</span>
          </span>
        </button>
        <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
          <span style="display:block; flex:1; height:8px; background:var(--color-neutral-200); position:relative; min-width:80px;">
            <i style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:${pc};"></i>
          </span>
          <span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--color-neutral-600);">${esc(s.split ? '' : woLabel(rep))}</span>
        </div>
        ${s.split ? buildSplit(s, woLabel) : ''}
        <div class="wo-step-detail" style="${acik ? '' : 'display:none;'}"></div>
      </div>`;

    const detail = row.querySelector('.wo-step-detail');
    if (acik) detail.appendChild(buildDetail(o, s, { eta, allComplete, due }));
    row.querySelector('.wo-step-toggle').addEventListener('click', () => {
      const now = !(acikAdim.has(key) ? acikAdim.get(key) : (firstOpen && firstOpen.sequence === s.sequence));
      acikAdim.set(key, now);
      if (now && !detail.hasChildNodes()) detail.appendChild(buildDetail(o, s, { eta, allComplete, due }));
      detail.style.display = now ? '' : 'none';
    });
    return row;
  }

  function buildSplit(s, woLabel) {
    return `<div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">` +
      s.group.map(w => {
        const tgt = Number(w.targetQuantity) || 0;
        const done = produced(w);
        const bp = tgt > 0 ? Math.min(100, Math.round(done / tgt * 100)) : 0;
        const [bc] = pctStyle(bp, false);
        const label = w.splitLabel || '—';
        return `<div style="display:flex; align-items:center; gap:10px; border:1px solid var(--color-neutral-300); background:var(--color-neutral-100); padding:8px 10px; flex-wrap:wrap;">
          <span style="flex:none; width:22px; height:22px; display:grid; place-items:center; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid var(--color-accent-700); background:var(--color-accent); color:#fff;">${esc(label)}</span>
          <span style="flex:none; font-size:13.5px;">${esc(centers.label(w.workCenterId) || '—')}</span>
          <span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--color-neutral-600);">${esc(woLabel(w))}</span>
          <span style="display:block; flex:1 1 120px; height:8px; background:var(--color-neutral-200); position:relative; min-width:80px;">
            <i style="position:absolute; left:0; top:0; bottom:0; width:${bp}%; background:${bc};"></i>
          </span>
          <span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:13px; white-space:nowrap;">${esc(fmtTr(done))} / ${esc(fmtTr(tgt))}  %${bp}</span>
        </div>`;
      }).join('') + `</div>`;
  }

  function buildDetail(o, s, { eta, allComplete, due }) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:12px; border:1px solid var(--color-neutral-300); background:var(--color-neutral-100); padding:12px 14px;';

    // ETA rozeti
    let etaText, etaC, etaF;
    if (allComplete) { etaText = t('wo.etaDone'); etaC = 'var(--color-success)'; etaF = 'var(--color-success-fill)'; }
    else if (eta) {
      const meets = !due || eta <= due;
      etaText = t('wo.etaEstimate', { date: fmtDateTR(fmtISOLocal(eta)) }) + ' · ' + (meets ? t('wo.etaMeets') : t('wo.etaMisses'));
      etaC = meets ? 'var(--color-success)' : 'var(--color-danger)'; etaF = meets ? 'var(--color-success-fill)' : 'var(--color-danger-fill)';
    } else { etaText = t('wo.etaNone'); etaC = 'var(--color-neutral-600)'; etaF = 'var(--color-neutral-100)'; }

    // adımın tüm iş emirlerinin üretim kayıtları, tarihe göre
    const recs = [];
    for (const w of s.group) for (const r of (prodByWo.get(w.id) || [])) recs.push(r);
    recs.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    const cols = [
      ['wo.colDate', 'left', '100px'], ['wo.colShift', 'left', '120px'], ['wo.colOperator', 'left', '120px'],
      ['wo.colProduced', 'right', '90px'], ['wo.colScrap', 'right', '70px'], ['wo.colDowntime', 'left', '90px'],
      ['wo.colNote', 'left', 'auto'],
    ];

    wrap.innerHTML = `
      <div style="display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
        <span style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:0.12em; color:var(--color-neutral-600);">${esc(t('wo.recordsTitle'))}</span>
        <span style="flex:none; padding:2px 8px; font-size:12.5px; border:1px solid ${etaC}; background:${etaF}; color:${etaC};">${esc(etaText)}</span>
        <button type="button" class="wo-add-prod" style="margin-left:auto; flex:none; height:32px; padding:0 12px; font-size:13px; font-weight:500; background:var(--color-accent); border:1px solid var(--color-accent-700); color:#fff; cursor:pointer;">${esc(t('wo.addProduction'))}</button>
      </div>` +
      (recs.length === 0
        ? `<div style="padding:18px; text-align:center; font-size:13px; color:var(--color-neutral-600); background:#fff; border:1px solid var(--color-neutral-300);">${esc(t('wo.noRecords'))}</div>`
        : `<div style="overflow-x:auto; background:#fff; border:1px solid var(--color-neutral-300);">
            <table style="width:100%; min-width:700px; border-collapse:collapse; font-size:13.5px;">
              <thead><tr style="background:var(--color-neutral-100);">
                ${cols.map(([k, hz, w]) => `<th style="text-align:${hz}; padding:7px 10px; font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:0.1em; color:var(--color-neutral-700); font-weight:500; border-bottom:1px solid var(--color-neutral-300); width:${w}; white-space:nowrap;">${esc(t(k))}</th>`).join('')}
              </tr></thead>
              <tbody>${recs.map(rowHtml).join('')}</tbody>
            </table>
          </div>`);

    wrap.querySelector('.wo-add-prod')?.addEventListener('click', () => { location.hash = '#production'; });
    return wrap;

    function rowHtml(r) {
      const dt = downtimeMinutes(r.downtimeStart, r.downtimeEnd, wh);
      const note = r.note || '';
      const mono = "font-family:'IBM Plex Mono',monospace;";
      const td = (extra = '') => `padding:7px 10px; border-bottom:1px solid var(--color-neutral-200);${extra}`;
      return `<tr>
        <td style="${td(mono + 'font-size:12.5px;')}">${esc(fmtDateTR(r.date) || '—')}</td>
        <td style="${td('white-space:nowrap;')}">${esc(r.shift ? t('shift.' + r.shift) : '—')}</td>
        <td style="${td('white-space:nowrap;')}">${esc(operators.label(r.operatorId))}</td>
        <td style="${td('text-align:right;' + mono + 'font-size:13px; font-weight:500;')}">${esc(fmtTr(r.actualQuantity))}</td>
        <td style="${td('text-align:right;' + mono + 'font-size:12.5px;')}">${r.scrapQuantity ? esc(fmtTr(r.scrapQuantity)) : '—'}</td>
        <td style="${td(mono + 'font-size:12.5px; white-space:nowrap; color:' + (dt > 0 ? 'var(--color-warning)' : 'var(--color-neutral-500)') + ';')}">${dt > 0 ? esc(fmtDuration(dt)) : '—'}</td>
        <td title="${esc(note)}" style="${td('font-size:12.5px; color:var(--color-neutral-700); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}">${esc(note || '—')}</td>
      </tr>`;
    }
  }

  // ---------- SEKME 2: Liste ----------
  function renderListTab() {
    const host = container.querySelector('#wo-body');
    host.style.cssText = 'flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:20px;';
    host.innerHTML = `
      <div style="flex:none; background:#fff; border:1px solid var(--color-neutral-400); padding:11px 14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <input type="text" id="wo-lsearch" value="${esc(listeArama)}" placeholder="${esc(t('wo.searchList'))}" style="flex:1 1 220px; min-width:200px; max-width:320px; box-sizing:border-box; height:38px; padding:0 10px; font-size:13.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
        <div id="wo-lfilter" style="display:flex; border:1px solid var(--color-neutral-400); flex:none;">
          ${LIST_FILTERS.map(([id, key], i) => {
            const on = id === listeFiltre;
            return `<button type="button" class="wo-lfbtn" data-f="${id}" style="height:38px; padding:0 14px; font-size:14px; border:0; border-left:${i === 0 ? '0' : '1px solid var(--color-neutral-400)'}; cursor:pointer; background:${on ? 'var(--color-accent-900)' : 'transparent'}; color:${on ? '#fff' : 'var(--color-text)'}; font-weight:${on ? '600' : '400'}; white-space:nowrap;">${esc(t(key))}</button>`;
          }).join('')}
        </div>
        <div style="flex:none; display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; color:var(--color-neutral-700); white-space:nowrap;">${esc(t('wo.planDateLabel'))}</span>
          <input type="date" id="wo-ldate" value="${esc(listeTarihi)}" style="box-sizing:border-box; height:38px; padding:0 10px; font-family:'IBM Plex Mono',monospace; font-size:13.5px; border:1px solid var(--color-neutral-400); background:#fff; color:var(--color-text);">
          <button type="button" id="wo-lall" style="height:38px; padding:0 12px; font-size:13.5px; background:transparent; border:1px solid var(--color-neutral-400); cursor:pointer; white-space:nowrap;">${esc(t('wo.allBtn'))}</button>
        </div>
        <span id="wo-lcount" style="flex:none; margin-left:auto; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--color-neutral-600); white-space:nowrap;"></span>
      </div>
      <div id="wo-list-groups" style="display:flex; flex-direction:column; gap:20px;"></div>`;

    const s = host.querySelector('#wo-lsearch');
    s.addEventListener('input', () => { listeArama = s.value; renderListGroups(); });
    host.querySelectorAll('.wo-lfbtn').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.f === listeFiltre) return;
      listeFiltre = b.dataset.f; renderListTab();
    }));
    host.querySelector('#wo-ldate').addEventListener('change', (e) => { listeTarihi = e.target.value; renderListGroups(); });
    host.querySelector('#wo-lall').addEventListener('click', () => { listeTarihi = ''; renderListTab(); });

    renderListGroups();
  }

  function isPlanned(w) { const set = planDatesByWo.get(w.id); return !!(set && set.size); }
  function woLabelFull(w) { return 'İE-' + w.woNo + (w.splitLabel ? '/' + w.splitLabel : ''); }

  function renderListGroups() {
    const q = listeArama.trim().toLocaleLowerCase('tr');
    const rows = workOrders.filter(w => {
      const o = orderById.get(w.orderId);
      const p = products.byId.get(w.productCodeId);
      if (q) {
        const hay = [woLabelFull(w), o?.orderNo, p?.code, p?.name, ops.label(w.operationId), centers.label(w.workCenterId)]
          .filter(Boolean).join(' ').toLocaleLowerCase('tr');
        if (!hay.includes(q)) return false;
      }
      if (listeTarihi && !planDatesByWo.get(w.id)?.has(listeTarihi)) return false;
      const hedef = Number(w.targetQuantity) || 0;
      const bitti = hedef > 0 && produced(w) >= hedef;
      if (listeFiltre === 'aktif') return !bitti;
      if (listeFiltre === 'tamam') return bitti;
      return true;
    });

    const count = container.querySelector('#wo-lcount');
    if (count) count.textContent = t('wo.listCount', { shown: rows.length, total: workOrders.length })
      + (listeTarihi ? ' ' + t('wo.listCountDateSuffix', { date: fmtDateTR(listeTarihi) }) : '');

    const planli = rows.filter(isPlanned);
    const plansiz = rows.filter(w => !isPlanned(w));
    const host = container.querySelector('#wo-list-groups');
    host.innerHTML =
      groupHtml('wo.grpPlanned', 'wo.grpPlannedDesc', planli, false, false) +
      groupHtml('wo.grpUnplanned', 'wo.grpUnplannedDesc', plansiz, true, true);
    host.querySelectorAll('.wo-planadd').forEach(b => b.addEventListener('click', () => { location.hash = '#machine-plans'; }));
  }

  function groupHtml(titleKey, descKey, rows, plansiz, warnCount) {
    const cols = [
      ['wo.colWoNo', 'left', '150px'], ['wo.colOrder', 'left', '150px'], ['wo.colProduct', 'left', '110px'],
      ['wo.colOperation', 'left', '150px'], ['wo.colMachine', 'left', '170px'], ['wo.colTarget', 'right', '90px'],
      ['wo.colProduced', 'right', '100px'], ['wo.colRemaining', 'right', '90px'], ['wo.colPct', 'center', '70px'],
      ['wo.colStatus', 'left', '130px'], ['wo.colEta', 'left', '140px'], ['', 'right', '120px'],
    ];
    const cRenk = warnCount && rows.length ? 'var(--color-warning)' : (rows.length ? 'var(--color-accent-700)' : 'var(--color-neutral-600)');
    const cZemin = warnCount && rows.length ? 'var(--color-warning-fill)' : (rows.length ? 'var(--color-accent-100)' : 'var(--color-neutral-100)');
    const bodyHtml = rows.length
      ? rows.map(w => rowHtml(w, plansiz)).join('')
      : `<tr><td colspan="12" style="padding:18px; text-align:center; font-size:13px; color:var(--color-neutral-600); border-bottom:1px solid var(--color-neutral-200);">${esc(t('common.noRecords'))}</td></tr>`;
    return `<div style="background:#fff; border:1px solid var(--color-neutral-400);">
      <div style="padding:12px 18px 11px; border-bottom:1px solid var(--color-neutral-300); display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
        <span style="font-family:var(--font-heading); font-size:19px; font-weight:600;">${esc(t(titleKey))}</span>
        <span style="flex:none; padding:2px 8px; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid ${cRenk}; background:${cZemin}; color:${cRenk};">${esc(t('wo.recordCount', { n: rows.length }))}</span>
        <span style="font-size:12.5px; color:var(--color-neutral-600);">${esc(t(descKey))}</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; min-width:1340px; border-collapse:collapse; font-size:14px;">
          <thead><tr style="background:var(--color-neutral-100);">
            ${cols.map(([k, hz, w]) => `<th style="text-align:${hz}; padding:8px 12px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:0.12em; color:var(--color-neutral-700); font-weight:500; border-bottom:1px solid var(--color-neutral-300); width:${w}; white-space:nowrap;">${k ? esc(t(k)) : ''}</th>`).join('')}
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>`;
  }

  function rowHtml(w, plansiz) {
    const o = orderById.get(w.orderId);
    const p = products.byId.get(w.productCodeId);
    const hedef = Number(w.targetQuantity) || 0;
    const done = produced(w);
    const kalan = Math.max(0, hedef - done);
    const pct = hedef > 0 ? Math.min(100, Math.round(done / hedef * 100)) : 0;
    const [pc, pf] = pctStyle(pct, false);
    const durum = listDurum(w, done, hedef);
    const due = o?.requestedDeliveryDate ? parseISO(o.requestedDeliveryDate) : null;
    const e = estimateCompletion(w, production, { today });
    const etaTxt = e.complete ? '—' : (e.etaDate ? fmtDateTR(fmtISOLocal(e.etaDate)) : '—');
    const etaLate = !e.complete && due && e.etaDate && e.etaDate > due;
    const td = (hz, extra = '') => `padding:9px 12px; text-align:${hz}; border-bottom:1px solid var(--color-neutral-200);${extra}`;
    const mono = "font-family:'IBM Plex Mono',monospace;";
    return `<tr>
      <td style="${td('left', mono + 'font-size:13px; font-weight:500;')}">${esc(woLabelFull(w))}</td>
      <td style="${td('left', mono + 'font-size:12.5px; color:var(--color-neutral-600);')}">${esc(o?.orderNo || '—')}</td>
      <td style="${td('left', mono + 'font-size:13px;')}">${esc(p?.code || '—')}</td>
      <td style="${td('left', 'white-space:nowrap;')}">${esc(w.operationId ? ops.label(w.operationId) : '—')}</td>
      <td style="${td('left', 'white-space:nowrap;')}">${esc(w.workCenterId ? centers.label(w.workCenterId) : '—')}</td>
      <td style="${td('right', mono + 'font-size:13px;')}">${esc(fmtTr(hedef))}</td>
      <td style="${td('right', mono + 'font-size:13px;')}">${esc(fmtTr(done))}</td>
      <td style="${td('right', mono + 'font-size:13px;')}">${esc(fmtTr(kalan))}</td>
      <td style="${td('center')}"><span style="display:inline-block; padding:2px 7px; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid ${pc}; background:${pf}; color:${pc};">%${pct}</span></td>
      <td style="${td('left')}"><span style="display:inline-block; padding:2px 8px; font-size:12.5px; border:1px solid ${durum.c}; background:${durum.f}; color:${durum.c}; white-space:nowrap;">${esc(durum.label)}</span></td>
      <td style="${td('left', mono + 'font-size:13px; white-space:nowrap; color:' + (etaLate ? 'var(--color-danger)' : 'var(--color-text)') + ';')}">${esc(etaTxt)}</td>
      <td style="${td('right', 'white-space:nowrap;')}">${plansiz ? `<button type="button" class="wo-planadd" style="height:30px; padding:0 12px; font-size:13px; cursor:pointer; background:transparent; border:1px solid var(--color-accent-700); color:var(--color-accent-800);">${esc(t('wo.planAdd'))}</button>` : ''}</td>
    </tr>`;
  }

  function listDurum(w, done, hedef) {
    if (w.status === 'İptal') return { label: t('status.İptal'), c: 'var(--color-neutral-600)', f: 'var(--color-neutral-100)' };
    if (hedef > 0 && done >= hedef) return { label: t('wo.stDone'), c: 'var(--color-success)', f: 'var(--color-success-fill)' };
    if (done > 0) return { label: t('wo.stActive'), c: 'var(--color-accent-700)', f: 'var(--color-accent-100)' };
    return { label: t('wo.stNotStarted'), c: 'var(--color-neutral-600)', f: 'var(--color-neutral-100)' };
  }

  // ---------- yardımcılar ----------
  function statusLabel(code) {
    return t({ done: 'wo.stDone', stopped: 'wo.stStopped', waiting: 'wo.stWaiting', risk: 'wo.stRisk', active: 'wo.stActive' }[code]);
  }
  function statusStyle(code) {
    switch (code) {
      case 'done': return ['var(--color-success)', 'var(--color-success-fill)'];
      case 'stopped': return ['var(--color-neutral-600)', 'var(--color-neutral-100)'];
      case 'waiting': return ['var(--color-warning)', 'var(--color-warning-fill)'];
      case 'risk': return ['var(--color-danger)', 'var(--color-danger-fill)'];
      default: return ['var(--color-accent-700)', 'var(--color-accent-100)'];
    }
  }
  function pctStyle(pct, risky) {
    if (risky) return ['var(--color-danger)', 'var(--color-danger-fill)'];
    if (pct >= 100) return ['var(--color-success)', 'var(--color-success-fill)'];
    if (pct > 0) return ['var(--color-accent-700)', 'var(--color-accent-100)'];
    return ['var(--color-neutral-600)', 'var(--color-neutral-100)'];
  }
}

function readTab() { try { const v = localStorage.getItem(TAB_LS); return TABS.some(([id]) => id === v) ? v : 'siparis'; } catch { return 'siparis'; } }
function writeTab(v) { try { localStorage.setItem(TAB_LS, v); } catch {} }
// Date → "YYYY-MM-DD" (yerel), fmtDateTR ile göstermek için.
function fmtISOLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
