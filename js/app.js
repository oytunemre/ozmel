/* =======================================================================
   QFW Program — Tedarikçi Kalite Konsolu
   KENDİ SUNUCUNUZDA (DirectAdmin/PHP+MySQL) barındırılan sürüm.
   Veri, aşağıdaki API_URL adresindeki api.php dosyasına kaydedilir.
   ======================================================================= */

// ─── SUNUCU ADRESİ ──────────────────────────────────────────────────────
// '.' = "bu sayfanın bulunduğu klasör". index.html ile api.php aynı klasörde
// olduğu sürece adresi elle yazmaya gerek yok: ozmel.com da, www.ozmel.com da,
// ileride başka bir klasöre taşınsa da çalışır ve CORS sorunu çıkmaz.
// Sadece api.php'yi başka bir sunucuya koyarsanız buraya tam adresini yazın.
const API_BASE = '.';
// ────────────────────────────────────────────────────────────────────────
const API_URL = API_BASE + '/api.php';
const LOGIN_URL = API_BASE + '/login.php';
const LOGOUT_URL = API_BASE + '/logout.php';

const SEED = JSON.parse(document.getElementById('seed-data').textContent);

let DB = { sites: [], parts: [], milestones: [], audits: [], dimwork: [], qfw: [], routes: [], capacity: [], workorders: [], production: [], orders: [], kontrolPlani: [], kaliteOlcumleri: [],
  firstOffNoktalari: [], saatlikNoktalari: [], firstOffKayitlari: [], saatlikKayitlari: [], makinePlani: [], satinalmaIstekleri: [], satinalmaGirisleri: [], urunAgaclari: [], gorevler: [], gorevKisiler: [], girisKaliteKontrolleri: [] };
let ROUTE = 'dashboard';
let SEARCH = '';
let SORT = {};
let SELECTED_PART_MS = null;   // selected part for milestone module
let SELECTED_PART_DIM = null;  // selected part for dimwork module
let SELECTED_AUDIT_SECTION = null;
let SELECTED_URUN_CAP = null;  // selected product for capacity module
let SELECTED_URUN_ROUTE = null; // selected product for routes module
let SELECTED_WO = null; // legacy (unused after MRP restructure, kept for safety)
let SELECTED_ORDER = null; // selected order id for Siparişler module
let EXPANDED_STEP = {}; // orderId -> expanded work order id, for İş Emirleri accordion
let SELECTED_KALITE_ORDER = null; // selected order for Kalite Kontrol module
let SELECTED_VARDIYA = '1';
let EXPANDED_KALITE_SIRA = {}; // orderId -> expanded sira, for Kalite Kontrol accordion
let GUNLUK_URUN = null, GUNLUK_OP = null, GUNLUK_TARIH = null, GUNLUK_TAB = 'ozet';
const GUNLUK_OPS = ['Cutting','Countersink','Marking','Pressing'];
const GUNLUK_OP_LABELS = {'Cutting':'Kesim','Countersink':'Havşalama','Marking':'Markalama','Pressing':'Presleme'};
const SAATLER = ['10:30','12:00','15:00','18:00'];

/* ---------------- oturum / kullanıcı ---------------- */
let SESSION_TOKEN = null;
let CURRENT_USER = null; // { role: 'editor'|'viewer', displayName }

function canEdit(){ return !!CURRENT_USER && CURRENT_USER.role === 'editor'; }

function loadSession(){
  try{
    const raw = localStorage.getItem('qfw_session');
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveSession(session){
  try{ localStorage.setItem('qfw_session', JSON.stringify(session)); }catch(e){}
}
function clearSession(){
  try{ localStorage.removeItem('qfw_session'); }catch(e){}
  SESSION_TOKEN = null;
  CURRENT_USER = null;
}

async function doLogin(username, password){
  try{
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    const body = await res.json().catch(()=>({}));
    if(!res.ok){ return {ok:false, error: body.error || ('HTTP '+res.status)}; }
    SESSION_TOKEN = body.token;
    CURRENT_USER = {role: body.role, displayName: body.displayName};
    saveSession({token: body.token, role: body.role, displayName: body.displayName});
    return {ok:true};
  }catch(e){
    const isNetworkError = e instanceof TypeError || /fetch|network/i.test(e.message);
    return {ok:false, error: isNetworkError
      ? `Sunucuya ulaşılamadı. LOGIN_URL adresini kontrol edin. (${e.message})`
      : e.message};
  }
}
async function doLogout(){
  try{ await fetch(LOGOUT_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: SESSION_TOKEN})}); }catch(e){}
  clearSession();
  showLoginScreen();
}

function showLoginScreen(errorMsg){
  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  let screen = document.getElementById('login-screen');
  if(!screen){
    screen = document.createElement('div');
    screen.id = 'login-screen';
    screen.className = 'login-screen';
    document.body.appendChild(screen);
  }
  screen.innerHTML = `
    <div class="login-card">
      <div class="brand-eyebrow">Tedarikçi Kalite Sistemi</div>
      <div class="brand-name" style="color:var(--ink);">Özmel Dış Ticaret</div>
      <div class="field" style="margin-top:22px;">
        <label>Kullanıcı Adı</label>
        <input id="login-username" autocomplete="username">
      </div>
      <div class="field">
        <label>Şifre</label>
        <input id="login-password" type="password" autocomplete="current-password">
      </div>
      ${errorMsg ? `<div style="color:var(--flag);font-size:12.5px;margin-bottom:10px;">${escapeHtml(errorMsg)}</div>` : ''}
      <button class="btn btn-primary" style="width:100%;justify-content:center;" id="login-submit-btn">Giriş Yap</button>
    </div>
  `;
  screen.style.display = 'flex';
  const submit = async ()=>{
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if(!u || !p) return;
    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
    const result = await doLogin(u, p);
    if(result.ok){
      screen.style.display = 'none';
      document.getElementById('loading').style.display = 'flex';
      boot();
    } else {
      showLoginScreen(result.error);
    }
  };
  document.getElementById('login-submit-btn').addEventListener('click', submit);
  ['login-username','login-password'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  });
  document.getElementById('login-username').focus();
}

/* ---------------- API helpers (kendi sunucunuz) ---------------- */
async function apiGet(attempt){
  attempt = attempt || 0;
  try{
    const res = await fetch(API_URL, {cache:'no-store', headers: {'X-Session-Token': SESSION_TOKEN || ''}});
    if(!res.ok){
      const body = await res.json().catch(()=>({}));
      if(body.code === 'NO_SESSION' || body.code === 'SESSION_EXPIRED'){
        clearSession();
        return {__authError: true};
      }
      throw new Error(body.error || ('Sunucu HTTP ' + res.status + ' döndürdü'));
    }
    const text = await res.text();
    return text==='null' ? null : JSON.parse(text);
  }catch(e){
    if(attempt < 2){
      await new Promise(r=>setTimeout(r, 500*(attempt+1)));
      return apiGet(attempt+1);
    }
    console.error('apiGet failed', e);
    const isNetworkError = e instanceof TypeError || /fetch|network|NetworkError/i.test(e.message);
    const msg = isNetworkError
      ? `Sunucuya hiç ulaşılamadı (ağ/CORS hatası). API_BASE adresinin doğru ve api.php'nin o adreste erişilebilir olduğundan emin olun. (${e.message})`
      : e.message;
    return {__error: msg};
  }
}
async function apiSet(payload, attempt){
  if(!canEdit()){ showToast('Görüntüleyici hesabıyla değişiklik kaydedilemez', true); return false; }
  attempt = attempt || 0;
  try{
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'X-Session-Token': SESSION_TOKEN || ''},
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const body = await res.json().catch(()=>({}));
      if(body.code === 'NO_SESSION' || body.code === 'SESSION_EXPIRED'){
        clearSession();
        showLoginScreen('Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.');
        return false;
      }
      throw new Error(body.error || ('HTTP '+res.status));
    }
    return true;
  }catch(e){
    if(attempt < 2){
      await new Promise(r=>setTimeout(r, 500*(attempt+1)));
      return apiSet(payload, attempt+1);
    }
    console.error('apiSet failed', e);
    showToast('Kaydetme hatası — sunucu bağlantısını kontrol edin: ' + e.message, true);
    return false;
  }
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function buildGunlukReferansVerisi(){
  DB.firstOffNoktalari = toRows(SEED.firstOffNoktalari).map(r => ({
    id: uid(), urun: String(r['Urun']||''), operasyon: r['Operasyon']||'', no: r['No'],
    karakteristik: r['KontrolMaddesi']||'', tip: r['Tip']||'nitel',
    nominal: r['Nominal']===''?null:parseFloat(r['Nominal']),
    altLimit: r['AltLimit']===''?null:parseFloat(r['AltLimit']),
    ustLimit: r['UstLimit']===''?null:parseFloat(r['UstLimit']), birim: r['Birim']||''
  }));
  DB.saatlikNoktalari = toRows(SEED.saatlikNoktalari).map(r => ({
    id: uid(), urun: String(r['Urun']||''), operasyon: r['Operasyon']||'', olcumYeri: r['OlcumYeri']||'',
    tip: r['Tip']||'nitel', nominal: r['Nominal']===''?null:parseFloat(r['Nominal']),
    altLimit: r['AltLimit']===''?null:parseFloat(r['AltLimit']),
    ustLimit: r['UstLimit']===''?null:parseFloat(r['UstLimit']), birim: r['Birim']||''
  }));
}

function toRows(tbl){
  // convert {h:[...], r:[[...]]} into array of objects keyed by header name
  return tbl.r.map(row => {
    const o = {};
    tbl.h.forEach((h,i)=> o[h] = row[i]);
    return o;
  });
}

/* ---------------- boot / seed ---------------- */
async function boot(){
  const existing = await apiGet();

  if(existing && existing.__authError){
    showLoginScreen();
    return;
  }

  if(existing && existing.__error){
    document.getElementById('loading').innerHTML = `
      <div class="lg-title">Bağlantı Hatası</div>
      <div style="max-width:420px;text-align:center;line-height:1.6;">
        Sunucuya bağlanılamadı: <b>${escapeHtml(existing.__error)}</b><br><br>
        Lütfen <span class="mono">index.html</span> dosyasının başındaki <span class="mono">&lt;script&gt;</span> içinde
        yer alan <span class="mono">API_BASE</span> değerini, ve sunucudaki
        <span class="mono">config.php</span> dosyasını kontrol edin.
      </div>`;
    return;
  }

  if(existing){
    Object.assign(DB, existing);
    // Bu modülden önce yayınlanmış kurulumlarda kontrol planı olmayabilir — referans
    // veri statik olduğu için sorunsuzca sonradan doldurulabilir.
    if(!DB.kontrolPlani || DB.kontrolPlani.length===0){
      DB.kontrolPlani = toRows(SEED.kontrolPlani).map(r => ({
        id: uid(), urun: String(r['Urun']||''), sira: String(r['Sira']||''), operasyon: r['Operasyon']||'',
        isMerkezi: r['IsMerkezi']||'', karakteristik: r['Karakteristik']||'', spesifikasyonRaw: r['SpesifikasyonRaw']||'',
        tip: r['Tip']||'nitel', altLimit: r['AltLimit']===''?null:parseFloat(r['AltLimit']),
        ustLimit: r['UstLimit']===''?null:parseFloat(r['UstLimit']), nominal: r['Nominal']===''?null:parseFloat(r['Nominal']),
        birim: r['Birim']||'', olcumYontemi: r['OlcumYontemi']||'', numuneAdedi: r['NumuneAdedi']||'',
        kontrolSikligi: r['KontrolSikligi']||'', kayitForm: r['KayitForm']||'', aksiyon: r['Aksiyon']||''
      }));
      if(!DB.kaliteOlcumleri) DB.kaliteOlcumleri = [];
      await saveAll();
    }
    if(!DB.firstOffNoktalari || DB.firstOffNoktalari.length===0){
      buildGunlukReferansVerisi();
      if(!DB.firstOffKayitlari) DB.firstOffKayitlari = [];
      if(!DB.saatlikKayitlari) DB.saatlikKayitlari = [];
      await saveAll();
    }
  } else {
    // Veritabanı boş -- Access dosyalarından gelen ilk (seed) veriyle dolduruyoruz.
    DB.sites = toRows(SEED.sites).map(r => ({
      id: uid(), supplier: r['VFe35 PartsAward Supplier']||'', trigoRE: r['Trigo RE']||'',
      sqe: r['Vinfast SQE']||'', sqeEmail: r['EmailsEmail']||'', sqm: r['Vinfast SQM']||'',
      sqmEmail: r['SQM EmailsEmail']||'', country: r['Country']||'', city: r['City']||'', siteCode: r['Site Code']||''
    }));
    DB.parts = toRows(SEED.parts).map(r => ({
      id: uid(), partNumber: r['VF Part Number']||'', partName: r['Part Name English']||'',
      supplier: r['VFe35 PartsAward Supplier']||'', trigoRE: r['Trigo RE']||'', partType:'', subType:''
    }));
    DB.milestones = toRows(SEED.updates).map(r => ({
      id: uid(), part: r['Part']||'', seq: parseFloat(r['Seq'])||0, description: r['Description']||'',
      comp: r['Comp']||'', sdatePlan: r['Sdate Plan']||'', sdateAct: r['Sdate Act']||'',
      cdatePlan: r['Cdate Plan']||'', cdateAct: r['Cdate Act']||'', notes: r['Notes']||''
    }));
    DB.audits = toRows(SEED.audit).map(r => ({
      id: uid(), form: r['Form']||'TQS', section: r['Section']||'', question: r['Question']||'',
      score: r['Score']===''? null : parseFloat(r['Score']), evidence: r['Evidence']||''
    }));
    DB.dimwork = toRows(SEED.dimwork).map(r => ({
      id: uid(), partNumber: r['Part Number']||'', inspectionPoint: r['Inspection_Point']||'', drawing: r['Drawing']||'',
      charId: r['Char_ID']||'', characteristic: r['Characteristic']||'', nominal: parseFloat(r['Nominal']),
      upper: parseFloat(r['Upper Limit']), lower: parseFloat(r['Lower Limit']), serial: r['Serial Number']||'',
      value: r['Dimension Value']===''? null : parseFloat(r['Dimension Value'])
    }));
    DB.qfw = [];
    DB.routes = toRows(SEED.routes).map(r => ({
      id: uid(), urun: String(r['Urun']||''), urunAdi: r['UrunAdi']||'', operasyon: r['Operasyon']||'',
      isMerkezi: r['IsMerkezi']||'', sira: parseFloat(r['Sira'])||0, aktif: false
    }));
    DB.capacity = toRows(SEED.capacity).map(r => ({
      id: uid(), urun: String(r['Urun']||''), isMerkezi: r['IsMerkezi']||'', kapasite: parseFloat(r['Kapasite'])||0
    }));
    const groups = {};
    DB.routes.forEach(r => { const k = r.urun+'|'+r.sira; (groups[k]=groups[k]||[]).push(r); });
    Object.values(groups).forEach(group => {
      const withCap = group.find(r => DB.capacity.some(c => c.urun===r.urun && c.isMerkezi===r.isMerkezi));
      (withCap || group[0]).aktif = true;
    });
    DB.workorders = [];
    DB.production = [];
    DB.orders = [];
    DB.kontrolPlani = toRows(SEED.kontrolPlani).map(r => ({
      id: uid(), urun: String(r['Urun']||''), sira: String(r['Sira']||''), operasyon: r['Operasyon']||'',
      isMerkezi: r['IsMerkezi']||'', karakteristik: r['Karakteristik']||'', spesifikasyonRaw: r['SpesifikasyonRaw']||'',
      tip: r['Tip']||'nitel', altLimit: r['AltLimit']===''?null:parseFloat(r['AltLimit']),
      ustLimit: r['UstLimit']===''?null:parseFloat(r['UstLimit']), nominal: r['Nominal']===''?null:parseFloat(r['Nominal']),
      birim: r['Birim']||'', olcumYontemi: r['OlcumYontemi']||'', numuneAdedi: r['NumuneAdedi']||'',
      kontrolSikligi: r['KontrolSikligi']||'', kayitForm: r['KayitForm']||'', aksiyon: r['Aksiyon']||''
    }));
    DB.kaliteOlcumleri = [];
    buildGunlukReferansVerisi();
    DB.firstOffKayitlari = [];
    DB.saatlikKayitlari = [];
    await saveAll();
  }

  // Bilinen bir veri hatasını düzelt: 221170/171/172 Kesim Boyu toleransları yanlış girilmişti.
  if(DB.saatlikNoktalari && DB.saatlikNoktalari.length && fixKesimBoyuDegerleri()){
    await saveAll();
  }
  // Bilinen bir veri hatasını düzelt: 221172 Markalama Boyu ve 221173 Palm Uzunluğu First Off toleransları yanlıştı.
  if(DB.firstOffNoktalari && DB.firstOffNoktalari.length && fixFirstOffToleranslari()){
    await saveAll();
  }

  await ensureOrderNumbers();
  if(ensureUrunAgaclari()) await saveAll();
  if(ensureGorevSeed()) await saveAll();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  render();
}

async function saveAll(){
  return apiSet(DB);
}

