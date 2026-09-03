// Rotalar — v2 modülü. Düzen: referans v78 viewRoutes (solda ürün seçici, sağda
// seçili ürünün zaman çizelgesi); görsel dil v2 (kare blueprint, v2 token'ları, t()).
//
// Adımlar sequence bazında gruplanır; aynı sırada birden çok iş merkezi = Aktif /
// Alternatif satırları. Alt operasyon ondalık sırayla eklenir (1 -> 1.1 -> 1.2).
// Varyant (sipariş bazlı seçenek grubu) aynı (ürün, sıra, operasyon) üçlüsündeki
// TÜM iş merkezi alternatiflerine birlikte uygulanır/kaldırılır — tutarlılık için.
//
// urun/operasyon/isMerkezi FK; varyantlar çocuk tablo. i18n: bindLang ile dil
// değişince VERİ ÇEKMEDEN yeniden çizilir (seçim/arama closure'da korunur).

import { resource, ValidationError } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast, flashRow } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, mapProduct, mapNamed } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';

const api = resource('routes');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

// Seçili ürün modül düzeyinde tutulur — modüle geri dönünce seçim korunur (referans
// SELECTED_URUN_ROUTE deseni). Liste değişip geçersiz kalırsa render() ilk ürüne düşer.
let SELECTED_PRODUCT = null;
// Drawer'daki not alanlarına benzersiz ad üretmek için (aynı panelde iki not olabilir).
let noteSeq = 0;

