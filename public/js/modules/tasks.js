// Görev Takibi v2 — beş sekmeli çalışma alanı. Tasarım: Gorev-Takibi-v2.dc.html.
// Sekmeler: Görevler · Kişi Özeti · Pano · Günlük Hatırlatma · Kişiler.
// Kişiler sekmesi eski taskPeople.js'in yerini alır (o menü öğesi kaldırıldı).
//
// Sorumlular task_people'a FK (primaryAssigneeId / secondaryAssigneeId). Enum (durum/öncelik)
// BE'de TR; ekranda ts.*/prio.* ile çevrilir. Türetilen: kalanGun = termin − bugün (yerel),
// gecikti = durum≠Tamamlandı && kalanGun<0. Sekme durumu localStorage'da.
// i18n: dil değişince VERİ ÇEKMEDEN yeniden çizilir (bindLang; veri closure'da).

import { resource } from '../core/api.js';
import { openDrawer } from '../core/drawer.js';
import { FkSelect } from '../core/fkselect.js';
import { toast } from '../core/toast.js';
import { confirmDialog, errorState, esc } from '../core/states.js';
import { loadLookup, TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS, withCurrent } from '../core/lookups.js';
import { t, bindLang } from '../core/i18n.js';
import { fmtTr, fmtDateTR } from '../core/format.js';
import { parseISO, startOfDay } from '../core/report.js';
import { formatPhone } from '../core/phone.js';

const api = resource('tasks');
const peopleApi = resource('task-people');
const canWrite = (window.SESSION_ROLE ?? 'editor') === 'editor';

const TAB_KEY = 'ozmel.gt.tab';
const TABS = [
  ['gorevler', 'gt.tabTasks'], ['kisiOzeti', 'gt.tabPeopleSummary'], ['pano', 'gt.tabBoard'],
  ['hatirlatma', 'gt.tabReminder'], ['kisiler', 'gt.tabPeople'],
];
const DAY_MS = 86400000;

// Enum gösterimi (BE TR): anahtar yoksa ham değer.
const statusLabel = (v) => { if (!v) return t('common.dash'); const k = 'ts.' + v; const s = t(k); return s === k ? v : s; };
const prioLabel = (v) => { if (!v) return t('common.dash'); const k = 'prio.' + v; const s = t(k); return s === k ? v : s; };
const statusOptions = (cur) => withCurrent(TASK_STATUS_OPTIONS.map(o => ({ value: o.value, label: t('ts.' + o.value) })), cur);
const prioOptions = (cur) => withCurrent(TASK_PRIORITY_OPTIONS.map(o => ({ value: o.value, label: t('prio.' + o.value) })), cur);

const statusChip = (v) => {
  const cls = v === 'Tamamlandı' ? 'gt-chip-ok' : v === 'Devam Ediyor' ? 'gt-chip-warn' : 'gt-chip-neutral';
  return `<span class="gt-chip ${cls}">${esc(statusLabel(v))}</span>`;
};
const prioChip = (v) => {
  if (!v) return t('common.dash');
  const cls = v === 'Yüksek' ? 'gt-chip-bad' : v === 'Orta' ? 'gt-chip-warn' : 'gt-chip-neutral';
  return `<span class="gt-chip ${cls}">${esc(prioLabel(v))}</span>`;
};