/* ---------------- backup / restore (independent of Claude's storage) ---------------- */
function exportBackup(){
  try{
    const payload = { exportedAt: new Date().toISOString(), app: 'Özmel Dış Ticaret', version: 2, data: DB };
    const json = JSON.stringify(payload, null, 2);
    const filename = `qfw_konsol_yedek_${toLocalISODate(new Date())}.json`;
    const a = document.createElement('a');
    if(window.URL && typeof URL.createObjectURL === 'function'){
      const blob = new Blob([json], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // fallback for environments without Blob URL support
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    showToast('Yedek indirildi — bilgisayarınıza kaydedildi');
  }catch(e){
    console.error('export failed', e);
    showToast('Yedek indirilemedi', true);
  }
}

async function handleImportFile(input){
  const file = input.files[0];
  if(!file) return;
  if(!confirm('Bu işlem mevcut TÜM veriyi seçtiğiniz yedek dosyasındaki veriyle değiştirecek. Emin misiniz?')){ input.value=''; return; }
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = parsed.data || parsed; // accept both wrapped export format and a raw DB object
    const coreRequired = ['sites','parts','milestones','audits','dimwork','qfw','routes','capacity','workorders','production','orders'];
    const optional = ['kontrolPlani','kaliteOlcumleri','firstOffNoktalari','saatlikNoktalari','firstOffKayitlari','saatlikKayitlari','makinePlani','satinalmaIstekleri','satinalmaGirisleri','urunAgaclari','gorevler','gorevKisiler','girisKaliteKontrolleri']; // eklenmesi daha sonraki tablolar — eski yedeklerde olmayabilir
    const missing = coreRequired.filter(k=>!Array.isArray(incoming[k]));
    if(missing.length){ showToast('Geçersiz yedek dosyası — eksik: ' + missing.join(', '), true); input.value=''; return; }
    coreRequired.forEach(k=>{ DB[k] = incoming[k]; });
    optional.forEach(k=>{ DB[k] = Array.isArray(incoming[k]) ? incoming[k] : (DB[k]||[]); });
    const ok = await saveAll();
    if(ok){ showToast('Yedek geri yüklendi'); render(); }
    input.value='';
  }catch(e){
    console.error('import failed', e);
    showToast('Dosya okunamadı — geçerli bir yedek JSON dosyası seçin', true);
    input.value='';
  }
}
async function persist(_tableKey){
  return saveAll();
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function showToast(msg, isError){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isError ? 'var(--flag)' : 'var(--deep)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2600);
}

/* ---------------- date helpers ---------------- */
function parseDate(s){
  if(!s) return null;
  // formats like "03/16/22 00:00:00" (MM/DD/YY)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  let [,mo,da,yr] = m;
  yr = yr.length===2 ? (parseInt(yr,10)>50? '19'+yr : '20'+yr) : yr;
  return new Date(parseInt(yr,10), parseInt(mo,10)-1, parseInt(da,10));
}
function fmtDate(s){
  const d = parseDate(s);
  if(!d) return '—';
  return d.toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'});
}
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
// toISOString() UTC'ye çevirir — Türkiye gibi pozitif saat dilimlerinde yerel gece
// yarısı bir önceki günün UTC akşamına denk gelir ve tarih bir gün geriye kayar.
// Tüm "bugünün tarihi" / hafta hesaplamaları bu fonksiyonla, YEREL tarihe göre yapılmalı.
function toLocalISODate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const g = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${g}`;
}
// "YYYY-MM-DD" metnini new Date(string) gibi UTC değil, YEREL gün olarak ayrıştırır —
// negatif saat dilimlerinde bile tarih kaymasın diye.
function parseLocalDate(str){
  if(!str) return null;
  const [y,m,g] = str.split('-').map(Number);
  if(!y||!m||!g) return null;
  const d = new Date(y, m-1, g); d.setHours(0,0,0,0);
  return d;
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Wraps row-level action buttons; renders empty (but keeps the <td>) for viewer accounts.
function actionsCell(buttonsHtml){
  return `<td>${canEdit() ? `<div class="row-actions">${buttonsHtml}</div>` : ''}</td>`;
}

/* ---------------- nav config ---------------- */
const NAV = [
  {group:'Genel'},
  {id:'dashboard', label:'Genel Bakış', ico:'::'},
  {group:'Tedarik Zinciri'},
  {id:'sites', label:'Tedarikçi & Site', ico:'[S]'},
  {id:'parts', label:'Parça Yönetimi', ico:'[P]'},
  {group:'Süreç Takibi'},
  {id:'gorevler', label:'Görev Takibi', ico:'[GT]'},
  {id:'kalite', label:'Kalite Kontrol', ico:'[Q]'},
  {id:'gunluk', label:'Günlük Kalite Raporları', ico:'[G]'},
  {group:'Satış'},
  {id:'satisSiparisleri', label:'Satış Siparişleri', ico:'[Ş]'},
  {id:'satisRaporlari', label:'Satış Raporları', ico:'[R]'},
  {group:'Üretim Planlama'},
  {id:'routes', label:'Rotalar', ico:'[R]'},
  {id:'capacity', label:'Kapasite Yönetimi', ico:'[K]'},
  {id:'uretimplani', label:'Üretim Planı (Haftalık)', ico:'[H]'},
  {id:'orders', label:'Üretim Siparişleri', ico:'[Ü]'},
  {id:'workorders', label:'İş Emirleri', ico:'[İ]'},
  {id:'uretimgirisi', label:'Üretim Girişi', ico:'[G]'},
  {group:'Ürün Yönetimi'},
  {id:'urunagaclari', label:'Ürün Ağaçları', ico:'[UA]'},
  {group:'Satınalma & Stok'},
  {id:'satinalma', label:'Satınalma İstekleri', ico:'[SA]'},
  {id:'satinalmaGirisleri', label:'Satınalma Girişleri', ico:'[SG]'},
  {id:'stok', label:'Stok Durumu', ico:'[ST]'},
];

let NAV_ACIK_GRUPLAR = null;
function navGrupAcikMi(grup){
  if(NAV_ACIK_GRUPLAR===null){
    try{
      const kayitli = JSON.parse(localStorage.getItem('navAcikGruplar'));
      NAV_ACIK_GRUPLAR = kayitli ? new Set(kayitli) : new Set(NAV.filter(n=>n.group).map(n=>n.group));
    }catch(e){ NAV_ACIK_GRUPLAR = new Set(NAV.filter(n=>n.group).map(n=>n.group)); }
  }
  return NAV_ACIK_GRUPLAR.has(grup);
}
function toggleNavGrup(grup){
  navGrupAcikMi(grup);
  if(NAV_ACIK_GRUPLAR.has(grup)) NAV_ACIK_GRUPLAR.delete(grup);
  else NAV_ACIK_GRUPLAR.add(grup);
  try{ localStorage.setItem('navAcikGruplar', JSON.stringify([...NAV_ACIK_GRUPLAR])); }catch(e){}
  render();
}
function go(route){
  ROUTE = route; SEARCH=''; SORT={};
  render();
}

/* ---------------- root render ---------------- */
function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-eyebrow">Tedarikçi Kalite Sistemi</div>
        <div class="brand-name">Özmel Dış Ticaret</div>
        <div class="brand-sub">VinFast Tedarik Zinciri Konsolu</div>
      </div>
      <nav class="nav">
        ${(()=>{
          let cur = null;
          return NAV.map(n => {
            if(n.group){ cur = n.group; return `<div class="nav-section-label" style="cursor:pointer;display:flex;align-items:center;gap:4px;" onclick="toggleNavGrup('${n.group}')"><span style="font-size:8px;">${navGrupAcikMi(n.group)?'▼':'▶'}</span>${n.group}</div>`; }
            if(!navGrupAcikMi(cur)) return '';
            return `<div class="nav-item ${ROUTE===n.id?'active':''}" onclick="go('${n.id}')"><span class="ico">${n.ico}</span><span>${n.label}</span></div>`;
          }).join('');
        })()}
      </nav>
      <div class="sidebar-foot">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="font-size:12px;">
            <div style="color:#fff;font-weight:600;">${escapeHtml(CURRENT_USER?.displayName||'')}</div>
            <div style="color:#8098A8;">${CURRENT_USER?.role==='editor' ? 'Düzenleyici' : 'Görüntüleyici'}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:#C6D6DE; border-color:rgba(255,255,255,0.18);" onclick="doLogout()">Çıkış</button>
        </div>
        <div style="margin-bottom:10px;"><span class="sync-dot"></span>Paylaşımlı veri — ekip senkron</div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" style="flex:1; color:#C6D6DE; border-color:rgba(255,255,255,0.18);" onclick="exportBackup()">⬇ Yedek İndir</button>
          ${canEdit() ? `<button class="btn btn-ghost btn-sm" style="flex:1; color:#C6D6DE; border-color:rgba(255,255,255,0.18);" onclick="document.getElementById('import-file-input').click()">⬆ Geri Yükle</button>` : ''}
        </div>
        <input type="file" id="import-file-input" accept="application/json" style="display:none" onchange="handleImportFile(this)">
      </div>
    </div>
    <div class="main">
      <div id="topbar-slot"></div>
      <div class="content" id="content-slot"></div>
    </div>
  `;
  renderModule();
}

function renderModule(){
  const slotTop = document.getElementById('topbar-slot');
  const slotContent = document.getElementById('content-slot');
  switch(ROUTE){
    case 'dashboard': slotTop.innerHTML = topbar('Genel Bakış', null, null); slotContent.innerHTML = viewDashboard(); afterDashboard(); break;
    case 'sites': slotTop.innerHTML = topbar('Tedarikçi & Site Yönetimi', DB.sites.length, 'Yeni Site', 'openSiteModal()'); slotContent.innerHTML = viewSites(); break;
    case 'parts': slotTop.innerHTML = topbar('Parça Yönetimi', DB.parts.length, 'Yeni Parça', 'openPartModal()'); slotContent.innerHTML = viewParts(); break;
    case 'gorevler': slotTop.innerHTML = topbar('Görev Takibi', DB.gorevler.length, null, null); slotContent.innerHTML = viewGorevTakibi(); break;
    case 'routes': slotTop.innerHTML = topbar('Ürün Rotaları', DB.routes.length, 'Yeni Rota Adımı', 'openRouteModal()'); slotContent.innerHTML = viewRoutes(); break;
    case 'capacity': slotTop.innerHTML = topbar('Kapasite Yönetimi', DB.capacity.length, null, null); slotContent.innerHTML = viewCapacity(); break;
    case 'uretimplani': slotTop.innerHTML = topbar('Üretim Planı (Haftalık Makine Planlama)', null, null, null); slotContent.innerHTML = viewUretimPlani(); break;
    case 'orders': slotTop.innerHTML = topbar('Üretim Siparişleri', DB.orders.length, 'Yeni Üretim Siparişi', 'openOrderModal()'); slotContent.innerHTML = viewOrders(); break;
    case 'satisSiparisleri': slotTop.innerHTML = topbar('Satış Siparişleri', DB.orders.filter(o=>o.kaynak==='satis').length, 'Yeni Satış Siparişi', 'openSatisSiparisiModal()'); slotContent.innerHTML = viewSatisSiparisleri(); break;
    case 'satisRaporlari': slotTop.innerHTML = topbar('Satış Raporları', DB.orders.filter(o=>o.kaynak==='satis').length, null, null); slotContent.innerHTML = viewSatisRaporlari(); break;
    case 'workorders': slotTop.innerHTML = topbar('İş Emirleri', DB.workorders.length, null, null); slotContent.innerHTML = viewWorkOrders(); break;
    case 'uretimgirisi': slotTop.innerHTML = topbar('Üretim Girişi', DB.workorders.filter(w=>w.durum==='Aktif').length, null, null); slotContent.innerHTML = viewUretimGirisi(); break;
    case 'urunagaclari': slotTop.innerHTML = topbar('Ürün Ağaçları', DB.urunAgaclari.length, null, null); slotContent.innerHTML = viewUrunAgaclari(); break;
    case 'satinalma': slotTop.innerHTML = topbar('Satınalma İstekleri', DB.satinalmaIstekleri.length, 'Yeni İstek', 'openSatinalmaModal()'); slotContent.innerHTML = viewSatinalma(); break;
    case 'satinalmaGirisleri': slotTop.innerHTML = topbar('Satınalma Girişleri', DB.satinalmaGirisleri.length, 'Yeni Giriş', 'openSatinalmaGirisModal()'); slotContent.innerHTML = viewSatinalmaGirisleri(); break;
    case 'stok': slotTop.innerHTML = topbar('Stok Durumu', null, null, null); slotContent.innerHTML = viewStok(); break;
    case 'kalite': slotTop.innerHTML = topbar('Kalite Kontrol', DB.kaliteOlcumleri.length, null, null); slotContent.innerHTML = viewKalite(); break;
    case 'gunluk': slotTop.innerHTML = topbar('Günlük Kalite Raporları', null, null, null); slotContent.innerHTML = viewGunlukKalite(); break;
  }
}

function topbar(title, count, btnLabel, btnAction, extraHtml){
  return `
    <div class="topbar">
      <div class="topbar-title-row">
        <button class="btn btn-ghost menu-toggle btn-sm" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
        <h1>${title}</h1>
        ${count!==null ? `<span class="count-chip">${count} kayıt</span>` : ''}
      </div>
      <div class="topbar-actions">
        ${ROUTE!=='dashboard' ? `
          <div class="search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Ara…" oninput="onSearch(this.value)" value="${escapeHtml(SEARCH)}">
          </div>` : ''}
        ${canEdit() ? (extraHtml||'') : ''}
        ${(btnLabel && canEdit()) ? `<button class="btn btn-primary" onclick="${btnAction}">+ ${btnLabel}</button>` : ''}
      </div>
    </div>
  `;
}

function onSearch(v){ SEARCH = v; renderModule(); }

function sortIcon(col){ return SORT.col===col ? (SORT.dir===1?' ▲':' ▼') : ''; }
function toggleSort(col){
  if(SORT.col===col) SORT.dir = -(SORT.dir||1); else { SORT.col=col; SORT.dir=1; }
  renderModule();
}
function sortRows(rows, defaultCol){
  const col = SORT.col || defaultCol;
  const dir = SORT.dir || 1;
  if(!col) return rows;
  return [...rows].sort((a,b)=>{
    let av=a[col], bv=b[col];
    if(typeof av === 'number' || typeof bv === 'number'){ av = av||0; bv = bv||0; return (av-bv)*dir; }
    av = String(av??'').toLowerCase(); bv = String(bv??'').toLowerCase();
    return av.localeCompare(bv)*dir;
  });
}
function matchSearch(obj, fields){
  if(!SEARCH) return true;
  const q = SEARCH.toLowerCase();
  return fields.some(f => String(obj[f]??'').toLowerCase().includes(q));
}

/* =======================================================================
   GENEL SIRALANABİLİR TABLO — başlığa tıklayınca sıralama.
   Kullanım: <th onclick="sirala('tabloId','alanAdi')">Başlık${siraIsareti('tabloId','alanAdi')}</th>
   ve listeyi render etmeden önce: list = sirali('tabloId', list, varsayilanAlan, varsayilanYon);
   ======================================================================= */
let TABLO_SIRALAMA = {};
function sirala(tabloId, alan){
  const mevcut = TABLO_SIRALAMA[tabloId];
  if(mevcut && mevcut.alan===alan){ mevcut.yon = mevcut.yon==='asc' ? 'desc' : 'asc'; }
  else { TABLO_SIRALAMA[tabloId] = {alan, yon:'asc'}; }
  renderModule();
}
function siraIsareti(tabloId, alan){
  const s = TABLO_SIRALAMA[tabloId];
  if(!s || s.alan!==alan) return '<span style="opacity:.25;font-size:9px;"> ▲▼</span>';
  return s.yon==='asc' ? '<span style="font-size:9px;"> ▲</span>' : '<span style="font-size:9px;"> ▼</span>';
}
function sortableTh(tabloId, alan, etiket){
  return `<th onclick="sirala('${tabloId}','${alan}')" style="cursor:pointer;user-select:none;white-space:nowrap;">${etiket}${siraIsareti(tabloId, alan)}</th>`;
}
function sirali(tabloId, liste, varsayilanAlan, varsayilanYon){
  const s = TABLO_SIRALAMA[tabloId] || (varsayilanAlan ? {alan:varsayilanAlan, yon:varsayilanYon||'asc'} : null);
  if(!s) return liste;
  const yon = s.yon==='asc' ? 1 : -1;
  return [...liste].sort((a,b)=>{
    let va = a[s.alan], vb = b[s.alan];
    // tarih benzeri alanları karşılaştırılabilir hale getir
    const da = parseDate(va), db = parseDate(vb);
    if(da && db){ return (da-db)*yon; }
    if(typeof va==='number' && typeof vb==='number') return (va-vb)*yon;
    va = String(va??''); vb = String(vb??'');
    return va.localeCompare(vb, 'tr', {sensitivity:'base'}) * yon;
  });
}

/* =======================================================================
   DASHBOARD
   ======================================================================= */
function viewDashboard(){
  const totalSites = DB.sites.length;
  const totalParts = DB.parts.length;
  const openMs = DB.gorevler.filter(g => g.durum !== 'Tamamlandı').length;
  const overdue = DB.gorevler.filter(g => gorevGecikmisMi(g));
  const doneMs = DB.gorevler.filter(g => g.durum === 'Tamamlandı').length;
  const onTimePct = DB.gorevler.length ? Math.round(doneMs/DB.gorevler.length*100) : 0;

  const scored = DB.audits.filter(a => a.score !== null && a.score !== undefined && !isNaN(a.score));
  const avgAudit = scored.length ? (scored.reduce((s,a)=>s+a.score,0)/scored.length) : 0;

  const measured = DB.dimwork.filter(d => d.value !== null && !isNaN(d.value));
  const outOfTol = measured.filter(d => d.value < d.lower || d.value > d.upper).length;

  const qfwTotal = DB.qfw.length;
  const qfwRejects = DB.qfw.reduce((s,q)=> s + (q.rejections||[]).reduce((s2,r)=>s2+(parseFloat(r.qty)||0),0), 0);

  // country distribution
  const byCountry = {};
  DB.sites.forEach(s => { const c = s.country||'Belirtilmemiş'; byCountry[c] = (byCountry[c]||0)+1; });
  const countryEntries = Object.entries(byCountry).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxCountry = Math.max(1, ...countryEntries.map(e=>e[1]));

  // capacity / bottleneck summary
  const capWarnings = computeDataWarnings();
  const capProducts = [...new Set(DB.routes.map(r=>r.urun))];
  const bottlenecks = capProducts.map(p => ({urun:p, urunAdi: DB.routes.find(r=>r.urun===p)?.urunAdi||'', ...productBottleneck(p)}))
    .filter(b=>b.bottleneck)
    .sort((a,b)=>a.bottleneck.kapasite - b.bottleneck.kapasite);
  const maxCap = Math.max(1, ...bottlenecks.map(b=>b.bottleneck.kapasite));

  // MRP summary (orders schema)
  const activeOrders = DB.orders.filter(o=>o.durum==='Aktif');
  const riskyOrders = activeOrders.map(o=>({order:o, stats: orderStats(o)})).filter(x=>x.stats.behindSchedule || x.stats.feasible===false);
  const todayProduced = DB.production.filter(p=>{ const d=parseDate(p.tarih); return d && d.getTime()===TODAY.getTime(); }).reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);

  return `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Toplam Tedarikçi / Site</div>
        <div class="kpi-value">${totalSites}</div>
        <div class="kpi-foot">${new Set(DB.sites.map(s=>s.country)).size} ülke</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Toplam Parça</div>
        <div class="kpi-value">${totalParts}</div>
        <div class="kpi-foot">${new Set(DB.parts.map(p=>p.supplier)).size} tedarikçiye dağılmış</div>
      </div>
      <div class="kpi-card ${overdue.length? 'flag':'good'}">
        <div class="kpi-label">Geciken Görev</div>
        <div class="kpi-value">${overdue.length}</div>
        <div class="kpi-foot">${openMs} açık görevden</div>
      </div>
      <div class="kpi-card good">
        <div class="kpi-label">Görev Tamamlanma</div>
        <div class="kpi-value">%${onTimePct}</div>
        <div class="kpi-foot">${doneMs} / ${DB.gorevler.length} görev</div>
      </div>
      <div class="kpi-card ${capWarnings.length? 'warn':'good'}">
        <div class="kpi-label">Kapasite Veri Uyarısı</div>
        <div class="kpi-value">${capWarnings.length}</div>
        <div class="kpi-foot">${capProducts.length} ürün rotası tanımlı</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1.3fr 1fr; gap:16px;">
      <div class="panel">
        <div class="panel-head"><h3>Geciken Görevler</h3><span class="badge badge-flag">${overdue.length}</span></div>
        <div class="panel-body">
          ${overdue.length===0 ? `<div class="empty-state"><div class="eb-glyph">✓</div><h4>Gecikme yok</h4><p>Tüm açık görevler termin içinde.</p></div>` : `
          <div class="table-wrap"><table>
            <thead><tr><th>Görev</th><th>Sorumlu</th><th>Termin</th><th>Gecikme</th></tr></thead>
            <tbody>
              ${overdue.slice(0,8).map(g=>{
                const days = -gorevKalanGun(g.termin);
                return `<tr>
                  <td>${escapeHtml(g.gorevTanimi)}</td>
                  <td class="mono">${escapeHtml(g.anaSorumlu||'')}</td>
                  <td>${fmtDate(g.termin)}</td>
                  <td><span class="badge badge-flag">${days} gün</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
          ${overdue.length>8 ? `<div class="field-hint" style="margin-top:8px;">+${overdue.length-8} görev daha — Görev Takibi modülünde görüntüleyin.</div>`:''}
          `}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Tedarikçi Dağılımı — Ülke</h3></div>
        <div class="panel-body">
          ${countryEntries.map(([c,n])=>`
            <div class="bar-row">
              <div class="bar-label" title="${escapeHtml(c)}">${escapeHtml(c)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${n/maxCountry*100}%"></div></div>
              <div class="bar-val">${n}</div>
            </div>
          `).join('') || '<div class="field-hint">Veri yok.</div>'}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Ürün Bazlı Günlük Hedef Kapasite (Darboğaz)</h3><span class="field-hint">En kısıtlı 8 ürün</span></div>
      <div class="panel-body">
        ${bottlenecks.length===0 ? `<div class="field-hint">Kapasite Yönetimi modülünden veri girildikçe burada görünecek.</div>` : bottlenecks.slice(0,8).map(b=>`
          <div class="bar-row">
            <div class="bar-label mono" title="${escapeHtml(b.urun)} — ${escapeHtml(b.urunAdi)}">${escapeHtml(b.urun)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${b.bottleneck.kapasite/maxCap*100}%; background:${b.bottleneck.kapasite/maxCap<0.15?'var(--flag)':'var(--accent)'};"></div></div>
            <div class="bar-val">${b.bottleneck.kapasite}</div>
          </div>
        `).join('')}
        ${bottlenecks.length ? `<div class="field-hint" style="margin-top:8px;">Darboğaz istasyonundaki kapasiteyi <b>Kapasite Yönetimi</b> modülünden değiştirdiğinizde bu sıralama anında güncellenir.</div>` : ''}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Üretim Takibi (MRP) Özeti</h3><span class="badge ${riskyOrders.length?'badge-flag':'badge-good'}">${riskyOrders.length} riskli</span></div>
      <div class="panel-body">
        <div class="kpi-grid" style="grid-template-columns:1fr 1fr; margin-bottom:12px;">
          <div><div class="kpi-label">Aktif Sipariş</div><div class="kpi-value" style="font-size:24px;">${activeOrders.length}</div></div>
          <div><div class="kpi-label">Bugünkü Üretim</div><div class="kpi-value" style="font-size:24px;">${todayProduced}</div></div>
        </div>
        ${riskyOrders.length ? riskyOrders.slice(0,4).map(({order,stats})=>`
          <div class="bar-row">
            <div class="bar-label mono">${escapeHtml(order.urun)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${stats.pct}%; background:var(--flag);"></div></div>
            <div class="bar-val">%${stats.pct.toFixed(0)}</div>
          </div>
        `).join('') : `<div class="field-hint">${DB.orders.length? 'Tüm aktif siparişler zamanında.' : 'Henüz sipariş açılmadı.'}</div>`}
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr; gap:16px; margin-top:0;">
      <div class="panel">
        <div class="panel-head"><h3>Modüllere Git</h3></div>
        <div class="panel-body" style="display:flex; flex-direction:column; gap:6px;">
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('sites')">→ Tedarikçi &amp; Site Yönetimi</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('parts')">→ Parça Yönetimi</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('gorevler')">→ Görev Takibi</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('routes')">→ Rotalar</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('capacity')">→ Kapasite Yönetimi</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('satisSiparisleri')">→ Satış Siparişleri</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('orders')">→ Üretim Siparişleri</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('workorders')">→ İş Emirleri</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('uretimgirisi')">→ Üretim Girişi</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('satinalma')">→ Satınalma İstekleri</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('stok')">→ Stok Durumu</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('kalite')">→ Kalite Kontrol</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="go('gunluk')">→ Günlük Kalite Raporları</button>
        </div>
      </div>
    </div>
  `;
}
function afterDashboard(){ /* reserved for future canvas-based charts */ }

/* =======================================================================
   SITES module
   ======================================================================= */
function viewSites(){
  let rows = DB.sites.filter(s => matchSearch(s, ['supplier','trigoRE','sqe','sqm','country','city','siteCode']));
  rows = sortRows(rows, 'supplier');
  if(DB.sites.length===0) return emptyState('Henüz tedarikçi/site kaydı yok', 'Yeni site ekleyerek başlayın.', 'openSiteModal()', 'Yeni Site Ekle');
  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>
        <th onclick="toggleSort('supplier')">Tedarikçi${sortIcon('supplier')}</th>
        <th onclick="toggleSort('trigoRE')">Trigo RE${sortIcon('trigoRE')}</th>
        <th onclick="toggleSort('sqe')">VinFast SQE${sortIcon('sqe')}</th>
        <th onclick="toggleSort('sqm')">VinFast SQM${sortIcon('sqm')}</th>
        <th onclick="toggleSort('country')">Ülke${sortIcon('country')}</th>
        <th onclick="toggleSort('city')">Şehir${sortIcon('city')}</th>
        <th onclick="toggleSort('siteCode')">Site Kodu${sortIcon('siteCode')}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${rows.map(s=>`
          <tr>
            <td><b>${escapeHtml(s.supplier)}</b></td>
            <td>${escapeHtml(s.trigoRE)}</td>
            <td>${escapeHtml(s.sqe)}<div class="field-hint">${escapeHtml(s.sqeEmail)}</div></td>
            <td>${escapeHtml(s.sqm)}<div class="field-hint">${escapeHtml(s.sqmEmail)}</div></td>
            <td>${escapeHtml(s.country)}</td>
            <td>${escapeHtml(s.city)}</td>
            <td class="mono">${escapeHtml(s.siteCode)}</td>
            ${actionsCell(`
              <button class="btn btn-sm btn-ghost" onclick="openSiteModal('${s.id}')">Düzenle</button>
              <button class="btn btn-sm btn-danger" onclick="deleteRow('sites','${s.id}','Site')">Sil</button>
            `)}
          </tr>
        `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--ink-faint);padding:30px;">Arama sonucu bulunamadı.</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function openSiteModal(id){
  const rec = id ? DB.sites.find(x=>x.id===id) : {supplier:'',trigoRE:'',sqe:'',sqeEmail:'',sqm:'',sqmEmail:'',country:'',city:'',siteCode:''};
  const trigoOptions = [...new Set(DB.sites.map(s=>s.trigoRE).filter(Boolean))];
  openModal(`${id?'Site Düzenle':'Yeni Site'}`, `
    <div class="field"><label>Tedarikçi Adı</label><input id="f-supplier" value="${escapeHtml(rec.supplier)}" placeholder="Örn. Bosch Automotive Products"></div>
    <div class="field-row">
      <div class="field"><label>Trigo RE (Saha Sorumlusu)</label><input id="f-trigoRE" list="trigo-list" value="${escapeHtml(rec.trigoRE)}"></div>
      <div class="field"><label>Site Kodu</label><input id="f-siteCode" value="${escapeHtml(rec.siteCode)}"></div>
    </div>
    <datalist id="trigo-list">${trigoOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>VinFast SQE</label><input id="f-sqe" value="${escapeHtml(rec.sqe)}"></div>
      <div class="field"><label>SQE E-posta</label><input id="f-sqeEmail" value="${escapeHtml(rec.sqeEmail)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>VinFast SQM</label><input id="f-sqm" value="${escapeHtml(rec.sqm)}"></div>
      <div class="field"><label>SQM E-posta</label><input id="f-sqmEmail" value="${escapeHtml(rec.sqmEmail)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Ülke</label><input id="f-country" value="${escapeHtml(rec.country)}"></div>
      <div class="field"><label>Şehir</label><input id="f-city" value="${escapeHtml(rec.city)}"></div>
    </div>
  `, async ()=>{
    const data = {
      supplier: val('f-supplier'), trigoRE: val('f-trigoRE'), sqe: val('f-sqe'), sqeEmail: val('f-sqeEmail'),
      sqm: val('f-sqm'), sqmEmail: val('f-sqmEmail'), country: val('f-country'), city: val('f-city'), siteCode: val('f-siteCode')
    };
    if(!data.supplier){ showToast('Tedarikçi adı zorunlu', true); return false; }
    if(id){ Object.assign(DB.sites.find(x=>x.id===id), data); }
    else { DB.sites.push({id:uid(), ...data}); }
    await persist('sites');
    showToast('Site kaydedildi');
    renderModule();
    return true;
  });
}

/* =======================================================================
   PARTS module
   ======================================================================= */
function viewParts(){
  let rows = DB.parts.filter(p => matchSearch(p, ['partNumber','partName','supplier','trigoRE','partType','subType']));
  rows = sortRows(rows, 'partNumber');
  if(DB.parts.length===0) return emptyState('Henüz parça kaydı yok', 'Yeni parça ekleyerek başlayın.', 'openPartModal()', 'Yeni Parça Ekle');
  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>
        <th onclick="toggleSort('partNumber')">VF Parça No${sortIcon('partNumber')}</th>
        <th onclick="toggleSort('partName')">Parça Adı${sortIcon('partName')}</th>
        <th onclick="toggleSort('supplier')">Tedarikçi${sortIcon('supplier')}</th>
        <th onclick="toggleSort('trigoRE')">Trigo RE${sortIcon('trigoRE')}</th>
        <th onclick="toggleSort('partType')">Tip / Alt Tip${sortIcon('partType')}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${rows.map(p=>`
          <tr>
            <td class="mono"><b>${escapeHtml(p.partNumber)}</b></td>
            <td>${escapeHtml(p.partName)}</td>
            <td>${escapeHtml(p.supplier)}</td>
            <td>${escapeHtml(p.trigoRE)}</td>
            <td>${p.partType?`<span class="badge badge-neutral">${escapeHtml(p.partType)}</span>`:''} ${p.subType?`<span class="badge badge-neutral">${escapeHtml(p.subType)}</span>`:''}</td>
            ${actionsCell(`
              <button class="btn btn-sm btn-ghost" onclick="openPartModal('${p.id}')">Düzenle</button>
              <button class="btn btn-sm btn-danger" onclick="deleteRow('parts','${p.id}','Parça')">Sil</button>
            `)}
          </tr>
        `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Arama sonucu bulunamadı.</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function openPartModal(id){
  const rec = id ? DB.parts.find(x=>x.id===id) : {partNumber:'',partName:'',supplier:'',trigoRE:'',partType:'',subType:''};
  const supplierOptions = [...new Set(DB.sites.map(s=>s.supplier).filter(Boolean))];
  const trigoOptions = [...new Set(DB.sites.map(s=>s.trigoRE).filter(Boolean))];
  const partTypes = toRows(SEED.part_type)['Part Type'] ? [] : []; // placeholder unused
  const typeList = SEED.part_type.r.map(r=>r[0]);
  const subTypeList = SEED.part_subtype.r.map(r=>r[0]);
  openModal(`${id?'Parça Düzenle':'Yeni Parça'}`, `
    <div class="field-row">
      <div class="field"><label>VF Parça Numarası</label><input id="f-partNumber" value="${escapeHtml(rec.partNumber)}" placeholder="Örn. ELE11002095"></div>
      <div class="field"><label>Parça Adı (EN)</label><input id="f-partName" value="${escapeHtml(rec.partName)}"></div>
    </div>
    <div class="field"><label>Tedarikçi</label><input id="f-supplier" list="supplier-list" value="${escapeHtml(rec.supplier)}"></div>
    <datalist id="supplier-list">${supplierOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field"><label>Trigo RE</label><input id="f-trigoRE" list="trigo-list2" value="${escapeHtml(rec.trigoRE)}"></div>
    <datalist id="trigo-list2">${trigoOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Parça Tipi</label>
        <select id="f-partType"><option value="">—</option>${typeList.map(t=>`<option ${rec.partType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Alt Tip</label>
        <select id="f-subType"><option value="">—</option>${subTypeList.map(t=>`<option ${rec.subType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select>
      </div>
    </div>
  `, async ()=>{
    const data = { partNumber: val('f-partNumber'), partName: val('f-partName'), supplier: val('f-supplier'), trigoRE: val('f-trigoRE'), partType: val('f-partType'), subType: val('f-subType') };
    if(!data.partNumber){ showToast('Parça numarası zorunlu', true); return false; }
    if(id){ Object.assign(DB.parts.find(x=>x.id===id), data); }
    else { DB.parts.push({id:uid(), ...data}); }
    await persist('parts');
    showToast('Parça kaydedildi');
    renderModule();
    return true;
  });
}

function emptyState(title, desc, action, label){
  return `<div class="panel"><div class="empty-state">
    <div class="eb-glyph">□</div>
    <h4>${title}</h4>
    <p>${desc}</p>
    ${action ? `<button class="btn btn-primary" style="margin-top:14px;" onclick="${action}">+ ${label}</button>` : ''}
  </div></div>`;
}

async function deleteRow(table, id, label){
  if(!confirm(`${label} kaydını silmek istediğinize emin misiniz?`)) return;
  DB[table] = DB[table].filter(x=>x.id!==id);
  await persist(table);
  showToast(`${label} silindi`);
  renderModule();
}

/* =======================================================================
   MILESTONES module — grouped by Part, sequential timeline
   ======================================================================= */
function milestoneStatus(m){
  if(m.comp === 'Yes') return 'done';
  if(m.comp === 'On Hold') return 'hold';
  const cp = parseDate(m.cdatePlan);
  if(cp && cp < TODAY) return 'late';
  return 'open';
}
function statusBadge(st){
  const map = {
    done: '<span class="badge badge-good">Tamamlandı</span>',
    hold: '<span class="badge badge-warn">Beklemede</span>',
    late: '<span class="badge badge-flag">Gecikti</span>',
    open: '<span class="badge badge-neutral">Planlandı</span>'
  };
  return map[st];
}

/* =======================================================================
   GÖREV TAKİBİ — insanlara atanan görevlerin izlenmesi. Görevler / Kişi
   Özeti / Pano / Günlük Hatırlatma / Kişiler sekmeleriyle.
   ======================================================================= */
const GOREVLER_SEED = [];
const GOREV_KISILER_SEED = [];

const GOREV_DURUMLAR = ['Başlamadı','Devam Ediyor','Beklemede','Tamamlandı'];
const GOREV_ONCELIKLER = ['Yüksek','Orta','Düşük'];
let GOREV_TAB = 'gorevler';

function ensureGorevSeed(){
  let changed = false;
  if(DB.gorevler.length===0 && GOREVLER_SEED.length){
    DB.gorevler = GOREVLER_SEED.map(g=>({id:uid(), ...g}));
    changed = true;
  }
  if(DB.gorevKisiler.length===0 && GOREV_KISILER_SEED.length){
    DB.gorevKisiler = GOREV_KISILER_SEED.map(k=>({id:uid(), ...k}));
    changed = true;
  }
  return changed;
}
function gorevKalanGun(termin){
  const t = parseDate(termin);
  if(!t) return null;
  return Math.round((t - TODAY)/86400000);
}
function gorevGecikmisMi(g){
  if(g.durum==='Tamamlandı') return false;
  const k = gorevKalanGun(g.termin);
  return k!==null && k<0;
}
function gorevSorumlular(){
  const isimler = new Set();
  DB.gorevler.forEach(g=>{ if(g.anaSorumlu) isimler.add(g.anaSorumlu); if(g.yardimci) isimler.add(g.yardimci); });
  DB.gorevKisiler.forEach(k=>{ if(k.isim) isimler.add(k.isim); });
  return [...isimler].sort();
}

function viewGorevTakibi(){
  const toplam = DB.gorevler.length;
  const baslamadi = DB.gorevler.filter(g=>g.durum==='Başlamadı').length;
  const devamEdiyor = DB.gorevler.filter(g=>g.durum==='Devam Ediyor').length;
  const tamamlandi = DB.gorevler.filter(g=>g.durum==='Tamamlandı').length;
  const geciken = DB.gorevler.filter(g=>gorevGecikmisMi(g)).length;

  return `
  <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);">
    <div class="kpi-card"><div class="kpi-label">Toplam Görev</div><div class="kpi-value">${toplam}</div></div>
    <div class="kpi-card"><div class="kpi-label">Başlamadı</div><div class="kpi-value">${baslamadi}</div></div>
    <div class="kpi-card"><div class="kpi-label">Devam Ediyor</div><div class="kpi-value">${devamEdiyor}</div></div>
    <div class="kpi-card good"><div class="kpi-label">Tamamlandı</div><div class="kpi-value">${tamamlandi}</div></div>
    <div class="kpi-card ${geciken?'flag':'good'}"><div class="kpi-label">Geciken</div><div class="kpi-value">${geciken}</div></div>
  </div>

  <div class="tab-strip">
    <div class="tab-btn ${GOREV_TAB==='gorevler'?'active':''}" onclick="GOREV_TAB='gorevler'; renderModule();">Görevler</div>
    <div class="tab-btn ${GOREV_TAB==='kisiOzeti'?'active':''}" onclick="GOREV_TAB='kisiOzeti'; renderModule();">Kişi Özeti</div>
    <div class="tab-btn ${GOREV_TAB==='pano'?'active':''}" onclick="GOREV_TAB='pano'; renderModule();">Pano</div>
    <div class="tab-btn ${GOREV_TAB==='gunlukOzet'?'active':''}" onclick="GOREV_TAB='gunlukOzet'; renderModule();">Günlük Hatırlatma</div>
    <div class="tab-btn ${GOREV_TAB==='kisiler'?'active':''}" onclick="GOREV_TAB='kisiler'; renderModule();">Kişiler</div>
  </div>

  ${GOREV_TAB==='gorevler' ? viewGorevlerListesi()
    : GOREV_TAB==='kisiOzeti' ? viewGorevKisiOzeti()
    : GOREV_TAB==='pano' ? viewGorevPano()
    : GOREV_TAB==='gunlukOzet' ? viewGorevGunlukOzet()
    : viewGorevKisiler()}
  `;
}

/* ---------------- Görevler (ana liste) ---------------- */
function viewGorevlerListesi(){
  let list = DB.gorevler.filter(g => matchSearch(g, ['gorevTanimi','departman','anaSorumlu','yardimci','notlar']));
  if(TABLO_SIRALAMA['gorevler']){
    list = sirali('gorevler', list);
  } else {
    list = [...list].sort((a,b)=>{
      const ag = gorevGecikmisMi(a), bg = gorevGecikmisMi(b);
      if(ag!==bg) return ag?-1:1;
      const rank = d => d==='Tamamlandı'?1:0;
      if(rank(a.durum)!==rank(b.durum)) return rank(a.durum)-rank(b.durum);
      return (parseDate(a.termin)||0) - (parseDate(b.termin)||0);
    });
  }

  return `
  <div class="panel">
    <div class="panel-head"><h3>Görev Listesi</h3>${canEdit() ? `<button class="btn btn-primary btn-sm" onclick="openGorevModal()">+ Yeni Görev</button>` : ''}</div>
    ${list.length===0 ? `<div class="empty-state"><p>Henüz görev yok.</p></div>` : `
    <div class="table-wrap"><table>
      <thead><tr>${sortableTh('gorevler','sira','Sıra')}${sortableTh('gorevler','gorevTanimi','Görev Tanımı')}${sortableTh('gorevler','departman','Departman')}${sortableTh('gorevler','anaSorumlu','Ana Sorumlu')}${sortableTh('gorevler','yardimci','Yardımcı')}${sortableTh('gorevler','oncelik','Öncelik')}${sortableTh('gorevler','termin','Termin')}${sortableTh('gorevler','durum','Durum')}${sortableTh('gorevler','tamamlanmaYuzdesi','Tamamlanma')}<th>Kalan Gün</th><th>Notlar</th><th></th></tr></thead>
      <tbody>
        ${list.map(g=>{
          const kalan = gorevKalanGun(g.termin);
          const gecikti = gorevGecikmisMi(g);
          return `<tr>
            <td class="mono">${g.sira??''}</td>
            <td style="max-width:260px;">${escapeHtml(g.gorevTanimi)}</td>
            <td>${escapeHtml(g.departman||'—')}</td>
            <td class="mono">${escapeHtml(g.anaSorumlu||'—')}</td>
            <td class="mono">${escapeHtml(g.yardimci||'—')}</td>
            <td>${g.oncelik==='Yüksek'?'<span class="badge badge-flag">Yüksek</span>':g.oncelik==='Orta'?'<span class="badge badge-warn">Orta</span>':'<span class="badge badge-neutral">Düşük</span>'}</td>
            <td class="mono">${fmtDate(g.termin)}</td>
            <td>${g.durum==='Tamamlandı'?'<span class="badge badge-good">Tamamlandı</span>':g.durum==='Devam Ediyor'?'<span class="badge badge-warn">Devam Ediyor</span>':g.durum==='Beklemede'?'<span class="badge badge-neutral">Beklemede</span>':'<span class="badge badge-neutral">Başlamadı</span>'}</td>
            <td class="mono">%${Math.round((g.tamamlanmaYuzdesi||0)*100)}</td>
            <td class="mono">${gecikti?`<span class="badge badge-flag">${-kalan} gün gecikti</span>`:(kalan===null?'—':`${kalan} gün`)}</td>
            <td style="max-width:180px;font-size:12px;">${escapeHtml(g.notlar||'')}</td>
            <td>${canEdit() ? `<div class="row-actions"><button class="btn btn-sm btn-ghost" onclick="openGorevModal('${g.id}')">Düzenle</button><button class="btn btn-sm btn-danger" onclick="deleteRow('gorevler','${g.id}','Görev')">Sil</button></div>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`}
  </div>`;
}

function openGorevModal(id){
  const rec = id ? DB.gorevler.find(x=>x.id===id) : {
    sira: DB.gorevler.length ? Math.max(...DB.gorevler.map(g=>g.sira||0))+1 : 1,
    gorevTanimi:'', departman:'', anaSorumlu:'', yardimci:'', oncelik:'Orta', termin:'', durum:'Başlamadı', tamamlanmaYuzdesi:0, notlar:''
  };
  const kisiler = gorevSorumlular();
  openModal(`${id?'Görevi Düzenle':'Yeni Görev'}`, `
    <div class="field"><label>Görev Tanımı</label><textarea id="g-gorevTanimi">${escapeHtml(rec.gorevTanimi||'')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Departman / Alan</label><input id="g-departman" value="${escapeHtml(rec.departman||'')}" placeholder="Örn. Üretim, Ofis, Satın Alma"></div>
      <div class="field"><label>Sıra</label><input id="g-sira" type="number" value="${rec.sira??''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Ana Sorumlu</label><input id="g-anaSorumlu" list="gorev-kisi-opts" value="${escapeHtml(rec.anaSorumlu||'')}"></div>
      <div class="field"><label>Yardımcı</label><input id="g-yardimci" list="gorev-kisi-opts" value="${escapeHtml(rec.yardimci||'')}"></div>
    </div>
    <datalist id="gorev-kisi-opts">${kisiler.map(k=>`<option value="${escapeHtml(k)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Öncelik</label><select id="g-oncelik">${GOREV_ONCELIKLER.map(o=>`<option ${rec.oncelik===o?'selected':''}>${o}</option>`).join('')}</select></div>
      <div class="field"><label>Termin</label><input id="g-termin" type="date" value="${rec.termin||''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Durum</label><select id="g-durum">${GOREV_DURUMLAR.map(d=>`<option ${rec.durum===d?'selected':''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label>Tamamlanma % (0-100)</label><input id="g-tamamlanma" type="number" min="0" max="100" value="${Math.round((rec.tamamlanmaYuzdesi||0)*100)}"></div>
    </div>
    <div class="field"><label>Notlar / Engel</label><textarea id="g-notlar">${escapeHtml(rec.notlar||'')}</textarea></div>
  `, async ()=>{
    const data = {
      sira: parseInt(val('g-sira'))||null, gorevTanimi: val('g-gorevTanimi'), departman: val('g-departman'),
      anaSorumlu: val('g-anaSorumlu'), yardimci: val('g-yardimci'), oncelik: val('g-oncelik'), termin: val('g-termin'),
      durum: val('g-durum'), tamamlanmaYuzdesi: (parseFloat(val('g-tamamlanma'))||0)/100, notlar: val('g-notlar')
    };
    if(!data.gorevTanimi){ showToast('Görev tanımı zorunlu', true); return false; }
    if(id){ Object.assign(DB.gorevler.find(x=>x.id===id), data); }
    else { DB.gorevler.push({id:uid(), ...data}); }
    await persist('gorevler');
    showToast('Görev kaydedildi');
    renderModule();
    return true;
  });
}

/* ---------------- Kişi Özeti ---------------- */
function viewGorevKisiOzeti(){
  const kisiler = gorevSorumlular();
  if(kisiler.length===0) return emptyState('Henüz kişi yok', 'Görev atadığınızda burada otomatik listelenecek.', null, null);
  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr><th>Kişi</th><th>Toplam Görev</th><th>Açık Görev</th><th>Tamamlanan</th><th>Geciken</th><th>Yardımcı Olduğu</th></tr></thead>
      <tbody>
        ${kisiler.map(k=>{
          const anaGorevler = DB.gorevler.filter(g=>g.anaSorumlu===k);
          const toplam = anaGorevler.length;
          const acik = anaGorevler.filter(g=>g.durum!=='Tamamlandı').length;
          const tamam = anaGorevler.filter(g=>g.durum==='Tamamlandı').length;
          const gecikenSayi = anaGorevler.filter(g=>gorevGecikmisMi(g)).length;
          const yardimciSayi = DB.gorevler.filter(g=>g.yardimci===k).length;
          return `<tr>
            <td><b>${escapeHtml(k)}</b></td>
            <td class="mono">${toplam}</td>
            <td class="mono">${acik}</td>
            <td class="mono">${tamam}</td>
            <td class="mono">${gecikenSayi?`<span class="badge badge-flag">${gecikenSayi}</span>`:'0'}</td>
            <td class="mono">${yardimciSayi}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ---------------- Pano ---------------- */
function viewGorevPano(){
  const durumSayilari = {};
  GOREV_DURUMLAR.forEach(d=> durumSayilari[d] = DB.gorevler.filter(g=>g.durum===d).length);
  const toplam = DB.gorevler.length;
  const geciken = DB.gorevler.filter(g=>gorevGecikmisMi(g)).length;
  const buHafta = DB.gorevler.filter(g=>{ const k=gorevKalanGun(g.termin); return k!==null && k>=0 && k<=7; }).length;
  const tamamlanma = toplam ? Math.round(DB.gorevler.filter(g=>g.durum==='Tamamlandı').length/toplam*100) : 0;
  const departmanlar = [...new Set(DB.gorevler.map(g=>g.departman).filter(Boolean))];

  return `
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi-card"><div class="kpi-label">Toplam Görev</div><div class="kpi-value">${toplam}</div></div>
    <div class="kpi-card ${geciken?'flag':'good'}"><div class="kpi-label">Geciken Görev</div><div class="kpi-value">${geciken}</div></div>
    <div class="kpi-card"><div class="kpi-label">Bu Hafta Termini Gelen</div><div class="kpi-value">${buHafta}</div></div>
    <div class="kpi-card good"><div class="kpi-label">Tamamlanma Oranı</div><div class="kpi-value">%${tamamlanma}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div class="panel">
      <div class="panel-head"><h3>Durum Dağılımı</h3></div>
      <div class="panel-body">
        <div class="table-wrap"><table><thead><tr><th>Durum</th><th>Adet</th></tr></thead><tbody>
          ${GOREV_DURUMLAR.map(d=>`<tr><td>${d}</td><td class="mono">${durumSayilari[d]}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Departman Bazında</h3></div>
      <div class="panel-body">
        <div class="table-wrap"><table><thead><tr><th>Departman</th><th>Toplam</th><th>Tamamlanan</th></tr></thead><tbody>
          ${departmanlar.length===0 ? `<tr><td colspan="3" style="text-align:center;color:var(--ink-faint);">Departman bilgisi girilmemiş.</td></tr>` :
            departmanlar.map(d=>{
              const gs = DB.gorevler.filter(g=>g.departman===d);
              return `<tr><td>${escapeHtml(d)}</td><td class="mono">${gs.length}</td><td class="mono">${gs.filter(g=>g.durum==='Tamamlandı').length}</td></tr>`;
            }).join('')}
        </tbody></table></div>
      </div>
    </div>
  </div>`;
}

/* ---------------- Günlük Hatırlatma ---------------- */
function gorevMesajOlustur(kisi, acikGorevler){
  const tarihStr = TODAY.toLocaleDateString('tr-TR');
  let msg = `Merhaba ${kisi}, ${tarihStr} itibarıyla açık görevlerin (${acikGorevler.length} adet):\n`;
  msg += acikGorevler.map(g=>{
    const kalan = gorevKalanGun(g.termin);
    const kalanStr = kalan===null ? 'termin yok' : gorevGecikmisMi(g) ? `${-kalan} gün gecikti` : `Kalan: ${kalan} gün`;
    return `- ${g.gorevTanimi} (Termin: ${g.termin?fmtDate(g.termin):'—'}, ${kalanStr})`;
  }).join('\n');
  return msg;
}
function viewGorevGunlukOzet(){
  const kisiler = gorevSorumlular();
  const acikKisiler = kisiler.map(k=>({
    kisi: k,
    acik: DB.gorevler.filter(g=>g.anaSorumlu===k && g.durum!=='Tamamlandı'),
    geciken: DB.gorevler.filter(g=>g.anaSorumlu===k && gorevGecikmisMi(g)).length,
    iletisim: DB.gorevKisiler.find(x=>x.isim===k)
  })).filter(x=>x.acik.length>0);

  if(acikKisiler.length===0) return emptyState('Açık görev yok', 'Herkesin görevleri tamamlanmış görünüyor.', null, null);

  return `
  <div class="field-hint" style="margin-bottom:12px;">${TODAY.toLocaleDateString('tr-TR')} itibarıyla açık görevi olan herkes. Telefon/e-posta yoksa Kişiler sekmesinden ekleyin.</div>
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr><th>İsim</th><th>Açık Görev</th><th>Geciken</th><th>Mesaj Önizleme</th><th></th></tr></thead>
      <tbody>
        ${acikKisiler.map(x=>{
          const mesaj = gorevMesajOlustur(x.kisi, x.acik);
          const tel = x.iletisim?.telefon;
          const eposta = x.iletisim?.eposta;
          const konu = encodeURIComponent(`Günlük Görev Hatırlatması ${TODAY.toLocaleDateString('tr-TR')}`);
          const govde = encodeURIComponent(mesaj);
          return `<tr>
            <td><b>${escapeHtml(x.kisi)}</b></td>
            <td class="mono">${x.acik.length}</td>
            <td class="mono">${x.geciken?`<span class="badge badge-flag">${x.geciken}</span>`:'0'}</td>
            <td style="max-width:340px;font-size:11.5px;color:var(--ink-soft);white-space:pre-line;">${escapeHtml(mesaj.slice(0,180))}${mesaj.length>180?'…':''}</td>
            <td><div class="row-actions">
              ${tel ? `<a class="btn btn-sm btn-primary" href="https://wa.me/${escapeHtml(tel)}?text=${govde}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="field-hint">tel yok</span>`}
              ${eposta ? `<a class="btn btn-sm btn-ghost" href="mailto:${escapeHtml(eposta)}?subject=${konu}&body=${govde}">Mail</a>` : `<span class="field-hint">e-posta yok</span>`}
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ---------------- Kişiler ---------------- */
function viewGorevKisiler(){
  return `
  <div class="panel">
    <div class="panel-head"><h3>Kişi İletişim Bilgileri</h3>${canEdit() ? `<button class="btn btn-primary btn-sm" onclick="openGorevKisiModal()">+ Yeni Kişi</button>` : ''}</div>
    ${DB.gorevKisiler.length===0 ? `<div class="empty-state"><p>Henüz kişi eklenmedi. WhatsApp/mail hatırlatması için telefon ve e-posta girin.</p></div>` : `
    <div class="table-wrap"><table>
      <thead><tr><th>İsim</th><th>E-posta</th><th>WhatsApp Telefon</th><th></th></tr></thead>
      <tbody>
        ${DB.gorevKisiler.map(k=>`
          <tr>
            <td><b>${escapeHtml(k.isim)}</b></td>
            <td class="mono">${escapeHtml(k.eposta||'—')}</td>
            <td class="mono">${escapeHtml(k.telefon||'—')}</td>
            <td>${canEdit() ? `<div class="row-actions"><button class="btn btn-sm btn-ghost" onclick="openGorevKisiModal('${k.id}')">Düzenle</button><button class="btn btn-sm btn-danger" onclick="deleteRow('gorevKisiler','${k.id}','Kişi')">Sil</button></div>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`}
  </div>
  <div class="field-hint" style="margin-top:10px;">Telefon numarasını ülke koduyla girin (örn. 905321234567) — WhatsApp linki bu formatı bekler.</div>`;
}
function openGorevKisiModal(id){
  const rec = id ? DB.gorevKisiler.find(x=>x.id===id) : {isim:'', eposta:'', telefon:''};
  openModal(`${id?'Kişiyi Düzenle':'Yeni Kişi'}`, `
    <div class="field"><label>İsim</label><input id="k-isim" value="${escapeHtml(rec.isim||'')}"></div>
    <div class="field"><label>E-posta</label><input id="k-eposta" type="email" value="${escapeHtml(rec.eposta||'')}"></div>
    <div class="field"><label>WhatsApp Telefon (ülke koduyla)</label><input id="k-telefon" value="${escapeHtml(rec.telefon||'')}" placeholder="905321234567"></div>
  `, async ()=>{
    const data = {isim: val('k-isim'), eposta: val('k-eposta'), telefon: val('k-telefon')};
    if(!data.isim){ showToast('İsim zorunlu', true); return false; }
    if(id){ Object.assign(DB.gorevKisiler.find(x=>x.id===id), data); }
    else { DB.gorevKisiler.push({id:uid(), ...data}); }
    await persist('gorevKisiler');
    showToast('Kişi kaydedildi');
    renderModule();
    return true;
  });
}
function toInputDate(s){ const d = parseDate(s); if(!d) return ''; return toLocalISODate(d); }
function fromInputDate(s){ if(!s) return ''; const [y,m,d] = s.split('-'); return `${m}/${d}/${y.slice(2)} 00:00:00`; }

/* =======================================================================
   AUDIT module — grouped by Section
   ======================================================================= */
function viewAudit(){
  if(DB.audits.length===0) return emptyState('Henüz denetim sorusu yok', '', null, null);
  const sections = [...new Set(DB.audits.map(a=>a.section))];
  if(!SELECTED_AUDIT_SECTION || !sections.includes(SELECTED_AUDIT_SECTION)) SELECTED_AUDIT_SECTION = sections[0];

  const sectionStats = sections.map(sec=>{
    const qs = DB.audits.filter(a=>a.section===sec);
    const scored = qs.filter(q=>q.score!==null && !isNaN(q.score));
    const avg = scored.length ? scored.reduce((s,q)=>s+q.score,0)/scored.length : null;
    return {sec, count: qs.length, avg};
  });

  const qs = DB.audits.filter(a=>a.section===SELECTED_AUDIT_SECTION);

  return `
  <div class="part-picker">
    <div class="part-list">
      ${sectionStats.map(s=>`
        <div class="part-list-item ${s.sec===SELECTED_AUDIT_SECTION?'active':''}" onclick="selectAuditSection('${escapeHtml(s.sec).replace(/'/g,"\\'")}')">
          <div class="pn" style="font-family:var(--font-body);font-weight:600;">${escapeHtml(s.sec)}</div>
          <div class="pmeta">${s.count} soru ${s.avg!==null? '· ort. '+s.avg.toFixed(1) : '· puansız'}</div>
        </div>
      `).join('')}
    </div>
    <div class="timeline">
      <div class="panel">
        <div class="panel-head"><h3>${escapeHtml(SELECTED_AUDIT_SECTION)}</h3><span class="field-hint">TQS Denetim Formu</span></div>
        <div class="panel-body" style="padding:0;">
          ${qs.map(q=>`
            <div class="audit-q-row">
              <div style="width:46px;flex:0 0 46px;" class="mono field-hint">#${escapeHtml(q.question)}</div>
              <div class="qtext">
                ${q.evidence && q.evidence!=='0' ? `<div class="field-hint">Kanıt: ${escapeHtml(q.evidence)}</div>` : ''}
              </div>
              <div class="score-pills">
                ${[0,1,2,3,4].map(v=>`<div class="score-pill ${q.score===v?'sel-'+v:''}" onclick="setAuditScore('${q.id}',${v})">${v}</div>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="field-hint" style="margin-top:8px;">Puanlama: 0 = Uygun değil · 1–2 = Kısmi uygun · 3–4 = Tam uygun</div>
    </div>
  </div>`;
}
function selectAuditSection(s){ SELECTED_AUDIT_SECTION = s; renderModule(); }
async function setAuditScore(id, v){
  const rec = DB.audits.find(x=>x.id===id);
  rec.score = (rec.score===v) ? null : v;
  await persist('audits');
  renderModule();
}

/* =======================================================================
   DIMWORK module — tolerance / caliper visualization
   ======================================================================= */
function viewDimwork(){
  const parts = [...new Set(DB.dimwork.map(d=>d.partNumber))].filter(Boolean).sort();
  if(parts.length===0) return emptyState('Henüz ölçüm karakteristiği yok', 'Yeni karakteristik ekleyin.', 'openDimModal()', 'Yeni Karakteristik');
  if(!SELECTED_PART_DIM || !parts.includes(SELECTED_PART_DIM)) SELECTED_PART_DIM = parts[0];
  const filteredParts = SEARCH ? parts.filter(p=>p.toLowerCase().includes(SEARCH.toLowerCase())) : parts;

  const rows = DB.dimwork.filter(d=>d.partNumber===SELECTED_PART_DIM);
  const byPoint = {};
  rows.forEach(r=>{ (byPoint[r.inspectionPoint||'—'] = byPoint[r.inspectionPoint||'—']||[]).push(r); });

  return `
  <div class="part-picker">
    <div class="part-list">
      ${filteredParts.map(p=>{
        const pRows = DB.dimwork.filter(d=>d.partNumber===p);
        const measured = pRows.filter(d=>d.value!==null && !isNaN(d.value));
        const bad = measured.filter(d=>d.value<d.lower || d.value>d.upper).length;
        return `<div class="part-list-item ${p===SELECTED_PART_DIM?'active':''}" onclick="selectDimPart('${escapeHtml(p).replace(/'/g,"\\'")}')">
          <div class="pn">${escapeHtml(p)} ${bad?`<span class="badge badge-flag" style="margin-left:4px;">${bad} sapma</span>`:''}</div>
          <div class="pmeta">${measured.length}/${pRows.length} ölçüm girildi</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      ${Object.entries(byPoint).map(([point, items])=>`
        <div class="panel">
          <div class="panel-head"><h3>${escapeHtml(point)}</h3><span class="field-hint">${items.length} karakteristik</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Char ID</th><th>Karakteristik</th><th>Nominal</th><th>Alt / Üst Limit</th><th>Ölçüm</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${items.map(d=>{
                const hasVal = d.value!==null && !isNaN(d.value);
                const ok = hasVal && d.value>=d.lower && d.value<=d.upper;
                const range = d.upper - d.lower;
                const pos = range ? Math.min(1,Math.max(0,(d.value - d.lower)/range)) : 0.5;
                const nomPos = range ? Math.min(1,Math.max(0,(d.nominal - d.lower)/range)) : 0.5;
                return `<tr>
                  <td class="mono">${escapeHtml(d.charId)}</td>
                  <td>${escapeHtml(d.characteristic)}</td>
                  <td class="mono">${isFinite(d.nominal)?d.nominal:'—'}</td>
                  <td class="mono">${isFinite(d.lower)?d.lower:'—'} / ${isFinite(d.upper)?d.upper:'—'}</td>
                  <td>
                    <input type="number" step="any" class="mono" style="width:90px;padding:4px 6px;border:1px solid var(--line-strong);border-radius:3px;"
                      value="${hasVal?d.value:''}" placeholder="—"
                      onchange="setDimValue('${d.id}', this.value)">
                  </td>
                  <td>
                    <div class="caliper">
                      <div class="caliper-track"></div>
                      <div class="caliper-nominal" style="left:${nomPos*100}%"></div>
                      ${hasVal ? `<div class="caliper-marker ${ok?'ok':'bad'}" style="left:${pos*100}%"></div>` : ''}
                    </div>
                    ${hasVal ? (ok?'<span class="badge badge-good">Uygun</span>':'<span class="badge badge-flag">Sapma</span>') : '<span class="badge badge-neutral">Bekliyor</span>'}
                  </td>
                  <td><div class="row-actions"><button class="btn btn-sm btn-danger" onclick="deleteRow('dimwork','${d.id}','Karakteristik')">Sil</button></div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        </div>
      `).join('')}
    </div>
  </div>`;
}
function selectDimPart(p){ SELECTED_PART_DIM = p; renderModule(); }
async function setDimValue(id, v){
  const rec = DB.dimwork.find(x=>x.id===id);
  rec.value = v==='' ? null : parseFloat(v);
  await persist('dimwork');
  renderModule();
}
function openDimModal(){
  openModal('Yeni Ölçüm Karakteristiği', `
    <div class="field-row">
      <div class="field"><label>Parça Numarası</label><input id="f-partNumber" list="dim-part-opts" value="${SELECTED_PART_DIM||''}"></div>
      <div class="field"><label>Muayene Noktası</label><input id="f-inspectionPoint" placeholder="Örn. SOP &amp; EOP"></div>
    </div>
    <datalist id="dim-part-opts">${[...new Set(DB.dimwork.map(d=>d.partNumber))].map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Char ID</label><input id="f-charId" type="number"></div>
      <div class="field"><label>Çizim (Drawing)</label><input id="f-drawing"></div>
    </div>
    <div class="field"><label>Karakteristik</label><input id="f-characteristic" placeholder="Örn. Lazer Cutting-111.50"></div>
    <div class="field-row">
      <div class="field"><label>Nominal</label><input id="f-nominal" type="number" step="any"></div>
      <div class="field"><label>Alt Limit</label><input id="f-lower" type="number" step="any"></div>
      <div class="field"><label>Üst Limit</label><input id="f-upper" type="number" step="any"></div>
    </div>
    <div class="field"><label>Seri No</label><input id="f-serial"></div>
  `, async ()=>{
    const data = {
      partNumber: val('f-partNumber'), inspectionPoint: val('f-inspectionPoint'), drawing: val('f-drawing'),
      charId: val('f-charId'), characteristic: val('f-characteristic'),
      nominal: parseFloat(val('f-nominal')), lower: parseFloat(val('f-lower')), upper: parseFloat(val('f-upper')),
      serial: val('f-serial'), value: null
    };
    if(!data.partNumber || !data.characteristic){ showToast('Parça ve karakteristik zorunlu', true); return false; }
    DB.dimwork.push({id:uid(), ...data});
    await persist('dimwork');
    SELECTED_PART_DIM = data.partNumber;
    showToast('Karakteristik eklendi');
    renderModule();
    return true;
  });
}

/* =======================================================================
   QFW module — quality-walk inspection log
   ======================================================================= */
const REJECT_TYPES = SEED.rejection_types.r.map(r=>r[0]);

function viewQfw(){
  let rows = DB.qfw.filter(q => matchSearch(q, ['supplier','partNumber','location','description']));
  rows = [...rows].sort((a,b)=> (parseDate(b.date)||0) - (parseDate(a.date)||0));
  if(DB.qfw.length===0) return emptyState('Henüz kalite walk kaydı yok', 'Sahada yapılan ilk kalite yürüyüşü kaydını ekleyin.', 'openQfwModal()', 'Yeni Kalite Walk');
  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Tarih</th><th>Tedarikçi</th><th>Parça No</th><th>Lokasyon</th><th>Muayene</th><th>Ret</th><th>Ret Tipleri</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(q=>{
          const totalRej = (q.rejections||[]).reduce((s,r)=>s+(parseFloat(r.qty)||0),0);
          const types = [...new Set((q.rejections||[]).map(r=>r.type).filter(Boolean))];
          return `<tr>
            <td class="mono">${fmtDate(q.date)}</td>
            <td>${escapeHtml(q.supplier)}</td>
            <td class="mono">${escapeHtml(q.partNumber)}</td>
            <td>${escapeHtml(q.location)}</td>
            <td class="mono">${q.qtyInspected ?? '—'}</td>
            <td>${totalRej>0? `<span class="badge badge-flag">${totalRej}</span>` : `<span class="badge badge-good">0</span>`}</td>
            <td>${types.map(t=>`<span class="badge badge-neutral">${escapeHtml(t)}</span>`).join(' ')}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-ghost" onclick="openQfwModal('${q.id}')">Düzenle</button>
              <button class="btn btn-sm btn-danger" onclick="deleteRow('qfw','${q.id}','Kalite walk kaydı')">Sil</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function openQfwModal(id){
  const rec = id ? DB.qfw.find(x=>x.id===id) : {date:toLocalISODate(new Date()), supplier:'', partNumber:'', location:'', qtyInspected:'', description:'', rejections:[{qty:'',type:'',characteristic:''},{qty:'',type:'',characteristic:''},{qty:'',type:'',characteristic:''}]};
  const rej = (rec.rejections && rec.rejections.length) ? rec.rejections : [{qty:'',type:'',characteristic:''},{qty:'',type:'',characteristic:''},{qty:'',type:'',characteristic:''}];
  while(rej.length<3) rej.push({qty:'',type:'',characteristic:''});
  const supplierOptions = [...new Set(DB.sites.map(s=>s.supplier).filter(Boolean))];
  const partOptions = [...new Set(DB.parts.map(p=>p.partNumber).filter(Boolean))];

  openModal(`${id?'Kalite Walk Kaydını Düzenle':'Yeni Kalite Walk Kaydı'}`, `
    <div class="field-row">
      <div class="field"><label>Muayene Tarihi</label><input id="f-date" type="date" value="${id? toInputDate(rec.date) : rec.date}"></div>
      <div class="field"><label>Lokasyon</label><input id="f-location" value="${escapeHtml(rec.location)}" placeholder="Örn. Hat 3 / Giriş Kalite"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Tedarikçi</label><input id="f-supplier" list="qfw-supplier-opts" value="${escapeHtml(rec.supplier)}"></div>
      <div class="field"><label>Parça No</label><input id="f-partNumber" list="qfw-part-opts" value="${escapeHtml(rec.partNumber)}"></div>
    </div>
    <datalist id="qfw-supplier-opts">${supplierOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <datalist id="qfw-part-opts">${partOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field"><label>Muayene Edilen Adet</label><input id="f-qtyInspected" type="number" value="${rec.qtyInspected??''}"></div>
    <div class="field"><label>Genel Açıklama</label><textarea id="f-description">${escapeHtml(rec.description)}</textarea></div>

    <div class="reject-block">
      <h5>Ret Detayları (opsiyonel — en fazla 3)</h5>
      ${[0,1,2].map(i=>`
        <div class="qfw-form-grid" style="margin-bottom:${i<2?'8px':'0'};">
          <input id="f-rejQty${i}" type="number" placeholder="Ret Adedi" value="${rej[i].qty??''}">
          <select id="f-rejType${i}">
            <option value="">Ret Tipi —</option>
            ${REJECT_TYPES.map(t=>`<option ${rej[i].type===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
          </select>
          <input id="f-rejChar${i}" placeholder="Karakteristik" value="${escapeHtml(rej[i].characteristic||'')}">
        </div>
      `).join('')}
    </div>
  `, async ()=>{
    const rejections = [0,1,2].map(i=>({
      qty: val('f-rejQty'+i), type: val('f-rejType'+i), characteristic: val('f-rejChar'+i)
    })).filter(r=>r.qty || r.type || r.characteristic);
    const data = {
      date: fromInputDate(val('f-date')) || val('f-date'), supplier: val('f-supplier'), partNumber: val('f-partNumber'),
      location: val('f-location'), qtyInspected: val('f-qtyInspected')?parseFloat(val('f-qtyInspected')):null,
      description: val('f-description'), rejections
    };
    if(!data.supplier || !data.partNumber){ showToast('Tedarikçi ve parça no zorunlu', true); return false; }
    if(id){ Object.assign(DB.qfw.find(x=>x.id===id), data); }
    else { DB.qfw.push({id:uid(), ...data}); }
    await persist('qfw');
    showToast('Kalite walk kaydı kaydedildi');
    renderModule();
    return true;
  });
}

/* =======================================================================
   KALİTE KONTROL — gerçek FR-07 kontrol planlarına göre, Sipariş bazlı
   izlenebilir ölçüm girişi. Sıra 'G' (Hammadde Kabul) ve 'S' (Son Kontrol/
   Sevk) rota adımı değildir, pipeline'ın başında/sonunda sabit gösterilir.
   ======================================================================= */
const SIRA_LABELS = {'G':'Hammadde Kabul (Giriş)', 'S':'Son Kontrol / Sevk'};
function siraSortKey(s){ if(s==='G') return -1; if(s==='S') return 999; return parseFloat(s); }
function siraLabel(s, fallbackOp){ return SIRA_LABELS[s] || (s + ' — ' + (fallbackOp||'')); }

function kontrolPlaniForUrun(urun){
  const items = DB.kontrolPlani.filter(k=>k.urun===urun);
  const bySira = {};
  items.forEach(k=>{ (bySira[k.sira]=bySira[k.sira]||[]).push(k); });
  return Object.keys(bySira).sort((a,b)=>siraSortKey(a)-siraSortKey(b)).map(sira=>({sira, operasyon: bySira[sira][0].operasyon, items: bySira[sira]}));
}
function olcumHistory(orderId, kontrolPlaniId){
  return DB.kaliteOlcumleri.filter(o=>o.orderId===orderId && o.kontrolPlaniId===kontrolPlaniId)
    .sort((a,b)=>(parseDate(b.tarih)||0)-(parseDate(a.tarih)||0));
}
function olcumSonuc(kp, deger){
  if(kp.tip!=='olcusel') return null;
  if(deger===null || deger===undefined || isNaN(deger)) return null;
  return (deger>=kp.altLimit && deger<=kp.ustLimit) ? 'Uygun' : 'Uygun Değil';
}
function orderQualityStats(orderId){
  const urun = DB.orders.find(o=>o.id===orderId)?.urun;
  if(!urun) return {total:0, measured:0, fail:0};
  const items = DB.kontrolPlani.filter(k=>k.urun===urun);
  let measured=0, fail=0;
  items.forEach(kp=>{
    const h = olcumHistory(orderId, kp.id);
    if(h.length){ measured++; if(h[0].sonuc==='Uygun Değil') fail++; }
  });
  return {total: items.length, measured, fail};
}

function currentEntry(orderId, kontrolPlaniId){
  return DB.kaliteOlcumleri.find(o=>o.orderId===orderId && o.kontrolPlaniId===kontrolPlaniId) || null;
}
function fmtRange(kp){
  if(kp.tip!=='olcusel') return '';
  const fmt = n => Number(n).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
  return `${fmt(kp.altLimit)} – ${fmt(kp.ustLimit)} ${kp.birim}`;
}

function viewKalite(){
  const ordersWithPlan = DB.orders.filter(o => DB.kontrolPlani.some(k=>k.urun===o.urun));
  if(ordersWithPlan.length===0) return emptyState('Kontrol planı tanımlı sipariş yok', 'Kontrol planı bulunan bir ürün için önce Siparişler modülünden sipariş açın (221170-221173).', null, null);

  if(!SELECTED_KALITE_ORDER || !ordersWithPlan.find(o=>o.id===SELECTED_KALITE_ORDER)) SELECTED_KALITE_ORDER = ordersWithPlan[0].id;
  const order = ordersWithPlan.find(o=>o.id===SELECTED_KALITE_ORDER);
  const urunAdi = DB.routes.find(r=>r.urun===order.urun)?.urunAdi || '';
  const groups = kontrolPlaniForUrun(order.urun);

  return `
  <div class="part-picker">
    <div class="part-list">
      ${ordersWithPlan.map(o=>{
        const st = orderQualityStats(o.id);
        return `<div class="part-list-item ${o.id===SELECTED_KALITE_ORDER?'active':''}" onclick="selectKaliteOrder('${o.id}')">
          <div class="pn">${escapeHtml(o.urun)}</div>
          <div class="pmeta">${o.hedefMiktar} adet · teslim ${fmtDate(o.istenenTeslimTarihi)}</div>
          <div class="pmeta" style="margin-top:4px;">${st.measured}/${st.total} madde girildi ${st.fail?`<span class="badge badge-flag" style="margin-left:4px;">${st.fail} uygunsuz</span>`:''}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      <div class="panel">
        <div class="panel-head">
          <h3 class="mono">${escapeHtml(order.urun)} <span style="font-family:var(--font-body);font-weight:400;font-size:13px;color:var(--ink-soft);">— ${escapeHtml(urunAdi)}</span></h3>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="field-hint">Vardiya:</span>
            <select onchange="SELECTED_VARDIYA=this.value;" style="padding:5px 8px;border:1px solid var(--line-strong);border-radius:3px;font-size:12.5px;">
              <option value="1" ${SELECTED_VARDIYA==='1'?'selected':''}>1</option>
              <option value="2" ${SELECTED_VARDIYA==='2'?'selected':''}>2</option>
              <option value="3" ${SELECTED_VARDIYA==='3'?'selected':''}>3</option>
            </select>
          </div>
        </div>
        <div class="panel-body" style="display:flex; flex-direction:column; gap:22px;">
          ${groups.map(g=>`
            <div>
              <div style="font-family:var(--font-display);font-weight:600;font-size:13.5px;color:var(--ink-soft);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--line);">
                ${escapeHtml(siraLabel(g.sira, g.operasyon))}
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;">
                ${g.items.map(kp=>{
                  const entry = currentEntry(order.id, kp.id);
                  return `
                  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 0;">
                    <div style="flex:1;min-width:200px;">
                      <div style="font-weight:600;font-size:13.5px;">${escapeHtml(kp.karakteristik)}</div>
                      <div class="field-hint">${kp.tip==='olcusel' ? fmtRange(kp) : escapeHtml(kp.spesifikasyonRaw||'Görsel kontrol')}</div>
                    </div>
                    ${kp.tip==='olcusel' ? renderOlcuselInput(order, kp, entry) : renderNitelInput(order, kp, entry)}
                  </div>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>`;
}
function renderOlcuselInput(order, kp, entry){
  const range = kp.ustLimit - kp.altLimit;
  const hasVal = entry && entry.deger!==null && !isNaN(entry.deger);
  const pos = hasVal && range ? Math.min(1,Math.max(0,(entry.deger-kp.altLimit)/range)) : null;
  const nomPos = range ? Math.min(1,Math.max(0,(kp.nominal-kp.altLimit)/range)) : 0.5;
  const ok = hasVal && entry.sonuc==='Uygun';
  return `
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <input type="number" step="any" class="mono" style="width:100px;padding:7px 9px;border:1px solid var(--line-strong);border-radius:3px;font-size:14px;"
        value="${hasVal?entry.deger:''}" placeholder="değer" ${canEdit()?'':'disabled'}
        onchange="recordOlcum('${order.id}','${kp.id}', this.value)">
      <div class="caliper" style="width:130px;">
        <div class="caliper-track"></div>
        <div class="caliper-nominal" style="left:${nomPos*100}%"></div>
        ${hasVal ? `<div class="caliper-marker ${ok?'ok':'bad'}" style="left:${pos*100}%"></div>` : ''}
      </div>
      <span style="min-width:88px;">${hasVal ? (ok?'<span class="badge badge-good">Uygun</span>':'<span class="badge badge-flag">Uygun Değil</span>') : '<span class="badge badge-neutral">—</span>'}</span>
    </div>`;
}
function renderNitelInput(order, kp, entry){
  return `
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <button class="btn btn-sm ${entry?.sonuc==='Uygun'?'btn-primary':'btn-ghost'}" ${canEdit()?'':'disabled'} onclick="recordOlcumNitel('${order.id}','${kp.id}','Uygun')">Uygun</button>
      <button class="btn btn-sm ${entry?.sonuc==='Uygun Değil'?'btn-danger':'btn-ghost'}" ${canEdit()?'':'disabled'} onclick="recordOlcumNitel('${order.id}','${kp.id}','Uygun Değil')">Uygun Değil</button>
    </div>`;
}
function selectKaliteOrder(id){ SELECTED_KALITE_ORDER = id; renderModule(); }
async function recordOlcum(orderId, kontrolPlaniId, v){
  const kp = DB.kontrolPlani.find(k=>k.id===kontrolPlaniId);
  const deger = v===''? null : parseFloat(v);
  if(deger===null || isNaN(deger)) return;
  const sonuc = olcumSonuc(kp, deger);
  let entry = currentEntry(orderId, kontrolPlaniId);
  if(entry){
    Object.assign(entry, {deger, sonuc, tarih: toLocalISODate(new Date()), vardiya: SELECTED_VARDIYA, operator: CURRENT_USER?.displayName||''});
  } else {
    entry = {id: uid(), orderId, kontrolPlaniId, tarih: toLocalISODate(new Date()), vardiya: SELECTED_VARDIYA,
      deger, sonuc, operator: CURRENT_USER?.displayName||'', not: ''};
    DB.kaliteOlcumleri.push(entry);
  }
  await persist('kaliteOlcumleri');
  if(sonuc==='Uygun Değil') showToast(kp.karakteristik + ' — Uygun Değil (istediğiniz zaman düzeltebilirsiniz)', true);
  else showToast('Ölçüm kaydedildi');
  renderModule();
}
async function recordOlcumNitel(orderId, kontrolPlaniId, sonuc){
  let entry = currentEntry(orderId, kontrolPlaniId);
  if(entry){
    Object.assign(entry, {sonuc, tarih: toLocalISODate(new Date()), vardiya: SELECTED_VARDIYA, operator: CURRENT_USER?.displayName||''});
  } else {
    entry = {id: uid(), orderId, kontrolPlaniId, tarih: toLocalISODate(new Date()), vardiya: SELECTED_VARDIYA,
      deger: null, sonuc, operator: CURRENT_USER?.displayName||'', not: ''};
    DB.kaliteOlcumleri.push(entry);
  }
  await persist('kaliteOlcumleri');
  showToast(sonuc==='Uygun' ? 'Uygun olarak kaydedildi' : 'Uygun Değil olarak kaydedildi — istediğiniz zaman düzeltebilirsiniz', sonuc!=='Uygun');
  renderModule();
}

/* =======================================================================
   GÜNLÜK KALİTE RAPORLARI — siparişten bağımsız. First Off (günde birden
   fazla, gerekçeli) + Saatlik Kontrol (10:30/12:00/15:00/18:00, her
   karakteristik için 6 numune). Gerçek FR-06 formlarından işlendi.
   ======================================================================= */
function gunlukUrunler(){ return [...new Set(DB.firstOffNoktalari.map(n=>n.urun))].sort(); }
function firstOffNoktaListesi(urun, op){ return DB.firstOffNoktalari.filter(n=>n.urun===urun && n.operasyon===op).sort((a,b)=>a.no-b.no); }
function saatlikNoktaListesi(urun, op){ return DB.saatlikNoktalari.filter(n=>n.urun===urun && n.operasyon===op); }
function gunlukSonuc(nokta, deger){
  if(nokta.tip!=='olcusel') return null;
  if(deger===null || deger===undefined || deger==='' || isNaN(deger)) return null;
  return (deger>=nokta.altLimit && deger<=nokta.ustLimit) ? 'Uygun' : 'Uygun Değil';
}
const GEREKCE_LISTESI = ['Yeni iş emri / seri başlangıcı','Setup / kurulum sonrası','Vardiya değişimi','Uzun duruş sonrası','Ayar / parametre değişimi','Malzeme / lot değişimi','Düzeltici faaliyet sonrası'];

function viewGunlukKalite(){
  const urunler = gunlukUrunler();
  if(urunler.length===0) return emptyState('Referans veri yok', '', null, null);
  if(!GUNLUK_URUN || !urunler.includes(GUNLUK_URUN)) GUNLUK_URUN = urunler[0];
  if(!GUNLUK_OP) GUNLUK_OP = GUNLUK_OPS[0];
  if(!GUNLUK_TARIH) GUNLUK_TARIH = toLocalISODate(new Date());

  return `
  <div class="panel">
    <div class="panel-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div class="field" style="margin:0;">
        <label>Ürün</label>
        <select onchange="GUNLUK_URUN=this.value; FIRSTOFF_EDIT=null; renderModule();" style="min-width:110px;">
          ${urunler.map(u=>`<option value="${u}" ${u===GUNLUK_URUN?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      ${GUNLUK_TAB!=='girisKontrol' ? `
      <div class="field" style="margin:0;">
        <label>Operasyon</label>
        <select onchange="GUNLUK_OP=this.value; FIRSTOFF_EDIT=null; renderModule();" style="min-width:130px;">
          ${GUNLUK_OPS.map(op=>`<option value="${op}" ${op===GUNLUK_OP?'selected':''}>${GUNLUK_OP_LABELS[op]}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="field" style="margin:0;">
        <label>Tarih</label>
        <input type="date" value="${GUNLUK_TARIH}" onchange="GUNLUK_TARIH=this.value; FIRSTOFF_EDIT=null; renderModule();">
      </div>
      <div class="field" style="margin:0;">
        <label>Vardiya</label>
        <select onchange="SELECTED_VARDIYA=this.value; renderModule();">
          <option value="1" ${SELECTED_VARDIYA==='1'?'selected':''}>1</option>
          <option value="2" ${SELECTED_VARDIYA==='2'?'selected':''}>2</option>
          <option value="3" ${SELECTED_VARDIYA==='3'?'selected':''}>3</option>
        </select>
      </div>
    </div>
  </div>

  <div class="tab-strip">
    <div class="tab-btn ${GUNLUK_TAB==='ozet'?'active':''}" onclick="GUNLUK_TAB='ozet'; renderModule();">Günlük Özet</div>
    <div class="tab-btn ${GUNLUK_TAB==='firstoff'?'active':''}" onclick="GUNLUK_TAB='firstoff'; renderModule();">First Off (İlk Parça)</div>
    <div class="tab-btn ${GUNLUK_TAB==='saatlik'?'active':''}" onclick="GUNLUK_TAB='saatlik'; renderModule();">Saatlik Kontrol</div>
    <div class="tab-btn ${GUNLUK_TAB==='girisKontrol'?'active':''}" onclick="GUNLUK_TAB='girisKontrol'; renderModule();">Giriş Kalite Kontrol</div>
  </div>

  ${GUNLUK_TAB==='firstoff' ? viewFirstOffTab() : GUNLUK_TAB==='saatlik' ? viewSaatlikTab() : GUNLUK_TAB==='girisKontrol' ? viewGirisKaliteTab() : viewGunlukOzet()}
  `;
}

/* ---------------- First Off tab ---------------- */
let FIRSTOFF_EDIT = null; // null | 'new' | kayıt id

function viewFirstOffTab(){
  if(FIRSTOFF_EDIT!==null) return viewFirstOffEdit();

  const kayitlar = DB.firstOffKayitlari.filter(k=>k.urun===GUNLUK_URUN && k.operasyon===GUNLUK_OP && k.tarih===GUNLUK_TARIH)
    .sort((a,b)=>(a.kontrolSaati||'').localeCompare(b.kontrolSaati||''));
  return `
  <div class="panel">
    <div class="panel-head">
      <h3>${GUNLUK_OP_LABELS[GUNLUK_OP]} — ${GUNLUK_URUN} — ${fmtDate(GUNLUK_TARIH)}</h3>
      ${canEdit() ? `<button class="btn btn-primary btn-sm" onclick="FIRSTOFF_EDIT='new'; renderModule();">+ Yeni First Off</button>` : ''}
    </div>
    <div class="panel-body">
      ${kayitlar.length===0 ? `<div class="field-hint">Bu gün için henüz First Off kaydı yok.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Saat</th><th>Operatör</th><th>İş Emri No</th><th>Gerekçe</th><th>Karar</th><th></th></tr></thead>
        <tbody>
          ${kayitlar.map(k=>`
            <tr>
              <td class="mono">${k.kontrolSaati||'—'}</td>
              <td>${escapeHtml(k.operator||'')}</td>
              <td class="mono">${escapeHtml(k.isEmriNo||'—')}</td>
              <td style="max-width:220px;font-size:12px;color:var(--ink-soft);">${(k.gerekce||[]).join(', ')}${k.not?`<div style="margin-top:3px;font-style:italic;color:var(--ink-faint);">${escapeHtml(k.not)}</div>`:''}</td>
              <td>${k.genelKarar==='Uygun'?'<span class="badge badge-good">Uygun</span>':k.genelKarar==='Uygun Değil'?'<span class="badge badge-flag">Uygun Değil</span>':'<span class="badge badge-neutral">—</span>'}</td>
              <td>${actionsCell(`<button class="btn btn-sm btn-ghost" onclick="FIRSTOFF_EDIT='${k.id}'; renderModule();">Düzenle</button><button class="btn btn-sm btn-danger" onclick="deleteFirstOff('${k.id}')">Sil</button>`)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`}
    </div>
  </div>`;
}

function viewFirstOffEdit(){
  const id = FIRSTOFF_EDIT==='new' ? null : FIRSTOFF_EDIT;
  const rec = id ? DB.firstOffKayitlari.find(x=>x.id===id) : {
    urun: GUNLUK_URUN, operasyon: GUNLUK_OP, tarih: GUNLUK_TARIH, vardiya: SELECTED_VARDIYA,
    operator: CURRENT_USER?.displayName||'', isEmriNo:'', numuneAdedi:'6', kontrolSaati:'', gerekce:[], degerler:{}, genelKarar:'', not:''
  };
  const noktalar = firstOffNoktaListesi(rec.urun, rec.operasyon);

  return `
  <div class="panel">
    <div class="panel-head">
      <h3>${id?'First Off Kaydını Düzenle':'Yeni First Off'} — ${GUNLUK_OP_LABELS[rec.operasyon]} — ${escapeHtml(rec.urun)}</h3>
      <button class="btn btn-sm btn-ghost" onclick="FIRSTOFF_EDIT=null; renderModule();">← Listeye Dön</button>
    </div>
    <div class="panel-body">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <div class="field" style="margin:0;"><label>Kontrol Saati</label><input id="fo-kontrolSaati" type="time" value="${rec.kontrolSaati||''}"></div>
        <div class="field" style="margin:0;"><label>Operatör</label><input id="fo-operator" value="${escapeHtml(rec.operator||'')}"></div>
        <div class="field" style="margin:0;"><label>İş Emri No</label><input id="fo-isEmriNo" value="${escapeHtml(rec.isEmriNo||'')}"></div>
        <div class="field" style="margin:0;"><label>Numune Adedi</label><input id="fo-numuneAdedi" type="number" value="${rec.numuneAdedi||6}"></div>
      </div>

      <div class="field">
        <label>First Off Gerekçesi</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;margin-top:6px;">
          ${GEREKCE_LISTESI.map((g,i)=>`
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:400;text-transform:none;padding:7px 10px;border:1px solid var(--line);border-radius:3px;cursor:pointer;background:var(--surface-2);">
              <input type="checkbox" id="fo-gerekce-${i}" ${(rec.gerekce||[]).includes(g)?'checked':''}> ${escapeHtml(g)}
            </label>
          `).join('')}
        </div>
      </div>

      <div style="margin-top:18px;">
        <h5 style="margin:0 0 8px;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);">İlk 6 Parça Ölçümü</h5>
        <div class="table-wrap"><table>
          <thead><tr><th style="min-width:190px;">Kontrol Maddesi</th><th style="min-width:110px;">Tolerans</th>${[1,2,3,4,5,6].map(i=>`<th>${i}</th>`).join('')}<th>Sonuç</th></tr></thead>
          <tbody>
            ${noktalar.map(n=>{
              const vals = rec.degerler?.[n.id] || [];
              let failCount=0, filledCount=0;
              for(let i=0;i<6;i++){
                const v = vals[i];
                if(v!==undefined && v!==null && v!==''){
                  filledCount++;
                  if(n.tip==='olcusel'){ if(!(v>=n.altLimit && v<=n.ustLimit)) failCount++; }
                  else if(v==='Uygun Değil') failCount++;
                }
              }
              return `<tr>
                <td>${n.no}. ${escapeHtml(n.karakteristik)}</td>
                <td class="mono field-hint">${n.tip==='olcusel' ? `${n.altLimit}–${n.ustLimit} ${n.birim}` : 'OK/NOK'}</td>
                ${[0,1,2,3,4,5].map(i=>{
                  const v = vals[i];
                  if(n.tip==='olcusel'){
                    return `<td><input type="number" step="any" class="mono fo-input" data-nokta="${n.id}" data-idx="${i}" data-tip="olcusel"
                      style="width:62px;padding:4px 5px;border:1px solid var(--line-strong);border-radius:3px;font-size:12px;" value="${v??''}"></td>`;
                  }
                  return `<td><select class="fo-input" data-nokta="${n.id}" data-idx="${i}" data-tip="nitel" style="width:64px;padding:4px 2px;border:1px solid var(--line-strong);border-radius:3px;font-size:11px;">
                    <option value="" ${!v?'selected':''}>—</option>
                    <option value="Uygun" ${v==='Uygun'?'selected':''}>OK</option>
                    <option value="Uygun Değil" ${v==='Uygun Değil'?'selected':''}>NOK</option>
                  </select></td>`;
                }).join('')}
                <td>${filledCount===0?'<span class="badge badge-neutral">—</span>':failCount>0?`<span class="badge badge-flag">${failCount} uygunsuz</span>`:'<span class="badge badge-good">Uygun</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="field" style="margin-top:16px;"><label>Not</label><textarea id="fo-not">${escapeHtml(rec.not||'')}</textarea></div>

      <div style="display:flex;gap:8px;margin-top:18px;">
        <button class="btn btn-primary" onclick="kaydetFirstOff(${id?`'${id}'`:'null'})">Kaydet</button>
        <button class="btn btn-ghost" onclick="FIRSTOFF_EDIT=null; renderModule();">İptal</button>
      </div>
      <div class="field-hint" style="margin-top:8px;">İlk Parça Kararı elle seçilmez — girilen ölçümlere göre otomatik hesaplanır (herhangi bir numune tolerans dışıysa "Uygun Değil" olur).</div>
    </div>
  </div>`;
}

function firstOffGenelKarariHesapla(urun, operasyon, degerler){
  const noktalar = firstOffNoktaListesi(urun, operasyon);
  let herhangiGirildi = false, herhangiUygunsuz = false;
  noktalar.forEach(n=>{
    const vals = degerler[n.id] || [];
    for(let i=0;i<6;i++){
      const v = vals[i];
      if(v===undefined || v===null || v==='') continue;
      herhangiGirildi = true;
      if(n.tip==='olcusel'){ if(!(v>=n.altLimit && v<=n.ustLimit)) herhangiUygunsuz = true; }
      else if(v==='Uygun Değil'){ herhangiUygunsuz = true; }
    }
  });
  if(!herhangiGirildi) return '';
  return herhangiUygunsuz ? 'Uygun Değil' : 'Uygun';
}

async function kaydetFirstOff(id){
  const rec = id ? DB.firstOffKayitlari.find(x=>x.id===id) : {urun: GUNLUK_URUN, operasyon: GUNLUK_OP};
  const noktalar = firstOffNoktaListesi(rec.urun, rec.operasyon);
  const gerekce = GEREKCE_LISTESI.filter((g,i)=>document.getElementById('fo-gerekce-'+i)?.checked);
  const degerler = {};
  document.querySelectorAll('.fo-input').forEach(el=>{
    const noktaId = el.getAttribute('data-nokta');
    const idx = parseInt(el.getAttribute('data-idx'),10);
    if(!degerler[noktaId]) degerler[noktaId] = [];
    if(el.getAttribute('data-tip')==='olcusel'){
      degerler[noktaId][idx] = el.value===''? null : parseFloat(el.value);
    } else {
      degerler[noktaId][idx] = el.value || null;
    }
  });
  const data = {
    urun: rec.urun, operasyon: rec.operasyon, tarih: GUNLUK_TARIH, vardiya: SELECTED_VARDIYA,
    operator: val('fo-operator'), isEmriNo: val('fo-isEmriNo'), numuneAdedi: val('fo-numuneAdedi'),
    kontrolSaati: val('fo-kontrolSaati'), gerekce, degerler, not: val('fo-not'),
    genelKarar: firstOffGenelKarariHesapla(rec.urun, rec.operasyon, degerler)
  };
  if(id){ Object.assign(DB.firstOffKayitlari.find(x=>x.id===id), data); }
  else { DB.firstOffKayitlari.push({id:uid(), ...data}); }
  await persist('firstOffKayitlari');
  showToast('First Off kaydı kaydedildi');
  FIRSTOFF_EDIT = null;
  renderModule();
}
async function deleteFirstOff(id){
  if(!confirm('Bu First Off kaydını silmek istediğinize emin misiniz?')) return;
  DB.firstOffKayitlari = DB.firstOffKayitlari.filter(x=>x.id!==id);
  await persist('firstOffKayitlari');
  showToast('Kayıt silindi');
  renderModule();
}

/* ---------------- Saatlik Kontrol tab ---------------- */
function saatlikKaydiBul(saat, operasyon){
  operasyon = operasyon || GUNLUK_OP;
  return DB.saatlikKayitlari.find(k=>k.urun===GUNLUK_URUN && k.operasyon===operasyon && k.tarih===GUNLUK_TARIH && k.vardiya===SELECTED_VARDIYA && k.saat===saat) || null;
}
const GORSEL_FORM_URUNLERI = ['221170','221171','221172','221173'];
function viewSaatlikTab(){
  if(GORSEL_FORM_URUNLERI.includes(GUNLUK_URUN)){
    return `
    <div class="tab-strip" style="margin-top:-4px;">
      <div class="tab-btn ${GUNLUK_SAATLIK_GORUNUM==='tablo'?'active':''}" onclick="GUNLUK_SAATLIK_GORUNUM='tablo'; renderModule();">Tablo</div>
      <div class="tab-btn ${GUNLUK_SAATLIK_GORUNUM==='gorsel'?'active':''}" onclick="GUNLUK_SAATLIK_GORUNUM='gorsel'; renderModule();">Görsel Form</div>
    </div>
    ${GUNLUK_SAATLIK_GORUNUM==='gorsel' ? viewGorselForm() : viewSaatlikTabloTab()}`;
  }
  return viewSaatlikTabloTab();
}
function aktifIsMerkezi(urun, operasyon){
  const aktif = DB.routes.find(r=>r.urun===urun && r.operasyon===operasyon && r.aktif);
  if(aktif) return aktif.isMerkezi;
  const herhangi = DB.routes.find(r=>r.urun===urun && r.operasyon===operasyon);
  return herhangi ? herhangi.isMerkezi : null;
}
function viewSaatlikTabloTab(){
  const noktalar = saatlikNoktaListesi(GUNLUK_URUN, GUNLUK_OP);
  const makina = aktifIsMerkezi(GUNLUK_URUN, GUNLUK_OP);
  return `
  <div class="panel">
    <div class="panel-head"><h3>${GUNLUK_OP_LABELS[GUNLUK_OP]} — ${GUNLUK_URUN} — ${fmtDate(GUNLUK_TARIH)} — Vardiya ${SELECTED_VARDIYA}</h3></div>
    <div class="panel-body" style="display:flex;flex-direction:column;gap:20px;">
      ${SAATLER.map(saat=>{
        const kayit = saatlikKaydiBul(saat);
        return `
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--line);">
            <span style="font-family:var(--font-display);font-weight:600;font-size:13.5px;">${saat}</span>
            <input placeholder="Personel adı" value="${escapeHtml(kayit?.personel||'')}" ${canEdit()?'':'disabled'}
              style="width:150px;padding:5px 8px;border:1px solid var(--line-strong);border-radius:3px;font-size:12.5px;"
              onchange="saatlikMetaGuncelle('${saat}','personel',this.value)">
            <span class="badge badge-neutral" title="Rotalar modülündeki aktif iş merkezi">
              ${makina ? escapeHtml(makina) : 'Rotada aktif iş merkezi tanımlı değil'}
            </span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Ölçüm Yeri</th><th>Nominal</th>${[1,2,3,4,5,6].map(i=>`<th>${i}</th>`).join('')}<th>Sonuç</th></tr></thead>
            <tbody>
              ${noktalar.map(n=>{
                const vals = kayit?.degerler?.[n.id] || [];
                let failCount = 0, filledCount = 0;
                for(let i=0;i<6;i++){
                  const v = vals[i];
                  if(v!==undefined && v!==null && v!==''){
                    filledCount++;
                    if(n.tip==='olcusel'){ if(!(v>=n.altLimit && v<=n.ustLimit)) failCount++; }
                    else if(v==='Uygun Değil') failCount++;
                  }
                }
                return `<tr>
                  <td style="min-width:160px;">${escapeHtml(n.olcumYeri)}</td>
                  <td class="mono field-hint">${n.tip==='olcusel' ? `${n.altLimit}-${n.ustLimit}` : 'OK/NOK'}</td>
                  ${[0,1,2,3,4,5].map(i=>{
                    const v = vals[i];
                    if(n.tip==='olcusel'){
                      return `<td><input type="number" step="any" class="mono" style="width:62px;padding:4px 5px;border:1px solid var(--line-strong);border-radius:3px;font-size:12px;"
                        value="${v??''}" ${canEdit()?'':'disabled'} onchange="saatlikDegerGuncelle('${saat}','${n.id}',${i},this.value)"></td>`;
                    } else {
                      return `<td><select style="width:64px;padding:4px 2px;border:1px solid var(--line-strong);border-radius:3px;font-size:11px;" ${canEdit()?'':'disabled'} onchange="saatlikDegerGuncelle('${saat}','${n.id}',${i},this.value)">
                        <option value="" ${!v?'selected':''}>—</option>
                        <option value="Uygun" ${v==='Uygun'?'selected':''}>OK</option>
                        <option value="Uygun Değil" ${v==='Uygun Değil'?'selected':''}>NOK</option>
                      </select></td>`;
                    }
                  }).join('')}
                  <td>${filledCount===0?'<span class="badge badge-neutral">—</span>':failCount>0?`<span class="badge badge-flag">${failCount} uygunsuz</span>`:'<span class="badge badge-good">Uygun</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
async function saatlikMetaGuncelle(saat, field, value, operasyon){
  operasyon = operasyon || GUNLUK_OP;
  let kayit = saatlikKaydiBul(saat, operasyon);
  if(!kayit){
    kayit = {id:uid(), urun:GUNLUK_URUN, operasyon, tarih:GUNLUK_TARIH, vardiya:SELECTED_VARDIYA, saat, personel:'', makina:'', uretimAdedi:'', degerler:{}};
    DB.saatlikKayitlari.push(kayit);
  }
  kayit[field] = value;
  await persist('saatlikKayitlari');
}
async function saatlikDegerGuncelle(saat, noktaId, sampleIdx, value, operasyonOverride){
  const nokta = DB.saatlikNoktalari.find(n=>n.id===noktaId);
  const operasyon = operasyonOverride || nokta.operasyon;
  let kayit = saatlikKaydiBul(saat, operasyon);
  if(!kayit){
    kayit = {id:uid(), urun:GUNLUK_URUN, operasyon, tarih:GUNLUK_TARIH, vardiya:SELECTED_VARDIYA, saat, personel:'', makina:'', uretimAdedi:'', degerler:{}};
    DB.saatlikKayitlari.push(kayit);
  }
  if(!kayit.degerler[noktaId]) kayit.degerler[noktaId] = [];
  if(nokta.tip==='olcusel'){
    kayit.degerler[noktaId][sampleIdx] = value===''? null : parseFloat(value);
  } else {
    kayit.degerler[noktaId][sampleIdx] = value || null;
  }
  await persist('saatlikKayitlari');
  renderModule();
}

/* ---------------- Günlük Özet — o gün fiilen kontrol edilen ürün/operasyonlar ---------------- */
function viewGunlukOzet(){
  const tarih = GUNLUK_TARIH;
  const urunler = gunlukUrunler();

  const satirlar = [];
  urunler.forEach(urun=>{
    GUNLUK_OPS.forEach(op=>{
      const foKayitlari = DB.firstOffKayitlari.filter(k=>k.urun===urun && k.operasyon===op && k.tarih===tarih);
      const saatlikKayitlari = DB.saatlikKayitlari.filter(k=>k.urun===urun && k.operasyon===op && k.tarih===tarih);
      const dolulSaatler = SAATLER.filter(s=>{
        const k = saatlikKayitlari.find(x=>x.saat===s);
        return k && k.degerler && Object.values(k.degerler).some(arr=>(arr||[]).some(v=>v!==null && v!==undefined && v!==''));
      });
      if(foKayitlari.length===0 && dolulSaatler.length===0) return; // o gün bu kombinasyonda hiç kayıt yok, gösterme

      // First Off karar dağılımı
      const foUygun = foKayitlari.filter(k=>k.genelKarar==='Uygun').length;
      const foUygunDegil = foKayitlari.filter(k=>k.genelKarar==='Uygun Değil').length;

      // Saatlik uygunsuz sayım
      let saatlikOlcum=0, saatlikUygunsuz=0;
      saatlikKayitlari.forEach(k=>{
        Object.entries(k.degerler||{}).forEach(([noktaId,arr])=>{
          const nokta = DB.saatlikNoktalari.find(n=>n.id===noktaId);
          (arr||[]).forEach(v=>{
            if(v===null||v===undefined||v==='') return;
            saatlikOlcum++;
            if(nokta){
              if(nokta.tip==='olcusel'){ if(!(v>=nokta.altLimit && v<=nokta.ustLimit)) saatlikUygunsuz++; }
              else if(v==='Uygun Değil') saatlikUygunsuz++;
            }
          });
        });
      });

      satirlar.push({urun, op, foKayitlari, foUygun, foUygunDegil, dolulSaatler, saatlikOlcum, saatlikUygunsuz});
    });
  });

  const girisKayitlari = DB.girisKaliteKontrolleri.filter(k=>k.kontrolTarihi===tarih);
  const tedarikciGruplari = {};
  girisKayitlari.forEach(k=>{
    const key = k.tedarikci || 'Tedarikçi belirtilmemiş';
    (tedarikciGruplari[key]=tedarikciGruplari[key]||[]).push(k);
  });

  if(satirlar.length===0 && girisKayitlari.length===0){
    return emptyState('Bu tarihte kayıt yok', `${fmtDate(tarih)} tarihinde First Off, saatlik kontrol veya giriş kalite kontrolü girilmemiş.`, null, null);
  }

  // ürüne göre grupla
  const urunGruplari = {};
  satirlar.forEach(s=>{ (urunGruplari[s.urun]=urunGruplari[s.urun]||[]).push(s); });

  return `
  <div style="font-family:var(--font-display);font-weight:600;font-size:16px;margin-bottom:14px;">${fmtDate(tarih)} — Günlük Kontrol Özeti</div>

  ${satirlar.length ? `
  <div style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:8px;">Üretim Prosesleri — First Off &amp; Saatlik Kontrol · ${Object.keys(urunGruplari).length} ürün, ${satirlar.length} operasyon</div>
  <div class="panel">
    <div class="panel-body" style="display:flex;flex-direction:column;gap:18px;">
      ${Object.entries(urunGruplari).map(([urun, rows])=>`
        <div>
          <div style="font-family:var(--font-display);font-weight:600;font-size:14px;margin-bottom:8px;">
            ${escapeHtml(urun)} <span style="font-weight:400;color:var(--ink-soft);font-size:12.5px;">— ${escapeHtml(DB.routes.find(r=>r.urun===urun)?.urunAdi||'')}</span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Operasyon</th><th>First Off</th><th>Saatlik Dilimler</th><th>Saatlik Ölçüm</th></tr></thead>
            <tbody>
              ${rows.map(r=>`
                <tr>
                  <td><b>${GUNLUK_OP_LABELS[r.op]}</b></td>
                  <td>
                    ${r.foKayitlari.length===0 ? '<span class="badge badge-neutral">Girilmedi</span>' : `
                      <span class="badge badge-neutral">${r.foKayitlari.length} kayıt</span>
                      ${r.foUygun ? `<span class="badge badge-good">${r.foUygun} uygun</span>` : ''}
                      ${r.foUygunDegil ? `<span class="badge badge-flag">${r.foUygunDegil} uygun değil</span>` : ''}
                      <button class="btn btn-sm btn-ghost" style="margin-left:6px;" onclick="GUNLUK_URUN='${r.urun}'; GUNLUK_OP='${r.op}'; GUNLUK_TAB='firstoff'; FIRSTOFF_EDIT=null; renderModule();">Detaya Git</button>
                    `}
                  </td>
                  <td>
                    ${SAATLER.map(s=>`<span class="badge ${r.dolulSaatler.includes(s)?'badge-good':'badge-neutral'}" style="margin-right:3px;">${s}</span>`).join('')}
                  </td>
                  <td>
                    ${r.saatlikOlcum===0 ? '<span class="field-hint">—</span>' : `
                      <span class="mono">${r.saatlikOlcum} ölçüm</span>
                      ${r.saatlikUygunsuz ? `<span class="badge badge-flag" style="margin-left:6px;">${r.saatlikUygunsuz} uygunsuz</span>` : '<span class="badge badge-good" style="margin-left:6px;">tümü uygun</span>'}
                      <button class="btn btn-sm btn-ghost" style="margin-left:6px;" onclick="GUNLUK_URUN='${r.urun}'; GUNLUK_OP='${r.op}'; GUNLUK_TAB='saatlik'; GUNLUK_SAATLIK_GORUNUM='tablo'; renderModule();">Detaya Git</button>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        </div>
      `).join('')}
    </div>
  </div>` : ''}

  ${girisKayitlari.length ? `
  <div style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin:20px 0 8px;">Giriş Kalite Kontrol — ${Object.keys(tedarikciGruplari).length} tedarikçi, ${girisKayitlari.length} kayıt</div>
  <div class="panel">
    <div class="panel-body" style="display:flex;flex-direction:column;gap:18px;">
      ${Object.entries(tedarikciGruplari).map(([tedarikci, kayitlar])=>`
        <div>
          <div style="font-family:var(--font-display);font-weight:600;font-size:14px;margin-bottom:8px;">${escapeHtml(tedarikci)}</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Malzeme</th><th>Gözlem Nedeni</th><th>Gelen Adet</th><th>Numune</th><th>Sonuç</th><th></th></tr></thead>
            <tbody>
              ${kayitlar.map(k=>`
                <tr>
                  <td><b>${escapeHtml(k.malzeme||'')}</b>${k.cizimNo?`<div class="field-hint mono">${escapeHtml(k.cizimNo)}</div>`:''}</td>
                  <td style="font-size:12px;">${escapeHtml(k.gozlemNedeni||'')}</td>
                  <td class="mono">${k.gelenAdet} ${escapeHtml(girisKaliteBirim(k))}</td>
                  <td class="mono">${k.ornekAdedi}</td>
                  <td>${k.genelSonuc==='Kabul'?'<span class="badge badge-good">Kabul</span>':k.genelSonuc==='Red'?'<span class="badge badge-flag">Red</span>':'<span class="badge badge-neutral">—</span>'}</td>
                  <td><button class="btn btn-sm btn-ghost" onclick="GUNLUK_TAB='girisKontrol'; GIRISKALITE_EDIT='${k.id}'; renderModule();">Detaya Git</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        </div>
      `).join('')}
    </div>
  </div>` : ''}
  `;
}

/* =======================================================================
   GİRİŞ KALİTE KONTROL — FR-08/FR-09'a dayalı. Hammadde ya da fason yarı
   mamül girişlerinde, gelen adede göre FR-09 örnekleme tablosundan numune
   sayısı otomatik hesaplanır; karakteristikler BOM'dan önerilir.
   ======================================================================= */
const FR09_ORNEKLEME_TABLOSU = [
  {min:3,    max:50,     adet:3},
  {min:51,   max:250,    adet:7},
  {min:251,  max:1000,   adet:10},
  {min:1001, max:5000,   adet:12},
  {min:5001, max:10000,  adet:15},
  {min:10001,max:35000,  adet:20},
  {min:35001,max:100000, adet:25},
];
function fr09OrnekAdedi(gelenAdet){
  gelenAdet = parseFloat(gelenAdet)||0;
  if(gelenAdet<=0) return 0;
  if(gelenAdet<3) return gelenAdet;
  const bulunan = FR09_ORNEKLEME_TABLOSU.find(r=>gelenAdet>=r.min && gelenAdet<=r.max);
  return bulunan ? bulunan.adet : 25;
}
let GIRISKALITE_EDIT = null; // null | 'new' | kayıt id

function viewGirisKaliteTab(){
  if(GIRISKALITE_EDIT!==null) return viewGirisKaliteEdit();

  let list = [...DB.girisKaliteKontrolleri];
  list.sort((a,b)=> (parseDate(b.kontrolTarihi)||0) - (parseDate(a.kontrolTarihi)||0));

  return `
  <div class="panel">
    <div class="panel-head">
      <h3>Giriş Kalite Kontrol</h3>
      ${canEdit() ? `<button class="btn btn-primary btn-sm" onclick="GIRISKALITE_EDIT='new'; renderModule();">+ Yeni Giriş Kalite Kontrolü</button>` : ''}
    </div>
    <div class="panel-body">
      ${list.length===0 ? `<div class="field-hint">Henüz giriş kalite kontrolü yapılmamış. Hammadde ya da fason yarı mamül geldiğinde buradan veya Satınalma Girişleri'nden başlatabilirsiniz.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Tarih</th><th>Tedarikçi</th><th>Malzeme</th><th>Gözlem Nedeni</th><th>Gelen Adet</th><th>Numune</th><th>Sonuç</th><th></th></tr></thead>
        <tbody>
          ${list.map(k=>`
            <tr>
              <td class="mono">${fmtDate(k.kontrolTarihi)}</td>
              <td>${escapeHtml(k.tedarikci||'—')}</td>
              <td><b>${escapeHtml(k.malzeme||'')}</b>${k.cizimNo?`<div class="field-hint mono">${escapeHtml(k.cizimNo)}</div>`:''}</td>
              <td style="font-size:12px;">${escapeHtml(k.gozlemNedeni||'')}</td>
              <td class="mono">${k.gelenAdet} ${escapeHtml(girisKaliteBirim(k))}</td>
              <td class="mono">${k.ornekAdedi}</td>
              <td>${k.genelSonuc==='Kabul'?'<span class="badge badge-good">Kabul</span>':k.genelSonuc==='Red'?'<span class="badge badge-flag">Red</span>':'<span class="badge badge-neutral">—</span>'}</td>
              <td>${actionsCell(`<button class="btn btn-sm btn-ghost" onclick="GIRISKALITE_EDIT='${k.id}'; renderModule();">Düzenle</button><button class="btn btn-sm btn-danger" onclick="deleteGirisKalite('${k.id}')">Sil</button>`)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`}
    </div>
  </div>`;
}

function girisKaliteBomOner(malzemeKoduVeyaUrun){
  const bom = DB.urunAgaclari.find(b=>b.malzemeKodu===malzemeKoduVeyaUrun || b.urun===malzemeKoduVeyaUrun);
  if(!bom) return [];
  const tol = 0.1; // BOM'da ayrı tolerans yok; Kesim kontrol planındaki tipik değer kullanılır, gerekirse elle düzeltilir
  return [
    {no:1, tanim:'Dış Çap', olcu:`${bom.disCap} ±${tol} mm`, tip:'olcusel', nominal:bom.disCap, altLimit:bom.disCap-tol, ustLimit:bom.disCap+tol, birim:'mm', degerler:[]},
    {no:2, tanim:'İç Çap', olcu:`${bom.icCap} ±${tol} mm`, tip:'olcusel', nominal:bom.icCap, altLimit:bom.icCap-tol, ustLimit:bom.icCap+tol, birim:'mm', degerler:[]},
    {no:3, tanim:'Görsel Kontrol (yüzey, çapak, hasar)', olcu:'OK/NOK', tip:'nitel', degerler:[]},
  ];
}

function viewGirisKaliteEdit(){
  const id = GIRISKALITE_EDIT==='new' ? null : GIRISKALITE_EDIT;
  const rec = id ? DB.girisKaliteKontrolleri.find(x=>x.id===id) : {
    satinalmaGirisIdleri: GIRISKALITE_PREFILL?.satinalmaGirisIdleri || [],
    tedarikci: GIRISKALITE_PREFILL?.tedarikci || '', malzeme: GIRISKALITE_PREFILL?.malzeme || '',
    urun: GIRISKALITE_PREFILL?.urun || '', cizimNo: '', issue: '',
    gelenAdet: GIRISKALITE_PREFILL?.gelenAdet || '', malzemeGelisTarihi: GIRISKALITE_PREFILL?.malzemeGelisTarihi || new Date().toISOString().slice(0,10),
    kontrolTarihi: toLocalISODate(new Date()), ilaveBilgi: '', gozlemNedeni: 'Gelen Malzeme Kontrolü',
    kontrolEden: CURRENT_USER?.displayName||'', karakteristikler: [], genelSonuc: ''
  };
  GIRISKALITE_PREFILL = null;
  const ornekAdedi = fr09OrnekAdedi(rec.gelenAdet);
  const karakteristikler = rec.karakteristikler && rec.karakteristikler.length ? rec.karakteristikler : [];

  return `
  <div class="panel">
    <div class="panel-head">
      <h3>${id?'Giriş Kalite Kontrolünü Düzenle':'Yeni Giriş Kalite Kontrolü'}</h3>
      <button class="btn btn-sm btn-ghost" onclick="GIRISKALITE_EDIT=null; renderModule();">← Listeye Dön</button>
    </div>
    <div class="panel-body">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
        <div class="field" style="margin:0;"><label>Tedarikçi</label><input id="gk-tedarikci" value="${escapeHtml(rec.tedarikci||'')}"></div>
        <div class="field" style="margin:0;"><label>Malzeme</label><input id="gk-malzeme" list="gk-malzeme-opts" value="${escapeHtml(rec.malzeme||rec.urun||'')}" onchange="girisKaliteMalzemeSecildi()"></div>
        <div class="field" style="margin:0;"><label>Çizim No</label><input id="gk-cizimNo" value="${escapeHtml(rec.cizimNo||'')}"></div>
        <datalist id="gk-malzeme-opts">${DB.urunAgaclari.map(b=>`<option value="${escapeHtml(b.malzemeKodu)}">${escapeHtml(b.malzemeAciklama)}</option>`).join('')}</datalist>
        <div class="field" style="margin:0;"><label>Gözlemleme Nedeni</label>
          <select id="gk-gozlemNedeni">
            <option ${rec.gozlemNedeni==='Gelen Malzeme Kontrolü'?'selected':''}>Gelen Malzeme Kontrolü</option>
            <option ${rec.gozlemNedeni==='Fason Yarı Mamül Kontrolü'?'selected':''}>Fason Yarı Mamül Kontrolü</option>
          </select>
        </div>
        <div class="field" style="margin:0;"><label>Malzeme Geliş Tarihi</label><input id="gk-gelisTarihi" type="date" value="${rec.malzemeGelisTarihi||''}"></div>
        <div class="field" style="margin:0;"><label>Kontrol Tarihi</label><input id="gk-kontrolTarihi" type="date" value="${rec.kontrolTarihi||''}"></div>
        <div class="field" style="margin:0;"><label>Gelen Adet</label><input id="gk-gelenAdet" type="number" value="${rec.gelenAdet||''}" oninput="girisKaliteOrnekGuncelle()"></div>
        <div class="field" style="margin:0;"><label>Kontrol Eden</label><input id="gk-kontrolEden" value="${escapeHtml(rec.kontrolEden||'')}"></div>
      </div>
      <div class="field"><label>İlave Bilgi</label><input id="gk-ilaveBilgi" value="${escapeHtml(rec.ilaveBilgi||'')}"></div>

      <div class="field">
        <label>Bu Kontrole Dahil Satınalma Girişleri</label>
        <div class="field-hint" style="margin-bottom:6px;">Aynı malzemeden birden fazla satınalma siparişine bağlı giriş varsa (örn. farklı üretim siparişleri için ayrı açılmış ama birlikte gelen malzeme), hepsini seçip TEK kontrolle onaylayabilirsiniz.</div>
        <div id="gk-girisler-listesi">${girisKaliteGirislerListesiHTML(rec.malzeme||rec.urun, id, id ? girisKaliteKapsananGirisIdleri(rec) : (rec.satinalmaGirisIdleri||[]))}</div>
      </div>

      <div id="gk-ornek-hint" class="field-hint" style="background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:8px 12px;margin:12px 0;">
        FR-09 örnekleme tablosuna göre bu miktar için <b>${ornekAdedi || '—'}</b> numune ölçülmeli.
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px;">
        <h5 style="margin:0;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);">Karakteristikler</h5>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-sm btn-ghost" onclick="girisKaliteBomOnerUygula()">BOM'dan Öner</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="girisKaliteSatirEkle()">+ Satır Ekle</button>
        </div>
      </div>
      <div id="gk-karakteristik-tablo" data-cache='${JSON.stringify(karakteristikler).replace(/'/g,"&#39;")}'>${girisKaliteKarakteristikTabloHTML(karakteristikler, ornekAdedi)}</div>

      <div style="display:flex;gap:8px;margin-top:18px;">
        <button class="btn btn-primary" onclick="kaydetGirisKalite(${id?`'${id}'`:'null'})">Kaydet</button>
        <button class="btn btn-ghost" onclick="GIRISKALITE_EDIT=null; renderModule();">İptal</button>
      </div>
      <div class="field-hint" style="margin-top:8px;">Kabul/Red elle seçilmez — girilen ölçümlere göre otomatik hesaplanır.</div>
    </div>
  </div>`;
}

function girisKaliteKarakteristikTabloHTML(karakteristikler, ornekAdedi){
  if(karakteristikler.length===0) return `<div class="field-hint">Henüz karakteristik eklenmedi. "BOM'dan Öner" veya "+ Satır Ekle" kullanın.</div>`;
  const kolonSayisi = Math.max(ornekAdedi||0, ...karakteristikler.map(k=>(k.degerler||[]).length));
  return `
  <div class="table-wrap"><table>
    <thead><tr><th>No</th><th style="min-width:170px;">Tanım</th><th style="min-width:110px;">Ölçü / Tolerans</th>${Array.from({length:kolonSayisi},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Kabul/Red</th><th></th></tr></thead>
    <tbody>
      ${karakteristikler.map((k,ri)=>{
        let failCount=0, filledCount=0;
        const parsedTol = k.tip==='olcusel' ? olcuMetniniAyristir(k.olcu) : null;
        const altLimit = parsedTol ? parsedTol.altLimit : k.altLimit;
        const ustLimit = parsedTol ? parsedTol.ustLimit : k.ustLimit;
        for(let i=0;i<kolonSayisi;i++){
          const v = (k.degerler||[])[i];
          if(v===undefined||v===null||v==='') continue;
          filledCount++;
          if(k.tip==='olcusel'){
            if(altLimit===null||altLimit===undefined||ustLimit===null||ustLimit===undefined||isNaN(altLimit)||isNaN(ustLimit)) failCount++;
            else if(!(v>=altLimit && v<=ustLimit)) failCount++;
          }
          else if(v==='Uygun Değil') failCount++;
        }
        return `<tr>
          <td class="mono">${k.no}</td>
          <td><input value="${escapeHtml(k.tanim||'')}" data-gk-satir="${ri}" data-gk-alan="tanim" style="width:100%;border:1px solid var(--line);border-radius:3px;padding:3px 5px;font-size:12px;"></td>
          <td><input value="${escapeHtml(k.olcu||'')}" data-gk-satir="${ri}" data-gk-alan="olcu" onchange="girisKaliteSatirYenile()" placeholder="örn. 695 ±0,4 mm" style="width:100%;border:1px solid var(--line);border-radius:3px;padding:3px 5px;font-size:11px;" class="mono"></td>
          ${Array.from({length:kolonSayisi},(_,i)=>{
            const v = (k.degerler||[])[i];
            if(k.tip==='olcusel'){
              return `<td><input type="number" step="any" class="mono gk-deger" data-satir="${ri}" data-idx="${i}" value="${v??''}" style="width:58px;padding:3px 4px;border:1px solid var(--line-strong);border-radius:3px;font-size:11.5px;"></td>`;
            }
            return `<td><select class="gk-deger" data-satir="${ri}" data-idx="${i}" style="width:60px;padding:3px 1px;border:1px solid var(--line-strong);border-radius:3px;font-size:10.5px;">
              <option value="" ${!v?'selected':''}>—</option>
              <option value="Uygun" ${v==='Uygun'?'selected':''}>OK</option>
              <option value="Uygun Değil" ${v==='Uygun Değil'?'selected':''}>NOK</option>
            </select></td>`;
          }).join('')}
          <td>${filledCount===0?'<span class="badge badge-neutral">—</span>':failCount>0?`<span class="badge badge-flag">${failCount} red</span>`:'<span class="badge badge-good">Kabul</span>'}</td>
          <td><button type="button" class="btn btn-sm btn-danger" onclick="girisKaliteSatirSil(${ri})">Sil</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

let GIRISKALITE_PREFILL = null;
function girisKaliteMevcutSatirlariOku(){
  const satirlar = [];
  document.querySelectorAll('[data-gk-satir]').forEach(el=>{
    const ri = parseInt(el.getAttribute('data-gk-satir'),10);
    if(!satirlar[ri]) satirlar[ri] = {};
    satirlar[ri][el.getAttribute('data-gk-alan')] = el.value;
  });
  document.querySelectorAll('.gk-deger').forEach(el=>{
    const ri = parseInt(el.getAttribute('data-satir'),10);
    const idx = parseInt(el.getAttribute('data-idx'),10);
    if(!satirlar[ri]) satirlar[ri] = {};
    if(!satirlar[ri].degerler) satirlar[ri].degerler = [];
    satirlar[ri].degerler[idx] = el.value;
  });
  return satirlar;
}
function girisKaliteGuncelKarakteristikler(){
  // DOM'dan mevcut karakteristikleri (tip/tolerans bilgisiyle birlikte) geri kur
  const mevcutEl = document.getElementById('gk-karakteristik-tablo');
  const cacheStr = mevcutEl?.getAttribute('data-cache');
  return cacheStr ? JSON.parse(cacheStr) : [];
}
function girisKaliteTabloYenile(karakteristikler){
  const ornekAdedi = fr09OrnekAdedi(val('gk-gelenAdet'));
  const el = document.getElementById('gk-karakteristik-tablo');
  el.innerHTML = girisKaliteKarakteristikTabloHTML(karakteristikler, ornekAdedi);
  el.setAttribute('data-cache', JSON.stringify(karakteristikler));
}
function girisKaliteSatirYenile(){
  const okunanlar = girisKaliteMevcutSatirlariOku();
  const cache = girisKaliteGuncelKarakteristikler();
  okunanlar.forEach((o,i)=>{ if(cache[i]) Object.assign(cache[i], o); });
  girisKaliteTabloYenile(cache);
}
function girisKaliteSatirEkle(){
  const okunanlar = girisKaliteMevcutSatirlariOku();
  const cache = girisKaliteGuncelKarakteristikler();
  okunanlar.forEach((o,i)=>{ if(cache[i]) Object.assign(cache[i], o); });
  cache.push({no: cache.length+1, tanim:'', olcu:'', tip:'olcusel', altLimit:null, ustLimit:null, degerler:[]});
  girisKaliteTabloYenile(cache);
}
function girisKaliteSatirSil(index){
  const okunanlar = girisKaliteMevcutSatirlariOku();
  const cache = girisKaliteGuncelKarakteristikler();
  okunanlar.forEach((o,i)=>{ if(cache[i]) Object.assign(cache[i], o); });
  cache.splice(index,1);
  cache.forEach((k,i)=>k.no=i+1);
  girisKaliteTabloYenile(cache);
}
function girisKaliteBomOnerUygula(){
  const malzeme = val('gk-malzeme');
  const onerilen = girisKaliteBomOner(malzeme);
  if(onerilen.length===0){ showToast('Bu malzeme için Ürün Ağaçları listesinde eşleşme bulunamadı', true); return; }
  girisKaliteTabloYenile(onerilen);
  showToast("BOM'dan karakteristikler önerildi — dilerseniz düzenleyin");
}
function girisKaliteOrnekGuncelle(){
  const hint = document.getElementById('gk-ornek-hint');
  const adet = fr09OrnekAdedi(val('gk-gelenAdet'));
  if(hint) hint.innerHTML = `FR-09 örnekleme tablosuna göre bu miktar için <b>${adet||'—'}</b> numune ölçülmeli.`;
  // mevcut satırları koruyarak tabloyu yeni kolon sayısına göre yeniden çiz
  const okunanlar = girisKaliteMevcutSatirlariOku();
  const cache = girisKaliteGuncelKarakteristikler();
  okunanlar.forEach((o,i)=>{ if(cache[i]) Object.assign(cache[i], o); });
  girisKaliteTabloYenile(cache);
}
function girisKaliteBekleyenGirisler(malzemeKoduVeyaUrun, mevcutGkId){
  if(!malzemeKoduVeyaUrun) return [];
  return DB.satinalmaGirisleri.filter(g=>{
    const istek = DB.satinalmaIstekleri.find(i=>i.id===g.satinalmaIstegiId);
    if(!istek || istek.urun!==malzemeKoduVeyaUrun) return false;
    if(girisKaliteDurumu(g.id)==='Bekliyor') return true;
    // zaten düzenlemekte olduğumuz kayda bağlıysa (onaylanmış/reddedilmiş olsa bile) yine göster
    const gk = DB.girisKaliteKontrolleri.find(k=>girisKaliteKapsananGirisIdleri(k).includes(g.id));
    return !!(gk && gk.id===mevcutGkId);
  });
}
function girisKaliteGirislerListesiHTML(malzemeKodu, mevcutGkId, secilenIdler){
  const adaylar = girisKaliteBekleyenGirisler(malzemeKodu, mevcutGkId);
  if(adaylar.length===0) return `<div class="field-hint">"${escapeHtml(malzemeKodu||'—')}" için bekleyen satınalma girişi bulunamadı.</div>`;
  return `
    <div style="display:flex;flex-direction:column;gap:5px;">
      ${adaylar.map(g=>{
        const istek = DB.satinalmaIstekleri.find(i=>i.id===g.satinalmaIstegiId);
        const order = istek?.orderId ? DB.orders.find(o=>o.id===istek.orderId) : null;
        return `<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:400;text-transform:none;padding:6px 8px;border:1px solid var(--line);border-radius:3px;background:var(--surface-2);">
          <input type="checkbox" class="gk-giris-secim" value="${g.id}" ${secilenIdler.includes(g.id)?'checked':''}>
          <span class="mono">${g.miktar} ${escapeHtml(istek?.birim||'')}</span>
          <span class="field-hint">${fmtDate(g.tarih)}</span>
          ${order?`<span class="badge badge-neutral">${escapeHtml(order.orderNo)}</span>`:''}
        </label>`;
      }).join('')}
    </div>
    <button type="button" class="btn btn-sm btn-ghost" style="margin-top:8px;" onclick="girisKaliteToplamiUygula()">Seçilenlerin Toplamını "Gelen Adet"e Uygula</button>
  `;
}
function girisKaliteToplamiUygula(){
  const secililer = [...document.querySelectorAll('.gk-giris-secim:checked')].map(el=>el.value);
  const toplam = secililer.reduce((s,gid)=>{
    const g = DB.satinalmaGirisleri.find(x=>x.id===gid);
    return s + (g?(parseFloat(g.miktar)||0):0);
  }, 0);
  document.getElementById('gk-gelenAdet').value = toplam;
  girisKaliteOrnekGuncelle();
}
function girisKaliteMalzemeSecildi(){
  // malzeme değişince otomatik BOM önerisi sun (sadece tablo boşsa)
  const cache = girisKaliteGuncelKarakteristikler();
  if(cache.length===0){
    const onerilen = girisKaliteBomOner(val('gk-malzeme'));
    if(onerilen.length) girisKaliteTabloYenile(onerilen);
  }
  const listesiEl = document.getElementById('gk-girisler-listesi');
  if(listesiEl){
    const oncekiSecim = [...document.querySelectorAll('.gk-giris-secim:checked')].map(el=>el.value);
    const mevcutGkId = GIRISKALITE_EDIT==='new' ? null : GIRISKALITE_EDIT;
    listesiEl.innerHTML = girisKaliteGirislerListesiHTML(val('gk-malzeme'), mevcutGkId, oncekiSecim);
  }
}

// "695 ±0,4 mm", "13.28 ± 0.1", "694.6-695.4" gibi serbest metin toleransları sayısal
// alt/üst limite çevirir — elle satır eklerken "Ölçü / Tolerans" kutusuna yazılan değer
// böylece gerçekten uygulanır, sadece görüntü metni olarak kalmaz.
function olcuMetniniAyristir(metin){
  if(!metin) return null;
  const temiz = String(metin).trim().replace(/,/g, '.');
  let m = temiz.match(/^(-?[\d.]+)\s*±\s*(-?[\d.]+)/);
  if(m){
    const nominal = parseFloat(m[1]), tol = Math.abs(parseFloat(m[2]));
    if(!isNaN(nominal) && !isNaN(tol)) return {nominal, altLimit: nominal-tol, ustLimit: nominal+tol};
  }
  m = temiz.match(/^(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)/);
  if(m){
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    if(!isNaN(a) && !isNaN(b)) return {nominal:(a+b)/2, altLimit: Math.min(a,b), ustLimit: Math.max(a,b)};
  }
  return null;
}
async function kaydetGirisKalite(id){
  const okunanlar = girisKaliteMevcutSatirlariOku();
  const cache = girisKaliteGuncelKarakteristikler();
  okunanlar.forEach((o,i)=>{ if(cache[i]) Object.assign(cache[i], o); });

  // Ölçüsel her satır için tolerans, "Ölçü / Tolerans" metninden yeniden ayrıştırılır —
  // BOM'dan önerilenlerde zaten tutarlı sonuç verir, elle girilenlerde ARTIK gerçekten uygulanır.
  cache.forEach(k=>{
    if(k.tip==='olcusel'){
      const ayristirilan = olcuMetniniAyristir(k.olcu);
      if(ayristirilan){ k.nominal = ayristirilan.nominal; k.altLimit = ayristirilan.altLimit; k.ustLimit = ayristirilan.ustLimit; }
    }
  });

  let herhangiGirildi=false, herhangiRed=false;
  cache.forEach(k=>{
    (k.degerler||[]).forEach(v=>{
      if(v===undefined||v===null||v==='') return;
      herhangiGirildi = true;
      if(k.tip==='olcusel'){
        if(k.altLimit===null||k.altLimit===undefined||k.ustLimit===null||k.ustLimit===undefined){ herhangiRed=true; }
        else if(!(parseFloat(v)>=k.altLimit && parseFloat(v)<=k.ustLimit)) herhangiRed=true;
      }
      else if(v==='Uygun Değil') herhangiRed=true;
    });
    (k.degerler||[]).forEach((v,i)=>{ if(k.tip==='olcusel' && v!==undefined && v!=='') k.degerler[i]=parseFloat(v); });
  });

  const data = {
    satinalmaGirisIdleri: [...document.querySelectorAll('.gk-giris-secim:checked')].map(el=>el.value),
    tedarikci: val('gk-tedarikci'), malzeme: val('gk-malzeme'), cizimNo: val('gk-cizimNo'),
    gozlemNedeni: val('gk-gozlemNedeni'), malzemeGelisTarihi: val('gk-gelisTarihi'), kontrolTarihi: val('gk-kontrolTarihi'),
    gelenAdet: parseFloat(val('gk-gelenAdet'))||0, ornekAdedi: fr09OrnekAdedi(val('gk-gelenAdet')),
    ilaveBilgi: val('gk-ilaveBilgi'), kontrolEden: val('gk-kontrolEden'),
    karakteristikler: cache, genelSonuc: herhangiGirildi ? (herhangiRed?'Red':'Kabul') : ''
  };
  if(!data.malzeme){ showToast('Malzeme zorunlu', true); return; }
  if(id){ Object.assign(DB.girisKaliteKontrolleri.find(x=>x.id===id), data); }
  else { DB.girisKaliteKontrolleri.push({id:uid(), ...data}); }
  await persist('girisKaliteKontrolleri');
  showToast('Giriş kalite kontrolü kaydedildi');
  GIRISKALITE_EDIT = null;
  renderModule();
}
async function deleteGirisKalite(id){
  if(!confirm('Bu giriş kalite kontrol kaydını silmek istediğinize emin misiniz?')) return;
  DB.girisKaliteKontrolleri = DB.girisKaliteKontrolleri.filter(x=>x.id!==id);
  await persist('girisKaliteKontrolleri');
  showToast('Kayıt silindi');
  renderModule();
}

let GUNLUK_SAATLIK_GORUNUM = 'tablo';
let GORSEL_SAAT = '10:30';
let GORSEL_NUMUNE = 1;

// "Toplam Boy Uzunluğu" (kablo pabucu boyu) ürüne göre değişir — FR-07 kontrol planındaki
// "Toplam boy uzunluğu" değerlerinden alındı.
const TOPLAM_BOY_DEGERLERI = {
  '221170': {nominal:88.5, altLimit:88.3, ustLimit:88.7},
  '221171': {nominal:99.5, altLimit:99.3, ustLimit:99.7},
  '221172': {nominal:105.0, altLimit:104.6, ustLimit:105.4},
  '221173': {nominal:76.0, altLimit:75.6, ustLimit:76.4}
};
// Saatlik Kesim Proses Kontrol Raporu dosyalarındaki "Kesim Boyu" değerleri 221170/171/172
// için hatalıydı (muhtemelen Presleme'nin toplam boy değeriyle karışmıştı). Doğrusu FR-07
// kontrol planındaki "Kesim boyu (uzunluk)" — burada düzeltiyoruz.
const KESIM_BOYU_DUZELTME = {
  '221170': {nominal:183.0, altLimit:182.6, ustLimit:183.4},
  '221171': {nominal:205.0, altLimit:204.6, ustLimit:205.4},
  '221172': {nominal:216.0, altLimit:215.6, ustLimit:216.4},
  '221173': {nominal:160.0, altLimit:159.6, ustLimit:160.4}
};
function fixKesimBoyuDegerleri(){
  let changed = false;
  Object.entries(KESIM_BOYU_DUZELTME).forEach(([urun,d])=>{
    const nokta = DB.saatlikNoktalari.find(n=>n.urun===urun && n.operasyon==='Cutting' && n.olcumYeri==='Kesim Boyu');
    if(nokta && (nokta.altLimit!==d.altLimit || nokta.ustLimit!==d.ustLimit || nokta.nominal!==d.nominal)){
      nokta.nominal = d.nominal; nokta.altLimit = d.altLimit; nokta.ustLimit = d.ustLimit;
      changed = true;
    }
  });
  return changed;
}

// 221172 "Markalama Çizgisi Boyu": Markalama operasyonunda presTEN ÖNCEki kontrol 44,6–45,4
// yerine 43,6–44,4 olmalı. Markalama sayfasındaki "Presten sonra markalama çizgisi boyu"
// VE Presleme operasyonundaki kontrol ise ikisi de presTEN SONRAki aynı ölçüm — 44,6–45,4
// olarak kalmalı (bir önceki düzeltmede "Presten sonra" olanı yanlışlıkla 43,6-44,4 yapmıştım).
// 221173 Presleme "Palm Uzunluğu" da 27,8–28,2 yerine 27,6–28,4 olmalı.
const FIRSTOFF_TOLERANS_DUZELTME = [
  {urun:'221172', operasyon:'Marking',  karakteristik:'Markalama Çizgisi Boyu', nominal:44.0, altLimit:43.6, ustLimit:44.4},
  {urun:'221172', operasyon:'Marking',  karakteristik:'Presten sonra markalama çizgisi boyu', nominal:45.0, altLimit:44.6, ustLimit:45.4},
  {urun:'221172', operasyon:'Pressing', karakteristik:'Markalama Çizgisi Boyu', nominal:45.0, altLimit:44.6, ustLimit:45.4},
  {urun:'221173', operasyon:'Pressing', karakteristik:'Palm Uzunluğu', nominal:28.0, altLimit:27.6, ustLimit:28.4},
];
function fixFirstOffToleranslari(){
  let changed = false;
  FIRSTOFF_TOLERANS_DUZELTME.forEach(d=>{
    const nokta = DB.firstOffNoktalari.find(n=>n.urun===d.urun && n.operasyon===d.operasyon && n.karakteristik===d.karakteristik);
    if(nokta && (nokta.altLimit!==d.altLimit || nokta.ustLimit!==d.ustLimit || nokta.nominal!==d.nominal)){
      nokta.nominal = d.nominal; nokta.altLimit = d.altLimit; nokta.ustLimit = d.ustLimit;
      changed = true;
    }
  });
  return changed;
}

// Konumlar çizimdeki çizgilerin gerçek yerlerine göre (yüzde, üstten/soldan).
// Değerler (nominal/tolerans) ürüne göre değişir, gorselNoktaBul() ile o an seçili
// üründeki gerçek karakteristiğe bağlanır.
const GORSEL_NOKTA_TANIMLARI = [
  {renk:'red',        renkKod:'#D6272C', olcumYeri:'İç Çap',                 operasyon:'Cutting',    tip:'olcusel', top:27,   left:6.5, ad:'İç Çap'},
  {renk:'navy',       renkKod:'#38318A', olcumYeri:'Dış Çap',                operasyon:'Cutting',    tip:'olcusel', top:27,   left:16,  ad:'Dış Çap'},
  {renk:'green',      renkKod:'#009845', olcumYeri:'Markalama Boyu(Oktan)',  operasyon:'Marking',    tip:'olcusel', top:16,   left:18.5,ad:'Markalama Boyu'},
  {renk:'yellow',     renkKod:'#C9A800', olcumYeri:'Basım Derinliği',        operasyon:'Pressing',   tip:'olcusel', top:11,   left:19.8,ad:'Derinlik Boyu'},
  {renk:'brown',      renkKod:'#7A5230', olcumYeri:'__TOPLAM_BOY__',         operasyon:'Pressing',   tip:'olcusel', top:42,   left:31,  ad:'Kablo Pabucu Boyu'},
  {renk:'magenta',    renkKod:'#E4098C', olcumYeri:'Pres Basım Uzunluğu',    operasyon:'Pressing',   tip:'olcusel', top:14,   left:43.3,ad:'Palm Uzunluğu'},
  {renk:'orange',     renkKod:'#EF7E1A', olcumYeri:'Pres Basım Kalınlık',    operasyon:'Pressing',   tip:'olcusel', top:39,   left:60.5,ad:'Palm Kalınlığı'},
  {renk:'pink',       renkKod:'#E85AA8', olcumYeri:'Pres Basım Genişlik',    operasyon:'Pressing',   tip:'olcusel', top:56.8, left:22.8,ad:'Palm Genişliği'},
  {renk:'lightgreen', renkKod:'#9FC02E', olcumYeri:'Kesim Boyu',             operasyon:'Cutting',    tip:'olcusel', top:48,   left:52,  ad:'Tam Kesim Boyu'},
  {renk:'neutral',    renkKod:'#4C5C71', olcumYeri:'Görsel Kontrol (Havşa)',                          operasyon:'Countersink', tip:'nitel', top:57,   left:76, ad:'Havşa Görsel'},
  {renk:'neutral',    renkKod:'#4C5C71', olcumYeri:'Görsel Kontrol(Çapak)',                           operasyon:'Countersink', tip:'nitel', top:68.7, left:74.5,ad:'Çapak Görsel'},
  {renk:'neutral',    renkKod:'#4C5C71', olcumYeri:'Görsel Kontrol (Sipariş No, VPCT, Okların okunaklığı)', operasyon:'Marking', tip:'nitel', top:80.7, left:96, ad:'Sip.No/VPCT/Oklar'}
];

function ensureGorselNoktalari(){
  // Presleme'de "Toplam Boy Uzunluğu" (kablo pabucu boyu) karşılığı yoktu — FR-07 kontrol
  // planındaki "Toplam boy uzunluğu" değerleriyle her ürün için ekliyoruz.
  let changed = false;
  GORSEL_FORM_URUNLERI.forEach(urun=>{
    const exists = DB.saatlikNoktalari.some(n=>n.urun===urun && n.operasyon==='Pressing' && n.olcumYeri==='Toplam Boy Uzunluğu');
    if(!exists){
      const d = TOPLAM_BOY_DEGERLERI[urun];
      DB.saatlikNoktalari.push({id:uid(), urun, operasyon:'Pressing', olcumYeri:'Toplam Boy Uzunluğu', tip:'olcusel', nominal:d.nominal, altLimit:d.altLimit, ustLimit:d.ustLimit, birim:'mm'});
      changed = true;
    }
  });
  if(fixKesimBoyuDegerleri()) changed = true;
  if(changed) persist('saatlikNoktalari');
}
function gorselNoktaBul(tanim){
  const olcumYeri = tanim.olcumYeri==='__TOPLAM_BOY__' ? 'Toplam Boy Uzunluğu' : tanim.olcumYeri;
  return DB.saatlikNoktalari.find(n=>n.urun===GUNLUK_URUN && n.operasyon===tanim.operasyon && n.olcumYeri===olcumYeri);
}
function fmtNoktaEtiket(nokta){
  const fmt = n => Number(n).toLocaleString('tr-TR', {maximumFractionDigits:2});
  const tol = (nokta.ustLimit - nokta.nominal);
  return `${fmt(nokta.nominal)} ±${fmt(tol)} mm`;
}
function viewGorselForm(){
  ensureGorselNoktalari();
  const b64 = document.getElementById('cizim-kablopapuc')?.textContent?.trim();

  return `
  <div class="panel">
    <div class="panel-head">
      <h3>${GUNLUK_URUN} — Görsel Ölçüm Formu</h3>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="field-hint">Saat:</span>
        <select onchange="GORSEL_SAAT=this.value; renderModule();" style="padding:5px 8px;border:1px solid var(--line-strong);border-radius:3px;font-size:12.5px;">
          ${SAATLER.map(s=>`<option value="${s}" ${s===GORSEL_SAAT?'selected':''}>${s}</option>`).join('')}
        </select>
        <span class="field-hint">Numune:</span>
        <select onchange="GORSEL_NUMUNE=parseInt(this.value); renderModule();" style="padding:5px 8px;border:1px solid var(--line-strong);border-radius:3px;font-size:12.5px;">
          ${[1,2,3,4,5,6].map(i=>`<option value="${i}" ${i===GORSEL_NUMUNE?'selected':''}>${i}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="panel-body">
      <div style="position:relative;width:100%;max-width:1000px;margin:0 auto;">
        <div style="position:relative;width:100%;padding-top:65.8%;">
          <img src="data:image/png;base64,${b64}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;border-radius:4px;">
          ${GORSEL_NOKTA_TANIMLARI.map(tanim=>{
            const nokta = gorselNoktaBul(tanim);
            if(!nokta) return '';
            const kayit = saatlikKaydiBul(GORSEL_SAAT, tanim.operasyon);
            const v = kayit?.degerler?.[nokta.id]?.[GORSEL_NUMUNE-1];
            const hasVal = v!==undefined && v!==null && v!=='';
            if(tanim.tip==='nitel'){
              const ok = hasVal && v==='Uygun';
              const bad = hasVal && v==='Uygun Değil';
              return `
              <div style="position:absolute;top:${tanim.top}%;left:${tanim.left}%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;z-index:5;">
                <select ${canEdit()?'':'disabled'}
                  style="width:70px;padding:3px 2px;text-align:center;font-size:11px;font-weight:600;border-radius:3px;
                    border:2px solid ${hasVal?(ok?'var(--good)':'var(--flag)'):tanim.renkKod}; background:${hasVal?(ok?'var(--good-soft)':'var(--flag-soft)'):'rgba(255,255,255,0.92)'};"
                  onchange="saatlikDegerGuncelle('${GORSEL_SAAT}','${nokta.id}',${GORSEL_NUMUNE-1},this.value,'${tanim.operasyon}')">
                  <option value="" ${!hasVal?'selected':''}>—</option>
                  <option value="Uygun" ${ok?'selected':''}>OK</option>
                  <option value="Uygun Değil" ${bad?'selected':''}>NOK</option>
                </select>
                <span style="font-size:9px;color:${tanim.renkKod};font-weight:700;background:rgba(255,255,255,0.85);padding:0 2px;border-radius:2px;white-space:nowrap;">${tanim.ad}</span>
              </div>`;
            }
            const ok = hasVal && v>=nokta.altLimit && v<=nokta.ustLimit;
            return `
            <div style="position:absolute;top:${tanim.top}%;left:${tanim.left}%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;z-index:5;">
              <input type="number" step="any" class="mono" ${canEdit()?'':'disabled'}
                style="width:62px;padding:3px 4px;text-align:center;font-size:12px;font-weight:600;border-radius:3px;
                  border:2px solid ${hasVal?(ok?'var(--good)':'var(--flag)'):tanim.renkKod}; background:${hasVal?(ok?'var(--good-soft)':'var(--flag-soft)'):'rgba(255,255,255,0.92)'};"
                value="${hasVal?v:''}"
                onchange="saatlikDegerGuncelle('${GORSEL_SAAT}','${nokta.id}',${GORSEL_NUMUNE-1},this.value,'${tanim.operasyon}')">
              <span style="font-size:9px;color:${tanim.renkKod};font-weight:700;background:rgba(255,255,255,0.85);padding:0 2px;border-radius:2px;white-space:nowrap;">${tanim.ad}: ${fmtNoktaEtiket(nokta)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="field-hint" style="margin-top:14px;text-align:center;">
        Kutu rengi, çizimdeki ilgili çizginin rengiyle eşleşir. Değer girildiğinde kutu, tolerans içindeyse yeşil, dışındaysa kırmızı olur.
        Bu form Kesim, Markalama ve Presleme operasyonlarının ilgili karakteristiklerine aynı anda yazar — "Tablo" görünümünde de aynı veriler görünür.
        Kutu konumu tam çizgiyle örtüşmüyorsa haber verin, ayarlayayım.
      </div>
    </div>
  </div>`;
}


/* =======================================================================
   Modal engine
   ======================================================================= */
function ensureModalRoot(){
  if(document.getElementById('modal-root')) return;
  const d = document.createElement('div');
  d.id = 'modal-root';
  d.className = 'modal-overlay';
  d.innerHTML = `<div class="modal">
    <div class="modal-head"><h3 id="modal-title"></h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">İptal</button>
      <button class="btn btn-primary" id="modal-save">Kaydet</button>
    </div>
  </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e=>{ if(e.target===d) closeModal(); });
}
function openModal(title, bodyHtml, onSave){
  ensureModalRoot();
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const saveBtn = document.getElementById('modal-save');
  const newBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newBtn, saveBtn);
  newBtn.addEventListener('click', async ()=>{
    newBtn.disabled = true;
    const ok = await onSave();
    newBtn.disabled = false;
    if(ok!==false) closeModal();
  });
  document.getElementById('modal-root').classList.add('open');
}
function closeModal(){
  const m = document.getElementById('modal-root');
  if(m) m.classList.remove('open');
}
function val(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }

/* ---------------- init ---------------- */
function init(){
  const saved = loadSession();
  if(saved && saved.token){
    SESSION_TOKEN = saved.token;
    CURRENT_USER = {role: saved.role, displayName: saved.displayName};
    boot();
  } else {
    showLoginScreen();
  }
}
init();

/* =======================================================================
   ROUTES module — read/manage product routing (Urun -> Operasyon -> Is Merkezi -> Sira)
   ======================================================================= */
function viewRoutes(){
  const products = [...new Set(DB.routes.map(r=>r.urun))].filter(Boolean).sort();
  if(products.length===0) return emptyState('Henüz rota tanımı yok', 'Yeni rota adımı ekleyin.', 'openRouteModal()', 'Yeni Rota Adımı');
  if(!SELECTED_URUN_ROUTE || !products.includes(SELECTED_URUN_ROUTE)) SELECTED_URUN_ROUTE = products[0];
  const filtered = SEARCH ? products.filter(p => p.includes(SEARCH) || (DB.routes.find(r=>r.urun===p)?.urunAdi||'').toLowerCase().includes(SEARCH.toLowerCase())) : products;

  const steps = DB.routes.filter(r=>r.urun===SELECTED_URUN_ROUTE).sort((a,b)=>a.sira-b.sira || a.isMerkezi.localeCompare(b.isMerkezi));
  const urunAdi = steps[0]?.urunAdi || '';
  const bySira = {};
  steps.forEach(s=>{ (bySira[s.sira]=bySira[s.sira]||[]).push(s); });

  return `
  <div class="part-picker">
    <div class="part-list">
      ${filtered.map(p=>{
        const pSteps = DB.routes.filter(r=>r.urun===p);
        const name = pSteps[0]?.urunAdi||'';
        const opCount = new Set(pSteps.map(s=>s.sira)).size;
        return `<div class="part-list-item ${p===SELECTED_URUN_ROUTE?'active':''}" onclick="selectRouteUrun('${p}')">
          <div class="pn">${escapeHtml(p)}</div>
          <div class="pmeta">${escapeHtml(name)}</div>
          <div class="pmeta">${opCount} operasyon adımı</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      <div class="panel">
        <div class="panel-head"><h3 class="mono">${escapeHtml(SELECTED_URUN_ROUTE)}</h3><span class="field-hint">${escapeHtml(urunAdi)}</span></div>
        <div class="panel-body">
          ${Object.keys(bySira).sort((a,b)=>a-b).map(sira=>{
            const group = bySira[sira];
            return `
            <div class="tl-step">
              <div class="tl-marker-col">
                <div class="tl-num">${sira}</div>
                <div class="tl-line"></div>
              </div>
              <div class="tl-content">
                <div class="tl-title-row"><span class="tl-title">${escapeHtml(group[0].operasyon)}</span></div>
                ${group.map(g=>`
                  <div style="display:flex;align-items:center;gap:8px;margin-top:5px;">
                    <span class="badge ${g.aktif?'badge-good':'badge-neutral'}">${g.aktif?'Aktif':'Alternatif'}</span>
                    <span style="font-size:13px;">${escapeHtml(g.isMerkezi)}</span>
                    <span class="row-actions" style="opacity:.6;">
                      ${canEdit() ? `
                      <button class="btn btn-sm btn-ghost" onclick="openRouteModal('${g.id}')">Düzenle</button>
                      <button class="btn btn-sm btn-danger" onclick="deleteRow('routes','${g.id}','Rota adımı')">Sil</button>
                      ` : ''}
                    </span>
                  </div>
                `).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="field-hint">Bir operasyonda birden fazla iş merkezi varsa, hangisinin "aktif" (kapasite hesabında kullanılacak) hat olduğunu <b>Kapasite Yönetimi</b> modülünden seçebilirsiniz.</div>
    </div>
  </div>`;
}
function selectRouteUrun(p){ SELECTED_URUN_ROUTE = p; renderModule(); }

function openRouteModal(id){
  const rec = id ? DB.routes.find(x=>x.id===id) : {urun: SELECTED_URUN_ROUTE||'', urunAdi:'', operasyon:'', isMerkezi:'', sira:'', aktif:true};
  const urunOptions = [...new Set(DB.routes.map(r=>r.urun))];
  openModal(`${id?'Rota Adımını Düzenle':'Yeni Rota Adımı'}`, `
    <div class="field-row">
      <div class="field"><label>Ürün Kodu</label><input id="f-urun" list="urun-opts" value="${escapeHtml(rec.urun)}"></div>
      <div class="field"><label>Ürün Adı</label><input id="f-urunAdi" value="${escapeHtml(rec.urunAdi)}"></div>
    </div>
    <datalist id="urun-opts">${urunOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Sıra No</label><input id="f-sira" type="number" value="${rec.sira}"></div>
      <div class="field"><label>Operasyon</label><input id="f-operasyon" value="${escapeHtml(rec.operasyon)}"></div>
    </div>
    <div class="field"><label>İş Merkezi</label><input id="f-isMerkezi" value="${escapeHtml(rec.isMerkezi)}"></div>
  `, async ()=>{
    const data = { urun: val('f-urun'), urunAdi: val('f-urunAdi'), operasyon: val('f-operasyon'), isMerkezi: val('f-isMerkezi'), sira: parseFloat(val('f-sira'))||0 };
    if(!data.urun || !data.operasyon || !data.isMerkezi){ showToast('Ürün, operasyon ve iş merkezi zorunlu', true); return false; }
    if(id){ Object.assign(DB.routes.find(x=>x.id===id), data); }
    else {
      // if this is the first step for this (urun,sira), mark it active by default
      const hasSiblings = DB.routes.some(r=>r.urun===data.urun && r.sira===data.sira);
      DB.routes.push({id:uid(), ...data, aktif: !hasSiblings});
    }
    await persist('routes');
    SELECTED_URUN_ROUTE = data.urun;
    showToast('Rota adımı kaydedildi');
    renderModule();
    return true;
  });
}

/* =======================================================================
   CAPACITY module — editable daily capacity, live cascading bottleneck calc
   ======================================================================= */
function getCapacity(urun, isMerkezi){
  return DB.capacity.find(c=>c.urun===urun && c.isMerkezi===isMerkezi) || null;
}
function productBottleneck(urun){
  const steps = DB.routes.filter(r=>r.urun===urun);
  const bySira = {};
  steps.forEach(s=>{ (bySira[s.sira]=bySira[s.sira]||[]).push(s); });
  let bottleneck = null;
  const missing = [];
  Object.keys(bySira).forEach(sira=>{
    const group = bySira[sira];
    const active = group.find(g=>g.aktif) || group[0];
    const capRec = getCapacity(urun, active.isMerkezi);
    if(!capRec){ missing.push({sira, isMerkezi:active.isMerkezi, operasyon:active.operasyon}); return; }
    if(bottleneck===null || capRec.kapasite < bottleneck.kapasite){
      bottleneck = {sira, isMerkezi:active.isMerkezi, operasyon:active.operasyon, kapasite:capRec.kapasite};
    }
  });
  return {bottleneck, missing, stepCount: Object.keys(bySira).length};
}
function computeDataWarnings(){
  const warnings = [];
  const seen = {};
  DB.capacity.forEach(c=>{ const k=c.urun+'|'+c.isMerkezi; seen[k]=(seen[k]||[]).concat([c]); });
  Object.entries(seen).forEach(([k,list])=>{
    if(list.length>1){ const [urun,isMerkezi]=k.split('|'); warnings.push({type:'duplicate', urun, isMerkezi, ids:list.map(x=>x.id), msg:`${urun} / ${isMerkezi} için ${list.length} adet çakışan kapasite kaydı var.`}); }
  });
  DB.capacity.forEach(c=>{
    const exists = DB.routes.some(r=>r.urun===c.urun && r.isMerkezi===c.isMerkezi);
    if(!exists) warnings.push({type:'orphan', urun:c.urun, isMerkezi:c.isMerkezi, capId:c.id, msg:`${c.urun} / ${c.isMerkezi} kapasitesi tanımlı ama üründe bu iş merkezini kullanan bir rota adımı yok.`});
  });
  DB.routes.forEach(r=>{
    const exists = DB.capacity.some(c=>c.urun===r.urun && c.isMerkezi===r.isMerkezi);
    if(!exists) warnings.push({type:'missing', urun:r.urun, isMerkezi:r.isMerkezi, operasyon:r.operasyon, active:r.aktif, msg:`${r.urun} / ${r.isMerkezi} (${r.operasyon}${r.aktif?', aktif hat':''}) için kapasite tanımlanmamış.`});
  });
  return warnings;
}

/* =======================================================================
   ÜRETİM PLANI — haftalık makine planlama (Kapasite'den ve İş Emirlerinden
   bağımsız). Planlamacı, ileriye dönük olarak hangi makinenin hangi gün
   hangi ürüne çalışacağını burada belirler; bir gözlem/planlama aracıdır,
   iş emri açmayı otomatik tetiklemez.
   ======================================================================= */
let UPLAN_HAFTA_BASI = null; // seçili haftanın Pazartesi tarihi (ISO yyyy-mm-dd)

function haftaBaslangici(d){
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const gun = dt.getDay(); // 0=Paz,1=Pzt,...6=Cmt
  const fark = (gun===0 ? -6 : 1-gun);
  dt.setDate(dt.getDate()+fark);
  return dt;
}
function haftaGunleri(){
  if(!UPLAN_HAFTA_BASI) UPLAN_HAFTA_BASI = toLocalISODate(haftaBaslangici(new Date()));
  const base = parseLocalDate(UPLAN_HAFTA_BASI);
  return Array.from({length:7}, (_,i)=>{ const d=new Date(base); d.setDate(d.getDate()+i); return toLocalISODate(d); });
}
const GUN_ADLARI = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

function tumMakineler(){ return [...new Set(DB.routes.map(r=>r.isMerkezi))].filter(Boolean).sort(); }
function makineUrunSecenekleri(isMerkezi){ return [...new Set(DB.routes.filter(r=>r.isMerkezi===isMerkezi).map(r=>r.urun))].sort(); }
function planKaydiBul(tarih, isMerkezi){ return DB.makinePlani.find(p=>p.tarih===tarih && p.isMerkezi===isMerkezi) || null; }
function operasyonSirasi(){
  const oncelik = ['Cutting','Countersink','Marking','Pressing','Packaging'];
  const hepsi = [...new Set(DB.routes.map(r=>r.operasyon))];
  return [...oncelik.filter(o=>hepsi.includes(o)), ...hepsi.filter(o=>!oncelik.includes(o))];
}
function makinelerByOperasyon(op){ return [...new Set(DB.routes.filter(r=>r.operasyon===op).map(r=>r.isMerkezi))].filter(Boolean).sort(); }
function operasyonForMakine(makine){ return DB.routes.find(r=>r.isMerkezi===makine)?.operasyon || 'Diğer'; }
let UPLAN_ACIK_GRUPLAR = null;
function uplanGrupAcikMi(op){
  if(UPLAN_ACIK_GRUPLAR===null){
    try{
      const kayitli = JSON.parse(localStorage.getItem('uplanAcikGruplar'));
      UPLAN_ACIK_GRUPLAR = kayitli ? new Set(kayitli) : new Set(operasyonSirasi());
    }catch(e){ UPLAN_ACIK_GRUPLAR = new Set(operasyonSirasi()); }
  }
  return UPLAN_ACIK_GRUPLAR.has(op);
}
function toggleUplanGrup(op){
  uplanGrupAcikMi(op);
  if(UPLAN_ACIK_GRUPLAR.has(op)) UPLAN_ACIK_GRUPLAR.delete(op);
  else UPLAN_ACIK_GRUPLAR.add(op);
  try{ localStorage.setItem('uplanAcikGruplar', JSON.stringify([...UPLAN_ACIK_GRUPLAR])); }catch(e){}
  renderModule();
}
function acikIsEmirleriForMakine(isMerkezi){
  return DB.workorders.filter(w=>w.isMerkezi===isMerkezi && w.durum==='Aktif' && workOrderStats(w).remaining>0);
}

async function planGuncelle(tarih, isMerkezi, secim){
  if(secim===''){
    const kayit = planKaydiBul(tarih, isMerkezi);
    if(kayit){ DB.makinePlani = DB.makinePlani.filter(p=>p.id!==kayit.id); await persist('makinePlani'); renderModule(); }
    return;
  }
  let urun, workOrderId = null;
  if(secim.startsWith('wo:')){
    const wo = DB.workorders.find(w=>w.id===secim.slice(3));
    if(!wo) return;
    urun = wo.urun; workOrderId = wo.id;
  } else {
    urun = secim.startsWith('urun:') ? secim.slice(5) : secim;
  }
  const capRec = getCapacity(urun, isMerkezi);
  const hedefMiktar = capRec ? capRec.kapasite : null;
  let kayit = planKaydiBul(tarih, isMerkezi);
  if(kayit){ kayit.urun = urun; kayit.workOrderId = workOrderId; kayit.hedefMiktar = hedefMiktar; }
  else { DB.makinePlani.push({id:uid(), tarih, isMerkezi, urun, workOrderId, hedefMiktar, not:''}); }
  await persist('makinePlani');
  renderModule();
}
async function planHedefGuncelle(tarih, isMerkezi, hedefMiktarInput){
  const kayit = planKaydiBul(tarih, isMerkezi);
  if(!kayit) return;
  kayit.hedefMiktar = hedefMiktarInput===''? null : parseFloat(hedefMiktarInput);
  await persist('makinePlani');
}
function planBazliETA(workOrderId, hedefMiktar){
  const kayitlar = DB.makinePlani.filter(p=>p.workOrderId===workOrderId && p.hedefMiktar);
  if(kayitlar.length===0) return null;
  // aynı günde birden fazla kayıt olmamalı ama olursa topla; kronolojik sırayla kümülatif ilerle
  const gunlukToplam = {};
  kayitlar.forEach(p=>{ gunlukToplam[p.tarih] = (gunlukToplam[p.tarih]||0) + p.hedefMiktar; });
  const gunler = Object.keys(gunlukToplam).sort();
  let kumulatif = 0, bitisGunu = null;
  for(const g of gunler){
    kumulatif += gunlukToplam[g];
    if(bitisGunu===null && hedefMiktar && kumulatif >= hedefMiktar){ bitisGunu = g; }
  }
  const yetersiz = hedefMiktar ? kumulatif < hedefMiktar : false;
  return {
    gunler, toplamPlanli: kumulatif, gunlukOrtalama: gunler.length ? kumulatif/gunler.length : 0,
    ilkGun: gunler[0], sonGun: gunler[gunler.length-1],
    bitisGunu: bitisGunu || gunler[gunler.length-1], // eşik hiç aşılmadıysa en iyi tahmin: son planlı gün
    yetersiz
  };
}

function viewUretimPlani(){
  const gunler = haftaGunleri();
  const makineler = tumMakineler();
  if(makineler.length===0) return emptyState('Rota tanımlı makine yok', 'Önce Rotalar modülünden ürün rotası ekleyin.', null, null);

  const oncekiHafta = parseLocalDate(gunler[0]); oncekiHafta.setDate(oncekiHafta.getDate()-7);
  const sonrakiHafta = parseLocalDate(gunler[0]); sonrakiHafta.setDate(sonrakiHafta.getDate()+7);
  const opSirasi = operasyonSirasi();

  return `
  <div class="panel">
    <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-sm btn-ghost" onclick="UPLAN_HAFTA_BASI='${toLocalISODate(oncekiHafta)}'; renderModule();">← Önceki Hafta</button>
        <span style="font-family:var(--font-display);font-weight:600;font-size:14px;">${fmtDate(gunler[0])} — ${fmtDate(gunler[6])}</span>
        <button class="btn btn-sm btn-ghost" onclick="UPLAN_HAFTA_BASI='${toLocalISODate(sonrakiHafta)}'; renderModule();">Sonraki Hafta →</button>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="UPLAN_HAFTA_BASI=null; renderModule();">Bu Hafta</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h3>Makine Planı</h3><span class="field-hint">İş merkezine göre gruplu — açık bir iş emri varsa doğrudan onu seçebilirsiniz</span></div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th style="min-width:150px;">Makine</th>
        ${gunler.map((g,i)=>`<th>${GUN_ADLARI[i]}<div class="field-hint" style="font-weight:400;">${fmtDate(g).slice(0,5)}</div></th>`).join('')}
      </tr></thead>
      <tbody>
        ${opSirasi.map(op=>{
          const opMakineler = makinelerByOperasyon(op);
          if(opMakineler.length===0) return '';
          const acik = uplanGrupAcikMi(op);
          return `
          <tr onclick="toggleUplanGrup('${op}')" style="cursor:pointer;">
            <td colspan="8" style="background:var(--surface-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);padding:6px 10px;">
              <span style="display:inline-block;width:14px;">${acik?'▼':'▶'}</span>${GUNLUK_OP_LABELS[op]||op} <span style="text-transform:none;font-weight:400;">(${opMakineler.length} makine)</span>
            </td>
          </tr>
          ${!acik ? '' : opMakineler.map(makine=>{
            const secenekler = makineUrunSecenekleri(makine);
            const acikWOs = acikIsEmirleriForMakine(makine);
            return `<tr>
              <td style="padding-left:18px;">${escapeHtml(makine)}</td>
              ${gunler.map(g=>{
                const kayit = planKaydiBul(g, makine);
                return `<td style="min-width:130px;padding:6px;">
                  <select style="width:100%;padding:4px 5px;border:1px solid var(--line-strong);border-radius:3px;font-size:11px;margin-bottom:3px;" ${canEdit()?'':'disabled'}
                    onchange="planGuncelle('${g}','${makine.replace(/'/g,"\\'")}', this.value)">
                    <option value="">—</option>
                    ${acikWOs.length ? `<optgroup label="Açık İş Emirleri">
                      ${acikWOs.map(wo=>`<option value="wo:${wo.id}" ${kayit?.workOrderId===wo.id?'selected':''}>${escapeHtml(woNoGoster(wo))} — ${escapeHtml(wo.urun)}</option>`).join('')}
                    </optgroup>` : ''}
                    <optgroup label="Ürün (plansız)">
                      ${secenekler.map(u=>`<option value="urun:${u}" ${(!kayit?.workOrderId && kayit?.urun===u)?'selected':''}>${u}</option>`).join('')}
                    </optgroup>
                  </select>
                  ${kayit?.urun ? `<input type="number" value="${kayit.hedefMiktar??''}" placeholder="adet" ${canEdit()?'':'disabled'}
                    style="width:100%;padding:3px 5px;border:1px solid var(--line);border-radius:3px;font-size:11px;" class="mono"
                    onchange="planHedefGuncelle('${g}','${makine.replace(/'/g,"\\'")}', this.value)">` : ''}
                  ${kayit?.workOrderId ? `<div class="field-hint" style="font-size:9.5px;margin-top:2px;">${(()=>{const _w=DB.workorders.find(w=>w.id===kayit.workOrderId); return _w?escapeHtml(woNoGoster(_w)):'';})()}</div>` : ''}
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}`;
        }).join('')}
      </tbody>
    </table></div>
  </div>

  ${renderHaftalikOzet(gunler, 'operasyon', 'İş Merkezi Bazlı Haftalık Özet', 'Aynı operasyondaki tüm makinelerin toplamı')}
  ${renderHaftalikOzet(gunler, 'isMerkezi', 'Makine Bazlı Haftalık Özet', 'Her makinenin kendi planlanan adedi')}
  ${renderHaftalikOzet(gunler, 'urun', 'Ürün Bazlı Haftalık Özet', 'Planlanan makinelerin toplamı, ürün bazında')}
  `;
}

function renderHaftalikOzet(gunler, kirilim, baslik, altBaslik){
  const gunlukOzet = {};
  gunler.forEach(g=>{
    gunlukOzet[g] = {};
    DB.makinePlani.filter(p=>p.tarih===g && p.urun && p.hedefMiktar).forEach(p=>{
      const key = kirilim==='operasyon' ? (operasyonForMakine(p.isMerkezi)) : kirilim==='isMerkezi' ? p.isMerkezi : p.urun;
      const label = kirilim==='operasyon' ? (GUNLUK_OP_LABELS[key]||key) : key;
      gunlukOzet[g][label] = (gunlukOzet[g][label]||0) + p.hedefMiktar;
    });
  });
  const anahtarlar = [...new Set(gunler.flatMap(g=>Object.keys(gunlukOzet[g])))].sort();
  return `
  <div class="panel">
    <div class="panel-head"><h3>${baslik}</h3><span class="field-hint">${altBaslik}</span></div>
    <div class="panel-body">
      <div class="table-wrap"><table>
        <thead><tr><th>${kirilim==='operasyon'?'İş Merkezi':kirilim==='isMerkezi'?'Makine':'Ürün'}</th>${gunler.map((g,i)=>`<th>${GUN_ADLARI[i]}</th>`).join('')}<th>Hafta Toplamı</th></tr></thead>
        <tbody>
          ${anahtarlar.length===0 ? `<tr><td colspan="${gunler.length+2}" style="text-align:center;color:var(--ink-faint);padding:20px;">Henüz plan girilmedi.</td></tr>` :
            anahtarlar.map(k=>{
              const degerler = gunler.map(g=>gunlukOzet[g][k]||0);
              const toplam = degerler.reduce((a,b)=>a+b,0);
              return `<tr>
                <td class="mono"><b>${escapeHtml(k)}</b></td>
                ${degerler.map(v=>`<td class="mono">${v||'—'}</td>`).join('')}
                <td class="mono"><b>${toplam}</b></td>
              </tr>`;
            }).join('')}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

function makineDurumu(){
  const aktifWOs = DB.workorders.filter(w=>w.durum==='Aktif');
  const byMachine = {};
  aktifWOs.forEach(w=>{
    const st = workOrderStats(w);
    if(st.remaining<=0) return;
    (byMachine[w.isMerkezi] = byMachine[w.isMerkezi]||[]).push({urun:w.urun, operasyon:w.operasyon, kalan:st.remaining, workOrderId:w.id});
  });
  return byMachine;
}
function viewCapacity(){
  const products = [...new Set(DB.routes.map(r=>r.urun))].filter(Boolean).sort();
  if(products.length===0) return emptyState('Rota tanımlı ürün yok', 'Önce Rotalar modülünden ürün rotası ekleyin.', null, null);
  if(!SELECTED_URUN_CAP || !products.includes(SELECTED_URUN_CAP)) SELECTED_URUN_CAP = products[0];
  const filtered = SEARCH ? products.filter(p => p.includes(SEARCH) || (DB.routes.find(r=>r.urun===p)?.urunAdi||'').toLowerCase().includes(SEARCH.toLowerCase())) : products;

  const warnings = computeDataWarnings();
  const steps = DB.routes.filter(r=>r.urun===SELECTED_URUN_CAP).sort((a,b)=>a.sira-b.sira || a.isMerkezi.localeCompare(b.isMerkezi));
  const urunAdi = steps[0]?.urunAdi || '';
  const bySira = {};
  steps.forEach(s=>{ (bySira[s.sira]=bySira[s.sira]||[]).push(s); });
  const {bottleneck, missing} = productBottleneck(SELECTED_URUN_CAP);
  const productWarnings = warnings.filter(w=>w.urun===SELECTED_URUN_CAP);
  const durum = makineDurumu();

  return `
  ${Object.keys(durum).length ? `
    <div class="panel">
      <div class="panel-head"><h3>Makine Durumu</h3><span class="field-hint">Açık iş emirlerine göre — salt okunur</span></div>
      <div class="panel-body" style="display:flex;flex-wrap:wrap;gap:10px;">
        ${Object.entries(durum).map(([makine, atamalar])=>`
          <div style="border:1px solid var(--line);border-radius:4px;padding:10px 14px;min-width:200px;">
            <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${escapeHtml(makine)}</div>
            ${atamalar.map(a=>`
              <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:3px;">
                <span class="mono">${escapeHtml(a.urun)}</span>
                <span class="field-hint">${GUNLUK_OP_LABELS[a.operasyon]||a.operasyon}</span>
                <span class="badge badge-neutral" style="margin-left:auto;">${a.kalan} kalan</span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''}
  ${warnings.length ? `
    <div class="panel" style="border-color:var(--warn-soft);">
      <div class="panel-head"><h3>Veri Kontrolü Uyarıları</h3><span class="badge badge-warn">${warnings.length}</span></div>
      <div class="panel-body" style="padding:0;">
        ${warnings.slice(0,30).map(w=>`
          <div class="audit-q-row">
            <div class="qtext">
              <span class="badge ${w.type==='duplicate'?'badge-flag':w.type==='orphan'?'badge-warn':'badge-neutral'}">${w.type==='duplicate'?'Çakışma':w.type==='orphan'?'Rotasız Kayıt':'Eksik Kapasite'}</span>
              <span style="margin-left:8px;">${escapeHtml(w.msg)}</span>
            </div>
            ${(w.type==='orphan' && canEdit()) ? `<button class="btn btn-sm btn-danger" onclick="deleteRow('capacity','${w.capId}','Kapasite kaydı')">Kaydı Sil</button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="selectCapUrun('${w.urun}')">Ürüne Git</button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''}

  <div class="part-picker">
    <div class="part-list">
      ${filtered.map(p=>{
        const {bottleneck:b} = productBottleneck(p);
        return `<div class="part-list-item ${p===SELECTED_URUN_CAP?'active':''}" onclick="selectCapUrun('${p}')">
          <div class="pn">${escapeHtml(p)}</div>
          <div class="pmeta">${escapeHtml(DB.routes.find(r=>r.urun===p)?.urunAdi||'')}</div>
          <div class="pmeta" style="margin-top:4px;">${b ? `Hedef: <b class="mono">${b.kapasite}</b>/gün` : 'Hedef hesaplanamadı'}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
        <div class="kpi-card ${bottleneck?'good':'flag'}">
          <div class="kpi-label">Ürün Günlük Hedef Kapasitesi</div>
          <div class="kpi-value">${bottleneck ? bottleneck.kapasite : '—'}</div>
          <div class="kpi-foot">${bottleneck ? 'adet/gün (darboğaz adımına göre)' : 'yetersiz veri'}</div>
        </div>
        <div class="kpi-card ${bottleneck?'warn':'flag'}">
          <div class="kpi-label">Darboğaz İstasyonu</div>
          <div class="kpi-value" style="font-size:16px;">${bottleneck ? escapeHtml(bottleneck.isMerkezi) : '—'}</div>
          <div class="kpi-foot">${bottleneck ? 'Sıra '+bottleneck.sira+' · '+escapeHtml(bottleneck.operasyon) : ''}</div>
        </div>
        <div class="kpi-card ${missing.length?'warn':'good'}">
          <div class="kpi-label">Tanımsız Adım</div>
          <div class="kpi-value">${missing.length}</div>
          <div class="kpi-foot">${missing.length? 'hedef hesabına dahil edilemedi':'tüm adımlar tanımlı'}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3 class="mono">${escapeHtml(SELECTED_URUN_CAP)}</h3><span class="field-hint">${escapeHtml(urunAdi)}</span></div>
        <div class="panel-body">
          ${Object.keys(bySira).sort((a,b)=>a-b).map(sira=>{
            const group = bySira[sira];
            const isBottleneckSira = bottleneck && String(bottleneck.sira)===String(sira);
            return `
            <div class="tl-step">
              <div class="tl-marker-col">
                <div class="tl-num ${isBottleneckSira?'late':''}">${sira}</div>
                <div class="tl-line"></div>
              </div>
              <div class="tl-content">
                <div class="tl-title-row">
                  <span class="tl-title">${escapeHtml(group[0].operasyon)}</span>
                  ${isBottleneckSira ? '<span class="badge badge-flag">Darboğaz</span>' : ''}
                </div>
                ${group.map(g=>{
                  const capRec = getCapacity(g.urun, g.isMerkezi);
                  return `
                  <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">
                    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;">
                      <input type="radio" name="active-${sira}" ${g.aktif?'checked':''} ${canEdit()?'':'disabled'} onchange="setActiveWorkCenter('${SELECTED_URUN_CAP}',${sira},'${g.id}')">
                      ${escapeHtml(g.isMerkezi)}
                    </label>
                    <span style="display:flex;align-items:center;gap:5px;">
                      <input type="number" class="mono" style="width:110px;padding:5px 8px;border:1px solid ${capRec?'var(--line-strong)':'var(--warn)'};border-radius:3px;"
                        value="${capRec?capRec.kapasite:''}" placeholder="tanımsız" ${canEdit()?'':'disabled'}
                        onchange="setCapacityValue('${g.urun}','${g.isMerkezi.replace(/'/g,"\\'")}', this.value)">
                      <span class="field-hint">adet/gün</span>
                    </span>
                    ${g.aktif ? `<span class="badge badge-good">Aktif Hat</span>` : `<span class="badge badge-neutral">Alternatif</span>`}
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="field-hint">Kapasite değerini değiştirdiğinizde bu ürünün hedef kapasitesi, darboğaz istasyonu ve Genel Bakış panosundaki ilgili göstergeler otomatik olarak yeniden hesaplanır.</div>
    </div>
  </div>`;
}
function selectCapUrun(p){ SELECTED_URUN_CAP = p; renderModule(); }

async function setActiveWorkCenter(urun, sira, routeId){
  DB.routes.filter(r=>r.urun===urun && String(r.sira)===String(sira)).forEach(r=>{ r.aktif = (r.id===routeId); });
  await persist('routes');
  showToast('Aktif hat güncellendi — hedefler yeniden hesaplandı');
  renderModule();
}
async function setCapacityValue(urun, isMerkezi, v){
  const num = v==='' ? null : parseFloat(v);
  let rec = getCapacity(urun, isMerkezi);
  if(!rec){
    if(num===null) return;
    rec = {id: uid(), urun, isMerkezi, kapasite: num};
    DB.capacity.push(rec);
  } else if(num===null){
    DB.capacity = DB.capacity.filter(c=>c.id!==rec.id);
  } else {
    rec.kapasite = num;
  }
  await persist('capacity');
  showToast('Kapasite güncellendi — hedefler yeniden hesaplandı');
  renderModule();
}

/* =======================================================================
   PRODUCTION / MRP module — work orders (talep) + daily production log,
   netted against the Kapasite module's live bottleneck target (arz).
   ======================================================================= */
function productDailyTarget(urun){
  const {bottleneck} = productBottleneck(urun);
  return bottleneck ? bottleneck.kapasite : null;
}

function workOrderStats(wo){
  const logs = DB.production.filter(p=>p.workOrderId===wo.id).sort((a,b)=>(parseDate(a.tarih)||0)-(parseDate(b.tarih)||0));
  const produced = logs.reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);
  const scrap = logs.reduce((s,p)=>s+(parseFloat(p.fireAdet)||0),0);
  const remaining = Math.max(0, (wo.hedefMiktar||0) - produced);
  const pct = wo.hedefMiktar ? Math.min(100, produced/wo.hedefMiktar*100) : 0;
  const capTarget = productDailyTarget(wo.urun);

  const recent = [...logs].slice(-7);
  const recentSum = recent.reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);
  const avgRate = recent.length ? recentSum/recent.length : null;
  const effRate = (avgRate && avgRate>0) ? avgRate : capTarget;

  let etaDate = null, etaLabel = '—';
  if(remaining<=0 && wo.hedefMiktar>0){ etaLabel = 'Tamamlandı'; }
  else if(effRate && effRate>0){
    const daysNeeded = Math.ceil(remaining/effRate);
    const d = new Date(TODAY); d.setDate(d.getDate()+daysNeeded);
    etaDate = d;
    etaLabel = d.toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'});
  }

  let feasible = null, gerekliGun = null, planFinish = null;
  const start = parseDate(wo.baslangicTarihi) || TODAY;
  if(capTarget){
    gerekliGun = Math.ceil((wo.hedefMiktar||0)/capTarget);
    planFinish = new Date(start); planFinish.setDate(planFinish.getDate()+gerekliGun);
    const requested = parseDate(wo.istenenTeslimTarihi);
    if(requested) feasible = planFinish <= requested;
  }

  const behindSchedule = etaDate && parseDate(wo.istenenTeslimTarihi) && etaDate > parseDate(wo.istenenTeslimTarihi);

  return {logs, produced, scrap, remaining, pct, capTarget, avgRate, etaLabel, etaDate, feasible, gerekliGun, planFinish, behindSchedule};
}

function woStatusBadge(wo, stats){
  if(wo.durum==='Tamamlandı') return '<span class="badge badge-good">Tamamlandı</span>';
  if(wo.durum==='İptal') return '<span class="badge badge-neutral">İptal</span>';
  if(stats.behindSchedule) return '<span class="badge badge-flag">Gecikme Riski</span>';
  if(stats.feasible===false) return '<span class="badge badge-warn">Kapasite Yetersiz</span>';
  return '<span class="badge badge-good">Zamanında</span>';
}

function viewProduction(){
  if(DB.workorders.length===0) return emptyState('Henüz üretim emri yok', 'Bir ürün için hedef miktar ve teslim tarihi girerek ilk üretim emrini açın.', 'openWorkOrderModal()', 'Yeni Sipariş');

  let orders = DB.workorders.filter(w => matchSearch(w, ['urun','not']) || (DB.routes.find(r=>r.urun===w.urun)?.urunAdi||'').toLowerCase().includes(SEARCH.toLowerCase()));
  orders = [...orders].sort((a,b)=>{
    const rank = d => d==='Aktif'?0:d==='Tamamlandı'?2:1;
    if(rank(a.durum)!==rank(b.durum)) return rank(a.durum)-rank(b.durum);
    return (parseDate(a.istenenTeslimTarihi)||0) - (parseDate(b.istenenTeslimTarihi)||0);
  });
  if(!SELECTED_WO || !orders.find(o=>o.id===SELECTED_WO)) SELECTED_WO = orders[0]?.id;

  const activeOrders = DB.workorders.filter(w=>w.durum==='Aktif');
  const todayStr = toLocalISODate(TODAY);
  const todayProduced = DB.production.filter(p=>{
    const d = parseDate(p.tarih); return d && d.getTime()===TODAY.getTime();
  }).reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);
  const riskCount = activeOrders.filter(w=>{ const st = workOrderStats(w); return st.behindSchedule || st.feasible===false; }).length;

  const wo = orders.find(o=>o.id===SELECTED_WO);
  const stats = wo ? workOrderStats(wo) : null;
  const urunAdi = wo ? (DB.routes.find(r=>r.urun===wo.urun)?.urunAdi || '') : '';

  return `
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi-card"><div class="kpi-label">Aktif Sipariş</div><div class="kpi-value">${activeOrders.length}</div><div class="kpi-foot">${DB.workorders.length} toplam emir</div></div>
    <div class="kpi-card good"><div class="kpi-label">Bugünkü Toplam Üretim</div><div class="kpi-value">${todayProduced}</div><div class="kpi-foot">tüm ürünler, ${fmtDate(todayStr)}</div></div>
    <div class="kpi-card ${riskCount?'flag':'good'}"><div class="kpi-label">Riskli Sipariş</div><div class="kpi-value">${riskCount}</div><div class="kpi-foot">gecikme veya kapasite yetersizliği</div></div>
    <div class="kpi-card"><div class="kpi-label">Toplam Kayıt</div><div class="kpi-value">${DB.production.length}</div><div class="kpi-foot">günlük üretim girişi</div></div>
  </div>

  <div class="part-picker">
    <div class="part-list">
      ${orders.map(o=>{
        const st = workOrderStats(o);
        return `<div class="part-list-item ${o.id===SELECTED_WO?'active':''}" onclick="selectWO('${o.id}')">
          <div class="pn">${escapeHtml(o.urun)} <span style="font-weight:400;color:var(--ink-faint);">· ${escapeHtml((DB.routes.find(r=>r.urun===o.urun)?.urunAdi||'').slice(0,22))}</span></div>
          <div class="pmeta">${o.hedefMiktar} adet hedef · teslim ${fmtDate(o.istenenTeslimTarihi)}</div>
          <div class="part-progress-bar"><div class="part-progress-fill" style="width:${st.pct}%; background:${st.behindSchedule||st.feasible===false?'var(--flag)':'var(--good)'};"></div></div>
          <div style="margin-top:6px;">${woStatusBadge(o, st)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      ${!wo ? `<div class="panel"><div class="empty-state"><p>Soldan bir sipariş seçin.</p></div></div>` : `
      <div class="panel">
        <div class="panel-head">
          <h3 class="mono">${escapeHtml(wo.urun)} <span style="font-family:var(--font-body);font-weight:400;font-size:13px;color:var(--ink-soft);">— ${escapeHtml(urunAdi)}</span></h3>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-ghost" onclick="openWorkOrderModal('${wo.id}')">Emri Düzenle</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRow('workorders','${wo.id}','Üretim emri')">Sil</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr); margin-bottom:16px;">
            <div class="kpi-card"><div class="kpi-label">Hedef Miktar</div><div class="kpi-value" style="font-size:22px;">${wo.hedefMiktar}</div></div>
            <div class="kpi-card good"><div class="kpi-label">Üretilen</div><div class="kpi-value" style="font-size:22px;">${stats.produced}</div><div class="kpi-foot">%${stats.pct.toFixed(0)} tamam</div></div>
            <div class="kpi-card ${stats.remaining>0?'warn':'good'}"><div class="kpi-label">Kalan</div><div class="kpi-value" style="font-size:22px;">${stats.remaining}</div></div>
            <div class="kpi-card ${stats.scrap>0?'flag':''}"><div class="kpi-label">Toplam Fire</div><div class="kpi-value" style="font-size:22px;">${stats.scrap}</div></div>
            <div class="kpi-card ${stats.behindSchedule?'flag':'good'}"><div class="kpi-label">Tahmini Bitiş</div><div class="kpi-value" style="font-size:15px;">${stats.etaLabel}</div><div class="kpi-foot">${stats.avgRate? 'son 7 kayıt hızına göre' : 'kapasite hedefine göre'}</div></div>
          </div>

          ${stats.capTarget ? `
            <div class="field-hint" style="margin-bottom:14px;">
              Kapasite modülüne göre günlük hedef: <b class="mono">${stats.capTarget}</b> adet/gün ·
              teorik süre: <b>${stats.gerekliGun}</b> gün ·
              planlanan bitiş: <b>${stats.planFinish ? stats.planFinish.toLocaleDateString('tr-TR') : '—'}</b>
              ${wo.istenenTeslimTarihi ? (stats.feasible===false ? ` — <span style="color:var(--flag);font-weight:600;">istenen teslim tarihine (${fmtDate(wo.istenenTeslimTarihi)}) mevcut kapasiteyle yetişilemiyor.</span>` : ` — <span style="color:var(--good);font-weight:600;">istenen teslim tarihine kapasite yeterli.</span>`) : ''}
            </div>
          ` : `<div class="field-hint" style="margin-bottom:14px;color:var(--warn);">Bu ürün için Kapasite Yönetimi modülünde tam bir hedef hesaplanamadı — tanımsız adımları tamamlayın.</div>`}

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h4 style="font-family:var(--font-display);font-size:14px;margin:0;">Günlük Üretim Kayıtları</h4>
            <button class="btn btn-sm btn-primary" onclick="openProductionLogModal(null,'${wo.id}')">+ Günlük Kayıt</button>
          </div>
          ${stats.logs.length===0 ? `<div class="field-hint">Henüz kayıt yok.</div>` : `
          <div class="table-wrap"><table>
            <thead><tr><th>Tarih</th><th>Vardiya</th><th>Hedef</th><th>Gerçekleşen</th><th>Fire</th><th>Sapma</th><th>Not</th><th></th></tr></thead>
            <tbody>
              ${[...stats.logs].reverse().map(p=>{
                const dev = (parseFloat(p.gercekAdet)||0) - (parseFloat(p.hedefAdet)||0);
                return `<tr>
                  <td class="mono">${fmtDate(p.tarih)}</td>
                  <td>${escapeHtml(p.vardiya||'—')}</td>
                  <td class="mono">${p.hedefAdet ?? '—'}</td>
                  <td class="mono"><b>${p.gercekAdet ?? 0}</b></td>
                  <td class="mono">${p.fireAdet || 0}</td>
                  <td>${dev>=0 ? `<span class="badge badge-good">+${dev}</span>` : `<span class="badge badge-flag">${dev}</span>`}</td>
                  <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.not||'')}</td>
                  <td><div class="row-actions">
                    <button class="btn btn-sm btn-ghost" onclick="openProductionLogModal('${p.id}','${wo.id}')">Düzenle</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProductionLog('${p.id}')">Sil</button>
                  </div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`}
        </div>
      </div>`}
    </div>
  </div>`;
}
function selectWO(id){ SELECTED_WO = id; renderModule(); }

function openWorkOrderModal(id){
  const rec = id ? DB.workorders.find(x=>x.id===id) : {urun:'', hedefMiktar:'', baslangicTarihi:toLocalISODate(new Date()), istenenTeslimTarihi:'', durum:'Aktif', not:''};
  const urunOptions = [...new Set(DB.routes.map(r=>r.urun))];
  openModal(`${id?'Üretim Emrini Düzenle':'Yeni Üretim Emri'}`, `
    <div class="field"><label>Ürün</label><input id="f-urun" list="wo-urun-opts" value="${escapeHtml(rec.urun)}" placeholder="Ürün kodu"></div>
    <datalist id="wo-urun-opts">${urunOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Hedef Miktar (adet)</label><input id="f-hedefMiktar" type="number" value="${rec.hedefMiktar}"></div>
      <div class="field"><label>Durum</label>
        <select id="f-durum">
          <option ${rec.durum==='Aktif'?'selected':''}>Aktif</option>
          <option ${rec.durum==='Tamamlandı'?'selected':''}>Tamamlandı</option>
          <option ${rec.durum==='İptal'?'selected':''}>İptal</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Başlangıç Tarihi</label><input id="f-baslangicTarihi" type="date" value="${rec.baslangicTarihi||''}"></div>
      <div class="field"><label>İstenen Teslim Tarihi</label><input id="f-istenenTeslimTarihi" type="date" value="${rec.istenenTeslimTarihi||''}"></div>
    </div>
    <div class="field"><label>Not</label><textarea id="f-not">${escapeHtml(rec.not||'')}</textarea></div>
    <div class="field-hint" id="wo-feasibility-hint"></div>
  `, async ()=>{
    const data = {
      urun: val('f-urun'), hedefMiktar: parseFloat(val('f-hedefMiktar'))||0, durum: val('f-durum'),
      baslangicTarihi: val('f-baslangicTarihi'), istenenTeslimTarihi: val('f-istenenTeslimTarihi'), not: val('f-not')
    };
    if(!data.urun || !data.hedefMiktar){ showToast('Ürün ve hedef miktar zorunlu', true); return false; }
    if(id){ Object.assign(DB.workorders.find(x=>x.id===id), data); }
    else { DB.workorders.push({id:uid(), ...data}); }
    await persist('workorders');
    SELECTED_WO = id || DB.workorders[DB.workorders.length-1].id;
    const check = productDailyTarget(data.urun);
    if(!check){ showToast('Sipariş kaydedildi — bu ürün için kapasite hedefi eksik, Kapasite modülünü kontrol edin', true); }
    else showToast('Üretim emri kaydedildi');
    renderModule();
    return true;
  });
}

function openProductionLogModal(id, workOrderId){
  const wo = DB.workorders.find(w=>w.id===workOrderId);
  const stats = workOrderStats(wo);
  const rec = id ? DB.production.find(x=>x.id===id) : {
    tarih: toLocalISODate(new Date()), vardiya:'1', gercekAdet:'', fireAdet:'', not:'',
    hedefAdet: Math.min(stats.capTarget||stats.remaining||0, stats.remaining||0) || stats.capTarget || ''
  };
  openModal(`${id?'Üretim Kaydını Düzenle':'Yeni Günlük Üretim Kaydı'}`, `
    <div class="field-hint" style="margin-bottom:12px;">${escapeHtml(wo.urun)} siparişi · kalan miktar: <b>${stats.remaining}</b> adet</div>
    <div class="field-row">
      <div class="field"><label>Tarih</label><input id="f-tarih" type="date" value="${rec.tarih}"></div>
      <div class="field"><label>Vardiya</label>
        <select id="f-vardiya"><option ${rec.vardiya==='1'?'selected':''}>1</option><option ${rec.vardiya==='2'?'selected':''}>2</option><option ${rec.vardiya==='3'?'selected':''}>3</option></select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Hedef Adet (o gün için)</label><input id="f-hedefAdet" type="number" value="${rec.hedefAdet}"></div>
      <div class="field"><label>Gerçekleşen Adet</label><input id="f-gercekAdet" type="number" value="${rec.gercekAdet}"></div>
    </div>
    <div class="field"><label>Fire / Iskarta Adet</label><input id="f-fireAdet" type="number" value="${rec.fireAdet}"></div>
    <div class="field"><label>Not</label><textarea id="f-not">${escapeHtml(rec.not||'')}</textarea></div>
  `, async ()=>{
    const data = {
      workOrderId, urun: wo.urun, tarih: val('f-tarih'), vardiya: val('f-vardiya'),
      hedefAdet: val('f-hedefAdet')?parseFloat(val('f-hedefAdet')):null,
      gercekAdet: parseFloat(val('f-gercekAdet'))||0,
      fireAdet: parseFloat(val('f-fireAdet'))||0,
      not: val('f-not')
    };
    if(!data.tarih){ showToast('Tarih zorunlu', true); return false; }
    if(id){ Object.assign(DB.production.find(x=>x.id===id), data); }
    else { DB.production.push({id:uid(), ...data}); }
    await persist('production');
    showToast('Üretim kaydı işlendi — sipariş ilerlemesi güncellendi');
    renderModule();
    return true;
  });
}
async function deleteProductionLog(id){
  if(!confirm('Bu üretim kaydını silmek istediğinize emin misiniz?')) return;
  DB.production = DB.production.filter(x=>x.id!==id);
  await persist('production');
  showToast('Üretim kaydı silindi');
  renderModule();
}

/* =======================================================================
   SIPARİŞLER + İŞ EMİRLERİ (v2) — rota tabanlı otomatik iş emri patlatma
   Bir Sipariş (Ürün + Miktar + Tarih) girildiğinde, o ürünün rotasındaki
   HER operasyon için ayrı bir İş Emri otomatik açılır. Günlük üretim
   kayıtları artık operasyon/iş-merkezi bazında, kendi istasyonunun
   Kapasite Yönetimi'ndeki hedefine göre girilir.
   ======================================================================= */
function nextOrderNo(){
  const year = new Date().getFullYear();
  const prefix = `SP-${year}-`;
  // Sadece otomatik oluşturulmuş 4 haneli sıralı numaraları say — müşteri sipariş
  // numaraları (ör. SP-2026-50500) bu sayaçla karışmasın.
  const pattern = new RegExp(`^SP-${year}-(\\d{4})$`);
  const maxSeq = DB.orders.reduce((m,o)=>{
    if(!o.orderNo) return m;
    const match = o.orderNo.match(pattern);
    if(!match) return m;
    const n = parseInt(match[1],10);
    return isNaN(n) ? m : Math.max(m,n);
  }, 0);
  return `${prefix}${String(maxSeq+1).padStart(4,'0')}`;
}
// Satış siparişi numarası girilmişse doğrudan onu kullan (ör. SP-2026-50500);
// girilmemişse otomatik sıralı numaraya düş (SP-2026-0001 gibi).
function siparisNoUret(satisSiparisNo){
  const temiz = (satisSiparisNo||'').trim();
  if(temiz) return `SP-${new Date().getFullYear()}-${temiz}`;
  return nextOrderNo();
}
async function ensureOrderNumbers(){
  let changed = false;
  DB.orders.forEach(o=>{ if(!o.orderNo){ o.orderNo = nextOrderNo(); changed = true; } });
  // Daha önce otomatik sıralı numara (SP-YYYY-0001 gibi) verilmiş ama aslında bir müşteri
  // sipariş numarası (satisSiparisNo) girilmiş kayıtları, o numarayı kullanacak şekilde düzelt.
  DB.orders.forEach(o=>{
    if(o.kaynak==='satis' && (o.satisSiparisNo||'').trim()){
      const dogruNo = siparisNoUret(o.satisSiparisNo);
      if(o.orderNo !== dogruNo){ o.orderNo = dogruNo; changed = true; }
    }
  });
  DB.workorders.forEach(w=>{
    if(!w.woNo){
      const order = DB.orders.find(o=>o.id===w.orderId);
      if(order){ w.woNo = `${order.orderNo}-${w.sira}`; changed = true; }
    }
  });
  if(changed){ await persist('orders'); await persist('workorders'); }
}
function generateWorkOrdersForOrder(order, secimMap){
  const steps = DB.routes.filter(r=>r.urun===order.urun);
  const bySira = {};
  steps.forEach(s=>{ (bySira[s.sira]=bySira[s.sira]||[]).push(s); });
  const newWOs = [];
  Object.keys(bySira).sort((a,b)=>a-b).forEach(sira=>{
    const group = bySira[sira];
    const secim = secimMap && secimMap[sira];
    const secimListesi = Array.isArray(secim) ? secim.filter(Boolean) : (secim ? [secim] : []);
    if(secimListesi.length > 1){
      // Bölünmüş adım: her makineye Kapasite Yönetimi'ndeki kapasiteyle orantılı miktar
      const paylar = kapasiteOranliBol(order.urun, secimListesi, order.hedefMiktar);
      secimListesi.forEach((makine,i)=>{
        const active = group.find(g=>g.isMerkezi===makine) || group[0];
        newWOs.push({
          id: uid(), orderId: order.id, urun: order.urun, sira: parseFloat(sira),
          splitEtiket: String.fromCharCode(65+i),
          operasyon: active.operasyon, isMerkezi: active.isMerkezi,
          hedefMiktar: paylar[i], durum: 'Aktif'
        });
      });
    } else {
      let active = null;
      if(secimListesi[0]) active = group.find(g=>g.isMerkezi===secimListesi[0]);
      if(!active) active = group.find(g=>g.aktif) || group[0];
      newWOs.push({
        id: uid(), orderId: order.id, urun: order.urun, sira: parseFloat(sira),
        operasyon: active.operasyon, isMerkezi: active.isMerkezi,
        hedefMiktar: order.hedefMiktar, durum: 'Aktif'
      });
    }
  });
  return newWOs;
}
function routeSiraGruplari(urun){
  const steps = DB.routes.filter(r=>r.urun===urun);
  const bySira = {};
  steps.forEach(s=>{ (bySira[s.sira]=bySira[s.sira]||[]).push(s); });
  return Object.keys(bySira).sort((a,b)=>a-b).map(sira=>({sira, operasyon: bySira[sira][0].operasyon, secenekler: bySira[sira]}));
}

function capForStep(wo){
  const rec = getCapacity(wo.urun, wo.isMerkezi);
  return rec ? rec.kapasite : null;
}

// Re-defines workOrderStats: now scoped to a single OPERATION (İş Emri),
// using that operation's own work-center capacity rather than the whole product's bottleneck.
function workOrderStats(wo){
  const logs = DB.production.filter(p=>p.workOrderId===wo.id).sort((a,b)=>(parseDate(a.tarih)||0)-(parseDate(b.tarih)||0));
  const produced = logs.reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);
  const scrap = logs.reduce((s,p)=>s+(parseFloat(p.fireAdet)||0),0);
  const remaining = Math.max(0, (wo.hedefMiktar||0) - produced);
  const pct = wo.hedefMiktar ? Math.min(100, produced/wo.hedefMiktar*100) : 0;
  const capTarget = capForStep(wo);

  const recent = logs.slice(-7);
  const recentSum = recent.reduce((s,p)=>s+(parseFloat(p.gercekAdet)||0),0);
  const avgRate = recent.length ? recentSum/recent.length : null;
  const effRate = (avgRate && avgRate>0) ? avgRate : capTarget;

  let etaDate = null, etaLabel = '—', planETA = null;
  if(remaining<=0 && wo.hedefMiktar>0){ etaLabel = 'Tamamlandı'; }
  else {
    planETA = planBazliETA(wo.id, wo.hedefMiktar);
    if(planETA){
      etaDate = parseDate(planETA.bitisGunu);
      etaLabel = fmtDate(planETA.bitisGunu) + (planETA.yetersiz ? ' (plan yetersiz)' : '');
    } else if(effRate && effRate>0){
      const daysNeeded = Math.ceil(remaining/effRate);
      const d = new Date(TODAY); d.setDate(d.getDate()+daysNeeded);
      etaDate = d;
      etaLabel = d.toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'});
    }
  }
  const order = DB.orders.find(o=>o.id===wo.orderId);
  const behindSchedule = !!(etaDate && order && parseDate(order.istenenTeslimTarihi) && etaDate > parseDate(order.istenenTeslimTarihi));

  return {logs, produced, scrap, remaining, pct, capTarget, avgRate, etaLabel, etaDate, behindSchedule, planETA};
}

function orderSteps(orderId){
  return DB.workorders.filter(w=>w.orderId===orderId).sort((a,b)=>a.sira-b.sira || (a.splitEtiket||'').localeCompare(b.splitEtiket||''));
}
// İş emri numarasını HER ZAMAN o anki bağlı siparişin numarasından canlı üretir —
// kayıtlı wo.woNo alanı sadece ilk oluşturma/yedek amaçlıdır, ekranda hep bu kullanılır.
// Bir operasyon birden fazla makineye bölünmüşse (splitEtiket), /A, /B gibi ek gösterilir.
function woNoGoster(wo){
  const order = DB.orders.find(o=>o.id===wo.orderId);
  const base = order ? `${order.orderNo}-${wo.sira}` : (wo.woNo || wo.id);
  return wo.splitEtiket ? `${base}/${wo.splitEtiket}` : base;
}
// İki (veya daha fazla) makineye bölünürken, miktarı o makinelerin Kapasite Yönetimi'ndeki
// kayıtlı günlük kapasitesine ORANTILI olarak paylaştırır (eşit değil).
function kapasiteOranliBol(urun, isMerkeziListesi, toplamMiktar){
  const kapasiteler = isMerkeziListesi.map(m => {
    const rec = getCapacity(urun, m);
    return rec && rec.kapasite>0 ? rec.kapasite : 1; // kapasite tanımsızsa eşit ağırlık
  });
  const toplamKapasite = kapasiteler.reduce((a,b)=>a+b,0);
  const paylar = kapasiteler.map(k => Math.round(toplamMiktar * k/toplamKapasite));
  // yuvarlama farkını son makineye ekle/çıkar, toplam tam tutsun
  const fark = toplamMiktar - paylar.reduce((a,b)=>a+b,0);
  paylar[paylar.length-1] += fark;
  return paylar;
}
function orderStats(order){
  const steps = orderSteps(order.id);
  if(steps.length===0){
    return { steps, finalWO:null, finalWOs:[], finalStats:null, finalStatsList:[], capTarget:null,
      gerekliGun:null, planFinish:null, feasible:null, pct:0, produced:0, remaining:(order.hedefMiktar||0),
      etaLabel:'—', behindSchedule:false };
  }
  const maxSira = Math.max(...steps.map(s=>s.sira));
  const finalWOs = steps.filter(s=>s.sira===maxSira);
  const finalStatsList = finalWOs.map(wo=>({wo, st:workOrderStats(wo)}));
  const hedefToplam = finalWOs.reduce((s,wo)=>s+(wo.hedefMiktar||0),0);
  const produced = finalStatsList.reduce((s,x)=>s+x.st.produced,0);
  const remaining = Math.max(0, hedefToplam - produced);
  const pct = hedefToplam ? Math.min(100, produced/hedefToplam*100) : 0;
  const behindSchedule = finalStatsList.some(x=>x.st.behindSchedule);
  let etaLabel = '—';
  if(remaining<=0 && hedefToplam>0){
    etaLabel = 'Tamamlandı';
  } else {
    const etaDates = finalStatsList.map(x=>x.st.etaDate).filter(Boolean);
    if(etaDates.length){
      const enGec = etaDates.reduce((a,b)=> a>b?a:b); // sipariş, en geç biten split'e kadar bitmez
      etaLabel = enGec.toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'});
    }
  }
  const capTarget = productDailyTarget(order.urun);
  let gerekliGun = null, planFinish = null, feasible = null;
  const start = parseDate(order.baslangicTarihi) || TODAY;
  if(capTarget){
    gerekliGun = Math.ceil((order.hedefMiktar||0)/capTarget);
    planFinish = new Date(start); planFinish.setDate(planFinish.getDate()+gerekliGun);
    const requested = parseDate(order.istenenTeslimTarihi);
    if(requested) feasible = planFinish <= requested;
  }
  return { steps, finalWO: finalWOs[0]||null, finalWOs, finalStats: finalStatsList[0]?.st||null, finalStatsList,
    capTarget, gerekliGun, planFinish, feasible, pct, produced, remaining, etaLabel, behindSchedule };
}
function orderStatusBadge(order, st){
  if(order.durum==='Tamamlandı') return '<span class="badge badge-good">Tamamlandı</span>';
  if(order.durum==='İptal') return '<span class="badge badge-neutral">İptal</span>';
  if(st.behindSchedule) return '<span class="badge badge-flag">Gecikme Riski</span>';
  if(st.feasible===false) return '<span class="badge badge-warn">Kapasite Yetersiz</span>';
  return '<span class="badge badge-good">Zamanında</span>';
}

/* ---------------- ÜRETİM SİPARİŞLERİ module ---------------- */
function viewOrders(){
  if(DB.orders.length===0) return emptyState('Henüz üretim siparişi yok', 'Bir ürün için hedef miktar ve teslim tarihi girin. Sipariş kaydedildiğinde iş emirleri otomatik açılmaz — hazır olduğunuzda "İş Emri Aç" ile siz başlatırsınız.', 'openOrderModal()', 'Yeni Üretim Siparişi');

  let orders = DB.orders.filter(o => matchSearch(o, ['urun','not','musteri','satisSiparisNo']) || (DB.routes.find(r=>r.urun===o.urun)?.urunAdi||'').toLowerCase().includes(SEARCH.toLowerCase()));
  if(TABLO_SIRALAMA['orders']){
    orders = sirali('orders', orders);
  } else {
    orders = [...orders].sort((a,b)=>{
      const rank = d => d==='Aktif'?0:d==='Tamamlandı'?2:1;
      if(rank(a.durum)!==rank(b.durum)) return rank(a.durum)-rank(b.durum);
      return (parseDate(a.istenenTeslimTarihi)||0) - (parseDate(b.istenenTeslimTarihi)||0);
    });
  }

  const activeOrders = DB.orders.filter(o=>o.durum==='Aktif');
  const bekleyenIsEmri = activeOrders.filter(o=>orderSteps(o.id).length===0).length;
  const riskyCount = activeOrders.filter(o=>{ const st=orderStats(o); return st.behindSchedule||st.feasible===false; }).length;

  return `
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi-card"><div class="kpi-label">Aktif Sipariş</div><div class="kpi-value">${activeOrders.length}</div><div class="kpi-foot">${DB.orders.length} toplam</div></div>
    <div class="kpi-card ${bekleyenIsEmri?'warn':'good'}"><div class="kpi-label">İş Emri Bekleyen</div><div class="kpi-value">${bekleyenIsEmri}</div><div class="kpi-foot">henüz başlatılmadı</div></div>
    <div class="kpi-card ${riskyCount?'flag':'good'}"><div class="kpi-label">Riskli Sipariş</div><div class="kpi-value">${riskyCount}</div><div class="kpi-foot">gecikme veya kapasite yetersizliği</div></div>
    <div class="kpi-card"><div class="kpi-label">Açık İş Emri</div><div class="kpi-value">${DB.workorders.filter(w=>w.durum==='Aktif').length}</div><div class="kpi-foot">planlamacı tarafından başlatıldı</div></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>${sortableTh('orders','orderNo','Sipariş No')}<th>Kaynak</th>${sortableTh('orders','urun','Ürün')}${sortableTh('orders','hedefMiktar','Hedef')}<th>Üretilen</th><th>Kalan</th>${sortableTh('orders','istenenTeslimTarihi','İstenen Teslim')}<th>Tahmini Bitiş</th>${sortableTh('orders','durum','Durum')}<th>İş Emri</th><th></th></tr></thead>
      <tbody>
        ${orders.map(o=>{
          const st = orderStats(o);
          const isEmriVar = st.steps.length>0;
          return `<tr>
            <td class="mono">${escapeHtml(o.orderNo||'—')}</td>
            <td>${o.kaynak==='satis' ? `<span class="badge badge-neutral" title="${escapeHtml(o.musteri||'')} ${escapeHtml(o.satisSiparisNo||'')}">Satış</span>` : `<span class="badge badge-neutral">Üretim</span>`}</td>
            <td class="mono"><b>${escapeHtml(o.urun)}</b><div class="field-hint">${escapeHtml((DB.routes.find(r=>r.urun===o.urun)?.urunAdi||'').slice(0,28))}</div></td>
            <td class="mono">${o.hedefMiktar}</td>
            <td class="mono">${st.produced}</td>
            <td class="mono">${st.remaining}</td>
            <td class="mono">${fmtDate(o.istenenTeslimTarihi)}</td>
            <td class="mono">${isEmriVar ? st.etaLabel : '—'}</td>
            <td>${orderStatusBadge(o, st)}</td>
            <td>${isEmriVar ? `${st.steps.length} adım` : `<span class="badge badge-warn">Bekliyor</span>`}</td>
            <td><div class="row-actions">
              ${isEmriVar
                ? `<button class="btn btn-sm btn-ghost" onclick="go('workorders'); selectOrder('${o.id}');">İş Emirlerini Görüntüle</button>`
                : (canEdit() ? `<button class="btn btn-sm btn-primary" onclick="acIsEmriAc('${o.id}')">İş Emri Aç</button>` : '')}
              ${canEdit() ? `
              <button class="btn btn-sm btn-ghost" onclick="openOrderModal('${o.id}')">Düzenle</button>
              <button class="btn btn-sm btn-danger" onclick="deleteOrderCascade('${o.id}')">Sil</button>
              ` : ''}
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function acIsEmriAc(orderId){
  const order = DB.orders.find(o=>o.id===orderId);
  if(!order) return;
  if(orderSteps(orderId).length>0){ showToast('Bu sipariş için iş emirleri zaten açık', true); return; }
  const gruplar = routeSiraGruplari(order.urun);
  if(gruplar.length===0){ showToast('Bu ürün için tanımlı rota bulunamadı', true); return; }

  openModal(`İş Emri Aç — ${escapeHtml(order.urun)}`, `
    <div class="field-hint" style="margin-bottom:14px;">
      Rotadaki her operasyon için iş emri açılacak. Birden fazla makine seçeneği olan adımlarda,
      hangi makinenin kullanılacağını seçebilir, isterseniz "İkinci makine ekle" ile o adımı
      iki makineye bölebilirsiniz — miktar, Kapasite Yönetimi'ndeki kapasitelerle orantılı paylaşılır.
    </div>
    ${gruplar.map(g=>`
      <div class="field">
        <label>${g.sira}. ${escapeHtml(g.operasyon)}</label>
        ${g.secenekler.length===1
          ? `<div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--line);border-radius:3px;font-size:13px;">${escapeHtml(g.secenekler[0].isMerkezi)}</div>
             <input type="hidden" class="sira-secim-select" data-sira="${g.sira}" data-idx="0" value="${escapeHtml(g.secenekler[0].isMerkezi)}">`
          : `<div id="sira-container-${g.sira}">
              <select class="sira-secim-select" data-sira="${g.sira}" data-idx="0" style="margin-bottom:5px;">
                ${g.secenekler.map(s=>`<option value="${escapeHtml(s.isMerkezi)}" ${s.aktif?'selected':''}>${escapeHtml(s.isMerkezi)}${s.aktif?' (aktif hat)':''}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="btn btn-sm btn-ghost" onclick="siraMakineEkle(${g.sira}, ${escapeHtml(JSON.stringify(g.secenekler.map(s=>s.isMerkezi)))})">+ İkinci makine ekle (böl)</button>`
        }
      </div>
    `).join('')}
  `, async ()=>{
    const secimMap = {};
    document.querySelectorAll('.sira-secim-select').forEach(el=>{
      const sira = el.getAttribute('data-sira');
      (secimMap[sira] = secimMap[sira]||[]).push(el.value);
    });
    const newWOs = generateWorkOrdersForOrder(order, secimMap);
    DB.workorders.push(...newWOs);
    await persist('workorders');
    showToast(`${newWOs.length} iş emri açıldı`);
    renderModule();
    return true;
  });
}
function siraMakineEkle(sira, secenekler){
  const container = document.getElementById(`sira-container-${sira}`);
  if(!container) return;
  const mevcutSayisi = container.querySelectorAll('.sira-secim-select').length;
  if(mevcutSayisi >= secenekler.length){ showToast('Bu adım için tüm makine seçenekleri zaten eklendi', true); return; }
  const secilenler = [...container.querySelectorAll('.sira-secim-select')].map(el=>el.value);
  const kalanlar = secenekler.filter(s=>!secilenler.includes(s));
  const row = document.createElement('div');
  row.style.display = 'flex'; row.style.gap = '6px'; row.style.marginBottom = '5px'; row.style.alignItems = 'center';
  row.innerHTML = `
    <select class="sira-secim-select" data-sira="${sira}" data-idx="${mevcutSayisi}" style="flex:1;">
      ${kalanlar.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
    </select>
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">Kaldır</button>
  `;
  container.appendChild(row);
}

function openOrderModal(id){
  const rec = id ? DB.orders.find(x=>x.id===id) : {urun:'', hedefMiktar:'', baslangicTarihi:toLocalISODate(new Date()), istenenTeslimTarihi:'', durum:'Aktif', not:'', kaynak:'uretim'};
  const urunOptions = [...new Set(DB.routes.map(r=>r.urun))];
  const routeInfo = id ? '' : `<div class="field-hint" id="order-route-preview" style="margin-bottom:12px;"></div>`;
  openModal(`${id?'Üretim Siparişini Düzenle':'Yeni Üretim Siparişi'}`, `
    <div class="field"><label>Ürün</label><input id="f-urun" list="order-urun-opts" value="${escapeHtml(rec.urun)}" placeholder="Ürün kodu" oninput="previewOrderRoute(this.value)"></div>
    <datalist id="order-urun-opts">${urunOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    ${routeInfo}
    <div class="field-row">
      <div class="field"><label>Hedef Miktar (adet)</label><input id="f-hedefMiktar" type="number" value="${rec.hedefMiktar}"></div>
      <div class="field"><label>Durum</label>
        <select id="f-durum">
          <option ${rec.durum==='Aktif'?'selected':''}>Aktif</option>
          <option ${rec.durum==='Tamamlandı'?'selected':''}>Tamamlandı</option>
          <option ${rec.durum==='İptal'?'selected':''}>İptal</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Başlangıç Tarihi</label><input id="f-baslangicTarihi" type="date" value="${rec.baslangicTarihi||''}"></div>
      <div class="field"><label>İstenen Teslim Tarihi</label><input id="f-istenenTeslimTarihi" type="date" value="${rec.istenenTeslimTarihi||''}"></div>
    </div>
    <div class="field"><label>Not</label><textarea id="f-not">${escapeHtml(rec.not||'')}</textarea></div>
    <div class="field-hint">İş emirleri burada otomatik açılmaz — kaydettikten sonra listeden "İş Emri Aç" ile siz başlatırsınız.</div>
  `, async ()=>{
    const data = {
      urun: val('f-urun'), hedefMiktar: parseFloat(val('f-hedefMiktar'))||0, durum: val('f-durum'),
      baslangicTarihi: val('f-baslangicTarihi'), istenenTeslimTarihi: val('f-istenenTeslimTarihi'), not: val('f-not')
    };
    if(!data.urun || !data.hedefMiktar){ showToast('Ürün ve hedef miktar zorunlu', true); return false; }
    const routeStepCount = DB.routes.filter(r=>r.urun===data.urun).length;
    if(!id && routeStepCount===0){ showToast('Bu ürün için tanımlı rota bulunamadı — önce Rotalar modülüne ekleyin', true); return false; }
    if(id){
      const order = DB.orders.find(x=>x.id===id);
      Object.assign(order, data);
      if(data.durum!=='Aktif'){ DB.workorders.filter(w=>w.orderId===id).forEach(w=>w.durum=data.durum); await persist('workorders'); }
      await persist('orders');
      showToast('Sipariş güncellendi');
    } else {
      const order = {id:uid(), orderNo: nextOrderNo(), kaynak:'uretim', ...data};
      DB.orders.push(order);
      await persist('orders');
      SELECTED_ORDER = order.id;
      showToast('Üretim siparişi kaydedildi — hazır olduğunuzda "İş Emri Aç" ile başlatın');
    }
    renderModule();
    return true;
  });
}
function previewOrderRoute(urun){
  const el = document.getElementById('order-route-preview');
  if(!el) return;
  const steps = DB.routes.filter(r=>r.urun===urun);
  if(steps.length===0){ el.textContent = urun ? 'Bu ürün için rota bulunamadı.' : ''; return; }
  const siraCount = new Set(steps.map(s=>s.sira)).size;
  const name = steps[0].urunAdi||'';
  el.innerHTML = `<b>${escapeHtml(name)}</b> — bu ürünün rotası ${siraCount} operasyondan oluşuyor: ${[...new Set(steps.sort((a,b)=>a.sira-b.sira).map(s=>s.operasyon))].join(' → ')}. İş emirleri kayıttan sonra siz "İş Emri Aç" dediğinizde oluşturulur.`;
}
async function deleteOrderCascade(id){
  if(!confirm('Bu siparişi ve ona bağlı tüm iş emirlerini / günlük kayıtları silmek istediğinize emin misiniz?')) return;
  const woIds = DB.workorders.filter(w=>w.orderId===id).map(w=>w.id);
  DB.production = DB.production.filter(p=>!woIds.includes(p.workOrderId));
  DB.workorders = DB.workorders.filter(w=>w.orderId!==id);
  DB.orders = DB.orders.filter(o=>o.id!==id);
  await persist('orders');
  await persist('workorders');
  await persist('production');
  showToast('Sipariş ve bağlı iş emirleri silindi');
  renderModule();
}

/* ---------------- SATIŞ SİPARİŞLERİ module ---------------- */
function viewSatisSiparisleri(){
  const satisOrders = DB.orders.filter(o=>o.kaynak==='satis');
  if(satisOrders.length===0) return emptyState('Henüz satış siparişi yok', 'Müşteri siparişi girildiğinde otomatik olarak Üretim Siparişleri listesine de düşer — iş emirleri orada planlamacı tarafından ayrıca açılır.', 'openSatisSiparisiModal()', 'Yeni Satış Siparişi');

  let orders = satisOrders.filter(o => matchSearch(o, ['urun','musteri','satisSiparisNo','not']));
  if(TABLO_SIRALAMA['satisSiparisleri']){
    orders = sirali('satisSiparisleri', orders);
  } else {
    orders = [...orders].sort((a,b)=> (parseDate(b.baslangicTarihi)||0) - (parseDate(a.baslangicTarihi)||0));
  }

  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>${sortableTh('satisSiparisleri','satisSiparisNo','Sipariş No')}${sortableTh('satisSiparisleri','orderNo','Takip No')}${sortableTh('satisSiparisleri','musteri','Müşteri')}${sortableTh('satisSiparisleri','urun','Ürün')}${sortableTh('satisSiparisleri','hedefMiktar','Miktar')}${sortableTh('satisSiparisleri','baslangicTarihi','Sipariş Tarihi')}${sortableTh('satisSiparisleri','istenenTeslimTarihi','İstenen Teslim')}<th>Üretim Durumu</th><th></th></tr></thead>
      <tbody>
        ${orders.map(o=>{
          const st = orderStats(o);
          const isEmriVar = st.steps.length>0;
          return `<tr>
            <td class="mono">${escapeHtml(o.satisSiparisNo||'—')}</td>
            <td class="mono">${escapeHtml(o.orderNo||'—')}</td>
            <td>${escapeHtml(o.musteri||'—')}</td>
            <td class="mono">${escapeHtml(o.urun)}</td>
            <td class="mono">${o.hedefMiktar}</td>
            <td class="mono">${fmtDate(o.baslangicTarihi)}</td>
            <td class="mono">${fmtDate(o.istenenTeslimTarihi)}</td>
            <td>${isEmriVar ? orderStatusBadge(o, st) : '<span class="badge badge-warn">İş Emri Bekliyor</span>'}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-primary" onclick="openSiparisRaporu('${o.id}')">Rapor</button>
              <button class="btn btn-sm btn-ghost" onclick="go('orders');">Üretim Siparişinde Gör</button>
              ${canEdit() ? `<button class="btn btn-sm btn-ghost" onclick="openSatisSiparisiModal('${o.id}')">Düzenle</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>
  <div class="field-hint" style="margin-top:10px;">Satış siparişleri, girildiği anda Üretim Siparişleri listesine düşer ancak iş emirleri otomatik açılmaz — planlamacı orada "İş Emri Aç" ile başlatır.</div>
  `;
}

function siparisRaporIcerigi(order){
  const st = orderStats(order);
  const steps = st.steps;

  let etaBlock;
  if(!steps.length){
    etaBlock = `<div class="field-hint">Henüz iş emri açılmadı — tahmini süre hesaplanamıyor.</div>`;
  } else {
    const splitVar = st.finalWOs.length > 1;
    etaBlock = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px;">
        <div class="kpi-card"><div class="kpi-label">Üretilen / Hedef</div><div class="kpi-value" style="font-size:20px;">${st.produced}</div><div class="kpi-foot">/ ${st.finalWOs.reduce((s,wo)=>s+(wo.hedefMiktar||0),0)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Kalan Miktar</div><div class="kpi-value" style="font-size:20px;">${st.remaining}</div></div>
        <div class="kpi-card ${st.behindSchedule?'warn':'good'}"><div class="kpi-label">Tahmini Bitiş</div><div class="kpi-value" style="font-size:16px;">${st.etaLabel}</div></div>
      </div>
      ${splitVar ? `
      <div class="field-hint" style="margin-bottom:8px;">Son operasyon ${st.finalWOs.length} makineye bölünmüş — sipariş, en geç biten split'e kadar tamamlanmış sayılmaz:</div>
      <div class="table-wrap"><table>
        <thead><tr><th>İş Emri</th><th>Makine</th><th>Hedef</th><th>Üretilen</th><th>Tahmini Bitiş</th></tr></thead>
        <tbody>
          ${st.finalStatsList.map(({wo,st:s2})=>`
            <tr><td class="mono">${escapeHtml(woNoGoster(wo))}</td><td>${escapeHtml(wo.isMerkezi)}</td><td class="mono">${wo.hedefMiktar}</td><td class="mono">${s2.produced}</td><td class="mono">${s2.etaLabel}</td></tr>
          `).join('')}
        </tbody>
      </table></div>` : `<div class="field-hint">Üretim Planı'nda son operasyon (${GUNLUK_OP_LABELS[st.finalWO.operasyon]||st.finalWO.operasyon}) için atanan günlere göre hesaplandı; plan yoksa fiili ölçüm hızına göre tahmindir.</div>`}
    `;
  }

  return `
    <div class="field-row">
      <div class="field"><label>Müşteri</label><div class="mono" style="padding:4px 0;">${escapeHtml(order.musteri||'—')}</div></div>
      <div class="field"><label>Ürün</label><div class="mono" style="padding:4px 0;">${escapeHtml(order.urun)}</div></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Hedef Miktar</label><div class="mono" style="padding:4px 0;">${order.hedefMiktar}</div></div>
      <div class="field"><label>İstenen Teslim</label><div class="mono" style="padding:4px 0;">${fmtDate(order.istenenTeslimTarihi)}</div></div>
    </div>
    <div style="margin:14px 0;border-top:1px solid var(--line);padding-top:12px;">
      <h5 style="margin:0 0 8px;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;color:var(--ink-faint);">Tahmini Bitiş</h5>
      ${etaBlock}
    </div>
    ${steps.length ? `
    <div style="margin-top:14px;">
      <h5 style="margin:0 0 8px;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;color:var(--ink-faint);">İş Emirleri</h5>
      <div class="table-wrap"><table>
        <thead><tr><th>İş Emri No</th><th>Operasyon</th><th>Makine</th><th>İlerleme</th></tr></thead>
        <tbody>
          ${steps.map(wo=>{
            const wst = workOrderStats(wo);
            return `<tr>
              <td class="mono">${escapeHtml(woNoGoster(wo))}</td>
              <td>${GUNLUK_OP_LABELS[wo.operasyon]||escapeHtml(wo.operasyon)}</td>
              <td>${escapeHtml(wo.isMerkezi)}</td>
              <td>%${wst.pct.toFixed(0)} (${wst.produced}/${wo.hedefMiktar})</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>` : ''}
  `;
}
function openSiparisRaporu(orderId){
  const order = DB.orders.find(o=>o.id===orderId);
  if(!order) return;
  openModal(`Sipariş Raporu — ${escapeHtml(order.orderNo||'')}`, siparisRaporIcerigi(order), async ()=>true);
}

/* ---------------- SATIŞ RAPORLARI — açılır/kapanır konsolide liste ---------------- */
let SATIS_RAPOR_ACIK = null;
function satisRaporAcikMi(orderId){
  if(SATIS_RAPOR_ACIK===null){
    try{ SATIS_RAPOR_ACIK = new Set(JSON.parse(localStorage.getItem('satisRaporAcik')||'[]')); }
    catch(e){ SATIS_RAPOR_ACIK = new Set(); }
  }
  return SATIS_RAPOR_ACIK.has(orderId);
}
function toggleSatisRapor(orderId){
  satisRaporAcikMi(orderId); // ensure init
  if(SATIS_RAPOR_ACIK.has(orderId)) SATIS_RAPOR_ACIK.delete(orderId);
  else SATIS_RAPOR_ACIK.add(orderId);
  try{ localStorage.setItem('satisRaporAcik', JSON.stringify([...SATIS_RAPOR_ACIK])); }catch(e){}
  renderModule();
}
function viewSatisRaporlari(){
  const satisOrders = DB.orders.filter(o=>o.kaynak==='satis');
  if(satisOrders.length===0) return emptyState('Henüz satış siparişi yok', 'Satış Siparişleri modülünden sipariş girildiğinde burada listelenecek.', null, null);

  let orders = satisOrders.filter(o => matchSearch(o, ['urun','musteri','satisSiparisNo','orderNo']));
  orders = [...orders].sort((a,b)=> (parseDate(b.baslangicTarihi)||0) - (parseDate(a.baslangicTarihi)||0));

  return `
  <div class="panel">
    <div class="panel-body" style="display:flex;flex-direction:column;gap:0;padding:0;">
      ${orders.map((o,i)=>{
        const acik = satisRaporAcikMi(o.id);
        const st = orderStats(o);
        const isEmriVar = st.steps.length>0;
        return `
        <div style="border-bottom:1px solid var(--line);${i===orders.length-1?'border-bottom:none;':''}">
          <div style="display:flex;align-items:center;gap:14px;padding:13px 18px;cursor:pointer;" onclick="toggleSatisRapor('${o.id}')">
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);width:14px;">${acik?'▼':'▶'}</span>
            <span class="mono" style="font-weight:600;min-width:110px;">${escapeHtml(o.orderNo||'')}</span>
            <span style="min-width:150px;">${escapeHtml(o.musteri||'—')}</span>
            <span class="mono" style="min-width:80px;">${escapeHtml(o.urun)}</span>
            <span class="field-hint mono" style="min-width:70px;">${o.hedefMiktar} adet</span>
            <span class="field-hint mono" style="min-width:90px;">teslim ${fmtDate(o.istenenTeslimTarihi)}</span>
            <span style="margin-left:auto;">${isEmriVar ? orderStatusBadge(o, st) : '<span class="badge badge-warn">İş Emri Bekliyor</span>'}</span>
          </div>
          ${acik ? `<div style="padding:0 18px 18px 42px;">${siparisRaporIcerigi(o)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function openSatisSiparisiModal(id){
  const rec = id ? DB.orders.find(x=>x.id===id) : {musteri:'', satisSiparisNo:'', urun:'', hedefMiktar:'', baslangicTarihi:toLocalISODate(new Date()), istenenTeslimTarihi:'', not:'', durum:'Aktif', kaynak:'satis'};
  const urunOptions = [...new Set(DB.routes.map(r=>r.urun))];
  openModal(`${id?'Satış Siparişini Düzenle':'Yeni Satış Siparişi'}`, `
    <div class="field-row">
      <div class="field"><label>Müşteri</label><input id="f-musteri" value="${escapeHtml(rec.musteri||'')}" placeholder="Müşteri adı"></div>
      <div class="field"><label>Satış Sipariş No</label><input id="f-satisSiparisNo" value="${escapeHtml(rec.satisSiparisNo||'')}" placeholder="Örn. SS-2026-0142"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Ürün</label><input id="f-urun" list="satis-urun-opts" value="${escapeHtml(rec.urun)}" placeholder="Ürün kodu"></div>
      <div class="field"><label>Miktar (adet)</label><input id="f-hedefMiktar" type="number" value="${rec.hedefMiktar}"></div>
    </div>
    <datalist id="satis-urun-opts">${urunOptions.map(t=>`<option value="${escapeHtml(t)}">`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Sipariş Tarihi</label><input id="f-baslangicTarihi" type="date" value="${rec.baslangicTarihi||''}"></div>
      <div class="field"><label>İstenen Teslim Tarihi</label><input id="f-istenenTeslimTarihi" type="date" value="${rec.istenenTeslimTarihi||''}"></div>
    </div>
    <div class="field"><label>Not</label><textarea id="f-not">${escapeHtml(rec.not||'')}</textarea></div>
    <div class="field-hint">Kaydedildiğinde Üretim Siparişleri listesine düşer — iş emirleri otomatik açılmaz, planlamacı orada başlatır.</div>
  `, async ()=>{
    const data = {
      musteri: val('f-musteri'), satisSiparisNo: val('f-satisSiparisNo'), urun: val('f-urun'),
      hedefMiktar: parseFloat(val('f-hedefMiktar'))||0, baslangicTarihi: val('f-baslangicTarihi'),
      istenenTeslimTarihi: val('f-istenenTeslimTarihi'), not: val('f-not')
    };
    if(!data.musteri || !data.urun || !data.hedefMiktar){ showToast('Müşteri, ürün ve miktar zorunlu', true); return false; }
    const routeStepCount = DB.routes.filter(r=>r.urun===data.urun).length;
    if(!id && routeStepCount===0){ showToast('Bu ürün için tanımlı rota bulunamadı — önce Rotalar modülüne ekleyin', true); return false; }
    if(id){
      Object.assign(DB.orders.find(x=>x.id===id), data, {orderNo: siparisNoUret(data.satisSiparisNo)});
      await persist('orders');
      showToast('Satış siparişi güncellendi');
    } else {
      const order = {id:uid(), orderNo: siparisNoUret(data.satisSiparisNo), kaynak:'satis', durum:'Aktif', ...data};
      DB.orders.push(order);
      await persist('orders');
      showToast('Satış siparişi kaydedildi ve Üretim Siparişleri listesine eklendi');
    }
    renderModule();
    return true;
  });
}

/* ---------------- İŞ EMİRLERİ module (per-operation daily entry) ---------------- */
/* =======================================================================
   ÜRETİM GİRİŞİ — operatörler için en az tıklamayla günlük adet girişi.
   Sipariş seçmeye / adım genişletmeye gerek yok: tüm açık iş emirleri tek
   ekranda kart olarak listelenir, değer girilip doğrudan kaydedilir.
   ======================================================================= */
function varsayilanVardiya(){
  const saat = new Date().getHours();
  if(saat < 13) return 'Sabah';
  if(saat < 19) return 'Öğleden Sonra';
  return 'Mesai';
}
function uretimGirisiKaydiBul(workOrderId, tarih, vardiya){
  return DB.production.find(p=>p.workOrderId===workOrderId && p.tarih===tarih && p.vardiya===vardiya) || null;
}
let UG_TARIH = null;
function viewUretimGirisi(){
  if(!UG_TARIH) UG_TARIH = toLocalISODate(new Date());
  const bugun = toLocalISODate(new Date());
  const varsayilan = varsayilanVardiya();

  const tarihSecici = `
  <div class="panel">
    <div class="panel-body" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <label style="font-size:12.5px;font-weight:600;color:var(--ink-soft);">Tarih:</label>
      <input type="date" value="${UG_TARIH}" onchange="UG_TARIH=this.value; renderModule();" style="padding:6px 10px;border:1px solid var(--line-strong);border-radius:3px;font-size:13px;">
      <button class="btn btn-sm btn-ghost" onclick="UG_TARIH='${bugun}'; renderModule();">Bugün</button>
      <span class="field-hint">Sadece Üretim Planı'nda bu tarihe atanmış iş emirleri gösterilir.</span>
    </div>
  </div>`;

  // o tarih için haftalık planda hangi iş emirleri hangi makineye atanmış
  const planMap = {}; // workOrderId -> plan kaydı (o güne ait, ilk eşleşen)
  DB.makinePlani.filter(p=>p.tarih===UG_TARIH && p.workOrderId).forEach(p=>{ if(!planMap[p.workOrderId]) planMap[p.workOrderId] = p; });

  const acikWOs = DB.workorders.filter(w=>w.durum==='Aktif' && planMap[w.id] && workOrderStats(w).remaining>0);
  if(acikWOs.length===0){
    return tarihSecici + emptyState('Bu tarih için planlanmış iş yok', `${fmtDate(UG_TARIH)} için Üretim Planı'nda henüz bir iş emri ataması yapılmamış. Haftalık Üretim Planı modülünden atama yapabilirsiniz.`, null, null);
  }

  let list = acikWOs.filter(w => matchSearch(w, ['urun','isMerkezi','operasyon']));
  list = [...list].sort((a,b)=> woNoGoster(a).localeCompare(woNoGoster(b)));

  return tarihSecici + `
  <div class="field-hint" style="margin:14px 0;">${fmtDate(UG_TARIH)} için planlanan iş emirleri — sipariş seçmenize veya adım açmanıza gerek yok.</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">
    ${list.map(wo=>{
      const stats = workOrderStats(wo);
      const kayit = uretimGirisiKaydiBul(wo.id, UG_TARIH, varsayilan);
      const plan = planMap[wo.id];
      return `
      <div class="panel" style="padding:16px;margin-bottom:0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
          <div>
            <div class="mono" style="font-weight:700;font-size:13.5px;">${escapeHtml(woNoGoster(wo))}</div>
            <div style="font-size:13px;font-weight:600;margin-top:2px;">${escapeHtml(wo.urun)} <span style="font-weight:400;color:var(--ink-soft);">— ${GUNLUK_OP_LABELS[wo.operasyon]||escapeHtml(wo.operasyon)}</span></div>
            <div class="field-hint">${escapeHtml(wo.isMerkezi)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div class="field-hint">Bugün Planlanan</div>
            <div class="mono" style="font-weight:700;font-size:22px;">${plan?.hedefMiktar ?? '—'}</div>
            <div class="field-hint" style="margin-top:2px;">Toplam ${wo.hedefMiktar} adet · kalan ${stats.remaining}</div>
          </div>
        </div>
        <div class="part-progress-bar"><div class="part-progress-fill" style="width:${stats.pct}%; background:${stats.behindSchedule?'var(--flag)':'var(--good)'};"></div></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
          <div class="field" style="margin:0;"><label>Vardiya</label>
            <select id="ug-vardiya-${wo.id}" ${canEdit()?'':'disabled'} onchange="renderModule();">
              <option value="Sabah" ${varsayilan==='Sabah'?'selected':''}>Sabah</option>
              <option value="Öğleden Sonra" ${varsayilan==='Öğleden Sonra'?'selected':''}>Öğleden Sonra</option>
              <option value="Mesai" ${varsayilan==='Mesai'?'selected':''}>Mesai</option>
            </select>
          </div>
          <div class="field" style="margin:0;"><label>Tarih</label><input type="date" id="ug-tarih-${wo.id}" value="${UG_TARIH}" ${canEdit()?'':'disabled'}></div>
          <div class="field" style="margin:0;"><label>Gerçekleşen Adet</label><input type="number" id="ug-gercek-${wo.id}" class="mono" value="${kayit?.gercekAdet ?? ''}" ${canEdit()?'':'disabled'}></div>
          <div class="field" style="margin:0;"><label>Fire Adet</label><input type="number" id="ug-fire-${wo.id}" class="mono" value="${kayit?.fireAdet ?? ''}" ${canEdit()?'':'disabled'}></div>
        </div>
        ${canEdit() ? `<button class="btn btn-primary" style="width:100%;margin-top:12px;justify-content:center;" onclick="kaydetUretimGirisi('${wo.id}')">Kaydet</button>` : ''}
        ${kayit ? `<div class="field-hint" style="margin-top:6px;text-align:center;">Bu vardiya için kayıt zaten var — kaydet, üzerine güncellenir.</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}
async function kaydetUretimGirisi(workOrderId){
  const wo = DB.workorders.find(w=>w.id===workOrderId);
  if(!wo) return;
  const tarih = document.getElementById(`ug-tarih-${workOrderId}`).value;
  const vardiya = document.getElementById(`ug-vardiya-${workOrderId}`).value;
  const gercekAdet = parseFloat(document.getElementById(`ug-gercek-${workOrderId}`).value)||0;
  const fireAdet = parseFloat(document.getElementById(`ug-fire-${workOrderId}`).value)||0;
  if(!tarih){ showToast('Tarih zorunlu', true); return; }
  let kayit = uretimGirisiKaydiBul(workOrderId, tarih, vardiya);
  if(kayit){
    kayit.gercekAdet = gercekAdet; kayit.fireAdet = fireAdet;
  } else {
    const stats = workOrderStats(wo);
    const hedefAdet = Math.min(stats.capTarget||stats.remaining||0, stats.remaining||0) || stats.capTarget || null;
    DB.production.push({id:uid(), workOrderId, tarih, vardiya, hedefAdet, gercekAdet, fireAdet, not:''});
  }
  await persist('production');
  showToast('Üretim kaydı kaydedildi');
  renderModule();
}

/* =======================================================================
   SATINALMA İSTEKLERİ — talep listesi + mal geldikçe giriş kaydı
   ======================================================================= */
function satinalmaGelenToplam(istekId){
  return DB.satinalmaGirisleri.filter(g=>g.satinalmaIstegiId===istekId).reduce((s,g)=>s+(parseFloat(g.miktar)||0),0);
}
// Bir mal girişinin stoğa sayılabilmesi için giriş kalite kontrolünün yapılmış VE
// Kabul (Uygun) sonuçlu olması gerekir — kontrolsüz ya da Red malzeme stoğa girmez.
function girisKaliteKapsananGirisIdleri(gk){
  // Eski kayıtlar tekil satinalmaGirisId, yeni kayıtlar dizi (satinalmaGirisIdleri) tutar.
  if(gk.satinalmaGirisIdleri && gk.satinalmaGirisIdleri.length) return gk.satinalmaGirisIdleri;
  return gk.satinalmaGirisId ? [gk.satinalmaGirisId] : [];
}
function girisKaliteBirim(kayit){
  const girisIdleri = girisKaliteKapsananGirisIdleri(kayit);
  if(girisIdleri.length===0) return '';
  const giris = DB.satinalmaGirisleri.find(g=>g.id===girisIdleri[0]);
  const istek = giris ? DB.satinalmaIstekleri.find(i=>i.id===giris.satinalmaIstegiId) : null;
  return istek?.birim || '';
}
function girisKaliteDurumu(satinalmaGirisId){
  const gk = DB.girisKaliteKontrolleri.find(k=>girisKaliteKapsananGirisIdleri(k).includes(satinalmaGirisId));
  if(!gk) return 'Bekliyor';
  return gk.genelSonuc==='Kabul' ? 'Uygun' : gk.genelSonuc==='Red' ? 'Uygun Değil' : 'Bekliyor';
}
function satinalmaOnaylanmisToplam(istekId){
  return DB.satinalmaGirisleri.filter(g=>g.satinalmaIstegiId===istekId && girisKaliteDurumu(g.id)==='Uygun')
    .reduce((s,g)=>s+(parseFloat(g.miktar)||0),0);
}
function satinalmaDurum(istek){
  const gelen = satinalmaGelenToplam(istek.id);
  if(gelen<=0) return 'Bekliyor';
  if(gelen < (istek.miktar||0)) return 'Kısmi Geldi';
  return 'Tamamlandı';
}
function satinalmaDurumBadge(durum){
  if(durum==='Tamamlandı') return '<span class="badge badge-good">Tamamlandı</span>';
  if(durum==='Kısmi Geldi') return '<span class="badge badge-warn">Kısmi Geldi</span>';
  return '<span class="badge badge-neutral">Bekliyor</span>';
}

/* =======================================================================
   ÜRÜN AĞAÇLARI (BOM) — hammadde-parça verim hesaplama, gerçek mühendislik
   ürün ağacı Excel'inden alındı. Formül: bir hammadde borusundan kaç bitmiş
   parça çıkar = TABANA_YUVARLA(Hammadde_Boyu / (Parça_Boyu + Kesim_Kaybı)).
   ======================================================================= */
function ensureUrunAgaclari(){
  if(DB.urunAgaclari && DB.urunAgaclari.length>0) return false;
  // Ürün_Ağaçları.xlsx içeriği — Drawing No, Rev No ve verim formülleriyle
  DB.urunAgaclari = [
    {id:uid(), urun:'221170', malzemeKodu:'221CM017', malzemeAciklama:'18,03*3.21*2640 Cu-ETP BAKIR BORU', disCap:18.03, icCap:11.62, hammaddeUzunluk:2640, hammaddeAgirlik:3.68, parcaBoyu:88.5, kesimKaybi:5, tedarikciKesimUzunlugu:2640},
    {id:uid(), urun:'221171', malzemeKodu:'221CM018', malzemeAciklama:'20,82*3,46*2740mm Cu-ETP BAKIR BORU', disCap:20.82, icCap:13.91, hammaddeUzunluk:2740, hammaddeAgirlik:4.58, parcaBoyu:99.5, kesimKaybi:5, tedarikciKesimUzunlugu:2740},
    {id:uid(), urun:'221172', malzemeKodu:'221CM019', malzemeAciklama:'23,90*3.96*2660mm Cu-ETP BAKIR BORU', disCap:23.90, icCap:15.98, hammaddeUzunluk:2660, hammaddeAgirlik:5.94, parcaBoyu:105, kesimKaybi:5, tedarikciKesimUzunlugu:2660},
    {id:uid(), urun:'221173', malzemeKodu:'221CM016', malzemeAciklama:'13,28*2.24*2650 Cu-ETP BAKIR BORU', disCap:13.28, icCap:8.81, hammaddeUzunluk:2650, hammaddeAgirlik:1.84, parcaBoyu:76, kesimKaybi:5, tedarikciKesimUzunlugu:2650},
  ];
  return true;
}
function bomBul(urun){ return DB.urunAgaclari.find(b=>b.urun===urun) || null; }
function bomHesapla(bom){
  const parcaAdedi = Math.floor(bom.hammaddeUzunluk / (bom.parcaBoyu + bom.kesimKaybi));
  const parcaAgirligi = parcaAdedi>0 ? Math.round((bom.hammaddeAgirlik/parcaAdedi)*100000)/100000 : 0;
  const kalinlik = Math.round(((bom.disCap-bom.icCap)/2)*100)/100;
  return {...bom, parcaAdedi, parcaAgirligi, kalinlik};
}
function hammaddeIhtiyaciHesapla(urun, adet){
  const bom = bomBul(urun);
  if(!bom || !adet) return null;
  const h = bomHesapla(bom);
  const tupSayisi = Math.ceil(adet / h.parcaAdedi);
  return {
    malzemeKodu: h.malzemeKodu, malzemeAciklama: h.malzemeAciklama, parcaAdediPerTup: h.parcaAdedi,
    tupSayisi, toplamUzunluk: tupSayisi*h.hammaddeUzunluk, toplamAgirlik: Math.round(tupSayisi*h.hammaddeAgirlik*1000)/1000
  };
}
function malzemeKoduUrunBul(malzemeKodu){ const b = DB.urunAgaclari.find(x=>x.malzemeKodu===malzemeKodu); return b?b.urun:null; }

function viewUrunAgaclari(){
  return `
  <div class="field-hint" style="margin-bottom:14px;">Kesim operasyonunun hammaddesi — bu kodlar Satınalma'da doğrudan kullanılır, hammadde girişi buradan stoğa yansır.</div>
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr><th>Ürün</th><th>Malzeme Kodu</th><th>Açıklama</th><th>Dış/İç Çap</th><th>Hammadde Boyu</th><th>Hammadde Ağırlığı</th><th>Parça Boyu</th><th>Kesim Kaybı</th><th>Tüpten Çıkan Parça</th><th>Parça Ağırlığı</th></tr></thead>
      <tbody>
        ${DB.urunAgaclari.map(bom=>{
          const h = bomHesapla(bom);
          return `<tr>
            <td class="mono"><b>${escapeHtml(bom.urun)}</b></td>
            <td class="mono">${escapeHtml(bom.malzemeKodu)}</td>
            <td style="font-size:12px;">${escapeHtml(bom.malzemeAciklama)}</td>
            <td class="mono">${bom.disCap} / ${bom.icCap} mm</td>
            <td class="mono">${bom.hammaddeUzunluk} mm</td>
            <td class="mono">${bom.hammaddeAgirlik} kg</td>
            <td class="mono">${bom.parcaBoyu} mm</td>
            <td class="mono">${bom.kesimKaybi} mm</td>
            <td class="mono"><b>${h.parcaAdedi} adet</b></td>
            <td class="mono">${h.parcaAgirligi} kg</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>

  <div class="panel">
    <div class="panel-head"><h3>Hammadde İhtiyacı Hesapla</h3><span class="field-hint">Sipariş miktarına göre kaç tüp gerektiğini gösterir</span></div>
    <div class="panel-body">
      <div class="field-row">
        <div class="field"><label>Ürün</label>
          <select id="ba-urun" onchange="renderModule()">
            ${DB.urunAgaclari.map(b=>`<option value="${b.urun}" ${BOM_HESAP_URUN===b.urun?'selected':''}>${b.urun}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Adet</label><input id="ba-adet" type="number" value="${BOM_HESAP_ADET||''}" oninput="BOM_HESAP_ADET=this.value; BOM_HESAP_URUN=document.getElementById('ba-urun').value; renderModule();"></div>
      </div>
      ${(()=>{
        const urun = document.getElementById('ba-urun')?.value || BOM_HESAP_URUN || DB.urunAgaclari[0]?.urun;
        const adet = parseFloat(BOM_HESAP_ADET);
        if(!adet) return `<div class="field-hint">Adet girin.</div>`;
        const r = hammaddeIhtiyaciHesapla(urun, adet);
        if(!r) return '';
        return `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:12px;">
          <div class="kpi-card"><div class="kpi-label">Gerekli Tüp</div><div class="kpi-value">${r.tupSayisi}</div><div class="kpi-foot">${r.malzemeKodu}</div></div>
          <div class="kpi-card"><div class="kpi-label">Toplam Uzunluk</div><div class="kpi-value" style="font-size:20px;">${r.toplamUzunluk} mm</div></div>
          <div class="kpi-card"><div class="kpi-label">Toplam Ağırlık</div><div class="kpi-value" style="font-size:20px;">${r.toplamAgirlik} kg</div></div>
        </div>`;
      })()}
    </div>
  </div>
  <div class="field-hint" style="margin-top:10px;">Not: Presleme'de her ara kesim parçası 2 bitmiş parçaya bölünüyorsa (bu 4 üründe de böyle), yukarıdaki "Tüpten Çıkan Parça" bu çift-verimi zaten içeriyor — Kalite Kontrol'deki Kesim Boyu ölçümü (ara kesim uzunluğu) ile karıştırılmamalı, o ayrı bir kontrol noktasıdır.</div>
  `;
}

let BOM_HESAP_URUN = null, BOM_HESAP_ADET = null;

function viewSatinalma(){
  if(DB.satinalmaIstekleri.length===0) return emptyState('Henüz satınalma isteği yok', 'Malzeme/ürün ve miktar girerek ilk talebinizi oluşturun. Mal geldikçe "Giriş Yap" ile kaydedersiniz.', 'openSatinalmaModal()', 'Yeni İstek');

  let list = DB.satinalmaIstekleri.filter(i => matchSearch(i, ['malzeme','urun','tedarikci','not']));
  if(TABLO_SIRALAMA['satinalma']){
    list = sirali('satinalma', list);
  } else {
    list = [...list].sort((a,b)=>{
      const rank = d => d==='Bekliyor'?0:d==='Kısmi Geldi'?1:2;
      return rank(satinalmaDurum(a)) - rank(satinalmaDurum(b)) || (parseDate(b.istekTarihi)||0)-(parseDate(a.istekTarihi)||0);
    });
  }

  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>${sortableTh('satinalma','malzeme','Malzeme / Ürün')}${sortableTh('satinalma','miktar','İstenen')}<th>Gelen</th>${sortableTh('satinalma','tedarikci','Tedarikçi')}${sortableTh('satinalma','istekTarihi','İstek Tarihi')}${sortableTh('satinalma','beklenenTarih','Beklenen')}<th>Bağlı Sipariş</th><th>Durum</th><th></th></tr></thead>
      <tbody>
        ${list.map(i=>{
          const gelen = satinalmaGelenToplam(i.id);
          const durum = satinalmaDurum(i);
          const order = i.orderId ? DB.orders.find(o=>o.id===i.orderId) : null;
          return `<tr>
            <td><b>${escapeHtml(i.malzeme||i.urun||'')}</b>${i.urun?`<div class="field-hint mono">${escapeHtml(i.urun)}</div>`:''}</td>
            <td class="mono">${i.miktar} ${escapeHtml(i.birim||'')}</td>
            <td class="mono">${gelen} ${escapeHtml(i.birim||'')}</td>
            <td>${escapeHtml(i.tedarikci||'—')}</td>
            <td class="mono">${fmtDate(i.istekTarihi)}</td>
            <td class="mono">${fmtDate(i.beklenenTarih)}</td>
            <td class="mono">${order?escapeHtml(order.orderNo):'—'}</td>
            <td>${satinalmaDurumBadge(durum)}</td>
            <td><div class="row-actions">
              ${canEdit() && durum!=='Tamamlandı' ? `<button class="btn btn-sm btn-primary" onclick="openSatinalmaGirisModal('${i.id}')">Giriş Yap</button>` : ''}
              ${canEdit() ? `<button class="btn btn-sm btn-ghost" onclick="openSatinalmaModal('${i.id}')">Düzenle</button><button class="btn btn-sm btn-danger" onclick="deleteSatinalma('${i.id}')">Sil</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function openSatinalmaModal(id){
  const rec = id ? DB.satinalmaIstekleri.find(x=>x.id===id) : {malzeme:'', urun:'', miktar:'', birim:'adet', tedarikci:'', istekTarihi:toLocalISODate(new Date()), beklenenTarih:'', orderId:'', not:''};
  const malzemeOptions = DB.urunAgaclari.map(b=>({kod:b.malzemeKodu, ad:b.malzemeAciklama}));
  openModal(`${id?'Satınalma İsteğini Düzenle':'Yeni Satınalma İsteği'}`, `
    <div class="field-row">
      <div class="field"><label>Malzeme Adı</label><input id="sa-malzeme" value="${escapeHtml(rec.malzeme||'')}" placeholder="Örn. 18,03*3.21*2640 Cu-ETP BAKIR BORU"></div>
      <div class="field"><label>Malzeme / Ürün Kodu</label><input id="sa-urun" list="sa-urun-opts" value="${escapeHtml(rec.urun||'')}" placeholder="Örn. 221CM016" onchange="satinalmaIhtiyacGoster()"></div>
    </div>
    <datalist id="sa-urun-opts">${malzemeOptions.map(m=>`<option value="${escapeHtml(m.kod)}">${escapeHtml(m.ad)}</option>`).join('')}</datalist>
    <div class="field-row">
      <div class="field"><label>Miktar</label><input id="sa-miktar" type="number" value="${rec.miktar}"></div>
      <div class="field"><label>Birim</label><input id="sa-birim" list="sa-birim-opts" value="${escapeHtml(rec.birim||'adet')}"></div>
      <datalist id="sa-birim-opts"><option value="adet"><option value="kg"><option value="tüp"></datalist>
    </div>
    <div class="field"><label>Tedarikçi</label><input id="sa-tedarikci" value="${escapeHtml(rec.tedarikci||'')}"></div>
    <div class="field-row">
      <div class="field"><label>İstek Tarihi</label><input id="sa-istekTarihi" type="date" value="${rec.istekTarihi||''}"></div>
      <div class="field"><label>Beklenen Tarih</label><input id="sa-beklenenTarih" type="date" value="${rec.beklenenTarih||''}"></div>
    </div>
    <div class="field"><label>Bağlı Sipariş (opsiyonel)</label>
      <select id="sa-orderId" onchange="satinalmaIhtiyacGoster()">
        <option value="">— Genel stok (belirli bir siparişe bağlı değil) —</option>
        ${DB.orders.map(o=>`<option value="${o.id}" ${rec.orderId===o.id?'selected':''}>${escapeHtml(o.orderNo)} — ${escapeHtml(o.urun)}</option>`).join('')}
      </select>
    </div>
    <div id="sa-ihtiyac-hint"></div>
    <div class="field"><label>Not</label><textarea id="sa-not">${escapeHtml(rec.not||'')}</textarea></div>
  `, async ()=>{
    const data = {
      malzeme: val('sa-malzeme'), urun: val('sa-urun'), miktar: parseFloat(val('sa-miktar'))||0, birim: val('sa-birim'),
      tedarikci: val('sa-tedarikci'), istekTarihi: val('sa-istekTarihi'), beklenenTarih: val('sa-beklenenTarih'),
      orderId: val('sa-orderId')||null, not: val('sa-not')
    };
    if(!data.malzeme || !data.miktar){ showToast('Malzeme adı ve miktar zorunlu', true); return false; }
    if(id){ Object.assign(DB.satinalmaIstekleri.find(x=>x.id===id), data); }
    else { DB.satinalmaIstekleri.push({id:uid(), ...data}); }
    await persist('satinalmaIstekleri');
    showToast('Satınalma isteği kaydedildi');
    renderModule();
    return true;
  });
  if(rec.orderId || rec.urun) setTimeout(satinalmaIhtiyacGoster, 0);
}
function satinalmaIhtiyacGoster(){
  const hint = document.getElementById('sa-ihtiyac-hint');
  if(!hint) return;
  const orderId = document.getElementById('sa-orderId')?.value;
  const malzemeKodu = document.getElementById('sa-urun')?.value;
  const order = orderId ? DB.orders.find(o=>o.id===orderId) : null;
  if(!order){ hint.innerHTML = ''; return; }
  const bomByOrder = bomBul(order.urun);
  const r = hammaddeIhtiyaciHesapla(order.urun, order.hedefMiktar);
  if(!r){ hint.innerHTML = ''; return; }
  // malzeme kodu boşsa veya bu siparişin BOM'una uymuyorsa otomatik doldur
  const malzemeAlani = document.getElementById('sa-urun');
  const malzemeAdiAlani = document.getElementById('sa-malzeme');
  hint.innerHTML = `
    <div class="field-hint" style="background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:10px 12px;margin:-6px 0 12px;">
      <b>${escapeHtml(order.orderNo)}</b> (${order.hedefMiktar} adet ${escapeHtml(order.urun)}) için hesaplanan hammadde ihtiyacı:
      <b>${r.tupSayisi} tüp</b> ${escapeHtml(r.malzemeKodu)} (${r.toplamUzunluk} mm, ${r.toplamAgirlik} kg toplam)
      <button type="button" class="btn btn-sm btn-primary" style="margin-left:8px;" onclick="satinalmaIhtiyaciUygula('${r.malzemeKodu}','${escapeHtml(r.malzemeAciklama).replace(/'/g,"\\'")}',${r.tupSayisi})">Bu miktarı kullan</button>
    </div>`;
}
function satinalmaIhtiyaciUygula(malzemeKodu, aciklama, tupSayisi){
  document.getElementById('sa-urun').value = malzemeKodu;
  document.getElementById('sa-malzeme').value = aciklama;
  document.getElementById('sa-miktar').value = tupSayisi;
  document.getElementById('sa-birim').value = 'tüp';
}
function openSatinalmaGirisModal(istekId){
  const acikIstekler = DB.satinalmaIstekleri.filter(i=>satinalmaDurum(i)!=='Tamamlandı');
  if(!istekId && acikIstekler.length===0){ showToast('Açık (tamamlanmamış) satınalma isteği yok', true); return; }
  const seciliIstek = istekId ? DB.satinalmaIstekleri.find(x=>x.id===istekId) : acikIstekler[0];
  if(!seciliIstek) return;

  const istekSecici = istekId
    ? `<input type="hidden" id="sg-istekId" value="${seciliIstek.id}">`
    : `<div class="field"><label>Satınalma İsteği</label>
        <select id="sg-istekId" onchange="satinalmaGirisIstekDegisti()">
          ${acikIstekler.map(i=>`<option value="${i.id}">${escapeHtml(i.malzeme||i.urun)} — ${escapeHtml(i.urun||'')} (${satinalmaGelenToplam(i.id)}/${i.miktar} ${escapeHtml(i.birim||'')})</option>`).join('')}
        </select>
      </div>`;

  openModal(`Mal Girişi${istekId?' — '+escapeHtml(seciliIstek.malzeme||seciliIstek.urun):''}`, `
    ${istekSecici}
    <div class="field-hint" id="sg-istek-hint" style="margin-bottom:12px;">${satinalmaGirisIstekHintHTML(seciliIstek)}</div>
    <div class="field-row">
      <div class="field"><label>Giriş Tarihi</label><input id="sg-tarih" type="date" value="${toLocalISODate(new Date())}"></div>
      <div class="field"><label>Gelen Miktar</label><input id="sg-miktar" type="number" value=""></div>
    </div>
    <div class="field"><label>Not</label><textarea id="sg-not"></textarea></div>
  `, async ()=>{
    const secilenId = val('sg-istekId');
    const miktar = parseFloat(val('sg-miktar'))||0;
    if(!secilenId){ showToast('Satınalma isteği seçin', true); return false; }
    if(miktar<=0){ showToast('Geçerli bir miktar girin', true); return false; }
    DB.satinalmaGirisleri.push({id:uid(), satinalmaIstegiId: secilenId, tarih: val('sg-tarih'), miktar, not: val('sg-not')});
    await persist('satinalmaGirisleri');
    showToast('Mal girişi kaydedildi');
    renderModule();
    return true;
  });
}
function satinalmaGirisIstekHintHTML(istek){
  const gelen = satinalmaGelenToplam(istek.id);
  return `İstenen: <b>${istek.miktar} ${escapeHtml(istek.birim||'')}</b> · Şu ana kadar gelen: <b>${gelen} ${escapeHtml(istek.birim||'')}</b> · Kalan: <b>${Math.max(0,istek.miktar-gelen)} ${escapeHtml(istek.birim||'')}</b>`;
}
function satinalmaGirisIstekDegisti(){
  const id = document.getElementById('sg-istekId')?.value;
  const istek = DB.satinalmaIstekleri.find(x=>x.id===id);
  const hint = document.getElementById('sg-istek-hint');
  if(istek && hint) hint.innerHTML = satinalmaGirisIstekHintHTML(istek);
}

function viewSatinalmaGirisleri(){
  if(DB.satinalmaGirisleri.length===0) return emptyState('Henüz mal girişi yok', 'Bir satınalma isteği için birden fazla kez giriş yapabilirsiniz — hammadde parça parça geldikçe her seferinde buradan kaydedin.', 'openSatinalmaGirisModal()', 'Yeni Giriş');

  let list = [...DB.satinalmaGirisleri];
  if(TABLO_SIRALAMA['satinalmaGirisleri']){
    list = sirali('satinalmaGirisleri', list);
  } else {
    list.sort((a,b)=> (parseDate(b.tarih)||0) - (parseDate(a.tarih)||0));
  }

  return `
  <div class="panel">
    <div class="table-wrap"><table>
      <thead><tr>${sortableTh('satinalmaGirisleri','tarih','Tarih')}<th>Malzeme / Ürün</th><th>Bağlı Sipariş</th>${sortableTh('satinalmaGirisleri','miktar','Gelen Miktar')}<th>İsteğin Toplamı</th><th>Kalite Kontrol</th><th>Not</th><th></th></tr></thead>
      <tbody>
        ${list.map(g=>{
          const istek = DB.satinalmaIstekleri.find(i=>i.id===g.satinalmaIstegiId);
          const order = istek?.orderId ? DB.orders.find(o=>o.id===istek.orderId) : null;
          const gk = DB.girisKaliteKontrolleri.find(x=>girisKaliteKapsananGirisIdleri(x).includes(g.id));
          return `<tr>
            <td class="mono">${fmtDate(g.tarih)}</td>
            <td><b>${escapeHtml(istek?.malzeme||istek?.urun||'—')}</b>${istek?.urun?`<div class="field-hint mono">${escapeHtml(istek.urun)}</div>`:''}</td>
            <td class="mono">${order?escapeHtml(order.orderNo):'—'}</td>
            <td class="mono"><b>${g.miktar}</b> ${escapeHtml(istek?.birim||'')}</td>
            <td class="mono field-hint">${istek ? `${satinalmaGelenToplam(istek.id)}/${istek.miktar}` : '—'}</td>
            <td>${gk ? (gk.genelSonuc==='Kabul'?'<span class="badge badge-good">Uygun</span>':gk.genelSonuc==='Red'?'<span class="badge badge-flag">Uygun Değil</span>':'<span class="badge badge-neutral">Kayıt var</span>') :
              (canEdit() ? `<button class="btn btn-sm btn-primary" onclick="girisKaliteBaslatSatinalmadan('${g.id}')">Kalite Kontrol Yap</button>` : '<span class="badge badge-warn">Bekliyor</span>')}</td>
            <td style="font-size:12px;">${escapeHtml(g.not||'')}</td>
            <td>${canEdit() ? `<button class="btn btn-sm btn-danger" onclick="deleteSatinalmaGiris('${g.id}')">Sil</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}
function girisKaliteBaslatSatinalmadan(satinalmaGirisId){
  const giris = DB.satinalmaGirisleri.find(g=>g.id===satinalmaGirisId);
  if(!giris) return;
  const istek = DB.satinalmaIstekleri.find(i=>i.id===giris.satinalmaIstegiId);
  GIRISKALITE_PREFILL = {
    satinalmaGirisIdleri: [giris.id],
    tedarikci: istek?.tedarikci || '',
    malzeme: istek?.urun || istek?.malzeme || '',
    urun: istek?.urun || '',
    gelenAdet: giris.miktar,
    malzemeGelisTarihi: giris.tarih
  };
  GUNLUK_TAB = 'girisKontrol';
  GIRISKALITE_EDIT = 'new';
  go('gunluk');
}
async function deleteSatinalmaGiris(id){
  if(!confirm('Bu mal giriş kaydını silmek istediğinize emin misiniz?')) return;
  DB.satinalmaGirisleri = DB.satinalmaGirisleri.filter(g=>g.id!==id);
  await persist('satinalmaGirisleri');
  showToast('Giriş kaydı silindi');
  renderModule();
}
async function deleteSatinalma(id){
  if(!confirm('Bu satınalma isteğini ve ilgili tüm giriş kayıtlarını silmek istediğinize emin misiniz?')) return;
  DB.satinalmaGirisleri = DB.satinalmaGirisleri.filter(g=>g.satinalmaIstegiId!==id);
  DB.satinalmaIstekleri = DB.satinalmaIstekleri.filter(x=>x.id!==id);
  await persist('satinalmaGirisleri');
  await persist('satinalmaIstekleri');
  showToast('Satınalma isteği silindi');
  renderModule();
}

/* =======================================================================
   STOK DURUMU — her aşamanın stoğu, üretim kayıtlarından CANLI hesaplanır.
   Bir aşamanın stoğu = o aşamada üretilen − bir sonraki aşamada üretilen
   (yani tüketilen). İlk aşama için "girdi" satınalma girişleridir.
   ======================================================================= */
function asamaUretilen(orderId, sira){
  const wos = DB.workorders.filter(w=>w.orderId===orderId && String(w.sira)===String(sira));
  return wos.reduce((s,wo)=> s + workOrderStats(wo).produced, 0);
}
// Bir satınalma girişini, girildiği birime göre (kg / tüp / adet) hem KG hem PARÇA ADEDİ
// eşdeğerine çevirir. Daha önce her giriş "tüp" sayılıp adede çevriliyordu — kg cinsinden
// girilen miktarlar da yanlışlıkla tüp sayısı gibi işlem görüyordu.
function birimDonusum(miktar, birim, h){
  const b = String(birim||'').toLowerCase().trim();
  if(!h) return {kg:0, adet:miktar}; // bu malzeme için BOM/verim bilgisi yoksa dönüşüm yapılamaz
  if(b.includes('kg')){
    return { kg: miktar, adet: h.parcaAgirligi>0 ? miktar/h.parcaAgirligi : 0 };
  }
  if(b.includes('tüp') || b.includes('tup') || b.includes('boru')){
    return { kg: miktar*h.hammaddeAgirlik, adet: miktar*h.parcaAdedi };
  }
  // 'adet'/'parça' ya da belirtilmemiş -> doğrudan parça adedi say
  return { kg: miktar*h.parcaAgirligi, adet: miktar };
}
function hammaddeStokBilgisi(urun){
  const bom = bomBul(urun);
  const malzemeKodu = bom ? bom.malzemeKodu : urun;
  const h = bom ? bomHesapla(bom) : null;
  const kabulEdilenKodlar = [malzemeKodu, urun];
  const istekler = DB.satinalmaIstekleri.filter(i=>kabulEdilenKodlar.includes(i.urun));

  let gelenKg = 0, gelenAdet = 0;
  const baglıSiparisler = new Set();
  istekler.forEach(istek=>{
    const onaylanan = satinalmaOnaylanmisToplam(istek.id);
    const d = birimDonusum(onaylanan, istek.birim, h);
    gelenKg += d.kg; gelenAdet += d.adet;
    if(istek.orderId){ const o = DB.orders.find(x=>x.id===istek.orderId); if(o) baglıSiparisler.add(o.orderNo); }
  });

  const tuketilenAdet = DB.workorders.filter(w=>w.urun===urun && w.operasyon==='Cutting')
    .reduce((s,wo)=>s+workOrderStats(wo).produced, 0);
  const tuketilenKg = h ? tuketilenAdet*h.parcaAgirligi : 0;

  const yuv = n => Math.round(n*1000)/1000;
  return {
    urun, malzemeKodu,
    gelenKg: yuv(gelenKg), gelenAdet: Math.round(gelenAdet),
    tuketilenKg: yuv(tuketilenKg), tuketilenAdet,
    netKg: yuv(gelenKg-tuketilenKg), netAdet: Math.round(gelenAdet-tuketilenAdet),
    baglıSiparisler: [...baglıSiparisler]
  };
}

function viewStok(){
  if(DB.urunAgaclari.length===0 && DB.orders.length===0) return emptyState('Henüz veri yok', 'Stok akışını görmek için önce Ürün Ağaçları veya sipariş girin.', null, null);

  const hammaddeler = DB.urunAgaclari.map(bom=>hammaddeStokBilgisi(bom.urun));

  const hammaddeBolumu = `
  <div class="panel">
    <div class="panel-head"><h3>Hammadde Stok Durumu</h3><span class="field-hint">Bir siparişe bağlı olsun olmasın tüm onaylı (giriş kalite kontrolü Uygun) malzeme — tüketildikçe otomatik düşer</span></div>
    <div class="panel-body">
      <div class="table-wrap"><table>
        <thead><tr><th>Ürün</th><th>Malzeme Kodu</th><th>Onaylı Gelen</th><th>Tüketilen (Kesim)</th><th>Net Stok (kg)</th><th>Net Stok (adet eşdeğeri)</th><th>Bağlı Sipariş(ler)</th></tr></thead>
        <tbody>
          ${hammaddeler.map(h=>`
            <tr>
              <td class="mono"><b>${escapeHtml(h.urun)}</b></td>
              <td class="mono">${escapeHtml(h.malzemeKodu)}</td>
              <td class="mono">${h.gelenKg} kg <span class="field-hint">(${h.gelenAdet} adet eşd.)</span></td>
              <td class="mono">${h.tuketilenKg} kg <span class="field-hint">(${h.tuketilenAdet} adet)</span></td>
              <td class="mono"><b style="color:${h.netKg<0?'var(--flag)':'var(--good)'}">${h.netKg} kg</b></td>
              <td class="mono">${h.netAdet}</td>
              <td style="font-size:12px;color:var(--ink-soft);">${h.baglıSiparisler.length ? h.baglıSiparisler.join(', ') : '<span class="field-hint">Genel stok</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>
  </div>`;

  if(DB.orders.length===0) return hammaddeBolumu;

  if(!SELECTED_ORDER || !DB.orders.find(o=>o.id===SELECTED_ORDER)) SELECTED_ORDER = DB.orders[0]?.id;
  const orders = DB.orders.filter(o => matchSearch(o, ['urun','orderNo','musteri']));
  const order = DB.orders.find(o=>o.id===SELECTED_ORDER);
  const gruplar = order ? routeSiraGruplari(order.urun) : [];
  const urunAdi = order ? (DB.routes.find(r=>r.urun===order.urun)?.urunAdi||'') : '';

  return hammaddeBolumu + `
  <div style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin:20px 0 8px;">Sipariş Bazında Üretim Akışı (WIP)</div>
  <div class="part-picker">
    <div class="part-list">
      ${orders.map(o=>`
        <div class="part-list-item ${o.id===SELECTED_ORDER?'active':''}" onclick="SELECTED_ORDER='${o.id}'; renderModule();">
          <div class="pn">${escapeHtml(o.orderNo||'')}</div>
          <div class="pmeta">${escapeHtml(o.urun)} · ${o.hedefMiktar} adet</div>
        </div>
      `).join('')}
    </div>
    <div class="timeline">
      ${!order ? `<div class="panel"><div class="empty-state"><p>Soldan bir sipariş seçin.</p></div></div>` : `
      <div class="panel">
        <div class="panel-head"><h3 class="mono">${escapeHtml(order.urun)}</h3><span class="field-hint">${escapeHtml(urunAdi)} — ${escapeHtml(order.orderNo||'')}</span></div>
        <div class="panel-body">
          ${(()=>{
            let onceki = null;
            const satirlar = [];
            gruplar.forEach((g,gi)=>{
              const uretilen = asamaUretilen(order.id, g.sira);
              satirlar.push({ ad: GUNLUK_OP_LABELS[g.operasyon]||g.operasyon, sira:g.sira, uretilen, ilkAsama: gi===0 });
              onceki = uretilen;
            });
            return satirlar.map((s,i)=>{
              const sonraki = satirlar[i+1];
              const tuketilen = sonraki ? sonraki.uretilen : 0;
              const stok = s.uretilen - tuketilen;
              const sonAsama = i===satirlar.length-1;
              return `
              <div class="tl-step">
                <div class="tl-marker-col">
                  <div class="tl-num ${stok>0?'done':''}">${s.sira}</div>
                  <div class="tl-line"></div>
                </div>
                <div class="tl-content">
                  <div class="tl-title-row"><span class="tl-title">${escapeHtml(s.ad)}</span>${s.ilkAsama?`<span class="field-hint" style="margin-left:8px;">hammadde: üstteki tabloya bakın</span>`:''}</div>
                  <div class="tl-dates">
                    <div class="dgroup"><b>Bu Aşamada Üretilen</b>${s.uretilen}</div>
                    <div class="dgroup"><b>${sonAsama?'Tüketim (yok — son aşama)':'Sonrakine Aktarılan'}</b>${tuketilen}</div>
                    <div class="dgroup"><b>${sonAsama?'Bitmiş Ürün Stoğu':'Ara Stok (WIP)'}</b><span style="color:${stok<0?'var(--flag)':'var(--good)'};font-weight:700;">${stok}</span></div>
                  </div>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>`}
    </div>
  </div>`;
}

function selectOrder(id){ SELECTED_ORDER = id; renderModule(); }
function ekMakineSecenekVarMi(wo){
  const grup = routeSiraGruplari(wo.urun).find(g=>String(g.sira)===String(wo.sira));
  if(!grup || grup.secenekler.length<2) return false;
  const kullanilanlar = DB.workorders.filter(w=>w.orderId===wo.orderId && w.sira===wo.sira).map(w=>w.isMerkezi);
  return grup.secenekler.some(s=>!kullanilanlar.includes(s.isMerkezi));
}
function openEkMakineEkleModal(workOrderId){
  const wo = DB.workorders.find(w=>w.id===workOrderId);
  if(!wo) return;
  const grup = routeSiraGruplari(wo.urun).find(g=>String(g.sira)===String(wo.sira));
  if(!grup){ showToast('Rota bilgisi bulunamadı', true); return; }
  const mevcutWOs = DB.workorders.filter(w=>w.orderId===wo.orderId && w.sira===wo.sira);
  const kullanilanlar = mevcutWOs.map(w=>w.isMerkezi);
  const kalanlar = grup.secenekler.filter(s=>!kullanilanlar.includes(s.isMerkezi));
  if(kalanlar.length===0){ showToast('Bu adım için tüm makine seçenekleri zaten kullanılıyor', true); return; }
  const stats = workOrderStats(wo);

  openModal(`Ek Makine Ekle — ${escapeHtml(woNoGoster(wo))}`, `
    <div class="field-hint" style="margin-bottom:12px;">
      "${escapeHtml(wo.isMerkezi)}" üzerindeki kalan <b>${stats.remaining}</b> adet, seçtiğiniz yeni makineyle
      Kapasite Yönetimi'ndeki kapasitelere orantılı paylaşılacak. Şu ana kadar üretilmiş (${stats.produced} adet)
      bu iş emrinde kalır, sadece kalan miktar bölünür.
    </div>
    <div class="field">
      <label>Yeni Makine</label>
      <select id="ek-makine-secim">
        ${kalanlar.map(s=>`<option value="${escapeHtml(s.isMerkezi)}">${escapeHtml(s.isMerkezi)}</option>`).join('')}
      </select>
    </div>
  `, async ()=>{
    const yeniMakine = val('ek-makine-secim');
    const paylar = kapasiteOranliBol(wo.urun, [wo.isMerkezi, yeniMakine], stats.remaining);
    wo.hedefMiktar = stats.produced + paylar[0];
    if(!wo.splitEtiket) wo.splitEtiket = 'A';
    const kullanilanEtiketler = mevcutWOs.map(w=>w.splitEtiket).filter(Boolean);
    let sonrakiHarf = 'B';
    while(kullanilanEtiketler.includes(sonrakiHarf)) sonrakiHarf = String.fromCharCode(sonrakiHarf.charCodeAt(0)+1);
    const secenekBilgi = grup.secenekler.find(s=>s.isMerkezi===yeniMakine);
    const yeniWO = {
      id: uid(), orderId: wo.orderId, urun: wo.urun, sira: wo.sira, splitEtiket: sonrakiHarf,
      operasyon: secenekBilgi.operasyon, isMerkezi: yeniMakine, hedefMiktar: paylar[1], durum: 'Aktif'
    };
    DB.workorders.push(yeniWO);
    await persist('workorders');
    showToast(`${escapeHtml(yeniMakine)} eklendi — kalan miktar orantılı paylaşıldı`);
    renderModule();
    return true;
  });
}
async function isEmirleriSil(orderId){
  if(!confirm('Bu siparişin tüm iş emirlerini ve ilgili günlük üretim/plan kayıtlarını silmek istediğinize emin misiniz? Sipariş, Üretim Siparişleri listesinde yeniden "İş Emri Aç" bekleyen duruma dönecek.')) return;
  const woIds = DB.workorders.filter(w=>w.orderId===orderId).map(w=>w.id);
  DB.production = DB.production.filter(p=>!woIds.includes(p.workOrderId));
  DB.makinePlani = DB.makinePlani.filter(p=>!p.workOrderId || !woIds.includes(p.workOrderId));
  DB.workorders = DB.workorders.filter(w=>w.orderId!==orderId);
  await persist('workorders');
  await persist('production');
  await persist('makinePlani');
  showToast('İş emirleri silindi — sipariş yeniden "İş Emri Aç" bekliyor');
  renderModule();
}
function toggleStepExpand(orderId, woId){
  if(EXPANDED_STEP[orderId]===woId) EXPANDED_STEP[orderId] = null;
  else EXPANDED_STEP[orderId] = woId;
  renderModule();
}

function viewWorkOrders(){
  if(DB.orders.length===0) return emptyState('Henüz sipariş yok', 'İş emirleri, Siparişler modülünde açtığınız her sipariş için rotaya göre otomatik oluşturulur.', 'openOrderModal()', 'Yeni Sipariş');

  let orders = DB.orders.filter(o => matchSearch(o, ['urun','not']) || (DB.routes.find(r=>r.urun===o.urun)?.urunAdi||'').toLowerCase().includes(SEARCH.toLowerCase()));
  orders = [...orders].sort((a,b)=>{
    const rank = d => d==='Aktif'?0:d==='Tamamlandı'?2:1;
    if(rank(a.durum)!==rank(b.durum)) return rank(a.durum)-rank(b.durum);
    return (parseDate(a.istenenTeslimTarihi)||0) - (parseDate(b.istenenTeslimTarihi)||0);
  });
  if(!SELECTED_ORDER || !orders.find(o=>o.id===SELECTED_ORDER)) SELECTED_ORDER = orders[0]?.id;
  const order = orders.find(o=>o.id===SELECTED_ORDER);
  const steps = order ? orderSteps(order.id) : [];
  const urunAdi = order ? (DB.routes.find(r=>r.urun===order.urun)?.urunAdi||'') : '';

  // default-expand the first step that isn't finished yet ("şu an işlenen operasyon")
  if(order && EXPANDED_STEP[order.id]===undefined){
    const current = steps.find(s => workOrderStats(s).remaining>0) || steps[0];
    EXPANDED_STEP[order.id] = current ? current.id : null;
  }

  return `
  <div class="part-picker">
    <div class="part-list">
      ${orders.map(o=>{
        const st = orderStats(o);
        return `<div class="part-list-item ${o.id===SELECTED_ORDER?'active':''}" onclick="selectOrder('${o.id}')">
          <div class="pn">${escapeHtml(o.urun)} <span class="field-hint mono">${escapeHtml(o.orderNo||'')}</span></div>
          <div class="pmeta">${o.hedefMiktar} adet · teslim ${fmtDate(o.istenenTeslimTarihi)}</div>
          <div class="part-progress-bar"><div class="part-progress-fill" style="width:${st.pct}%; background:${st.behindSchedule||st.feasible===false?'var(--flag)':'var(--good)'};"></div></div>
          <div style="margin-top:6px;">${orderStatusBadge(o, st)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="timeline">
      ${!order ? `<div class="panel"><div class="empty-state"><p>Soldan bir sipariş seçin.</p></div></div>` : `
      <div class="panel">
        <div class="panel-head">
          <h3 class="mono">${escapeHtml(order.urun)} <span style="font-family:var(--font-body);font-weight:400;font-size:13px;color:var(--ink-soft);">— ${escapeHtml(urunAdi)}</span></h3>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="field-hint mono">${escapeHtml(order.orderNo||'')} · ${order.hedefMiktar} adet · ${steps.length} operasyon</span>
            ${(canEdit() && steps.length>0) ? `<button class="btn btn-sm btn-danger" onclick="isEmirleriSil('${order.id}')">İş Emirlerini Sil</button>` : ''}
          </div>
        </div>
        <div class="panel-body">
          ${steps.length===0 ? `<div class="empty-state"><div class="eb-glyph">□</div><h4>İş emri henüz açılmadı</h4><p>Üretim Siparişleri modülünden "İş Emri Aç" ile başlatabilirsiniz.</p><button class="btn btn-primary" style="margin-top:14px;" onclick="go('orders')">Üretim Siparişleri'ne Git</button></div>` : ''}
          ${steps.map((wo,i)=>{
            const st = workOrderStats(wo);
            const expanded = EXPANDED_STEP[order.id]===wo.id;
            const done = st.remaining<=0 && wo.hedefMiktar>0;
            return `
            <div class="tl-step">
              <div class="tl-marker-col">
                <div class="tl-num ${done?'done':st.behindSchedule?'late':''}">${done?'✓':wo.sira}</div>
                <div class="tl-line"></div>
              </div>
              <div class="tl-content">
                <div class="tl-title-row" style="cursor:pointer;" onclick="toggleStepExpand('${order.id}','${wo.id}')">
                  <span class="tl-title">${escapeHtml(wo.operasyon)} <span style="font-weight:400;color:var(--ink-faint);">— ${escapeHtml(wo.isMerkezi)}</span></span>
                  <span class="field-hint mono">${escapeHtml(woNoGoster(wo))}</span>
                  ${done?'<span class="badge badge-good">Tamamlandı</span>':st.behindSchedule?'<span class="badge badge-flag">Gecikme Riski</span>':''}
                  <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);">${expanded?'▲':'▼'}</span>
                </div>
                <div class="tl-dates" style="margin-top:6px;">
                  <div class="dgroup"><b>Hedef</b>${wo.hedefMiktar}</div>
                  <div class="dgroup"><b>Üretilen</b>${st.produced}</div>
                  <div class="dgroup"><b>Kalan</b>${st.remaining}</div>
                  <div class="dgroup"><b>Günlük Kapasite</b>${st.capTarget ?? 'tanımsız'}</div>
                  <div class="dgroup"><b>Tahmini Bitiş</b>${st.etaLabel}</div>
                </div>
                <div class="part-progress-bar" style="max-width:320px;margin-top:8px;"><div class="part-progress-fill" style="width:${st.pct}%; background:${done?'var(--good)':st.behindSchedule?'var(--flag)':'var(--accent)'};"></div></div>
                ${(canEdit() && !done && ekMakineSecenekVarMi(wo)) ? `<button class="btn btn-sm btn-ghost" style="margin-top:8px;" onclick="event.stopPropagation(); openEkMakineEkleModal('${wo.id}')">+ Ek Makine Ekle (böl)</button>` : ''}

                ${expanded ? `
                  <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                      <h5 style="margin:0;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);">Günlük Üretim Kayıtları</h5>
                      <button class="btn btn-sm btn-primary" onclick="openStepLogModal(null,'${wo.id}')">+ Günlük Kayıt</button>
                    </div>
                    ${st.logs.length===0 ? `<div class="field-hint">Henüz kayıt yok.</div>` : `
                    <div class="table-wrap"><table>
                      <thead><tr><th>Tarih</th><th>Vardiya</th><th>Hedef</th><th>Gerçekleşen</th><th>Fire</th><th>Sapma</th><th>Not</th><th></th></tr></thead>
                      <tbody>
                        ${[...st.logs].reverse().map(p=>{
                          const dev = (parseFloat(p.gercekAdet)||0) - (parseFloat(p.hedefAdet)||0);
                          return `<tr>
                            <td class="mono">${fmtDate(p.tarih)}</td>
                            <td>${escapeHtml(p.vardiya||'—')}</td>
                            <td class="mono">${p.hedefAdet ?? '—'}</td>
                            <td class="mono"><b>${p.gercekAdet ?? 0}</b></td>
                            <td class="mono">${p.fireAdet || 0}</td>
                            <td>${dev>=0 ? `<span class="badge badge-good">+${dev}</span>` : `<span class="badge badge-flag">${dev}</span>`}</td>
                            <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.not||'')}</td>
                            <td><div class="row-actions">
                              ${canEdit() ? `
                              <button class="btn btn-sm btn-ghost" onclick="openStepLogModal('${p.id}','${wo.id}')">Düzenle</button>
                              <button class="btn btn-sm btn-danger" onclick="deleteProductionLog('${p.id}')">Sil</button>
                              ` : ''}
                            </div></td>
                          </tr>`;
                        }).join('')}
                      </tbody>
                    </table></div>`}
                  </div>
                ` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`}
    </div>
  </div>`;
}

function openStepLogModal(id, workOrderId){
  const wo = DB.workorders.find(w=>w.id===workOrderId);
  const stats = workOrderStats(wo);
  const rec = id ? DB.production.find(x=>x.id===id) : {
    tarih: toLocalISODate(new Date()), vardiya: varsayilanVardiya(), gercekAdet:'', fireAdet:'', not:'',
    hedefAdet: Math.min(stats.capTarget||stats.remaining||0, stats.remaining||0) || stats.capTarget || ''
  };
  openModal(`${id?'Üretim Kaydını Düzenle':'Yeni Günlük Üretim Kaydı'}`, `
    <div class="field-hint" style="margin-bottom:12px;">${escapeHtml(wo.urun)} · ${escapeHtml(wo.operasyon)} (${escapeHtml(wo.isMerkezi)}) · kalan: <b>${stats.remaining}</b> adet</div>
    <div class="field-row">
      <div class="field"><label>Tarih</label><input id="f-tarih" type="date" value="${rec.tarih}"></div>
      <div class="field"><label>Vardiya</label>
        <select id="f-vardiya">
          <option value="Sabah" ${rec.vardiya==='Sabah'?'selected':''}>Sabah</option>
          <option value="Öğleden Sonra" ${rec.vardiya==='Öğleden Sonra'?'selected':''}>Öğleden Sonra</option>
          <option value="Mesai" ${rec.vardiya==='Mesai'?'selected':''}>Mesai</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Hedef Adet (o gün için)</label><input id="f-hedefAdet" type="number" value="${rec.hedefAdet}"></div>
      <div class="field"><label>Gerçekleşen Adet</label><input id="f-gercekAdet" type="number" value="${rec.gercekAdet}"></div>
    </div>
    <div class="field"><label>Fire / Iskarta Adet</label><input id="f-fireAdet" type="number" value="${rec.fireAdet}"></div>
    <div class="field"><label>Not</label><textarea id="f-not">${escapeHtml(rec.not||'')}</textarea></div>
  `, async ()=>{
    const data = {
      workOrderId, tarih: val('f-tarih'), vardiya: val('f-vardiya'),
      hedefAdet: val('f-hedefAdet')?parseFloat(val('f-hedefAdet')):null,
      gercekAdet: parseFloat(val('f-gercekAdet'))||0,
      fireAdet: parseFloat(val('f-fireAdet'))||0,
      not: val('f-not')
    };
    if(!data.tarih){ showToast('Tarih zorunlu', true); return false; }
    if(id){ Object.assign(DB.production.find(x=>x.id===id), data); }
    else { DB.production.push({id:uid(), ...data}); }
    await persist('production');
    showToast('Üretim kaydı işlendi — sipariş ve iş emri ilerlemesi güncellendi');
    renderModule();
    return true;
  });
}