export async function viewRoutes(container, params) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let products, ops, centers, rows;
  try {
    products = await loadLookup('product-codes', mapProduct);
    ops = await loadLookup('operations', mapNamed);
    centers = await loadLookup('work-centers', mapNamed);
    rows = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewRoutes(container, params) }));
    return;
  }

  let search = '';
  // Global aramadan #routes?id=<routeId> geldiğinde: o rotanın ürününü seç + adımı vurgula.
  let focusRouteId = params?.id != null ? String(params.id) : null;
  if (focusRouteId) {
    const fr = rows.find(r => String(r.id) === focusRouteId);
    if (fr) SELECTED_PRODUCT = fr.productCodeId;
  }

  render();
  bindLang(container, render);   // dil değişince yeniden çiz (veri closure'da)

  // --- sol panel veri yardımcıları ---
  function productIds() {
    // rotası olan ürünler (benzersiz), ürün koduna göre sıralı.
    const ids = [...new Set(rows.map(r => r.productCodeId))];
    ids.sort((a, b) => (products.byId.get(a)?.code || '').localeCompare(products.byId.get(b)?.code || '', 'tr'));
    return ids;
  }
  function productMatches(pid) {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return true;
    const p = products.byId.get(pid) || {};
    return [p.code, p.name].some(s => (s || '').toLocaleLowerCase('tr').includes(q));
  }
  function stepCount(pid) {
    // tekil sequence sayısı (satır değil — aynı sırada birden çok iş merkezi olabilir).
    return new Set(rows.filter(r => r.productCodeId === pid).map(r => r.sequence)).size;
  }

  function render() {
    const allIds = productIds();
    const shownIds = allIds.filter(productMatches);
    // Arama sonucu boşsa son seçili ürün KORUNUR (sağ panel onda kalır); sonuç doluysa
    // ve seçim listede yoksa ilk eşleşene düşer.
    if (shownIds.length && !shownIds.includes(SELECTED_PRODUCT)) SELECTED_PRODUCT = shownIds[0];

    // Doldurmalı iki kolon: .rt-root (flex kolon, height:100%) → başlık + gövde ızgarası.
    // Arama SOL kolonun üstünde (tasarım). Paylaşılan .content düzenine dokunulmaz.
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'rt-root';
    const head = document.createElement('div');
    head.className = 'module-head rt-head';
    head.innerHTML = `
      <div>
        <h2>${esc(t('menu.routes'))}</h2>
        <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('rt.summary', { routes: rows.length, products: allIds.length }))}</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="rt-add"${canWrite ? '' : ' disabled title="' + esc(t('common.readonlyHint')) + '"'}>${esc(t('rt.new'))}</button>
      </div>`;
    root.appendChild(head);

    if (allIds.length === 0) {
      const st = document.createElement('div');
      st.className = 'state';
      st.innerHTML = `<div class="state-title">${esc(t('rt.emptyTitle'))}</div><div class="state-msg">${esc(t('rt.empty'))}</div>`;
      root.appendChild(st);
      container.appendChild(root);
      wireAdd();
      return;
    }

    const body = document.createElement('div');
    body.className = 'rt-body';
    const left = document.createElement('div');
    left.className = 'rt-col-left';
    const searchWrap = document.createElement('div');
    searchWrap.className = 'rt-search';
    searchWrap.innerHTML = `<input class="input" type="search" id="rt-search" placeholder="${esc(t('rt.search'))}" value="${esc(search)}">`;
    left.appendChild(searchWrap);
    // Arama boşsa sol listede "Eşleşen ürün yok" + temizle; sağ panel son üründe kalır.
    left.appendChild(shownIds.length === 0 ? emptySearchPanel() : partList(shownIds));

    const right = document.createElement('div');
    right.className = 'rt-col-right';
    right.appendChild(timeline());
    const note = document.createElement('div');
    note.className = 'rt-note';
    note.textContent = t('rt.footerNote');
    right.appendChild(note);

    body.appendChild(left);
    body.appendChild(right);
    root.appendChild(body);
    container.appendChild(root);

    const s = container.querySelector('#rt-search');
    s.addEventListener('input', () => {
      search = s.value; render();
      const el = container.querySelector('#rt-search');
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    });
    wireAdd();

    // focusId: adımı vurgula + görünüme kaydır (mevcut flashRow deseni).
    if (focusRouteId) {
      const el = container.querySelector(`[data-route="${cssEsc(focusRouteId)}"]`);
      if (el) { flashRow(el); el.scrollIntoView({ block: 'center' }); }
      focusRouteId = null;
    }
  }

  function wireAdd() {
    const add = container.querySelector('#rt-add');
    if (canWrite && add) add.addEventListener('click', () => openRouteForm({}));
  }

  // --- sol panel: ürün listesi ---
  function partList(ids) {
    const list = document.createElement('div');
    list.className = 'part-list';
    list.innerHTML = ids.map(pid => {
      const p = products.byId.get(pid) || {};
      const active = pid === SELECTED_PRODUCT ? ' active' : '';
      return `<div class="part-list-item${active}" data-pid="${esc(String(pid))}">
        <div class="pn">${esc(p.code || '#' + pid)}</div>
        <div class="pname">${esc(p.name || '')}</div>
        <div class="pmeta">${esc(t('rt.stepCount', { n: stepCount(pid) }))}</div>
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

  // Arama sonucu boş: sol kolon yerine "Eşleşen ürün yok" + "Aramayı temizle".
  function emptySearchPanel() {
    const el = document.createElement('div');
    el.className = 'rt-empty-search';
    el.innerHTML = `<div class="rt-empty-title">${esc(t('rt.noMatchTitle'))}</div>`;
    const b = document.createElement('button');
    b.className = 'btn btn-secondary btn-sm';
    b.textContent = t('rt.clearSearch');
    b.addEventListener('click', () => {
      search = ''; render();
      const s = container.querySelector('#rt-search'); if (s) s.focus();
    });
    el.appendChild(b);
    return el;
  }

  // --- sağ panel: zaman çizelgesi (panel döner; alt not render()'da eklenir) ---
  function timeline() {
    const p = products.byId.get(SELECTED_PRODUCT) || {};

    const steps = rows.filter(r => r.productCodeId === SELECTED_PRODUCT);
    const groups = new Map();   // sequence -> [routes]
    for (const r of steps) { if (!groups.has(r.sequence)) groups.set(r.sequence, []); groups.get(r.sequence).push(r); }
    const seqs = [...groups.keys()].sort((a, b) => a - b);
    // grup içi: aktif önce, sonra iş merkezi adına göre.
    for (const seq of seqs) {
      groups.get(seq).sort((a, b) =>
        (Number(b.isActive) - Number(a.isActive)) ||
        centers.label(a.workCenterId).localeCompare(centers.label(b.workCenterId), 'tr'));
    }

    const opCount = new Set(steps.map(s => s.operationId)).size;   // farklı operasyon sayısı
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-head">
      <div class="rt-panel-title"><h3 class="mono">${esc(p.code || '')}</h3><span class="sub">${esc(p.name || '')}</span></div>
      <span class="rt-panel-sum">${esc(t('rt.panelSummary', { steps: seqs.length, ops: opCount }))}</span>
    </div>`;
    const body = document.createElement('div');
    body.className = 'panel-body';

    seqs.forEach((seq, i) => {
      const group = groups.get(seq);
      const rep = group.find(g => g.isActive) || group[0];   // temsilci (aktif ya da ilk)
      // CNC grup başlığı: sıra tamsayı VE operasyon adında "CNC" geçiyorsa.
      const cncHead = Number.isInteger(seq) && ops.label(rep.operationId).toUpperCase().includes('CNC');
      if (cncHead) {
        const ch = document.createElement('div');
        ch.className = 'tl-cnc';
        ch.textContent = t('rt.cncGroup');
        if (i === 0) ch.style.marginTop = '0';
        body.appendChild(ch);
      }
      body.appendChild(stepEl(seq, group, rep));
    });

    panel.appendChild(body);
    return panel;
  }

  function stepEl(seq, group, rep) {
    const step = document.createElement('div');
    step.className = 'tl-step';

    const hasVariant = !!(rep.variantLabel || (rep.variants && rep.variants.length));
    const variantBtnLabel = hasVariant ? t('rt.editVariant') : t('rt.addVariant');

    step.innerHTML = `
      <div class="tl-marker-col">
        <div class="tl-num ${Number.isInteger(seq) ? 'tl-main' : 'tl-sub'}">${esc(fmtSeq(seq))}</div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-content">
        <div class="tl-title-row">
          <span class="tl-title">${esc(ops.label(rep.operationId))}</span>
          ${canWrite ? `<button class="btn btn-sm btn-ghost" data-act="alt">${esc(t('rt.addAltOp'))}</button>
          <button class="btn btn-sm btn-ghost" data-act="variant">${esc(variantBtnLabel)}</button>` : ''}
        </div>
        ${hasVariant ? `<div class="tl-variants">
          <span class="text-muted">${esc(rep.variantLabel || t('rt.variantFallback'))}:</span>
          ${(rep.variants || []).map(v => `<span class="tag tag-neutral">${esc(v)}</span>`).join('')}
        </div>` : ''}
      </div>`;

    const content = step.querySelector('.tl-content');
    // Aktif hat yok: bu (ürün, sıra) grubunda hiçbir hat is_active değil → kapasite
    // hesaplanamaz. Adım yine görünür; sarı uyarı + Kapasiteler bağlantısı.
    if (!group.some(g => g.isActive)) {
      const warn = document.createElement('div');
      warn.className = 'tl-warn';
      warn.innerHTML = `${esc(t('rt.noActiveWarn'))}<a href="#capacities" class="rt-link">${esc(t('cap.title'))}</a>${esc(t('rt.noActiveWarnPost'))}`;
      content.appendChild(warn);
    }
    for (const g of group) {
      const row = document.createElement('div');
      row.className = 'tl-wc';
      row.dataset.route = String(g.id);
      row.innerHTML = `
        <span class="tag ${g.isActive ? 'tag-success' : 'tag-neutral'}">${esc(g.isActive ? t('common.active') : t('rt.alt'))}</span>
        <span class="tl-wc-name">${esc(centers.label(g.workCenterId))}</span>`;
      if (canWrite) {
        const actions = document.createElement('span');
        actions.className = 'tl-wc-actions';
        actions.append(
          btn(t('action.edit'), '', () => openRouteForm({ row: g })),
          btn(t('action.delete'), 'tl-del', () => remove(g))
        );
        row.appendChild(actions);
      }
      content.appendChild(row);
    }

    if (canWrite) {
      step.querySelector('[data-act="alt"]').addEventListener('click', () => openAltOp(rep));
      step.querySelector('[data-act="variant"]').addEventListener('click', () => openVariant(group, rep));
    }
    return step;
  }

  // --- yeni / düzenle rota adımı (+ alt operasyon aynı formu kullanır) ---
  function openRouteForm({ row, presetProductId, presetSequence, presetWorkCenterId, altOp } = {}) {
    const editing = !!row;
    const pid = editing ? row.productCodeId : (presetProductId ?? SELECTED_PRODUCT ?? null);
    const productFk = new FkSelect({ source: products.source, rows: products.rows, value: pid, placeholder: t('ord.selectProduct') });
    const opFk = new FkSelect({ source: ops.source, rows: ops.rows, value: row?.operationId ?? null, placeholder: t('wo.selectOperation') });
    const centerFk = new FkSelect({ source: centers.source, rows: centers.rows, value: editing ? row.workCenterId : (presetWorkCenterId ?? null), placeholder: t('wo.selectCenter') });

    const seqDefault = editing ? row.sequence : (presetSequence ?? '');
    // Yeni adımda varsayılan aktif: o (ürün, sıra) için henüz aktif hat yoksa aktif başlat.
    const noActiveYet = !rows.some(r => r.productCodeId === pid && r.sequence === Number(seqDefault) && r.isActive);
    const activeDefault = editing ? (row.isActive ? 1 : 0) : (noActiveYet ? 1 : 0);

    const fields = [];
    if (altOp) fields.push(noteField(esc(t('rt.altOpHint'))));
    fields.push(
      { name: 'productCodeId', label: () => t('field.productShort'), type: 'fk', fk: productFk, required: true },
      { name: 'sequence', label: () => t('field.sequence'), type: 'number', step: '0.1', required: true },
      { name: 'operationId', label: () => t('field.operation'), type: 'fk', fk: opFk, required: true },
      { name: 'workCenterId', label: () => t('field.workCenter'), type: 'fk', fk: centerFk, required: true },
      { name: 'isActive', label: () => t('common.active'), type: 'bool', help: () => t('rt.activeHelp') },
      noteField(defineLinkHtml())
    );

    const dh = openDrawer({
      title: () => altOp ? t('rt.altOpTitle') : t(editing ? 'rt.editTitle' : 'rt.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { productCodeId: pid, sequence: seqDefault, isActive: activeDefault },
      fields,
      // Not alanları read() -> undefined döner; JSON'da düşer, whitelist zaten yok sayar.
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async (saved) => {
        SELECTED_PRODUCT = saved?.productCodeId ?? SELECTED_PRODUCT;
        toast(t(editing ? 'rt.updated' : (altOp ? 'rt.altOpAdded' : 'rt.added')), 'success');
        await reload();
      }
    });
    wireDefineLink(dh);
  }

  function openAltOp(rep) {
    // Referans mantığı: mevcut sıranın tam sayı tabanından başlayıp boş ondalık bul.
    const seqs = rows.filter(r => r.productCodeId === rep.productCodeId).map(r => r.sequence);
    let next = Math.floor(rep.sequence) + 0.1;
    while (seqs.some(s => Math.abs(s - next) < 0.001)) next += 0.1;
    next = Math.round(next * 10) / 10;
    openRouteForm({ presetProductId: rep.productCodeId, presetSequence: next, presetWorkCenterId: rep.workCenterId, altOp: true });
  }

  // --- varyant seçenekleri (aynı ürün+sıra+operasyon tüm alternatiflerine uygulanır) ---
  function openVariant(group, rep) {
    const hasVariant = !!(rep.variantLabel || (rep.variants && rep.variants.length));
    const fields = [
      noteField(esc(t('rt.variantHint'))),
      { name: 'variantLabel', label: () => t('rt.variantGroupName'), type: 'text', placeholder: () => t('rt.variantGroupPlaceholder') },
      { name: 'variantsText', label: () => t('rt.variantOptionsSemicolon'), type: 'textarea', placeholder: () => t('rt.variantOptionsPlaceholder') }
    ];
    if (hasVariant) fields.push(removeVariantField());

    const dh = openDrawer({
      title: () => t('rt.variantTitle'),
      submitLabel: () => t('action.save'),
      values: { variantLabel: rep.variantLabel || '', variantsText: (rep.variants || []).join('; ') },
      fields,
      onSubmit: async (v) => {
        const label = (v.variantLabel || '').trim();
        // Noktalı virgülle ayrılır — virgül ondalık ayracı (or. "8,40 mm") olduğu için kullanılamaz.
        const options = String(v.variantsText || '').split(';').map(x => x.trim()).filter(Boolean);
        if (!label) throw new ValidationError('', { variantLabel: t('rt.variantLabelRequired') });
        if (options.length === 0) throw new ValidationError('', { variantsText: t('rt.variantOptionsRequired') });
        await applyVariantToGroup(group, label, options);
        return true;
      },
      onSaved: async () => { toast(t('rt.variantSaved'), 'success'); await reload(); }
    });

    // "Varyant Tanımını Kaldır" — drawer'ın üçüncü aksiyonu; onaylı, tüm alternatiflerden siler.
    dh.el.querySelector('[data-act="remove-variant"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: t('rt.variantRemoveTitle'), body: t('rt.variantRemoveBody'),
        confirmLabel: t('action.delete'), danger: true
      });
      if (!ok) return;
      try {
        await applyVariantToGroup(group, '', []);
        dh.close();
        toast(t('rt.variantRemoved'), 'success');
        await reload();
      } catch (err) { toast(err.message, 'danger'); }
    });
  }

  // Varyant etiketi + seçeneklerini aynı (ürün, sıra, operasyon) tüm iş merkezlerine yaz.
  // Her alternatif ayrı kayıt; her biri kendi updatedAt'iyle (eşzamanlılık) güncellenir.
  async function applyVariantToGroup(group, label, options) {
    for (const g of group) {
      await api.update(g.id, { variantLabel: label, variants: options, updatedAt: g.updatedAt });
    }
  }

  async function reload() { rows = (await api.listAll()).data; render(); }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('rt.deleteTitle'),
      body: t('rt.deleteBody', { name: `${products.label(row.productCodeId)} · ${ops.label(row.operationId)}` }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try { await api.remove(row.id); toast(t('rt.deleted'), 'success'); await reload(); }
    catch (err) { toast(err.message, 'danger'); }
  }
}