export async function viewTasks(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  let tasks, people;
  try {
    people = await loadLookup('task-people', (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone }));
    tasks = (await api.listAll()).data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewTasks(container) }));
    return;
  }

  let tab = localStorage.getItem(TAB_KEY) || 'gorevler';
  if (!TABS.some(([id]) => id === tab)) tab = 'gorevler';
  let reminders = [];   // Günlük Hatırlatma kartlarının mesajları (kopyalama için)

  render();
  bindLang(container, render);

  // Görevi türetilmiş alanlarla döndürür (termin, kalanGun, gecikti).
  function computed() {
    const today = startOfDay(new Date());
    return tasks.map(g => {
      const due = g.dueDate ? parseISO(g.dueDate) : null;
      const kalanGun = due ? Math.round((startOfDay(due) - today) / DAY_MS) : null;
      const gecikti = g.status !== 'Tamamlandı' && kalanGun != null && kalanGun < 0;
      return { ...g, due, kalanGun, gecikti };
    });
  }

  // Üç kademeli sıralama: geciken üstte · tamamlanmamış önce · termin sırası (termsiz sona).
  function sortTasks(rows) {
    return rows.slice().sort((a, b) => {
      if (a.gecikti !== b.gecikti) return a.gecikti ? -1 : 1;
      const done = (r) => r.status === 'Tamamlandı' ? 1 : 0;
      if (done(a) !== done(b)) return done(a) - done(b);
      const ta = a.due ? a.due.getTime() : Infinity, tb = b.due ? b.due.getTime() : Infinity;
      return ta - tb;
    });
  }

  function render() {
    const rows = computed();
    const total = rows.length;
    const notStarted = rows.filter(g => g.status === 'Başlamadı').length;
    const inProgress = rows.filter(g => g.status === 'Devam Ediyor').length;
    const onHold = rows.filter(g => g.status === 'Beklemede').length;
    const done = rows.filter(g => g.status === 'Tamamlandı').length;
    const overdue = rows.filter(g => g.gecikti);

    const kpis = [
      { label: t('gt.kpiTotal'), value: fmtTr(total), top: 'var(--color-accent-500)', color: 'var(--color-text)' },
      { label: t('gt.kpiNotStarted'), value: fmtTr(notStarted), top: 'var(--color-neutral-500)', color: 'var(--color-text)' },
      { label: t('gt.kpiInProgress'), value: fmtTr(inProgress), top: 'var(--color-warning)', color: 'var(--color-text)' },
      { label: t('gt.kpiDone'), value: fmtTr(done), top: 'var(--color-success)', color: 'var(--color-text)' },
      { label: t('gt.kpiOverdue'), value: fmtTr(overdue.length), top: overdue.length ? 'var(--color-danger)' : 'var(--color-success)', color: overdue.length ? 'var(--color-danger)' : 'var(--color-text)' },
    ];

    let body = '';
    if (tab === 'gorevler') body = tabTasks(rows);
    else if (tab === 'kisiOzeti') body = tabPeopleSummary(rows);
    else if (tab === 'pano') body = tabBoard(rows, { total, notStarted, inProgress, onHold, done, overdue });
    else if (tab === 'hatirlatma') body = tabReminder(rows);
    else if (tab === 'kisiler') body = tabPeople(rows);

    container.innerHTML = `
      <div class="module-head">
        <div>
          <h2>${esc(t('menu.tasks'))}</h2>
          <div class="text-muted" style="font-size:13.5px; margin-top:6px;">${esc(t('gt.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" id="gt-add"${canWrite ? '' : ` disabled title="${esc(t('common.readonlyHint'))}"`}>${esc(t('gt.new'))}</button>
      </div>
      <div class="gt-kpis">
        ${kpis.map(k => `<div class="gt-kpi" style="border-top-color:${k.top};">
          <div class="gt-kpi-label">${esc(k.label)}</div>
          <div class="gt-kpi-value" style="color:${k.color};">${esc(k.value)}</div></div>`).join('')}
      </div>
      <div class="gt-tabs">
        ${TABS.map(([id, lbl]) => `<button type="button" class="gt-tab${id === tab ? ' on' : ''}" data-tab="${id}">${esc(t(lbl))}</button>`).join('')}
      </div>
      <div class="gt-tabbody">${body}</div>`;

    container.querySelector('#gt-add').addEventListener('click', () => { if (canWrite) openTaskForm(null); });
    container.querySelectorAll('.gt-tab').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab; localStorage.setItem(TAB_KEY, tab); render();
    }));
    bindTab();
  }

  // ---- Sekme 1: Görev Listesi ----
  function tabTasks(rows) {
    const sorted = sortTasks(rows);
    const cols = ['gt.colSeq', 'gt.colTask', 'gt.colDept', 'gt.colPrimary', 'gt.colSecondary', 'gt.colPriority',
      'gt.colDue', 'gt.colStatus', 'gt.colCompletion', 'gt.colRemaining', 'gt.colNotes'];
    const head = cols.map((c, i) => `<th class="${i === 9 ? 'gt-num' : ''}">${esc(t(c))}</th>`).join('');
    const dash = t('common.dash');
    const bodyRows = sorted.map(g => {
      const pct = g.completionRatio != null ? Math.round(g.completionRatio * 100) : 0;
      const kalan = g.status === 'Tamamlandı' || g.kalanGun == null ? dash
        : g.gecikti ? t('gt.overdueBy', { n: -g.kalanGun }) : t('gt.remainingDays', { n: g.kalanGun });
      return `
        <tr class="${g.gecikti ? 'gt-row-late' : ''}${canWrite ? ' gt-row-click' : ''}"${canWrite ? ` data-task="${g.id}"` : ''}>
          <td class="mono text-muted">${esc(g.sequence ?? dash)}</td>
          <td>${esc(g.description || dash)}</td>
          <td class="text-muted">${esc(g.department || dash)}</td>
          <td class="mono">${esc(g.primaryAssigneeId ? people.label(g.primaryAssigneeId) : dash)}</td>
          <td class="mono text-muted">${esc(g.secondaryAssigneeId ? people.label(g.secondaryAssigneeId) : dash)}</td>
          <td>${prioChip(g.priority)}</td>
          <td class="mono">${esc(g.dueDate ? fmtDateTR(g.dueDate) : dash)}</td>
          <td>${statusChip(g.status)}</td>
          <td>
            <div class="gt-prog"><span class="gt-prog-bar"><i style="width:${pct}%;"></i></span><span class="mono gt-prog-pct">%${pct}</span></div>
          </td>
          <td class="gt-num"><span class="${g.gecikti ? 'gt-chip gt-chip-bad' : 'mono text-muted'}">${esc(kalan)}</span></td>
          <td class="text-muted gt-notes">${esc(g.notes || '')}</td>
        </tr>`;
    }).join('');
    return panel(t('gt.listTitle'), t('gt.listSub'), `
      <div class="gt-tablewrap"><table class="gt-table gt-tasks">
        <thead><tr>${head}</tr></thead>
        <tbody>${bodyRows || emptyRow(cols.length, t('tsk.empty'))}</tbody>
      </table></div>`);
  }

  // ---- Sekme 2: Kişi Özeti ----
  function tabPeopleSummary(rows) {
    const ids = [...new Set(rows.map(g => g.primaryAssigneeId).filter(v => v != null))];
    const summary = ids.map(id => {
      const mine = rows.filter(g => g.primaryAssigneeId === id);
      const overdue = mine.filter(g => g.gecikti).length;
      return {
        id, name: people.label(id),
        total: mine.length,
        open: mine.filter(g => g.status !== 'Tamamlandı').length,
        done: mine.filter(g => g.status === 'Tamamlandı').length,
        overdue,
        helper: rows.filter(g => g.secondaryAssigneeId === id).length,
      };
    }).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
    const bodyRows = summary.map(k => `
      <tr>
        <td class="gt-strong">${esc(k.name)}</td>
        <td class="gt-num mono">${esc(fmtTr(k.total))}</td>
        <td class="gt-num mono">${esc(fmtTr(k.open))}</td>
        <td class="gt-num mono">${esc(fmtTr(k.done))}</td>
        <td class="gt-num">${k.overdue ? `<span class="gt-chip gt-chip-bad">${esc(fmtTr(k.overdue))}</span>` : `<span class="mono text-muted">0</span>`}</td>
        <td class="gt-num mono text-muted">${esc(fmtTr(k.helper))}</td>
      </tr>`).join('');
    const head = ['gt.colPerson', 'gt.colTotalTasks', 'gt.colOpenTasks', 'gt.colCompleted', 'gt.colOverdue', 'gt.colHelper']
      .map((c, i) => `<th class="${i === 0 ? '' : 'gt-num'}">${esc(t(c))}</th>`).join('');
    return panel(t('gt.summaryTitle'), '', `
      <div class="gt-tablewrap"><table class="gt-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${bodyRows || emptyRow(6, t('common.dash'))}</tbody>
      </table></div>`);
  }

  // ---- Sekme 3: Pano ----
  function tabBoard(rows, s) {
    const dist = [
      ['Başlamadı', s.notStarted], ['Devam Ediyor', s.inProgress], ['Beklemede', s.onHold], ['Tamamlandı', s.done],
    ];
    const maxD = Math.max(1, ...dist.map(d => d[1]));
    const distHTML = dist.map(([st, n]) => {
      const color = st === 'Tamamlandı' ? 'var(--color-success)' : st === 'Devam Ediyor' ? 'var(--color-warning)' : 'var(--color-accent-500)';
      return `<div class="gt-dist-row">
        <div class="gt-dist-label">${esc(statusLabel(st))}</div>
        <span class="gt-bar"><i style="width:${(n / maxD * 100).toFixed(1)}%; background:${color};"></i></span>
        <div class="mono gt-dist-n">${esc(fmtTr(n))}</div></div>`;
    }).join('');

    const week = rows.filter(g => g.status !== 'Tamamlandı' && g.kalanGun != null && g.kalanGun >= 0 && g.kalanGun <= 7).length;
    const rate = s.total ? Math.round(s.done / s.total * 100) : 0;
    const cards = [
      { label: t('gt.cardOverdue'), value: fmtTr(s.overdue.length), sub: t('gt.cardOverdueSub'), color: s.overdue.length ? 'var(--color-danger)' : 'var(--color-success)' },
      { label: t('gt.cardWeek'), value: fmtTr(week), sub: t('gt.cardWeekSub'), color: 'var(--color-warning)' },
      { label: t('gt.cardRate'), value: '%' + rate, sub: t('gt.cardRateSub', { done: fmtTr(s.done), total: fmtTr(s.total) }), color: 'var(--color-success)' },
    ];
    const cardsHTML = cards.map(c => `
      <div class="gt-sumcard">
        <div><div class="gt-sumcard-label">${esc(c.label)}</div><div class="gt-sumcard-sub">${esc(c.sub)}</div></div>
        <div class="gt-sumcard-val" style="color:${c.color};">${esc(c.value)}</div>
      </div>`).join('');

    return `<div class="gt-board">
      ${panel(t('gt.statusDist'), '', `<div class="gt-dist">${distHTML}</div>`)}
      ${panel(t('gt.upcomingOverdue'), '', `<div class="gt-sumcards">${cardsHTML}</div>`)}
    </div>`;
  }

  // ---- Sekme 4: Günlük Hatırlatma ----
  function tabReminder(rows) {
    const ids = [...new Set(rows.map(g => g.primaryAssigneeId).filter(v => v != null))];
    reminders = ids.map(id => {
      const open = rows.filter(g => g.primaryAssigneeId === id && g.status !== 'Tamamlandı')
        .sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));
      if (!open.length) return null;
      const p = people.byId.get(id) || {};
      const late = open.filter(g => g.gecikti).length;
      const lines = open.map(g => {
        const dateTxt = g.dueDate ? fmtDateTR(g.dueDate) : t('common.dash');
        const durum = g.gecikti ? t('gt.msgOverdue', { n: -g.kalanGun })
          : g.kalanGun != null ? t('gt.msgRemaining', { n: g.kalanGun }) : '';
        return t('gt.msgLine', { task: g.description || '', date: dateTxt, status: durum });
      });
      const msg = t('gt.msgGreeting', { name: p.name || '' }) + '\n' + lines.join('\n');
      return { id, name: p.name || '', phone: p.phone ? formatPhone(p.phone) : '', openCount: open.length, late, msg };
    }).filter(Boolean);

    const badge = (r) => t('gt.badgeOpen', { n: r.openCount }) + (r.late ? ' · ' + t('gt.badgeOverdue', { n: r.late }) : '');
    const cards = reminders.map((r, i) => `
      <div class="gt-rem">
        <div class="gt-rem-head">
          <span class="gt-strong">${esc(r.name)}</span>
          <span class="mono text-muted" style="font-size:12.5px;">${esc(r.phone)}</span>
          <span class="gt-chip ${r.late ? 'gt-chip-bad' : 'gt-chip-neutral'}" style="margin-left:auto;">${esc(badge(r))}</span>
          <button class="btn btn-secondary btn-sm gt-copy" data-i="${i}">${esc(t('gt.copy'))}</button>
        </div>
        <pre class="gt-rem-msg">${esc(r.msg)}</pre>
      </div>`).join('');
    return panel(t('gt.reminderTitle'), t('gt.reminderSub'),
      cards ? `<div class="gt-rems">${cards}</div>` : `<div class="text-muted" style="padding:8px 0;">${esc(t('gt.noReminders'))}</div>`);
  }

  // ---- Sekme 5: Kişiler (eski taskPeople.js) ----
  function tabPeople(rows) {
    const dash = t('common.dash');
    const openOf = (id) => rows.filter(g => g.primaryAssigneeId === id && g.status !== 'Tamamlandı').length;
    const bodyRows = people.rows.map(p => `
      <tr>
        <td class="gt-strong">${esc(p.name || '')}</td>
        <td class="mono">${p.email ? `<a class="xlink" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : dash}</td>
        <td class="mono">${esc(p.phone ? formatPhone(p.phone) : dash)}</td>
        <td class="gt-num mono">${esc(fmtTr(openOf(p.id)))}</td>
        ${canWrite ? `<td class="gt-num"><div class="gt-acts">
          <button class="btn btn-ghost btn-sm" data-pedit="${p.id}">${esc(t('action.edit'))}</button>
          <button class="btn btn-danger btn-sm" data-pdel="${p.id}">${esc(t('action.delete'))}</button></div></td>` : ''}
      </tr>`).join('');
    const head = `<th>${esc(t('gt.colName'))}</th><th>${esc(t('gt.colEmail'))}</th><th>${esc(t('gt.colPhone'))}</th><th class="gt-num">${esc(t('gt.colOpen'))}</th>${canWrite ? '<th class="gt-num"></th>' : ''}`;
    const addBtn = canWrite ? `<button class="btn btn-secondary btn-sm" id="gt-add-person">${esc(t('gt.newPerson'))}</button>` : '';
    return panel(t('gt.peopleTitle'), t('gt.peopleSub'), `
      <div class="gt-tablewrap"><table class="gt-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${bodyRows || emptyRow(canWrite ? 5 : 4, t('tp.empty'))}</tbody>
      </table></div>`, addBtn);
  }

  // Sekmeye özel olay bağlama (her render'da).
  function bindTab() {
    if (tab === 'gorevler' && canWrite) {
      container.querySelectorAll('.gt-row-click').forEach(tr => tr.addEventListener('click', () => {
        const g = tasks.find(x => x.id === Number(tr.dataset.task)); if (g) openTaskForm(g);
      }));
    }
    if (tab === 'hatirlatma') {
      container.querySelectorAll('.gt-copy').forEach(b => b.addEventListener('click', async () => {
        const r = reminders[Number(b.dataset.i)]; if (!r) return;
        try { await navigator.clipboard.writeText(r.msg); toast(t('gt.copied'), 'success'); }
        catch { toast(t('gt.copyFail'), 'danger'); }
      }));
    }
    if (tab === 'kisiler' && canWrite) {
      container.querySelector('#gt-add-person')?.addEventListener('click', () => openPersonForm(null));
      container.querySelectorAll('[data-pedit]').forEach(b => b.addEventListener('click', () => {
        const p = people.rows.find(x => x.id === Number(b.dataset.pedit)); if (p) openPersonForm(p);
      }));
      container.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', () => {
        const p = people.rows.find(x => x.id === Number(b.dataset.pdel)); if (p) removePerson(p);
      }));
    }
  }

  // ---- Görev drawer (ekle/düzenle) ----
  function openTaskForm(row) {
    const editing = !!row;
    const primaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.primaryAssigneeId ?? null, placeholder: t('tsk.selectPerson') });
    const secondaryFk = new FkSelect({ source: people.source, rows: people.rows, value: row?.secondaryAssigneeId ?? null, placeholder: t('tsk.selectPerson') });
    openDrawer({
      title: () => t(editing ? 'tsk.editTitle' : 'tsk.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : { status: 'Başlamadı' },
      fields: [
        { name: 'secId', type: 'section', label: () => t('tsk.secTask') },
        { name: 'sequence', label: () => t('field.sequence'), type: 'number' },
        { name: 'description', label: () => t('tsk.description'), type: 'textarea', required: true },
        { name: 'department', label: () => t('tsk.department'), type: 'text' },
        { name: 'priority', label: () => t('tsk.priority'), type: 'select', options: prioOptions(row?.priority) },
        { name: 'secAssign', type: 'section', label: () => t('tsk.secAssign') },
        { name: 'primaryAssigneeId', label: () => t('tsk.primary'), type: 'fk', fk: primaryFk },
        { name: 'secondaryAssigneeId', label: () => t('tsk.secondary'), type: 'fk', fk: secondaryFk },
        { name: 'dueDate', label: () => t('field.dueDate'), type: 'date' },
        { name: 'status', label: () => t('field.status'), type: 'select', options: statusOptions(row?.status) },
        { name: 'completionRatio', label: () => t('tsk.completionRatio'), type: 'number', step: 'any', help: () => t('tsk.completionHelp') },
        { name: 'notes', label: () => t('tsk.notes'), type: 'textarea' },
      ],
      onSubmit: async (v) => (editing ? await api.update(row.id, v) : await api.create(v)).data,
      onSaved: async () => { toast(t(editing ? 'tsk.updated' : 'tsk.added'), 'success'); tasks = (await api.listAll()).data; render(); },
      // Silme yalnız düzenlemede — drawer içinde, onay isteyerek (satırda ayrı sil sütunu yok).
      ...(editing ? {
        onDelete: async () => {
          const ok = await confirmDialog({ title: t('tsk.deleteTitle'), body: t('tsk.deleteBody'), confirmLabel: t('action.delete'), danger: true });
          if (!ok) return false;
          try {
            await api.remove(row.id);
            toast(t('tsk.deleted'), 'success');
            tasks = (await api.listAll()).data;
            render();
            return true;
          } catch (err) { toast(err.message, 'danger'); return false; }
        },
      } : {}),
    });
  }

  // ---- Kişi drawer (taskPeople'dan taşındı) ----
  function openPersonForm(row) {
    const editing = !!row;
    openDrawer({
      title: () => t(editing ? 'tp.editTitle' : 'tp.newTitle'),
      submitLabel: () => t(editing ? 'action.update' : 'action.add'),
      values: editing ? { ...row } : {},
      fields: [
        { name: 'name', label: () => t('field.fullName'), type: 'text', required: true },
        { name: 'email', label: () => t('field.email'), type: 'text' },
        { name: 'phone', label: () => t('field.phone'), type: 'phone' },
      ],
      onSubmit: async (v) => (editing ? await peopleApi.update(row.id, v) : await peopleApi.create(v)).data,
      onSaved: async () => { toast(t(editing ? 'tp.updated' : 'tp.added'), 'success'); await reloadPeople(); },
    });
  }

  async function removePerson(row) {
    const ok = await confirmDialog({ title: t('tp.deleteTitle'), body: t('common.deleteShort', { name: row.name }), confirmLabel: t('action.delete'), danger: true });
    if (!ok) return;
    try { await peopleApi.remove(row.id); toast(t('tp.deleted'), 'success'); await reloadPeople(); }
    catch (err) { toast(err.message, 'danger'); }
  }

  async function reloadPeople() {
    people = await loadLookup('task-people', (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone }));
    render();
  }
}

// --- küçük yardımcılar ---
function panel(title, sub, inner, headExtra = '') {
  return `<div class="panel gt-panel">
    <div class="gt-panel-head">
      <span class="gt-panel-title">${esc(title)}</span>
      ${sub ? `<span class="gt-panel-sub">${esc(sub)}</span>` : ''}
      ${headExtra ? `<span style="margin-left:auto;">${headExtra}</span>` : ''}
    </div>
    ${inner}
  </div>`;
}
function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" class="text-muted" style="padding:20px 14px; text-align:center;">${esc(msg)}</td></tr>`;
}
