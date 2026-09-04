// Kapasiteler — v2 modülü. Düzen: referans v78 viewCapacity (Rotalar'daki ürün
// seçici + zaman çizelgesi düzeninin aynısı), görsel dil v2 (kare blueprint, t()).
//
// Üç ek bölüm: (1) Makine Durumu — açık iş emirlerinden türetilir, salt okunur;
// (2) Veri Kontrolü Uyarıları — duplicate / orphan / missing; (3) sağ panelde üç
// KPI kartı + kapasite çizelgesi. Kapasite (ürün, iş merkezi, OPERASYON) üçlüsünde
// tutulur (migration 032). Aktif hat seçimi burada yapılır (routes.is_active).
// Dakika/adet girilen adımlarda kapasite Çalışma Saatleri'nden CANLI hesaplanır.
//
// i18n: bindLang ile dil değişince VERİ ÇEKMEDEN yeniden çizilir (seçim/arama korunur).

import { resource, request } from '../core/api.js';
import { toast, flashRow } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { collapsiblePanel } from '../core/collapsible.js';
import { createCapacityHelpers, groupBySeq } from '../core/bottleneck.js';

const capApi = resource('capacities');
const routesApi = resource('routes');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Seçili ürün modül düzeyinde tutulur (referans SELECTED_URUN_CAP deseni).
let SELECTED_PRODUCT = null;

// Makine Durumu paneli durumu. Katlama ortak collapsiblePanel bileşeninde (localStorage,
// varsayılan KAPALI); sıralama ve kart genişletme oturum boyu modül düzeyinde tutulur.
const MACHINE_ROW_LIMIT = 5;              // ilk N satır; kalanı "+N daha"ya toplanır (2-8 arası)
let MACHINE_SORT = 'total';               // 'total' (kart toplamına göre azalan) | 'name'
const MACHINE_EXPANDED = new Set();       // satır listesi açık iş merkezleri

