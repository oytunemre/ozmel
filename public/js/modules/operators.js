// Operatorler — v2 modulu. İki sekme: (1) Operatör Listesi (ortak FE katmani core/
// uzerine TAM baglanmis liste + ekleme + duzenleme + silme + yetkinlik FK secici),
// (2) Performans (production kayitlarinin operatore gore SALT OKUNUR ozeti).
// Sekme + dönem seçimi localStorage'da; yeni BE ucu yok, veri istemcide türetilir.
// i18n: etiketler () => t(...); veri değerleri (ad/sicil) çevrilmez.

import { resource, request } from '../core/api.js';
import { DataTable } from '../core/table.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { childChips } from './_childDetail.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDuration } from '../core/format.js';
import { downtimeMinutes } from '../core/capacity.js';
import { thresholdClass, startOfDay, mondayOf, addDays, parseISO } from '../core/report.js';

const operatorsApi = resource('operators');
const operationsApi = resource('operations');
const productionApi = resource('production');

// Salt okuma mu? Oturum rolu editor degilse yazma kapali (aksiyonlar devre disi + ipucu).
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const TAB_LS = 'ozmel.opr.tab';         // 'liste' | 'perf'
const RANGE_LS = 'ozmel.opr.perfRange'; // 'haftalik' | 'aylik' | 'tumu'
const TARGET_THRESHOLD = 90;            // hedef gerçekleşme eşiği (report.js:thresholdClass)

const readTab = () => { try { const v = localStorage.getItem(TAB_LS); return v === 'perf' ? 'perf' : 'liste'; } catch { return 'liste'; } };
const writeTab = (v) => { try { localStorage.setItem(TAB_LS, v); } catch {} };
const readRange = () => { try { const v = localStorage.getItem(RANGE_LS); return (v === 'aylik' || v === 'tumu') ? v : 'haftalik'; } catch { return 'haftalik'; } };
const writeRange = (v) => { try { localStorage.setItem(RANGE_LS, v); } catch {} };

// Bitişik düğme grubu (segment) — blueprint: kenarlıklı kutu, seçili accent-900 dolu.
function segControl(items, active) {
  return `<div style="display:inline-flex; border:1px solid var(--color-neutral-400);">
    ${items.map(([val, label], i) => {
      const on = val === active;
      return `<button type="button" data-seg="${esc(val)}" style="height:38px; padding:0 20px; font-size:14px; border:0; border-left:${i === 0 ? '0' : '1px solid var(--color-neutral-400)'}; cursor:pointer; background:${on ? 'var(--color-accent-900)' : 'transparent'}; color:${on ? '#fff' : 'var(--color-text)'}; font-weight:${on ? '600' : '400'}; white-space:nowrap;">${esc(label)}</button>`;
    }).join('')}
  </div>`;
}