// --- yardımcılar ---

// Drawer'a bilgi/yönlendirme notu (değer üretmeyen özel alan). html GÜVENLİ olmalı:
// yalnızca sabit i18n metni ya da bu modülün ürettiği link geçirilir.
function noteField(html) {
  const el = document.createElement('div');
  el.className = 'rt-drawer-note';
  el.innerHTML = html;
  return { name: '_note' + (noteSeq++), type: 'component', component: { el, getValue: () => undefined } };
}

// "Listede olmayan makine/operasyon mı lazım? İş Merkezleri" — referanstaki bağlantı.
function defineLinkHtml() {
  return `${esc(t('rt.defineHint'))} <a href="#work-centers" class="rt-link" data-nav="work-centers">${esc(t('menu.work-centers'))}</a>`;
}
// Bağlantıya tıklanınca drawer'ı kapat, İş Merkezleri ekranına git (drawer body.body'ye
// eklenir; kapatmadan gidilirse üstte asılı kalır).
function wireDefineLink(dh) {
  dh.el.querySelector('.rt-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    dh.close();
    location.hash = '#work-centers';
  });
}

function removeVariantField() {
  const el = document.createElement('div');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-sm btn-danger';
  b.dataset.act = 'remove-variant';
  b.textContent = t('rt.variantRemove');
  el.appendChild(b);
  return { name: '_removeVar', type: 'component', component: { el, getValue: () => undefined } };
}

// Sıra gösterimi: tam sayı -> "1", ondalık -> "1.1" (float yuvarlama artığını temizle).
function fmtSeq(n) {
  return String(Math.round(Number(n) * 10) / 10);
}

function btn(label, kind, on) {
  const b = document.createElement('button');
  b.className = `btn ${kind} btn-sm`;
  b.textContent = label;
  b.addEventListener('click', on);
  return b;
}

function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