export async function viewCapacities(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, routes, caps, workOrders, wh;
  let producedByWo = new Map();
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    routes = (await routesApi.listAll()).data;
    caps = (await capApi.listAll()).data;
    workOrders = (await resource('work-orders').listAll()).data;
    const production = (await resource('production').listAll()).data;
    for (const p of production) producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) || 0) + (p.actualQuantity || 0));
    ({ data: wh } = await request('/working-hours'));
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewCapacities(container, params) }));
    return;
  }

  let search = '';
  let focusCapId = params?.id != null ? String(params.id) : null;
  if (focusCapId) {
    const c = caps.find(x => String(x.id) === focusCapId);
    if (c) SELECTED_PRODUCT = c.productCodeId;
    else if (products.byId.has(Number(focusCapId))) SELECTED_PRODUCT = Number(focusCapId);
  }

  // Kapasite çözümleme/darboğaz/uyarılar ortak yardımcıdan (core/bottleneck.js). caps/routes
  // getirici geçilir — reload() bunları yeniden atadığında yardımcı güncel veriyi okur.
  const { getCapacity, productBottleneck, computeDataWarnings } =
    createCapacityHelpers({ caps: () => caps, routes: () => routes, wh, products, ops, centers, t });

  render();
  bindLang(container, render);

  // Bir adımın kapasitesini düzenlemek için GERÇEK kayıt (operasyon tam eşleşme; canlı kopya değil).
  function exactCap(productId, wcId, opId) {
    return caps.find(c => c.productCodeId === productId && c.workCenterId === wcId && c.operationId === opId) || null;
  }

  // Makine Durumu: açık (Aktif) iş emirlerinden, kalan>0 olanlar iş merkezine göre.
  function makineDurumu() {
    const byWc = new Map();
    for (const w of workOrders) {
      if (w.status !== 'Aktif' || w.workCenterId == null) continue;
      const remaining = (w.targetQuantity || 0) - (producedByWo.get(w.id) || 0);
      if (remaining <= 0) continue;
      if (!byWc.has(w.workCenterId)) byWc.set(w.workCenterId, []);
      byWc.get(w.workCenterId).push({ woId: w.id, woNo: w.woNo, productCodeId: w.productCodeId, operationId: w.operationId, remaining });
    }
    return byWc;
  }

  // --- sol panel yardımcıları ---
  function productIds() {
    const ids = [...new Set(routes.map(r => r.productCodeId))];
    ids.sort((a, b) => (products.byId.get(a)?.code || '').localeCompare(products.byId.get(b)?.code || '', 'tr'));
    return ids;
  }
  function productMatches(pid) {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return true;
    const p = products.byId.get(pid) || {};
    return [p.code, p.name].some(s => (s || '').toLocaleLowerCase('tr').includes(q));
  }

  function render() {
    const allIds = productIds();
    const shownIds = allIds.filter(productMatches);
    if (!shownIds.includes(SELECTED_PRODUCT)) SELECTED_PRODUCT = shownIds[0] ?? null;

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('cap.title'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('cap.subtitle'))}</div>
        </div>
      </div>`;

    if (allIds.length === 0) {
      const st = document.createElement('div');
      st.className = 'state';
      st.innerHTML = `<div class="state-title">${esc(t('cap.emptyRoutes'))}</div><div class="state-msg">${esc(t('cap.emptyRoutesMsg'))}</div>`;
      container.appendChild(st);
      return;
    }

    const warnings = computeDataWarnings();
    const durum = makineDurumu();
    container.appendChild(machinePanel(durum));   // her zaman: katlanmış başlıkta özet, açıkken kart ızgarası
    if (warnings.length) container.appendChild(warningsPanel(warnings));

    // arama
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `<div class="search"><input class="input" type="search" id="cap-search" placeholder="${esc(t('rt.search'))}" value="${esc(search)}"></div>`;
    container.appendChild(toolbar);

    if (shownIds.length === 0) {
      const st = document.createElement('div');
      st.className = 'state';
      st.innerHTML = `<div class="state-title">${esc(t('common.noResults'))}</div><div class="state-msg">${esc(t('rt.noMatch'))}</div>`;
      container.appendChild(st);
    } else {
      const picker = document.createElement('div');
      picker.className = 'part-picker';
      picker.appendChild(partList(shownIds));
      picker.appendChild(timeline());
      container.appendChild(picker);
    }

    const s = container.querySelector('#cap-search');
    s.addEventListener('input', () => {
      search = s.value; render();
      const el = container.querySelector('#cap-search');
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    });

    if (focusCapId) {
      const el = container.querySelector(`[data-cap="${cssEsc(focusCapId)}"]`) || container.querySelector('.part-list-item.active');
      if (el) { flashRow(el); el.scrollIntoView({ block: 'center' }); }
      focusCapId = null;
    }
  }

  // --- Makine Durumu paneli (katlanabilir, salt okunur — açık iş emirlerinden) ---
  // Veri istemcide türetilir (listAll); ayrı bir uç/yükleme-hata durumu yoktur.
  function machinePanel(durum) {
    let ops_ = 0, total = 0;
    for (const list of durum.values()) { ops_ += list.length; for (const a of list) total += a.remaining; }
    return collapsiblePanel({
      key: 'cap.machineStatus',
      title: t('cap.machineStatus'),
      metaHTML: `<span class="cpanel-dot">·</span> ${esc(t('cap.machineSummary', { wc: durum.size, ops: ops_ }))}`,
      rightHTML: `<span class="tag tag-neutral">${esc(t('cap.machineStatusReadonly'))}</span>`,
      onToggle: render,
      body: () => {
        const frag = document.createDocumentFragment();
        if (durum.size === 0) {
          const e = document.createElement('div');
          e.className = 'cap-mstat-empty';
          e.innerHTML =
            `<div class="cap-mstat-empty-title">${esc(t('cap.machineEmpty'))}</div>
             <div class="cap-mstat-empty-msg">${esc(t('cap.machineEmptyMsg'))}</div>`;
          frag.appendChild(e);
        } else {
          frag.appendChild(machineStrip(total));
          frag.appendChild(machineGrid(durum));
        }
        return frag;
      },
    });
  }

  // Sıralama / açıklama şeridi
  function machineStrip(total) {
    const strip = document.createElement('div');
    strip.className = 'cap-mstat-strip';
    strip.innerHTML =
      `<div class="cap-mstat-sort">
         <button type="button" class="cap-sort-btn${MACHINE_SORT === 'total' ? ' on' : ''}" data-sort="total">${esc(t('cap.machineSortTotal'))}</button>
         <button type="button" class="cap-sort-btn${MACHINE_SORT === 'name' ? ' on' : ''}" data-sort="name">${esc(t('cap.machineSortName'))}</button>
       </div>
       <span class="cap-mstat-hint">${esc(t('cap.machineRowHint'))}</span>
       <span class="cap-mstat-strip-note">${esc(t('cap.machineTotalRemaining', { n: fmtTr(total) }))}</span>`;
    strip.querySelectorAll('.cap-sort-btn').forEach(b => b.addEventListener('click', () => {
      MACHINE_SORT = b.dataset.sort; render();
    }));
    return strip;
  }

  // Kart ızgarası
  function machineGrid(durum) {
    const cards = [...durum.entries()].map(([wcId, list]) => ({
      wcId, name: centers.label(wcId), list,
      total: list.reduce((s, a) => s + a.remaining, 0),
    }));
    const maxTotal = cards.reduce((m, c) => Math.max(m, c.total), 0) || 1;
    cards.sort(MACHINE_SORT === 'name'
      ? (a, b) => a.name.localeCompare(b.name, 'tr')
      : (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr'));

    const grid = document.createElement('div');
    grid.className = 'cap-mstat-grid';
    for (const c of cards) grid.appendChild(machineCard(c, maxTotal));
    return grid;
  }

  function machineCard(c, maxTotal) {
    const share = c.total / maxTotal;
    const width = Math.max(share * 100, 2);
    const warn = share > 0.60;                              // yük payı eşiği — sarı, kritik yok
    const expanded = MACHINE_EXPANDED.has(c.wcId);
    const rows = expanded ? c.list : c.list.slice(0, MACHINE_ROW_LIMIT);
    const hidden = c.list.length - rows.length;

    const card = document.createElement('div');
    card.className = 'cap-mstat-card';
    card.innerHTML =
      `<div class="cap-mstat-card-hd">
         <div class="cap-mstat-card-top">
           <span class="cap-mstat-card-name" title="${esc(c.name)}">${esc(c.name)}</span>
           <span class="cap-mstat-card-ops">${esc(t('cap.machineOps', { n: c.list.length }))}</span>
         </div>
         <div class="cap-mstat-bar"><i class="${warn ? 'warn' : ''}" style="width:${width}%"></i></div>
         <div class="cap-mstat-card-total mono">${esc(fmtTr(c.total))}</div>
       </div>
       <div class="cap-mstat-rows">
         ${rows.map(a => {
           const op = a.operationId != null ? ops.label(a.operationId) : '';
           const code = products.byId.get(a.productCodeId)?.code || '#' + a.productCodeId;
           const wo = a.woNo || ('#' + a.woId);
           return `<a class="cap-mstat-row" href="#work-orders?id=${encodeURIComponent(a.woId)}">
             <span class="cap-mstat-code" title="${esc(wo)} · ${esc(code)}">
               <span class="cap-mstat-wo">${esc(wo)}</span><span class="mono cap-mstat-codev">${esc(code)}</span>
             </span>
             <span class="cap-mstat-op" title="${esc(op)}">${esc(op)}</span>
             <span class="mono cap-mstat-rem">${esc(fmtTr(a.remaining))}</span>
           </a>`;
         }).join('')}
       </div>`;

    if (hidden > 0 || expanded) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'cap-mstat-more';
      more.textContent = expanded ? t('cap.machineLess') : t('cap.machineMoreOps', { n: hidden });
      more.addEventListener('click', () => {
        if (expanded) MACHINE_EXPANDED.delete(c.wcId); else MACHINE_EXPANDED.add(c.wcId);
        render();
      });
      card.appendChild(more);
    }
    return card;
  }

  // --- Veri Kontrolü Uyarıları paneli (katlanabilir; yalnızca uyarı varken çağrılır) ---
  function warningsPanel(warnings) {
    const c = { duplicate: 0, orphan: 0, missing: 0 };
    for (const w of warnings) c[w.type] = (c[w.type] || 0) + 1;
    const parts = [];
    if (c.duplicate) parts.push(t('cap.warnCountDup', { n: c.duplicate }));
    if (c.orphan) parts.push(t('cap.warnCountOrphan', { n: c.orphan }));
    if (c.missing) parts.push(t('cap.warnCountMissing', { n: c.missing }));
    return collapsiblePanel({
      key: 'cap.dataWarnings',
      title: t('cap.warnings'),
      metaHTML: `<span class="cpanel-dot">·</span> ${esc(parts.join(' · '))}`,
      rightHTML: `<span class="tag tag-neutral">${warnings.length}</span>`,
      onToggle: render,
      body: () => {
        const frag = document.createDocumentFragment();
        for (const w of warnings.slice(0, 30)) frag.appendChild(warnRow(w));
        return frag;
      },
    });
  }

  function warnRow(w) {
    const badge = w.type === 'duplicate' ? `<span class="tag tag-danger">${esc(t('cap.warnDuplicate'))}</span>`
      : w.type === 'orphan' ? `<span class="tag tag-warn">${esc(t('cap.warnOrphan'))}</span>`
      : `<span class="tag tag-neutral">${esc(t('cap.warnMissing'))}</span>`;
    const row = document.createElement('div');
    row.className = 'cap-warn-row';
    row.innerHTML = `${badge}<span class="msg">${esc(w.msg)}</span><span class="grow"></span>`;
    if (w.type === 'orphan' && canWrite) {
      row.appendChild(btn(t('cap.deleteRecord'), 'btn-danger', () => deleteOrphan(w.capId)));
    }
    row.appendChild(btn(t('cap.goToProduct'), 'btn-ghost', () => { SELECTED_PRODUCT = w.productCodeId; render(); }));
    return row;
  }

  // --- sol panel: ürün listesi (Hedef = darboğaz kapasitesi) ---
  function partList(ids) {
    const list = document.createElement('div');
    list.className = 'part-list';
    list.innerHTML = ids.map(pid => {
      const p = products.byId.get(pid) || {};
      const { bottleneck } = productBottleneck(pid);
      const target = bottleneck ? t('cap.target', { n: fmtNum(bottleneck.capacity) }) : t('cap.targetNone');
      return `<div class="part-list-item${pid === SELECTED_PRODUCT ? ' active' : ''}" data-pid="${esc(String(pid))}">
        <div class="pn">${esc(p.code || '#' + pid)}</div>
        <div class="pmeta">${esc(p.name || '')}</div>
        <div class="pmeta" style="margin-top:4px;">${esc(target)}</div>
      </div>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.part-list-item');
      if (!item) return;
      const pid = Number(item.dataset.pid);
      if (pid !== SELECTED_PRODUCT) { SELECTED_PRODUCT = pid; render(); }
    });
    return list;
  }

  // --- sağ panel: KPI kartları + kapasite çizelgesi ---
  function timeline() {
    const wrap = document.createElement('div');
    wrap.className = 'timeline';
    const p = products.byId.get(SELECTED_PRODUCT) || {};
    const { bottleneck, missing } = productBottleneck(SELECTED_PRODUCT);

    // 3 KPI kartı (mevcut .kpis/.kpi deseni)
    const kpis = document.createElement('div');
    kpis.className = 'kpis';
    kpis.style.marginBottom = '16px';
    kpis.innerHTML =
      kpiCard(t('cap.kpiTarget'), bottleneck ? fmtNum(bottleneck.capacity) : '—',
        bottleneck ? t('cap.kpiTargetFoot') : t('cap.kpiTargetNone')) +
      kpiCard(t('cap.kpiBottleneck'), bottleneck ? esc(centers.label(bottleneck.workCenterId)) : '—',
        bottleneck ? t('cap.kpiBottleneckFoot', { seq: fmtSeq(bottleneck.seq), op: ops.label(bottleneck.operationId) }) : '', true) +
      kpiCard(t('cap.kpiUndefined'), String(missing.length),
        missing.length ? t('cap.kpiUndefinedSome') : t('cap.kpiUndefinedNone'), false, missing.length > 0);
    wrap.appendChild(kpis);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-head"><h3 class="mono">${esc(p.code || '')}</h3><span class="sub">${esc(p.name || '')}</span></div>`;
    const body = document.createElement('div');
    body.className = 'panel-body';

    const bySeq = groupBySeq(routes.filter(r => r.productCodeId === SELECTED_PRODUCT));
    for (const [seq, group] of bySeq) {
      group.sort((a, b) => (Number(b.isActive) - Number(a.isActive)) || centers.label(a.workCenterId).localeCompare(centers.label(b.workCenterId), 'tr'));
      const isBottleneck = bottleneck && bottleneck.seq === seq;
      body.appendChild(stepEl(seq, group, group.find(g => g.isActive) || group[0], isBottleneck));
    }

    panel.appendChild(body);
    wrap.appendChild(panel);

    const note = document.createElement('div');
    note.className = 'cap-note';
    note.textContent = t('cap.footerNote');
    wrap.appendChild(note);
    return wrap;
  }

  function stepEl(seq, group, rep, isBottleneck) {
    const step = document.createElement('div');
    step.className = 'tl-step';
    step.innerHTML = `
      <div class="tl-marker-col">
        <div class="tl-num${isBottleneck ? ' bottleneck' : ''}">${esc(fmtSeq(seq))}</div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-content">
        <div class="tl-title-row">
          <span class="tl-title">${esc(ops.label(rep.operationId))}</span>
          ${isBottleneck ? `<span class="tag tag-danger">${esc(t('cap.bottleneckBadge'))}</span>` : ''}
        </div>
      </div>`;
    const content = step.querySelector('.tl-content');

    // kök adım CNC ise alt operasyonlar (1.1, 1.2) da CNC sayılır (referans görünürlük koşulu)
    const kokSeq = Math.floor(seq);
    const kokRoute = routes.find(r => r.productCodeId === SELECTED_PRODUCT && r.sequence === kokSeq);
    const kokCnc = kokRoute && (/cnc/i.test(ops.label(kokRoute.operationId)) || /cnc/i.test(centers.label(kokRoute.workCenterId)));

    for (const g of group) {
      const cap = getCapacity(g.productCodeId, g.workCenterId, g.operationId);
      const hasMinutes = !!(cap && cap.minutes);
      const cnc = /cnc/i.test(ops.label(g.operationId)) || /cnc/i.test(centers.label(g.workCenterId)) || (seq !== kokSeq && kokCnc);
      content.appendChild(capRow(seq, g, cap, hasMinutes, cnc));
    }
    return step;
  }

  function capRow(seq, g, cap, hasMinutes, cnc) {
    const row = document.createElement('div');
    row.className = 'cap-edit-row';
    if (cap) row.dataset.cap = String(cap.id);

    // aktif hat radyosu
    const radioLabel = document.createElement('label');
    radioLabel.className = 'cap-active';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `cap-active-${fmtSeq(seq)}`;
    radio.checked = !!g.isActive;
    radio.disabled = !canWrite;
    radio.addEventListener('change', () => setActiveWorkCenter(seq, g.id));
    radioLabel.append(radio, document.createTextNode(' ' + centers.label(g.workCenterId)));
    row.appendChild(radioLabel);

    // kapasite (adet/gün) — minutes doluysa salt okunur (hesaplanıyor)
    const capWrap = document.createElement('span');
    capWrap.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const capInput = document.createElement('input');
    capInput.type = 'number';
    capInput.className = 'input mono cap-input';
    capInput.value = cap ? fmtNum(cap.capacity) : '';
    capInput.placeholder = t('cap.perDayPlaceholder');
    capInput.disabled = !canWrite || hasMinutes;
    capInput.addEventListener('change', () => setCapacityValue(g, capInput.value));
    capWrap.append(capInput, spanMuted(t('cap.perDay')));
    row.appendChild(capWrap);

    // dakika/adet — sadece CNC adımlarında
    if (cnc) {
      const o = csOzet(wh);
      const minWrap = document.createElement('span');
      minWrap.className = 'cap-min-wrap';
      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.step = 'any';
      minInput.className = 'input mono cap-min-input';
      minInput.value = cap && cap.minutes ? fmtNum(cap.minutes) : '';
      minInput.placeholder = t('cap.minPlaceholder');
      minInput.disabled = !canWrite;
      minInput.addEventListener('change', () => setCapacityDakika(g, minInput.value));
      const help = o ? t('cap.minHelp', { net: csHoursLabel(o.total) }) : t('cap.minHelpNoHours');
      minWrap.append(minInput, spanMuted(help));
      row.appendChild(minWrap);
    }

    // Aktif Hat / Alternatif rozeti
    row.appendChild(tag(g.isActive ? t('cap.activeLine') : t('rt.alt'), g.isActive ? 'tag-success' : 'tag-neutral'));
    return row;
  }

  // --- yazma işlemleri ---

  // Aktif hat: aynı (ürün, sıra) grubundaki TÜM rota kayıtlarında is_active güncellenir.
  async function setActiveWorkCenter(seq, routeId) {
    const group = routes.filter(r => r.productCodeId === SELECTED_PRODUCT && r.sequence === seq);
    try {
      for (const r of group) {
        const wantActive = r.id === routeId ? 1 : 0;
        if (Number(r.isActive) === wantActive) continue;   // gereksiz yazma yok
        await routesApi.update(r.id, { isActive: wantActive, updatedAt: r.updatedAt });
      }
      toast(t('cap.activeUpdated'), 'success');
      await reload();
    } catch (err) { toast(err.message, 'danger'); await reload(); }
  }

  // Kapasite (adet/gün). Boş -> kayıt silinir. Yoksa oluşturulur. Bu adımın operasyonuna yazılır.
  async function setCapacityValue(g, value) {
    const num = value.trim() === '' ? null : parseFloat(value);
    if (value.trim() !== '' && !isFinite(num)) return;
    const cap = getCapacity(g.productCodeId, g.workCenterId, g.operationId);
    try {
      if (!cap) {
        if (num === null) return;
        await capApi.create({ productCodeId: g.productCodeId, workCenterId: g.workCenterId, operationId: g.operationId, capacityPerShift: num });
        toast(t('cap.capUpdated'), 'success');
      } else if (num === null) {
        await capApi.remove(cap.id);
        toast(t('cap.capDeleted'), 'success');
      } else {
        await capApi.update(cap.id, { capacityPerShift: num, updatedAt: cap.updatedAt });
        toast(t('cap.capUpdated'), 'success');
      }
      await reload();
    } catch (err) { toast(err.message, 'danger'); await reload(); }
  }

  // Dakika/adet. Boş -> minutes NULL (kapasite elle girilene döner). Doluysa kapasite
  // çalışma saatlerinden hesaplanıp saklanır (getCapacity okurken de canlı hesaplar).
  async function setCapacityDakika(g, value) {
    const minutes = value.trim() === '' ? null : parseFloat(value);
    if (value.trim() !== '' && !isFinite(minutes)) return;
    const cap = exactCap(g.productCodeId, g.workCenterId, g.operationId);
    const o = csOzet(wh);
    try {
      if (minutes === null) {
        if (cap) await capApi.update(cap.id, { minutes: null, updatedAt: cap.updatedAt });
      } else if (!cap) {
        const capVal = (o && o.total > 0) ? Math.floor(o.total / minutes) : 0;
        await capApi.create({ productCodeId: g.productCodeId, workCenterId: g.workCenterId, operationId: g.operationId, capacityPerShift: capVal, minutes });
      } else {
        const patch = { minutes, updatedAt: cap.updatedAt };
        if (o && o.total > 0) patch.capacityPerShift = Math.floor(o.total / minutes);
        await capApi.update(cap.id, patch);
      }
      toast(t('cap.minUpdated'), 'success');
      await reload();
    } catch (err) { toast(err.message, 'danger'); await reload(); }
  }

  async function deleteOrphan(capId) {
    const c = caps.find(x => x.id === capId);
    const name = c ? `${products.label(c.productCodeId)} · ${centers.label(c.workCenterId)}` : '#' + capId;
    const ok = await confirmDialog({ title: t('cap.deleteTitle'), body: t('cap.deleteBody', { name }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await capApi.remove(capId); toast(t('cap.deleted'), 'success'); await reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }

  async function reload() {
    caps = (await capApi.listAll()).data;
    routes = (await routesApi.listAll()).data;
    render();
  }
}

// --- modül düzeyi saf yardımcılar ---
// (groupBySeq artık core/bottleneck.js'ten; getCapacity/productBottleneck/computeDataWarnings de.)

// Çalışma saati özeti: günlük net dakika (referans csOzet). "HH:MM" -> dakika.
function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (isFinite(h) && isFinite(m)) ? h * 60 + m : null;
}
function csOzet(wh) {
  if (!wh) return null;
  const seg = (start, end, bs, be) => {
    const s = toMin(start), e = toMin(end);
    if (s == null || e == null) return 0;
    let net = e - s;
    const b1 = toMin(bs), b2 = toMin(be);
    if (b1 != null && b2 != null) net -= (b2 - b1);
    return Math.max(0, net);
  };
  const morning = seg(wh.morningStart, wh.morningEnd, wh.morningBreakStart, wh.morningBreakEnd);
  const afternoon = seg(wh.afternoonStart, wh.afternoonEnd, wh.afternoonBreakStart, wh.afternoonBreakEnd);
  return { morning, afternoon, total: morning + afternoon };
}
function csHoursLabel(dakika) {
  const s = Math.floor(dakika / 60), d = Math.round(dakika % 60);
  return `${s} sa${d ? ` ${d} dk` : ''}`;
}

// Sıra gösterimi: tam sayı -> "1", ondalık -> "1.1".
function fmtSeq(n) { return String(Math.round(Number(n) * 10) / 10); }
// Miktar: gereksiz ondalık sıfırları at (204.000 -> 204, 2.5 -> 2.5).
function fmtNum(n) { return String(Math.round(Number(n) * 1000) / 1000); }
// tr-TR: binlik ayırıcı nokta, ondalık virgül (miktarlar için)
function fmtTr(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 3 }); }

function kpiCard(title, value, detail, small = false, danger = false) {
  const valStyle = small ? ' style="font-size:16px; word-break:break-word;"' : '';
  return `<div class="kpi">
    <div class="kpi-title">${esc(title)}</div>
    <div class="kpi-value${danger ? ' danger' : ''}"${valStyle}>${value}</div>
    <div class="kpi-detail">${esc(detail)}</div>
  </div>`;
}

function spanMuted(text) {
  const s = document.createElement('span');
  s.className = 'text-muted';
  s.textContent = text;
  return s;
}
function tag(label, kind) {
  const s = document.createElement('span');
  s.className = `tag ${kind}`;
  s.textContent = label;
  return s;
}
function btn(label, kind, on) {
  const b = document.createElement('button');
  b.className = `btn ${kind} btn-sm`;
  b.textContent = label;
  b.addEventListener('click', on);
  return b;
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
