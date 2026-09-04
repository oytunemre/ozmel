// Üretim Panosu — v2 modülü (yeni ekran). Referans mantık: v78 viewUretimPanosu.
// Sahaya asılan TV ekranı; diğer ekranlardan iki farkı var:
//   1) SALT görüntüleme — form/düzenleme yok
//   2) OTOMATİK yenilenen — uygulamadaki TEK yoklama noktası (TV'de kimse yenilemez)
//
// Uzaktan okunsun diye tipografi çok büyük (başlık 46 / KPI 58 / kart 44 px) —
// tasarımdan birebir, küçültülmez. Renk eşiği panoda farklı: iyi/orta arasındaki
// fark 30 puan (diğer ekranlarda 20) ve --pano-* tokenlarıyla ayrı tanımlı.
//
// Veri istemcide türetilir (listAll — yeni BE ucu yok): machine_plans (bugünün planı)
// + production (gerçekleşen, (tarih, iş emri) eşleşmesi) + work_orders + work_centers
// + product_codes + working_hours (duruş molası düşülür). Tarih hesabı YEREL (toISOString yok).

import { resource, request } from '../core/api.js';
import { errorState, esc } from '../core/states.js';
import { loadLookup, mapNamed, mapProduct } from '../core/lookups.js';
import { t, getLang, bindLang } from '../core/i18n.js';
import { downtimeMinutes } from '../core/capacity.js';
import { fmtTr, fmtDuration } from '../core/format.js';
import { fmtISO, mondayOf, addDays, startOfDay, DAY_NAMES } from '../core/report.js';

const TARGET_THRESHOLD = 90;   // eşik: ≥eşik iyi · ≥eşik−30 orta · altı kötü (30 puan!)
const REFRESH_SEC = 15;        // otomatik yenileme (5–120 arası anlamlı)

// Gün kısaltmaları (getDay() ile indekslenir) — DAY_NAMES tam ad verir, burada kısa lazım.
const DAY_SHORT = () => getLang() === 'en'
  ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  : ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const ddMM = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

const colorFor = (y) => y >= TARGET_THRESHOLD ? 'var(--pano-iyi)' : y >= TARGET_THRESHOLD - 30 ? 'var(--pano-orta)' : 'var(--pano-kotu)';
const fillFor = (y) => y >= TARGET_THRESHOLD ? 'var(--pano-iyi-zemin)' : y >= TARGET_THRESHOLD - 30 ? 'var(--pano-orta-zemin)' : 'var(--pano-kotu-zemin)';