export async function viewOperators(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  // Tek Promise.all: operasyonlar (yetkinlik adları + FK), operatörler (performans ad
  // eşlemesi), üretim kayıtları + çalışma saatleri (duruş dakikası) paralel çekilir.
  let operations, operators, production, wh;
  try {
    [operations, operators, production, wh] = await Promise.all([
      operationsApi.listAll().then(r => r.data),
      operatorsApi.listAll().then(r => r.data),
      productionApi.listAll().then(r => r.data),
      request('/working-hours').then(r => r.data),
    ]);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewOperators(container) }));
    return;
  }
  const opName = new Map(operations.map(o => [o.id, o.name]));
  const operatorName = new Map(operators.map(o => [o.id, o.fullName]));
  const opsSource = async () => ({
    rows: operations.map(o => ({ id: o.id, name: o.name })),
    total: operations.length
  });

  let tab = readTab();
  let range = readRange();

  // Kabuk: sekme şeridi + iki gövde (liste kalıcı, gizlenerek; performans yeniden çizilir).
  container.innerHTML = `
    <div id="opr-tabbar" style="margin-bottom:16px;"></div>
    <div id="opr-liste"></div>
    <div id="opr-perf" style="display:none;"></div>`;
  const tabbar = container.querySelector('#opr-tabbar');
  const listeHost = container.querySelector('#opr-liste');
  const perfHost = container.querySelector('#opr-perf');

  // --- Sekme 1: Operatör Listesi (mevcut liste — aynen) ---
  const table = new DataTable(listeHost, {
    title: () => t('menu.operators'),
    canWrite,
    addLabel: () => t('opr.new'),
    onAdd: () => openForm(null),
    onEdit: (row) => openForm(row),
    onDelete: (row) => remove(row),
    load: () => operatorsApi.listAll().then(r => r.data),
    rowId: (r) => r.id,
    searchText: (r) => [r.fullName, r.badgeNo, r.skills.map(id => opName.get(id) || '').join(' ')].join(' '),
    emptyMessage: () => t('opr.empty'),
    // Genişleyen satır: operatörün yetkin olduğu operasyonlar (satırda yalnız sayısı).
    expand: (r) => childChips(r.skills.map(id => opName.get(id) || ('#' + id)), t('opr.noSkills')),
    columns: [
      { label: () => t('field.nameSurname'), key: 'fullName' },
      { label: () => t('field.badgeNo'), key: 'badgeNo' },
      {
        label: () => t('opr.skills'),
        render: (r) => r.skills.length
          ? `<span class="mono">${r.skills.length}</span> ${esc(t('word.operations'))}`
          : '<span class="text-muted">—</span>'
      },
      {
        label: () => t('field.status'),
        render: (r) => r.isActive
          ? `<span class="tag tag-success">${esc(t('common.active'))}</span>`
          : `<span class="tag tag-neutral">${esc(t('common.inactive'))}</span>`
      }
    ]
  });

  renderTabBar();
  applyTab();
  // Dil değişince: sekme etiketleri + (açıksa) performans yeniden çizilir. Liste tablosu
  // kendi aboneliğiyle (DataTable) etiketlerini kendi tazeler — burada dokunulmaz.
  bindLang(container, () => { renderTabBar(); if (tab === 'perf') renderPerf(); });

  function renderTabBar() {
    tabbar.innerHTML = segControl([['liste', t('opr.tabList')], ['perf', t('opr.tabPerf')]], tab);
    tabbar.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.seg;
      if (v === tab) return;
      tab = v; writeTab(tab);
      renderTabBar(); applyTab();
    }));
  }

  function applyTab() {
    listeHost.style.display = tab === 'liste' ? '' : 'none';
    perfHost.style.display = tab === 'perf' ? '' : 'none';
    if (tab === 'perf') renderPerf();
  }

  // --- Sekme 2: Performans ---
  // Seçili döneme (bu hafta / bu ay / tüm zamanlar) düşen üretim tarihleri.
  function inRange(iso) {
    if (range === 'tumu') return true;
    if (!iso) return false;
    const today = startOfDay(new Date());
    const d = parseISO(iso);
    if (range === 'haftalik') { const s = mondayOf(today); return d >= s && d < addDays(s, 7); }
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }

  function renderPerf() {
    // Sadece operator_id DOLU kayıtlar; operatöre göre grupla (referans v78).
    const groups = new Map();
    for (const p of production) {
      if (p.operatorId == null || !inRange(p.date)) continue;
      const g = groups.get(p.operatorId) || { operatorId: p.operatorId, records: 0, produced: 0, scrap: 0, target: 0, downtime: 0 };
      g.records++;
      g.produced += Number(p.actualQuantity) || 0;
      g.scrap += Number(p.scrapQuantity) || 0;
      g.target += Number(p.targetQuantity) || 0;
      g.downtime += downtimeMinutes(p.downtimeStart, p.downtimeEnd, wh);
      groups.set(p.operatorId, g);
    }
    const rows = [...groups.values()].map(g => {
      const scrapRate = (g.produced + g.scrap) > 0 ? Math.round(g.scrap / (g.produced + g.scrap) * 1000) / 10 : 0;
      const targetPct = g.target > 0 ? Math.round(g.produced / g.target * 100) : null;
      // Silinmiş operatör: satırı atlama, adını "(silinmiş operatör)" göster.
      const name = operatorName.get(g.operatorId) || t('opr.deletedOperator');
      return { ...g, name, scrapRate, targetPct };
    }).sort((a, b) => b.produced - a.produced);

    const rangeCtl = segControl(
      [['haftalik', t('opr.perfRangeWeek')], ['aylik', t('opr.perfRangeMonth')], ['tumu', t('opr.perfRangeAll')]],
      range
    );

    const body = rows.length === 0
      ? `<div class="panel" style="margin-top:16px;"><div class="empty" style="padding:28px 18px; color:var(--color-neutral-700); font-size:14px;">${esc(t('opr.perfEmpty'))}</div></div>`
      : `
        <div class="panel" style="margin-top:16px;">
          <div class="panel-head">
            <h3>${esc(t('opr.perfTitle'))}</h3>
            <span class="sub">${esc(t('opr.perfSub'))}</span>
          </div>
          <div class="table-wrap"><table class="table ur-table">
            <thead><tr>
              <th>${esc(t('opr.colOperator'))}</th>
              <th class="num">${esc(t('opr.colRecords'))}</th>
              <th class="num">${esc(t('opr.colProduced'))}</th>
              <th class="num">${esc(t('opr.colScrap'))}</th>
              <th class="num">${esc(t('opr.colScrapRate'))}</th>
              <th class="num">${esc(t('opr.colTargetPct'))}</th>
              <th class="num">${esc(t('opr.colDowntime'))}</th>
            </tr></thead>
            <tbody>${rows.map(r => `<tr>
              <td>${esc(r.name)}</td>
              <td class="mono num">${esc(fmtTr(r.records))}</td>
              <td class="mono num">${esc(fmtTr(r.produced))}</td>
              <td class="mono num">${esc(fmtTr(r.scrap))}</td>
              <td class="num">${scrapBadge(r.scrapRate)}</td>
              <td class="num">${r.targetPct !== null ? pctBadge(r.targetPct) : '<span class="text-muted">—</span>'}</td>
              <td class="mono num">${r.downtime > 0 ? esc(fmtDuration(r.downtime)) : '—'}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>`;

    perfHost.innerHTML = `<div style="margin-bottom:4px;">${rangeCtl}</div>${body}`;
    perfHost.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.seg;
      if (v === range) return;
      range = v; writeRange(range); renderPerf();
    }));
  }

  // Fire oranı: ≤%2 success · ≤%5 warning · üstü danger.
  function scrapBadge(rate) {
    const cls = rate <= 2 ? 'tag-success' : rate <= 5 ? 'tag-warn' : 'tag-danger';
    return `<span class="tag ${cls}">%${esc(fmtTr(rate))}</span>`;
  }
  // Hedef gerçekleşme: report.js:thresholdClass (eşik 90); 'warning' → tag-warn.
  function pctBadge(n) {
    const c = thresholdClass(n, TARGET_THRESHOLD);
    const cls = c === 'warning' ? 'tag-warn' : c === 'success' ? 'tag-success' : 'tag-danger';
    return `<span class="tag ${cls}">%${esc(fmtTr(n))}</span>`;
  }

  function openForm(row) {
    const editing = !!row;
    if (editing) table.markActive(row.id);   // panjur aciykken ilgili satir vurgulu

    const skillsFk = new FkSelect({
      source: opsSource, multiple: true, value: row?.skills ?? [],
      rows: operations.map(o => ({ id: o.id, name: o.name }))   // etiketler hemen cozulsun
    });

    openDrawer({
      title: () => t(editing ? 'opr.editTitle' : 'opr.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { isActive: 1 },
      fields: [
        { name: 'fullName', label: () => t('field.nameSurname'), type: 'text', required: true },
        { name: 'badgeNo', label: () => t('field.badgeNo'), type: 'text', required: true },
        { name: 'isActive', label: () => t('field.status'), type: 'bool' },
        { name: 'skills', label: () => t('opr.skills'), type: 'fk', fk: skillsFk,
          help: () => t('opr.skillsHelp') }
      ],
      onSubmit: async (v) => {
        const payload = { fullName: v.fullName, badgeNo: v.badgeNo, isActive: v.isActive, skills: v.skills };
        const { data } = editing
          ? await operatorsApi.update(row.id, { ...payload, updatedAt: v.updatedAt })
          : await operatorsApi.create(payload);
        return data;
      },
      onSaved: async (saved) => {
        toast(t(editing ? 'opr.updated' : 'opr.added'), 'success');
        await table.reload();
        table.flash(saved.id);
      },
      onClose: () => table.markActive(null)
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: t('opr.deleteTitle'),
      body: t('opr.deleteBody', { name: row.fullName }),
      confirmLabel: t('action.delete'), danger: true
    });
    if (!ok) return;
    try {
      await operatorsApi.remove(row.id);
      toast(t('opr.deleted'), 'success');
      await table.reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}