export async function viewUretimPanosu(container) {
  container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

  let data;
  try {
    data = await loadData();
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(errorState({ message: err.message, onRetry: () => viewUretimPanosu(container) }));
    return;
  }

  // Kalıcı kök: render() yalnızca root.innerHTML'i değiştirir (root DOM'da kalır) — böylece
  // tam ekran hedefi ve yaşam-döngüsü işaretçisi renderlar arası sabit kalır.
  const root = document.createElement('div');
  root.className = 'pano-root';
  container.innerHTML = '';
  container.appendChild(root);

  render();
  bindLang(container, render);   // dil değişince VERİ ÇEKMEDEN yeniden çiz (veri closure'da)

  // Yaşam döngüsü: başka modüle geçilince root DOM'dan düşer → zamanlayıcıları bırak.
  const alive = () => container.contains(root);
  const stop = () => { clearInterval(clockTimer); clearInterval(refreshTimer); };

  // Canlı saat (1 sn) — tüm ekranı değil, yalnızca saat öğesini günceller (zıplama olmasın).
  const clockTimer = setInterval(() => {
    if (!alive()) { stop(); return; }
    const el = root.querySelector('.pano-clock');
    if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
  }, 1000);

  // Otomatik yenileme (N sn) — eski veri ekranda kalır; hata olursa sessizce geç (TV'de
  // hata şeridi anlamsız). Yenileme sırasında iskelet gösterilmez.
  const refreshTimer = setInterval(async () => {
    if (!alive()) { stop(); return; }
    try {
      data = await loadData();
      if (alive()) render();
    } catch { /* sessizce geç — eski veri kalsın */ }
  }, REFRESH_SEC * 1000);

  async function loadData() {
    const [centers, products] = await Promise.all([
      loadLookup('work-centers', mapNamed),
      loadLookup('product-codes', mapProduct),
    ]);
    const workOrders = (await resource('work-orders').listAll()).data;
    const plans = (await resource('machine-plans').listAll()).data;
    const production = (await resource('production').listAll()).data;
    const { data: wh } = await request('/working-hours');
    return { centers, products, woById: new Map(workOrders.map(w => [w.id, w])), plans, production, wh };
  }

  // Bir günün kayıtları: o günün her plan satırı (iş merkezi başına tek) için hedef +
  // gerçekleşen + duruş. Gerçekleşen/duruş (tarih, iş emri) üzerinden eşleşir.
  function dayRecords(iso) {
    const { plans, production, woById, wh } = data;
    const actualByWo = new Map(), downByWo = new Map();
    for (const p of production) {
      if (p.date !== iso || p.workOrderId == null) continue;
      actualByWo.set(p.workOrderId, (actualByWo.get(p.workOrderId) || 0) + (Number(p.actualQuantity) || 0));
      downByWo.set(p.workOrderId, (downByWo.get(p.workOrderId) || 0) + downtimeMinutes(p.downtimeStart, p.downtimeEnd, wh));
    }
    return plans.filter(pl => pl.date === iso).map(pl => {
      const wo = pl.workOrderId != null ? woById.get(pl.workOrderId) : null;
      const woNo = wo ? (wo.woNo + (wo.splitLabel ? '-' + wo.splitLabel : '')) : null;
      return {
        wcId: pl.workCenterId,
        wcName: data.centers.label(pl.workCenterId),
        product: data.products.byId.get(pl.productCodeId)?.code || (pl.productCodeId != null ? '#' + pl.productCodeId : ''),
        woNo,
        target: Number(pl.targetQuantity) || 0,
        actual: pl.workOrderId != null ? (actualByWo.get(pl.workOrderId) || 0) : 0,
        downtime: pl.workOrderId != null ? (downByWo.get(pl.workOrderId) || 0) : 0,
      };
    });
  }

  function render() {
    const today = startOfDay(new Date());
    const todayISO = fmtISO(today);
    const recs = dayRecords(todayISO);

    const totalTarget = recs.reduce((s, r) => s + r.target, 0);
    const totalActual = recs.reduce((s, r) => s + r.actual, 0);
    const totalDown = recs.reduce((s, r) => s + r.downtime, 0);
    const overall = totalTarget > 0 ? Math.round(totalActual / totalTarget * 100) : 0;

    const kpis = [
      { label: t('pano.kpiPlanned'), value: fmtTr(totalTarget, '0'), sub: t('pano.kpiPlannedSub', { n: recs.length }),
        top: 'var(--color-accent-500)', bg: 'transparent', color: 'var(--color-text)' },
      { label: t('pano.kpiActual'), value: fmtTr(totalActual, '0'), sub: t('pano.kpiActualSub'),
        top: 'var(--color-accent-500)', bg: 'transparent', color: 'var(--color-text)' },
      { label: t('pano.kpiOverall'), value: '%' + overall, sub: t('pano.kpiOverallSub', { n: TARGET_THRESHOLD }),
        top: colorFor(overall), bg: fillFor(overall), color: colorFor(overall) },
      { label: t('pano.kpiDowntime'), value: fmtDuration(totalDown), sub: totalDown > 0 ? t('pano.downtimeYes') : t('pano.downtimeNo'),
        top: totalDown > 0 ? 'var(--pano-kotu)' : 'var(--pano-iyi)', bg: totalDown > 0 ? 'var(--pano-kotu-zemin)' : 'transparent',
        color: totalDown > 0 ? 'var(--pano-kotu)' : 'var(--color-text)' },
    ];

    const cards = recs.slice().sort((a, b) => a.wcName.localeCompare(b.wcName, 'tr')).map(r => {
      const y = r.target > 0 ? Math.round(r.actual / r.target * 100) : 0;
      const color = colorFor(y);
      const sub = [r.product, r.woNo].filter(Boolean).join(' · ');
      return `
        <div class="pano-card">
          <div class="pano-card-top">
            <div class="pano-card-name">${esc(r.wcName)}</div>
            <div class="pano-card-pct" style="color:${color};">%${y}</div>
          </div>
          <div class="pano-card-sub">${esc(sub)}</div>
          <div class="pano-card-nums">
            <span class="pano-card-actual" style="color:${color};">${esc(fmtTr(r.actual, '0'))}</span>
            <span class="pano-card-target">/ ${esc(fmtTr(r.target, '0'))}</span>
            ${r.downtime > 0 ? `<span class="pano-card-down">${esc(fmtDuration(r.downtime))}</span>` : ''}
          </div>
          <span class="pano-bar"><i style="width:${Math.min(y, 100)}%; background:${color};"></i></span>
        </div>`;
    }).join('');

    const weekStart = mondayOf(today);
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const dr = dayRecords(fmtISO(d));
      const plan = dr.reduce((s, r) => s + r.target, 0);
      const actual = dr.reduce((s, r) => s + r.actual, 0);
      const y = plan > 0 ? Math.round(actual / plan * 100) : null;
      const isToday = fmtISO(d) === todayISO;
      return `
        <div class="pano-day" style="${isToday ? 'background:var(--color-accent-100); border-color:var(--color-accent-500);' : ''}">
          <div class="pano-day-name">${esc(DAY_SHORT()[d.getDay()])}</div>
          <div class="pano-day-date">${esc(ddMM(d))}</div>
          <div class="pano-day-nums">${esc(plan || actual ? fmtTr(actual, '0') : '—')}<small> / ${esc(plan ? fmtTr(plan, '0') : '—')}</small></div>
          <div class="pano-day-pct" style="color:${y === null ? 'var(--color-neutral-500)' : colorFor(y)};">${y === null ? '' : '%' + y}</div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="pano-head">
        <div style="min-width:0;">
          <div class="pano-title">${esc(t('pano.title'))}</div>
          <div class="pano-date">${esc(DAY_NAMES()[today.getDay()] + ', ' + ddMM(today) + '.' + today.getFullYear())}</div>
        </div>
        <div class="pano-head-right">
          <div class="pano-clock">${esc(new Date().toLocaleTimeString('tr-TR'))}</div>
          <button type="button" class="pano-fs">${esc(t('pano.fullscreen'))}</button>
        </div>
      </div>

      <div class="pano-kpis">
        ${kpis.map(k => `
          <div class="pano-kpi" style="border-top-color:${k.top}; background:${k.bg};">
            <div class="pano-kpi-label">${esc(k.label)}</div>
            <div class="pano-kpi-value" style="color:${k.color};">${esc(k.value)}</div>
            <div class="pano-kpi-sub">${esc(k.sub)}</div>
          </div>`).join('')}
      </div>

      ${recs.length === 0 ? `
        <div class="pano-empty">
          <div class="pano-empty-title">${esc(t('pano.emptyTitle'))}</div>
          <div class="pano-empty-sub">${esc(t('pano.emptyBody'))}</div>
        </div>` : `
        <div class="pano-cards">${cards}</div>`}

      <div>
        <div class="pano-week-label">${esc(t('pano.thisWeek'))}</div>
        <div class="pano-week">${week}</div>
      </div>

      <div class="pano-foot">${esc(t('pano.footer', { n: REFRESH_SEC }))}</div>
    `;

    // Tam ekran: pano köküne uygulanır (kabuk normal kalır). Hata sessizce yutulur.
    root.querySelector('.pano-fs').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
      } catch { /* yut */ }
    });
  }
}
