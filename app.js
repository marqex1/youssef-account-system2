'use strict';

const APP_VERSION = 'V21 Stable Online/Offline';
const STORAGE_KEY = 'YAS_V21_STABLE_STATE';
const SESSION_KEY = 'YAS_V21_SESSION';
const HASH_SALT = 'YAS_V21::';
const DEFAULT_HASH = '451b77b9b8721db330bba30fc2b2bcb3e46d87bcc2c655804ba36c916a7f1467';
const cfg = window.YOUSSEF_CLOUD_CONFIG || {enabled:false};
let state = null;
let session = null;
let currentPage = 'dashboard';
let cloudStatus = 'pending';
let saveTimer = null;
let sessionTimer = null;

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const app = $('#app');
const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const REVIEW = ['لم تتم المراجعة','مقبول','يحتاج إلى تعديل','مرفوض','معتمد','ملغي'];

function nowISO(){return new Date().toISOString()}
function todayISO(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function dayName(date){return DAY_NAMES[new Date(date+'T12:00:00').getDay()]}
function uid(p='id'){return p+'_'+Math.random().toString(36).slice(2,9)+'_'+Date.now().toString(36)}
function money(n){return `${Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:2})} جنيه`}
function fmtDate(d){if(!d)return '-'; return `${dayName(d)} — ${d}`}
function fmtTime(iso){if(!iso)return '-'; return new Date(iso).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}
function escapeHtml(s=''){return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function normalizeUrl(u){u=(u||'').trim(); return u.replace(/\/rest\/v1\/?$/,'')}
function currentUser(){return state?.users?.find(u=>u.id===session?.userId)}
function isAdmin(u=currentUser()){return u?.role==='admin'}
function isPro(u=currentUser()){return u?.role==='pro'}
function isUser(u=currentUser()){return u?.role==='user'}
function activeUsers(){return state.users.filter(u=>!u.deleted && u.active!==false)}
function toast(msg,type='ok'){const el=$('#toast');el.textContent=msg;el.style.background=type==='bad'?'#c0392b':type==='warn'?'#cc7a00':'#7a1230';el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600)}
function confirmBox(msg){return window.confirm(msg)}

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(HASH_SALT+text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function defaultState(){
  const adminId='u_admin', proId='u_pro', date=todayISO();
  return {
    meta:{version:APP_VERSION,createdAt:nowISO(),updatedAt:nowISO()},
    settings:{
      workHoursDefault:8,
      activeDate:date,
      motivationEnabled:true,
      motivationSound:false,
      motivationEveryModels:10,
      motivationEveryPoses:10,
      logo:'assets/logo.jpeg',
      company:'Youssef Accounts System'
    },
    users:[
      {id:adminId,fullName:'المدير الرئيسي',username:'Admin Joo',passwordHash:DEFAULT_HASH,role:'admin',poseCount:4,dailyTarget:10,targetType:'models',workHours:8,active:true,createdAt:nowISO(),lastLogin:null,notes:'الحساب الرئيسي'},
      {id:proId,fullName:'Joo Pro',username:'Joo',passwordHash:DEFAULT_HASH,role:'pro',poseCount:4,dailyTarget:10,targetType:'models',workHours:8,active:true,createdAt:nowISO(),lastLogin:null,notes:'مستخدم Pro'}
    ],
    workDays:[{id:uid('day'),date,scope:'global',userId:null,status:'open',openedBy:adminId,openedAt:nowISO(),closedBy:null,closedAt:null,notes:'اليوم المفتوح تلقائيًا'}],
    weeks:[],
    models:[],
    clients:[],
    services:[],
    entries:[],
    payments:[],
    reports:[],
    sessions:[],
    activity:[],
    trash:[],
    motivationalMessages:[
      {id:uid('msg'),type:'models',text:'عاش يا بطل! 🔥 أضفت {count} موديلات بنجاح ❤️',active:true},
      {id:uid('msg'),type:'target50',text:'برافو عليك 🎉 وصلت لـ 50% من هدفك اليومي ❤️',active:true},
      {id:uid('msg'),type:'target100',text:'حققت التارجت يا بطل! 🔥 شغل عظيم جدًا 👏',active:true},
      {id:uid('msg'),type:'exceed',text:'عديت التارجت ولسه مكمل! أنت مكسر الدنيا 🔥🚀',active:true}
    ],
    cloud:{lastSync:null,lastError:null}
  };
}

function migrate(s){
  if(!s || typeof s!=='object') s=defaultState();
  const d=defaultState();
  for(const k of Object.keys(d)) if(!(k in s)) s[k]=d[k];
  for(const k of ['users','workDays','weeks','models','clients','services','entries','payments','reports','sessions','activity','trash','motivationalMessages']) if(!Array.isArray(s[k])) s[k]=[];
  s.settings = Object.assign(d.settings, s.settings||{});
  if(!s.users.find(u=>u.username==='Admin Joo')) s.users.unshift(d.users[0]);
  if(!s.users.find(u=>u.username==='Joo')) s.users.push(d.users[1]);
  s.users.forEach(u=>{if(!u.passwordHash && u.password) {u.passwordHash=u.password; delete u.password;} if(!u.role)u.role='user'; if(!u.id)u.id=uid('u'); if(u.active===undefined)u.active=true;});
  s.models.forEach(m=>{if(!Array.isArray(m.poses)) m.poses=(m.links||[]).map((link,i)=>({id:uid('pose'),number:i+1,name:`الوضعية ${i+1}`,link,reviewStatus:m.reviewStatus||'لم تتم المراجعة',adminNote:'',openedBy:null,openedAt:null})); if(!m.generalStatus)m.generalStatus='لم تتم المراجعة';});
  if(!s.workDays.some(d=>d.status==='open')) s.workDays.push({id:uid('day'),date:s.settings.activeDate||todayISO(),scope:'global',userId:null,status:'open',openedBy:'u_admin',openedAt:nowISO(),closedBy:null,closedAt:null,notes:'يوم مفتوح تلقائيًا'});
  s.meta.version=APP_VERSION; s.meta.updatedAt=nowISO();
  return s;
}

function logAction(action,details={},userId=session?.userId){
  state.activity.unshift({id:uid('act'),userId:userId||'system',action,details,at:nowISO()});
  state.activity=state.activity.slice(0,1500);
}
function pushTrash(type,item){state.trash.unshift({id:uid('trash'),type,item,deletedBy:session?.userId,deletedAt:nowISO()});}

function saveLocal(){localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
async function saveAll(immediate=false){
  if(!state) return;
  state.meta.updatedAt=nowISO();
  saveLocal();
  if(immediate) return saveRemote();
  clearTimeout(saveTimer); saveTimer=setTimeout(saveRemote,650);
}
function loadLocal(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function saveSession(){sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));}
function loadSession(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}

function apiBase(){return normalizeUrl(cfg.supabaseUrl||'') + '/rest/v1/app_state'}
function cloudHeaders(){return {'apikey':cfg.supabaseAnonKey,'Authorization':'Bearer '+cfg.supabaseAnonKey,'Content-Type':'application/json'};}
async function loadRemote(){
  if(!cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {cloudStatus='bad';return null;}
  try{
    const url = `${apiBase()}?id=eq.${encodeURIComponent(cfg.stateId||'main')}&select=state,updated_at`;
    const res=await fetch(url,{headers:cloudHeaders(),cache:'no-store'});
    if(!res.ok) throw new Error(await res.text());
    const rows=await res.json(); cloudStatus='ok';
    return rows && rows[0] ? rows[0].state : null;
  }catch(e){cloudStatus='bad'; state && (state.cloud.lastError=String(e.message||e)); return null;}
}
async function saveRemote(){
  if(!state || !cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  cloudStatus='pending'; renderCloudOnly();
  try{
    const body={id:cfg.stateId||'main',state,updated_at:nowISO()};
    const res=await fetch(apiBase(),{method:'POST',headers:{...cloudHeaders(),'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await res.text());
    state.cloud.lastSync=nowISO();state.cloud.lastError=null; cloudStatus='ok'; saveLocal(); renderCloudOnly();
  }catch(e){cloudStatus='bad'; state.cloud.lastError=String(e.message||e); saveLocal(); renderCloudOnly();}
}
async function boot(){
  const local=migrate(loadLocal()); state=local;
  const remote=await loadRemote();
  if(remote && JSON.stringify(remote).length>50){ state=migrate(remote); saveLocal(); }
  else { state=local; saveLocal(); saveRemote(); }
  session=loadSession();
  if(session && !state.users.find(u=>u.id===session.userId && u.active!==false)) session=null;
  ensureActiveGlobalDay();
  render();
  window.addEventListener('beforeunload',()=>{if(session) closeCurrentSession('page_close',false)});
}
function ensureActiveGlobalDay(){
  const open=state.workDays.find(d=>d.scope==='global' && d.status==='open');
  if(!open){state.workDays.push({id:uid('day'),date:todayISO(),scope:'global',userId:null,status:'open',openedBy:'system',openedAt:nowISO(),closedBy:null,closedAt:null,notes:'فتح تلقائي'});}
}
function openGlobalDay(date=todayISO()){
  const existing=state.workDays.find(d=>d.scope==='global' && d.date===date);
  if(existing){existing.status='open';existing.openedAt=existing.openedAt||nowISO();existing.openedBy=session.userId;state.settings.activeDate=date;logAction('فتح يوم موجود',{date});saveAll();toast('تم فتح اليوم');render();return;}
  state.workDays.push({id:uid('day'),date,scope:'global',userId:null,status:'open',openedBy:session.userId,openedAt:nowISO(),closedBy:null,closedAt:null,notes:''});
  state.settings.activeDate=date;logAction('فتح يوم جديد',{date});saveAll();toast('تم فتح يوم جديد');render();
}
function closeGlobalDay(date){
  const d=state.workDays.find(x=>x.scope==='global'&&x.date===date&&x.status==='open'); if(!d)return toast('لا يوجد يوم مفتوح بهذا التاريخ','warn');
  d.status='closed';d.closedAt=nowISO();d.closedBy=session.userId;logAction('تقفيل يوم',{date});saveAll();toast('تم تقفيل اليوم');render();
}
function currentGlobalDay(){return state.workDays.find(d=>d.scope==='global'&&d.status==='open') || null;}
function userOpenDay(userId=currentUser()?.id){return state.workDays.find(d=>d.userId===userId&&d.status==='open') || null;}
function openUserDay(userId=currentUser()?.id,date=(currentGlobalDay()?.date||todayISO())){
  const global=currentGlobalDay(); if(!global) return toast('لا يوجد يوم عام مفتوح. اطلب من المدير فتح اليوم.','bad');
  const u=state.users.find(x=>x.id===userId); if(!u)return;
  const old=userOpenDay(userId); if(old) return toast('لديك يوم مفتوح بالفعل','warn');
  const existing=state.workDays.find(d=>d.userId===userId&&d.date===date);
  if(existing){existing.status='open';existing.openedAt=existing.openedAt||nowISO();existing.reopenedAt=nowISO();}
  else state.workDays.push({id:uid('day'),date,scope:'user',userId,status:'open',openedBy:userId,openedAt:nowISO(),closedBy:null,closedAt:null,notes:''});
  logAction('فتح يوم مستخدم',{user:u.username,date},userId);showMotivation(`صباح النشاط يا ${u.fullName||u.username}! 🔥`, `هدفك النهارده ${u.dailyTarget||0} ${u.targetType==='poses'?'وضعية':'موديل'}. شد حيلك وإحنا واثقين فيك ❤️`);
  saveAll();render();
}
function closeUserDay(dayId){const d=state.workDays.find(x=>x.id===dayId); if(!d)return; d.status='closed';d.closedBy=session.userId;d.closedAt=nowISO();logAction('تقفيل يوم مستخدم',{dayId,date:d.date,userId:d.userId});saveAll();render();}
function reopenDay(dayId){const d=state.workDays.find(x=>x.id===dayId); if(!d)return; d.status='open';d.reopenedBy=session.userId;d.reopenedAt=nowISO();logAction('إعادة فتح يوم',{dayId,date:d.date});saveAll();render();}

async function login(e){
  e.preventDefault();
  const username=$('#loginUsername').value.trim(); const password=$('#loginPassword').value;
  const h=await sha256(password); const u=state.users.find(x=>x.username.trim().toLowerCase()===username.toLowerCase() && !x.deleted && x.active!==false);
  if(!u || u.passwordHash!==h) return toast('بيانات الدخول غير صحيحة','bad');
  session={userId:u.id,loginAt:nowISO(),lastActive:nowISO(),sessionId:uid('sess')}; saveSession();
  u.lastLogin=nowISO(); state.sessions.push({id:session.sessionId,userId:u.id,loginAt:session.loginAt,logoutAt:null,lastActive:session.lastActive,durationMs:0,status:'active'}); logAction('تسجيل دخول',{},u.id); saveAll();
  currentPage = u.role==='user'?'userWork':'dashboard'; startSessionTimer(); render();
}
function logout(){closeCurrentSession('logout',true); session=null; sessionStorage.removeItem(SESSION_KEY); currentPage='dashboard'; render();}
function closeCurrentSession(reason='logout',doSave=true){
  if(!session || !state)return; const s=state.sessions.find(x=>x.id===session.sessionId); if(s && !s.logoutAt){s.logoutAt=nowISO();s.lastActive=nowISO();s.durationMs=new Date(s.logoutAt)-new Date(s.loginAt);s.status=reason; logAction('تسجيل خروج',{reason},session.userId); if(doSave) saveAll(true);}
}
function startSessionTimer(){clearInterval(sessionTimer);sessionTimer=setInterval(()=>{if(session){session.lastActive=nowISO();saveSession();const s=state.sessions.find(x=>x.id===session.sessionId);if(s){s.lastActive=session.lastActive;s.durationMs=new Date()-new Date(s.loginAt);} renderSessionBits(); saveLocal();}},30000)}
['mousemove','keydown','click','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(session){session.lastActive=nowISO();saveSession();}}));

function render(){
  if(!state){app.innerHTML='';return;}
  const u=currentUser();
  if(!u){renderLogin();return;}
  startSessionTimer();
  if(u.role==='user') renderUserShell(u); else renderAdminProShell(u);
}
function renderLogin(){
  app.innerHTML=`<div class="login-wrap"><form class="login-card" onsubmit="login(event)">
    <img class="logo" src="assets/logo.jpeg" alt="Youssef">
    <h1 class="login-title">Youssef Accounts System</h1>
    <p class="login-sub">تسجيل الدخول للنظام</p>
    <div class="field"><label>اسم المستخدم</label><input id="loginUsername" autocomplete="username" required></div>
    <div class="field"><label>كلمة المرور</label><div class="password-row"><input id="loginPassword" type="password" autocomplete="current-password" required><button type="button" class="btn secondary small" onclick="toggleLoginPass()">إظهار</button></div></div>
    <button class="btn full" type="submit">تسجيل الدخول</button>
    <p class="login-sub" style="margin-top:14px">Version 21 Stable</p>
  </form></div>`;
}
window.toggleLoginPass=()=>{const i=$('#loginPassword');i.type=i.type==='password'?'text':'password'};

function navFor(u){
  if(u.role==='admin') return [
    ['dashboard','🏠','لوحة المدير'],['userWork','🔗','إدخال الوضعيات'],['users','👥','إدارة المستخدمين'],['review','✅','مراجعة الشغل'],['days','📅','إدارة الأيام'],['weeks','🗓️','إدارة الأسابيع'],['clients','🧾','العملاء'],['services','💰','الخدمات والأسعار'],['entries','📝','تسجيل الشغل'],['models','🖼️','سجل الموديلات'],['payments','💳','المدفوعات والسلف'],['reports','📊','التقارير'],['activity','📌','سجل النشاط'],['trash','🗑️','سلة المحذوفات'],['messages','🔥','الرسائل التحفيزية'],['settings','⚙️','الإعدادات']
  ];
  return [['dashboard','🏠','الرئيسية'],['userWork','🔗','إدخال الوضعيات'],['clients','🧾','العملاء'],['services','💰','الخدمات'],['entries','📝','تسجيل الشغل'],['models','🖼️','سجل الموديلات'],['payments','💳','المدفوعات'],['days','📅','الأيام'],['reports','📊','التقارير'],['settings','⚙️','الإعدادات']];
}
function renderAdminProShell(u){
  const nav=navFor(u); if(!nav.some(n=>n[0]===currentPage)) currentPage='dashboard';
  app.innerHTML=`<div class="app-shell"><aside class="sidebar" id="sidebar"><div class="brand"><img src="assets/logo.jpeg"><div><b>Youssef System</b><span>${APP_VERSION}</span></div></div><nav class="nav">${nav.map(n=>`<button class="${currentPage===n[0]?'active':''}" onclick="go('${n[0]}')"><span>${n[1]}</span><span>${n[2]}</span></button>`).join('')}</nav><div class="user-mini"><b>${escapeHtml(u.fullName||u.username)}</b><span>${u.role==='admin'?'مدير رئيسي':'مستخدم Pro'}</span><br><span id="cloudBadge"></span><br><button class="btn secondary small" style="margin-top:10px" onclick="logout()">تسجيل الخروج</button></div></aside><main class="main"><div class="topbar"><div><button class="btn secondary mobile-menu" onclick="toggleSidebar()">☰ القائمة</button><h1>${pageTitle(currentPage)}</h1><p>${fmtDate(todayISO())} — <span id="sessionBits"></span></p></div><div class="no-print"><button class="btn light" onclick="saveAll(true)">💾 حفظ الآن</button></div></div><div id="view"></div></main></div>`;
  renderCloudOnly(); renderSessionBits(); renderPage();
}
function renderUserShell(u){
  currentPage='userWork';
  app.innerHTML=`<div class="main" style="max-width:1050px;margin:auto"><div class="topbar"><div><h1>شاشة العمل</h1><p>${fmtDate(todayISO())} — <span id="sessionBits"></span></p></div><div><button class="btn secondary" onclick="logout()">تسجيل الخروج</button></div></div><div id="view"></div></div>`;
  renderSessionBits(); renderUserWork();
}
function renderCloudOnly(){const el=$('#cloudBadge'); if(el) el.innerHTML=`<span class="cloud-dot ${cloudStatus==='ok'?'ok':cloudStatus==='pending'?'pending':'bad'}"></span> ${cloudStatus==='ok'?'Online محفوظ':cloudStatus==='pending'?'جاري المزامنة':'Offline / غير متصل'}`}
function renderSessionBits(){const el=$('#sessionBits'); if(!el||!session)return; const mins=Math.floor((new Date()-new Date(session.loginAt))/60000); el.textContent=`جلسة العمل: ${Math.floor(mins/60)}س ${mins%60}د`;}
window.toggleSidebar=()=>$('#sidebar')?.classList.toggle('open');
window.go=(p)=>{currentPage=p;$('#sidebar')?.classList.remove('open');render();}
function pageTitle(p){return {dashboard:'لوحة التحكم',users:'إدارة المستخدمين',review:'مراجعة الشغل',days:'إدارة الأيام',weeks:'إدارة الأسابيع',clients:'العملاء',services:'الخدمات',entries:'تسجيل الشغل',models:'سجل الموديلات',payments:'المدفوعات والسلف',reports:'التقارير',activity:'سجل النشاط',trash:'سلة المحذوفات',messages:'الرسائل التحفيزية',settings:'الإعدادات',userWork:'إدخال الوضعيات'}[p]||'النظام'}
function renderPage(){const map={dashboard:renderDashboard,users:renderUsers,review:renderReview,days:renderDays,weeks:renderWeeks,clients:renderClients,services:renderServices,entries:renderEntries,models:renderModels,payments:renderPayments,reports:renderReports,activity:renderActivity,trash:renderTrash,messages:renderMessages,settings:renderSettings,userWork:renderUserWork}; (map[currentPage]||renderDashboard)();}

function modelsForDate(date){return state.models.filter(m=>m.date===date && !m.deleted)}
function entriesForDate(date){return state.entries.filter(e=>e.date===date && !e.deleted)}
function paymentsForDate(date){return state.payments.filter(p=>p.date===date && !p.deleted)}
function modelPoseCount(m){return (m.poses||[]).length}
function userModels(userId,date){return state.models.filter(m=>m.userId===userId && (!date||m.date===date) && !m.deleted)}
function userProgress(userId,date){const u=state.users.find(x=>x.id===userId); const ms=userModels(userId,date); const poses=ms.reduce((a,m)=>a+modelPoseCount(m),0); const done=u?.targetType==='poses'?poses:ms.length; const target=Number(u?.dailyTarget||0); return {models:ms.length,poses,done,target,percent:target?Math.min(100,Math.round(done/target*100)):0,remain:Math.max(0,target-done)};}
function todaySummary(date=currentGlobalDay()?.date||todayISO()){
  const models=modelsForDate(date), entries=entriesForDate(date), pays=paymentsForDate(date); const work = entries.reduce((a,e)=>a+Number(e.total||0),0); const paid=pays.filter(p=>p.type==='دفعة'||p.type==='خصم'||p.type==='سلفة'||p.type==='تسوية').reduce((a,p)=>a+Number(p.amount||0),0);
  return {models:models.length,poses:models.reduce((a,m)=>a+modelPoseCount(m),0),work,paid,net:work-paid,unreviewed:models.filter(m=>m.generalStatus==='لم تتم المراجعة').length,accepted:models.filter(m=>m.generalStatus==='مقبول'||m.generalStatus==='معتمد').length,revision:models.filter(m=>m.generalStatus==='يحتاج إلى تعديل').length,rejected:models.filter(m=>m.generalStatus==='مرفوض').length};
}
function renderDashboard(){
  const date=currentGlobalDay()?.date||todayISO(); const sum=todaySummary(date); const openUsers=state.workDays.filter(d=>d.scope==='user'&&d.status==='open').length; const activeSessions=state.sessions.filter(s=>s.status==='active'&&!s.logoutAt).length;
  $('#view').innerHTML=`<div class="work-hero"><h2>نظام يوسف لإدارة الشغل</h2><p>اليوم النشط: ${fmtDate(date)} — حالة اليوم العام: ${currentGlobalDay()?'<b>مفتوح</b>':'<b>لا يوجد يوم مفتوح</b>'}</p><div class="meta"><span class="badge">المستخدمين المتصلين: ${activeSessions}</span><span class="badge">أيام المستخدمين المفتوحة: ${openUsers}</span><span class="badge">آخر مزامنة: ${state.cloud.lastSync?fmtTime(state.cloud.lastSync):'لم تتم'}</span></div></div>
  <div class="cards">
    ${statCard('🖼️','موديلات اليوم',sum.models)}${statCard('🔗','وضعيات اليوم',sum.poses)}${statCard('⏳','غير مراجع',sum.unreviewed)}${statCard('✅','مقبول/معتمد',sum.accepted)}
    ${statCard('⚠️','يحتاج تعديل',sum.revision)}${statCard('❌','مرفوض',sum.rejected)}${statCard('👥','المستخدمون',activeUsers().length)}${statCard('💰','شغل مالي اليوم',money(sum.work))}
  </div>
  <div class="quick-grid no-print">
    <button class="quick-card" onclick="go('users')"><b>👥 إدارة المستخدمين</b><span>إضافة، صلاحيات، تارجت، وضعيات</span></button>
    <button class="quick-card" onclick="go('review')"><b>✅ مراجعة الشغل</b><span>قبول ورفض وفتح الروابط</span></button>
    <button class="quick-card" onclick="go('days')"><b>📅 فتح وقفل اليوم</b><span>إدارة أيام العمل بوضوح</span></button>
  </div>
  <div class="section"><div class="section-head"><h2>آخر العمليات</h2><button class="btn secondary small" onclick="go('activity')">عرض الكل</button></div>${activityTable(state.activity.slice(0,8))}</div>`;
}
function statCard(icon,label,value){return `<div class="card stat"><div><small>${label}</small><b>${value}</b></div><div class="icon">${icon}</div></div>`}

function renderUserWork(){
  const u=currentUser(); if(!u)return; const open=userOpenDay(u.id); const global=currentGlobalDay(); const date=open?.date || global?.date || todayISO(); const prog=userProgress(u.id,date); const nextNum=nextModelNumber(u.id,date);
  $('#view').innerHTML=`<div class="work-hero"><h2>أهلًا ${escapeHtml(u.fullName||u.username)} 👋</h2><p>${open?`يومك مفتوح: ${fmtDate(open.date)}`:'لا يوجد يوم مفتوح لك الآن'}</p><div class="meta"><span class="badge">التارجت: ${u.dailyTarget||0} ${u.targetType==='poses'?'وضعية':'موديل'}</span><span class="badge">المنفذ: ${prog.done}</span><span class="badge">المتبقي: ${prog.remain}</span><span class="badge">عدد الوضعيات: ${u.poseCount||1}</span></div><div class="progress" style="margin-top:14px"><span style="width:${prog.percent}%"></span></div><p style="margin:8px 0 0">نسبة الإنجاز: ${prog.percent}%</p></div>
  ${!open?`<div class="section"><h2>افتح يومك أولًا</h2><p>بعد فتح اليوم تقدر تضيف لينكات الموديلات.</p><button class="btn" onclick="openUserDay()">فتح اليوم وبدء الشغل</button>${!global?'<p class="badge red" style="margin-top:10px">المدير لم يفتح اليوم العام بعد</p>':''}</div>`:workForm(u,nextNum)}
  <div class="section"><div class="section-head"><h2>سجل موديلاتك اليوم</h2></div>${modelsTable(userModels(u.id,date),{userView:true})}</div>`;
}
function workForm(u,nextNum){
  const n=Math.max(1,Number(u.poseCount||1));
  return `<div class="section"><div class="section-head"><h2>إضافة موديل جديد</h2><span class="badge maroon">رقم الموديل القادم: ${nextNum}</span></div>
    <form onsubmit="addUserModel(event)">
      <div class="grid"><div class="field"><label>رقم الموديل</label><input id="modelNumber" type="number" value="${nextNum}" readonly></div><div class="field"><label>عدد الوضعيات</label><input value="${n}" readonly></div></div>
      <div class="grid">${Array.from({length:n}).map((_,i)=>`<div class="field"><label>رابط الوضعية ${i+1}</label><input id="pose_${i}" placeholder="ضع الرابط هنا" required></div>`).join('')}</div>
      <div class="field"><label>ملاحظات اختيارية</label><textarea id="modelNote" placeholder="اكتب ملاحظة لو موجودة"></textarea></div>
      <button class="btn" type="submit">إضافة الموديل</button>
    </form>
  </div>`;
}
function nextModelNumber(userId,date){const nums=state.models.filter(m=>m.userId===userId&&m.date===date&&!m.deleted).map(m=>Number(m.modelNumber||0)); return (Math.max(0,...nums)+1);}
window.addUserModel=function(e){
  e.preventDefault(); const u=currentUser(); const open=userOpenDay(u.id); if(!open)return toast('افتح اليوم أولًا','bad');
  const n=Math.max(1,Number(u.poseCount||1)); const num=Number($('#modelNumber').value||nextModelNumber(u.id,open.date));
  if(state.models.some(m=>m.userId===u.id&&m.date===open.date&&Number(m.modelNumber)===num&&!m.deleted)) return toast('رقم الموديل موجود بالفعل في هذا اليوم','bad');
  const poses=[]; for(let i=0;i<n;i++){const link=$(`#pose_${i}`).value.trim(); if(!link)return toast(`اكتب رابط الوضعية ${i+1}`,'bad'); poses.push({id:uid('pose'),number:i+1,name:`الوضعية ${i+1}`,link,reviewStatus:'لم تتم المراجعة',adminNote:'',openedBy:null,openedAt:null});}
  const m={id:uid('model'),userId:u.id,dayId:open.id,weekId:findWeekForDate(open.date)?.id||null,date:open.date,modelNumber:num,modelCode:modelCode(u,num,open.date),poseCount:n,poses,note:$('#modelNote').value.trim(),generalStatus:'لم تتم المراجعة',createdAt:nowISO(),updatedAt:nowISO(),deleted:false};
  state.models.push(m); logAction('إضافة موديل',{modelNumber:num,poseCount:n,modelId:m.id},u.id);
  checkMotivation(u,open.date); saveAll(true); toast('تم إضافة الموديل بنجاح'); render();
}
function modelCode(u,num,date){return `${(u.username||'USR').replace(/\s+/g,'').slice(0,4).toUpperCase()}-${date.replaceAll('-','')}-${String(num).padStart(3,'0')}`}
function checkMotivation(u,date){const p=userProgress(u.id,date); const target=Number(u.dailyTarget||0); if(!state.settings.motivationEnabled)return; if(target && p.done===target) showMotivation('برافو يا بطل! 🎉', 'حققت التارجت اليومي بالكامل 🔥❤️'); else if(target && p.done>target) showMotivation('أنت مكسر الدنيا 🔥', 'عديت التارجت ولسه مكمل! مجهود عظيم ❤️🚀'); else if(state.settings.motivationEveryModels && p.models>0 && p.models%Number(state.settings.motivationEveryModels)===0) showMotivation('عاش يا بطل! 🔥', `أضفت ${p.models} موديلات بنجاح. كمل بنفس القوة ❤️`);}
function showMotivation(title,msg){let el=$('#motiv'); if(!el){el=document.createElement('div');el.id='motiv';el.className='motivation';document.body.appendChild(el);} el.innerHTML=`<button class="close-x" onclick="document.getElementById('motiv').classList.remove('show')">×</button><b>${title}</b><p>${msg}</p>`;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),6500); if(state.settings.motivationSound){try{new AudioContext().resume()}catch{}}}

function renderUsers(){
  if(!isAdmin()) return renderDenied();
  $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>إضافة / تعديل مستخدم</h2></div><form onsubmit="saveUser(event)" id="userForm"><input type="hidden" id="userId"><div class="grid3"><div class="field"><label>اسم الموظف</label><input id="ufull" required></div><div class="field"><label>اسم المستخدم</label><input id="uusername" required></div><div class="field"><label>كلمة المرور</label><input id="upass" type="password" placeholder="اتركها فارغة عند التعديل"></div><div class="field"><label>نوع الحساب</label><select id="urole"><option value="user">User عادي</option><option value="pro">Pro</option><option value="admin">Admin</option></select></div><div class="field"><label>عدد الوضعيات</label><input id="uposes" type="number" min="1" value="4"></div><div class="field"><label>التارجت اليومي</label><input id="utarget" type="number" min="0" value="10"></div><div class="field"><label>نوع التارجت</label><select id="utargettype"><option value="models">موديلات</option><option value="poses">وضعيات</option></select></div><div class="field"><label>ساعات العمل</label><input id="uhours" type="number" min="1" value="8"></div><div class="field"><label>الحالة</label><select id="uactive"><option value="true">مفعل</option><option value="false">موقوف</option></select></div></div><div class="field"><label>ملاحظات</label><textarea id="unotes"></textarea></div><div class="form-actions"><button class="btn" type="submit">حفظ المستخدم</button><button class="btn secondary" type="button" onclick="clearUserForm()">تفريغ</button></div></form></div>
  <div class="section"><div class="section-head"><h2>المستخدمون</h2></div>${usersTable()}</div>`;
}
function usersTable(){const rows=state.users.filter(u=>!u.deleted).map(u=>{const p=userProgress(u.id,currentGlobalDay()?.date||todayISO()); return `<tr><td>${escapeHtml(u.fullName||'')}</td><td>${escapeHtml(u.username)}</td><td>${roleBadge(u.role)}</td><td>${u.poseCount}</td><td>${u.dailyTarget} ${u.targetType==='poses'?'وضعية':'موديل'}</td><td>${p.done}/${p.target} (${p.percent}%)</td><td>${u.active===false?'<span class="badge red">موقوف</span>':'<span class="badge green">مفعل</span>'}</td><td><button class="btn small secondary" onclick="editUser('${u.id}')">تعديل</button> <button class="btn small red" onclick="deleteUser('${u.id}')">حذف</button></td></tr>`}).join(''); return `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الوضعيات</th><th>التارجت</th><th>إنجاز اليوم</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows||'<tr><td colspan="8">لا توجد بيانات</td></tr>'}</tbody></table></div>`}
function roleBadge(r){return r==='admin'?'<span class="badge maroon">Admin</span>':r==='pro'?'<span class="badge blue">Pro</span>':'<span class="badge green">User</span>'}
window.saveUser=async function(e){e.preventDefault(); if(!isAdmin())return; const id=$('#userId').value||uid('u'); const exists=state.users.find(u=>u.id===id); const username=$('#uusername').value.trim(); if(state.users.some(u=>u.username.toLowerCase()===username.toLowerCase()&&u.id!==id&&!u.deleted))return toast('اسم المستخدم موجود','bad'); const obj=exists||{id,createdAt:nowISO()}; obj.fullName=$('#ufull').value.trim();obj.username=username;obj.role=$('#urole').value;obj.poseCount=Number($('#uposes').value||1);obj.dailyTarget=Number($('#utarget').value||0);obj.targetType=$('#utargettype').value;obj.workHours=Number($('#uhours').value||8);obj.active=$('#uactive').value==='true';obj.notes=$('#unotes').value.trim(); const pass=$('#upass').value; if(pass)obj.passwordHash=await sha256(pass); if(!exists){if(!pass)return toast('اكتب كلمة مرور للمستخدم الجديد','bad');state.users.push(obj);logAction('إضافة مستخدم',{username});} else logAction('تعديل مستخدم',{username}); clearUserForm(); saveAll(true); toast('تم حفظ المستخدم'); renderUsers();}
window.editUser=function(id){const u=state.users.find(x=>x.id===id); if(!u)return; $('#userId').value=u.id;$('#ufull').value=u.fullName||'';$('#uusername').value=u.username;$('#upass').value='';$('#urole').value=u.role;$('#uposes').value=u.poseCount||1;$('#utarget').value=u.dailyTarget||0;$('#utargettype').value=u.targetType||'models';$('#uhours').value=u.workHours||8;$('#uactive').value=String(u.active!==false);$('#unotes').value=u.notes||'';window.scrollTo({top:0,behavior:'smooth'});}
window.clearUserForm=function(){$('#userForm')?.reset();$('#userId').value='';$('#uposes').value=4;$('#utarget').value=10;$('#uhours').value=8;}
window.deleteUser=function(id){const u=state.users.find(x=>x.id===id); if(!u||u.username==='Admin Joo')return toast('لا يمكن حذف المدير الرئيسي','bad'); if(!confirmBox('حذف الحساب فقط مع الاحتفاظ بالشغل؟'))return; u.deleted=true;u.active=false;pushTrash('user',JSON.parse(JSON.stringify(u)));logAction('حذف مستخدم',{username:u.username});saveAll(true);toast('تم نقل المستخدم للمحذوفات');renderUsers();}

function renderReview(){
  if(!isAdmin()) return renderDenied();
  const users=activeUsers();
  $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>مراجعة شغل المستخدمين</h2></div><div class="filters"><input id="fModel" placeholder="رقم موديل" oninput="renderReviewList()"><select id="fUser" onchange="renderReviewList()"><option value="">كل المستخدمين</option>${users.map(u=>`<option value="${u.id}">${escapeHtml(u.fullName||u.username)}</option>`).join('')}</select><input id="fDate" type="date" onchange="renderReviewList()"><select id="fStatus" onchange="renderReviewList()"><option value="">كل الحالات</option>${REVIEW.map(s=>`<option>${s}</option>`).join('')}</select><button class="btn secondary" onclick="clearReviewFilters()">مسح</button></div><div id="reviewList"></div></div>`;
  renderReviewList();
}
window.renderReviewList=function(){let ms=state.models.filter(m=>!m.deleted); const fM=$('#fModel')?.value.trim(), fU=$('#fUser')?.value, fD=$('#fDate')?.value, fS=$('#fStatus')?.value; if(fM)ms=ms.filter(m=>String(m.modelNumber)===fM||m.modelCode?.includes(fM)); if(fU)ms=ms.filter(m=>m.userId===fU); if(fD)ms=ms.filter(m=>m.date===fD); if(fS)ms=ms.filter(m=>m.generalStatus===fS || (m.poses||[]).some(p=>p.reviewStatus===fS)); ms.sort((a,b)=>a.date.localeCompare(b.date)||Number(a.modelNumber)-Number(b.modelNumber)); $('#reviewList').innerHTML=ms.length?ms.map(reviewCard).join(''):'<div class="empty">لا توجد موديلات للمراجعة</div>';}
function reviewCard(m){const u=state.users.find(x=>x.id===m.userId)||{}; return `<div class="card" style="margin-bottom:12px"><div class="section-head"><h2>موديل ${m.modelNumber} <span class="badge maroon">${escapeHtml(m.modelCode||'')}</span></h2><div class="actions"><span class="badge blue">${escapeHtml(u.fullName||u.username||'مستخدم محذوف')}</span><span class="badge">${fmtDate(m.date)}</span><span>${statusBadge(m.generalStatus)}</span></div></div><p>${escapeHtml(m.note||'')}</p><div class="grid">${(m.poses||[]).map(p=>`<div class="pose-box"><h4>${p.name} ${statusBadge(p.reviewStatus)}</h4><p style="word-break:break-all">${escapeHtml(p.link)}</p><div class="form-actions"><button class="btn small blue" onclick="openPose('${m.id}','${p.id}')">فتح</button><button class="btn small green" onclick="setPoseStatus('${m.id}','${p.id}','مقبول')">مقبول</button><button class="btn small orange" onclick="setPoseStatus('${m.id}','${p.id}','يحتاج إلى تعديل')">يحتاج تعديل</button><button class="btn small red" onclick="setPoseStatus('${m.id}','${p.id}','مرفوض')">مرفوض</button></div><small>ملاحظة: ${escapeHtml(p.adminNote||'-')}</small></div>`).join('')}</div><div class="form-actions"><button class="btn secondary small" onclick="editModel('${m.id}')">تعديل الموديل</button><button class="btn red small" onclick="softDeleteModel('${m.id}')">حذف</button><button class="btn green small" onclick="setModelStatus('${m.id}','معتمد')">اعتماد</button></div></div>`}
function statusBadge(s){const cls=s==='مقبول'||s==='معتمد'?'green':s==='مرفوض'?'red':s==='يحتاج إلى تعديل'?'orange':'maroon';return `<span class="badge ${cls}">${s||'لم تتم المراجعة'}</span>`}
window.openPose=function(mid,pid){const m=state.models.find(x=>x.id===mid), p=m?.poses.find(x=>x.id===pid); if(!p)return; p.openedBy=session.userId;p.openedAt=nowISO(); if(p.link) window.open(p.link,'_blank'); logAction('فتح رابط وضعية',{modelId:mid,poseId:pid});saveAll();}
window.setPoseStatus=function(mid,pid,status){const m=state.models.find(x=>x.id===mid), p=m?.poses.find(x=>x.id===pid); if(!p)return; const note= status==='يحتاج إلى تعديل'||status==='مرفوض' ? prompt('اكتب ملاحظة للموظف','') : p.adminNote; p.reviewStatus=status;p.adminNote=note||''; m.generalStatus=deriveModelStatus(m);m.updatedAt=nowISO();logAction('تغيير حالة وضعية',{mid,pid,status});saveAll(true);renderReviewList();}
window.setModelStatus=function(mid,status){const m=state.models.find(x=>x.id===mid); if(!m)return; m.generalStatus=status;(m.poses||[]).forEach(p=>p.reviewStatus=status==='معتمد'?'مقبول':status);logAction('تغيير حالة موديل',{mid,status});saveAll(true);renderReviewList();}
function deriveModelStatus(m){const ps=m.poses||[]; if(ps.some(p=>p.reviewStatus==='مرفوض'))return 'مرفوض'; if(ps.some(p=>p.reviewStatus==='يحتاج إلى تعديل'))return 'يحتاج إلى تعديل'; if(ps.length&&ps.every(p=>p.reviewStatus==='مقبول'||p.reviewStatus==='معتمد'))return 'مقبول'; return 'لم تتم المراجعة';}
window.clearReviewFilters=function(){$$('#fModel,#fUser,#fDate,#fStatus').forEach(e=>e.value='');renderReviewList();}

function renderDays(){
  const date=currentGlobalDay()?.date||todayISO();
  $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>فتح وقفل اليوم العام</h2></div><div class="grid3"><div class="field"><label>اختار تاريخ اليوم</label><input id="globalDate" type="date" value="${date}"></div><div class="field"><label>الحالة الحالية</label><input readonly value="${currentGlobalDay()?`مفتوح — ${fmtDate(currentGlobalDay().date)}`:'لا يوجد يوم مفتوح'}"></div><div class="field"><label>إجراءات</label><div class="form-actions"><button class="btn" onclick="openGlobalDay($('#globalDate').value)">فتح اليوم</button><button class="btn red" onclick="closeGlobalDay($('#globalDate').value)">تقفيل اليوم</button></div></div></div></div>
  <div class="section"><div class="section-head"><h2>أيام العمل</h2></div>${daysTable()}</div>`;
}
function daysTable(){const rows=state.workDays.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(d=>{const u=d.userId?(state.users.find(x=>x.id===d.userId)?.username||'مستخدم محذوف'):'عام'; const ms=state.models.filter(m=>(d.scope==='global'?m.date===d.date:m.dayId===d.id)&&!m.deleted); return `<tr><td>${fmtDate(d.date)}</td><td>${u}</td><td>${d.scope==='global'?'يوم عام':'يوم مستخدم'}</td><td>${d.status==='open'?'<span class="badge green">مفتوح</span>':'<span class="badge red">مغلق</span>'}</td><td>${fmtTime(d.openedAt)}</td><td>${fmtTime(d.closedAt)}</td><td>${ms.length}</td><td>${ms.reduce((a,m)=>a+modelPoseCount(m),0)}</td><td>${isAdmin()?`<button class="btn small green" onclick="reopenDay('${d.id}')">فتح</button> <button class="btn small red" onclick="closeUserDay('${d.id}')">قفل</button> <button class="btn small secondary" onclick="deleteDay('${d.id}')">حذف</button>`:''}</td></tr>`}).join('');return `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>النوع</th><th>الحالة</th><th>وقت الفتح</th><th>وقت القفل</th><th>موديلات</th><th>وضعيات</th><th>إجراءات</th></tr></thead><tbody>${rows||'<tr><td colspan="9">لا توجد أيام</td></tr>'}</tbody></table></div>`}
window.deleteDay=function(id){if(!isAdmin())return;const d=state.workDays.find(x=>x.id===id); if(!d)return; if(!confirmBox('حذف اليوم؟ سيتم نقله لسلة المحذوفات.'))return; d.deleted=true; pushTrash('day',JSON.parse(JSON.stringify(d))); state.workDays=state.workDays.filter(x=>x.id!==id);logAction('حذف يوم',{id,date:d.date});saveAll(true);renderDays();}

function renderWeeks(){
  if(!isAdmin()) return renderDenied();
  $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>إدارة الأسابيع</h2></div><form onsubmit="saveWeek(event)"><div class="grid4"><div class="field"><label>اسم الأسبوع</label><input id="wname" placeholder="الأسبوع رقم 1" required></div><div class="field"><label>من</label><input id="wstart" type="date" required></div><div class="field"><label>إلى</label><input id="wend" type="date" required></div><div class="field"><label>ملاحظات</label><input id="wnotes"></div></div><button class="btn" type="submit">فتح أسبوع</button></form></div><div class="section"><div class="section-head"><h2>الأسبوع الحالي والأرشيف</h2></div>${weeksTable()}</div>`;
}
function weeksTable(){const rows=state.weeks.map(w=>{const ms=state.models.filter(m=>m.weekId===w.id&&!m.deleted);return `<tr><td>${escapeHtml(w.name)}</td><td>${w.startDate}</td><td>${w.endDate}</td><td>${w.status==='open'?'<span class="badge green">مفتوح</span>':'<span class="badge red">مغلق</span>'}</td><td>${ms.length}</td><td>${ms.reduce((a,m)=>a+modelPoseCount(m),0)}</td><td><button class="btn small green" onclick="openWeek('${w.id}')">فتح</button> <button class="btn small red" onclick="closeWeek('${w.id}')">قفل</button></td></tr>`}).join('');return `<div class="table-wrap"><table><thead><tr><th>الأسبوع</th><th>من</th><th>إلى</th><th>الحالة</th><th>موديلات</th><th>وضعيات</th><th>إجراءات</th></tr></thead><tbody>${rows||'<tr><td colspan="7">لا توجد أسابيع</td></tr>'}</tbody></table></div>`}
window.saveWeek=function(e){e.preventDefault();const w={id:uid('week'),name:$('#wname').value,startDate:$('#wstart').value,endDate:$('#wend').value,status:'open',openedBy:session.userId,openedAt:nowISO(),notes:$('#wnotes').value};state.weeks.push(w); state.models.forEach(m=>{if(m.date>=w.startDate&&m.date<=w.endDate)m.weekId=w.id});logAction('فتح أسبوع',{name:w.name});saveAll(true);renderWeeks();}
function findWeekForDate(date){return state.weeks.find(w=>w.status==='open'&&date>=w.startDate&&date<=w.endDate)}
window.closeWeek=function(id){const w=state.weeks.find(x=>x.id===id);if(!w)return;w.status='closed';w.closedBy=session.userId;w.closedAt=nowISO();state.workDays.forEach(d=>{if(d.date>=w.startDate&&d.date<=w.endDate)d.status='closed'});logAction('قفل أسبوع',{id});saveAll(true);renderWeeks();}
window.openWeek=function(id){const w=state.weeks.find(x=>x.id===id);if(!w)return;w.status='open';w.reopenedBy=session.userId;w.reopenedAt=nowISO();logAction('إعادة فتح أسبوع',{id});saveAll(true);renderWeeks();}

function renderClients(){ if(!isAdmin()&&!isPro())return renderDenied(); $('#view').innerHTML=crudPage('العملاء','client',['name:اسم العميل','phone:رقم الواتساب','note:ملاحظات'],state.clients,saveClient,clientsTable());}
function renderServices(){ if(!isAdmin()&&!isPro())return renderDenied(); $('#view').innerHTML=crudPage('الخدمات والأسعار','service',['name:اسم الخدمة','price:سعر الوحدة:number','note:وصف'],state.services,saveService,servicesTable());}
function crudPage(title,type,fields,data,handler,tableHtml){setTimeout(()=>{window[`save_${type}`]=handler},0);return `<div class="section"><div class="section-head"><h2>إضافة ${title}</h2></div><form onsubmit="save_${type}(event)" id="${type}Form"><input type="hidden" id="${type}Id"><div class="grid3">${fields.map(f=>{const [key,label,kind]=f.split(':');return `<div class="field"><label>${label}</label><input id="${type}_${key}" ${kind==='number'?'type="number" step="0.01"':''}></div>`}).join('')}</div><div class="form-actions"><button class="btn" type="submit">حفظ</button><button class="btn secondary" type="button" onclick="document.getElementById('${type}Form').reset();document.getElementById('${type}Id').value=''">تفريغ</button></div></form></div><div class="section"><div class="section-head"><h2>${title}</h2></div>${tableHtml}</div>`}
function saveClient(e){e.preventDefault();const id=$('#clientId').value||uid('c');let c=state.clients.find(x=>x.id===id); if(!c){c={id,createdAt:nowISO()};state.clients.push(c)} c.name=$('#client_name').value;c.phone=$('#client_phone').value;c.note=$('#client_note').value;logAction('حفظ عميل',{name:c.name});saveAll(true);renderClients();}
function clientsTable(){return simpleTable(state.clients,'client',['name','phone','note']);}
function saveService(e){e.preventDefault();const id=$('#serviceId').value||uid('s');let s=state.services.find(x=>x.id===id); if(!s){s={id,createdAt:nowISO(),active:true};state.services.push(s)} s.name=$('#service_name').value;s.price=Number($('#service_price').value||0);s.note=$('#service_note').value;logAction('حفظ خدمة',{name:s.name});saveAll(true);renderServices();}
function servicesTable(){return simpleTable(state.services,'service',['name','price','note']);}
function simpleTable(arr,type,cols){const rows=arr.filter(x=>!x.deleted).map(x=>`<tr>${cols.map(c=>`<td>${c==='price'?money(x[c]):escapeHtml(x[c]||'')}</td>`).join('')}<td><button class="btn small secondary" onclick="editSimple('${type}','${x.id}')">تعديل</button> <button class="btn small red" onclick="deleteSimple('${type}','${x.id}')">حذف</button></td></tr>`).join('');return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}<th>إجراءات</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table></div>`}
window.editSimple=function(type,id){const map={client:['clients','client'],service:['services','service']};const [arrName,prefix]=map[type];const x=state[arrName].find(i=>i.id===id); if(!x)return; $(`#${prefix}Id`).value=x.id; Object.keys(x).forEach(k=>{const el=$(`#${prefix}_${k}`); if(el)el.value=x[k]||''});window.scrollTo({top:0,behavior:'smooth'});}
window.deleteSimple=function(type,id){const map={client:'clients',service:'services'};const arr=state[map[type]], x=arr.find(i=>i.id===id); if(!x)return; if(!confirmBox('تأكيد الحذف؟'))return; x.deleted=true;pushTrash(type,JSON.parse(JSON.stringify(x)));logAction('حذف عنصر',{type,id});saveAll(true);renderPage();}

function renderEntries(){ if(!isAdmin()&&!isPro())return renderDenied(); const date=currentGlobalDay()?.date||todayISO(); $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>تسجيل شغل / عملية</h2></div><form onsubmit="saveEntry(event)"><div class="grid4"><div class="field"><label>التاريخ</label><input id="entryDate" type="date" value="${date}"></div><div class="field"><label>العميل</label><select id="entryClient"><option value="">بدون</option>${state.clients.filter(c=>!c.deleted).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label>الخدمة</label><select id="entryService" onchange="entryServiceChanged()"><option value="">اختر</option>${state.services.filter(s=>!s.deleted).map(s=>`<option value="${s.id}" data-price="${s.price}">${escapeHtml(s.name)}</option>`).join('')}</select></div><div class="field"><label>سعر الوحدة</label><input id="entryPrice" type="number" step="0.01" oninput="calcEntry()"></div><div class="field"><label>العدد</label><input id="entryQty" type="number" step="1" value="1" oninput="calcEntry()"></div><div class="field"><label>الإجمالي</label><input id="entryTotal" readonly></div></div><div class="field"><label>ملاحظات</label><textarea id="entryNote"></textarea></div><button class="btn" type="submit">حفظ العملية</button></form></div><div class="section"><div class="section-head"><h2>سجل الشغل</h2></div>${entriesTable()}</div>`;}
window.entryServiceChanged=function(){const opt=$('#entryService').selectedOptions[0];$('#entryPrice').value=opt?.dataset.price||'';calcEntry();}
window.calcEntry=function(){$('#entryTotal').value=Number($('#entryPrice').value||0)*Number($('#entryQty').value||0)}
window.saveEntry=function(e){e.preventDefault(); const service=state.services.find(s=>s.id===$('#entryService').value); const ent={id:uid('ent'),date:$('#entryDate').value,clientId:$('#entryClient').value,serviceId:service?.id||'',serviceName:service?.name||'',unitPrice:Number($('#entryPrice').value||0),qty:Number($('#entryQty').value||0),total:Number($('#entryTotal').value||0),note:$('#entryNote').value,createdBy:session.userId,createdAt:nowISO()};state.entries.push(ent);logAction('إضافة عملية',{id:ent.id,total:ent.total});saveAll(true);toast('تم حفظ العملية');renderEntries();}
function entriesTable(){const rows=state.entries.filter(e=>!e.deleted).slice().reverse().map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${state.clients.find(c=>c.id===e.clientId)?.name||'-'}</td><td>${escapeHtml(e.serviceName)}</td><td>${e.qty}</td><td>${money(e.unitPrice)}</td><td>${money(e.total)}</td><td>${escapeHtml(e.note||'')}</td><td><button class="btn small red" onclick="deleteEntry('${e.id}')">حذف</button></td></tr>`).join('');return `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>العميل</th><th>الخدمة</th><th>العدد</th><th>السعر</th><th>الإجمالي</th><th>ملاحظات</th><th>إجراء</th></tr></thead><tbody>${rows||'<tr><td colspan="8">لا توجد عمليات</td></tr>'}</tbody></table></div>`}
window.deleteEntry=function(id){const e=state.entries.find(x=>x.id===id);if(!e)return;if(!confirmBox('حذف العملية؟'))return;e.deleted=true;pushTrash('entry',JSON.parse(JSON.stringify(e)));logAction('حذف عملية',{id});saveAll(true);renderEntries();}

function renderModels(){ $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>سجل الموديلات</h2></div><div class="filters"><input id="mSearch" placeholder="بحث برقم/كود/ملاحظة" oninput="renderModelsList()"><select id="mUser" onchange="renderModelsList()"><option value="">كل المستخدمين</option>${activeUsers().map(u=>`<option value="${u.id}">${escapeHtml(u.fullName||u.username)}</option>`).join('')}</select><input id="mDate" type="date" onchange="renderModelsList()"><select id="mStatus" onchange="renderModelsList()"><option value="">كل الحالات</option>${REVIEW.map(s=>`<option>${s}</option>`).join('')}</select><button class="btn secondary" onclick="$('#mSearch').value='';$('#mUser').value='';$('#mDate').value='';$('#mStatus').value='';renderModelsList()">مسح</button></div><div id="modelsList"></div></div>`;renderModelsList();}
window.renderModelsList=function(){let ms=state.models.filter(m=>!m.deleted); if(!isAdmin()&&!isPro()) ms=ms.filter(m=>m.userId===session.userId); const q=$('#mSearch')?.value.trim(), u=$('#mUser')?.value,d=$('#mDate')?.value,s=$('#mStatus')?.value; if(q)ms=ms.filter(m=>String(m.modelNumber).includes(q)||m.modelCode?.includes(q)||m.note?.includes(q)); if(u)ms=ms.filter(m=>m.userId===u); if(d)ms=ms.filter(m=>m.date===d); if(s)ms=ms.filter(m=>m.generalStatus===s); ms.sort((a,b)=>a.date.localeCompare(b.date)||Number(a.modelNumber)-Number(b.modelNumber)); $('#modelsList').innerHTML=modelsTable(ms,{actions:true});}
function modelsTable(ms,opt={}){if(!ms.length)return '<div class="empty">لا توجد موديلات</div>'; return `<div class="table-wrap"><table><thead><tr><th>رقم</th><th>الكود</th><th>اليوم</th><th>المستخدم</th><th>الوضعيات</th><th>الحالة</th><th>ملاحظات</th><th>إجراءات</th></tr></thead><tbody>${ms.map(m=>{const u=state.users.find(x=>x.id===m.userId)||{};return `<tr><td>${m.modelNumber}</td><td>${escapeHtml(m.modelCode||'')}</td><td>${fmtDate(m.date)}</td><td>${escapeHtml(u.fullName||u.username||'-')}</td><td>${modelPoseCount(m)}</td><td>${statusBadge(m.generalStatus)}</td><td>${escapeHtml(m.note||'')}</td><td><button class="btn small secondary" onclick="viewModel('${m.id}')">عرض</button> ${!opt.userView?`<button class="btn small blue" onclick="editModel('${m.id}')">تعديل</button> <button class="btn small red" onclick="softDeleteModel('${m.id}')">حذف</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`}
window.viewModel=function(id){const m=state.models.find(x=>x.id===id); if(!m)return; const u=state.users.find(x=>x.id===m.userId)||{}; modal(`موديل رقم ${m.modelNumber}`,`<div><p><b>المستخدم:</b> ${escapeHtml(u.fullName||u.username||'-')}</p><p><b>التاريخ:</b> ${fmtDate(m.date)}</p><p><b>الكود:</b> ${escapeHtml(m.modelCode||'')}</p>${(m.poses||[]).map(p=>`<div class="pose-box" style="margin-bottom:8px"><h4>${p.name} ${statusBadge(p.reviewStatus)}</h4><p style="word-break:break-all">${escapeHtml(p.link)}</p><button class="btn small blue" onclick="window.open('${escapeHtml(p.link)}','_blank')">فتح الرابط</button></div>`).join('')}<p><b>الملاحظات:</b> ${escapeHtml(m.note||'-')}</p></div>`);}
window.editModel=function(id){const m=state.models.find(x=>x.id===id); if(!m)return; modal('تعديل الموديل',`<form onsubmit="updateModel(event,'${id}')"><div class="grid3"><div class="field"><label>رقم الموديل</label><input id="emNum" type="number" value="${m.modelNumber}"></div><div class="field"><label>التاريخ</label><input id="emDate" type="date" value="${m.date}"></div><div class="field"><label>الحالة</label><select id="emStatus">${REVIEW.map(s=>`<option ${m.generalStatus===s?'selected':''}>${s}</option>`).join('')}</select></div></div>${(m.poses||[]).map(p=>`<div class="field"><label>${p.name}</label><input id="poseEdit_${p.id}" value="${escapeHtml(p.link)}"></div>`).join('')}<div class="field"><label>ملاحظات</label><textarea id="emNote">${escapeHtml(m.note||'')}</textarea></div><button class="btn" type="submit">حفظ التعديل</button></form>`);}
window.updateModel=function(e,id){e.preventDefault();const m=state.models.find(x=>x.id===id);if(!m)return; m.modelNumber=Number($('#emNum').value);m.date=$('#emDate').value;m.generalStatus=$('#emStatus').value;m.note=$('#emNote').value;m.updatedAt=nowISO();(m.poses||[]).forEach(p=>{p.link=$(`#poseEdit_${p.id}`).value});logAction('تعديل موديل',{id});saveAll(true);closeModal();renderPage();toast('تم تعديل الموديل');}
window.softDeleteModel=function(id){const m=state.models.find(x=>x.id===id);if(!m)return;if(!confirmBox('حذف الموديل ونقله لسلة المحذوفات؟'))return;m.deleted=true;pushTrash('model',JSON.parse(JSON.stringify(m)));logAction('حذف موديل',{id});saveAll(true);renderPage();}

function renderPayments(){ if(!isAdmin()&&!isPro())return renderDenied(); const date=currentGlobalDay()?.date||todayISO(); $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>المدفوعات والسلف</h2></div><form onsubmit="savePayment(event)"><div class="grid4"><div class="field"><label>التاريخ</label><input id="payDate" type="date" value="${date}"></div><div class="field"><label>العميل</label><select id="payClient"><option value="">بدون</option>${state.clients.filter(c=>!c.deleted).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label>النوع</label><select id="payType"><option>دفعة</option><option>سلفة</option><option>خصم</option><option>تسوية</option></select></div><div class="field"><label>المبلغ</label><input id="payAmount" type="number" step="0.01"></div></div><div class="field"><label>ملاحظات</label><input id="payNote"></div><button class="btn" type="submit">حفظ</button></form></div><div class="section"><div class="section-head"><h2>السجل</h2></div>${paymentsTable()}</div>`;}
window.savePayment=function(e){e.preventDefault();state.payments.push({id:uid('pay'),date:$('#payDate').value,clientId:$('#payClient').value,type:$('#payType').value,amount:Number($('#payAmount').value||0),note:$('#payNote').value,createdBy:session.userId,createdAt:nowISO()});logAction('إضافة مدفوعات',{amount:$('#payAmount').value});saveAll(true);renderPayments();}
function paymentsTable(){const rows=state.payments.filter(p=>!p.deleted).slice().reverse().map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${state.clients.find(c=>c.id===p.clientId)?.name||'-'}</td><td>${p.type}</td><td>${money(p.amount)}</td><td>${escapeHtml(p.note||'')}</td><td><button class="btn small red" onclick="deletePayment('${p.id}')">حذف</button></td></tr>`).join('');return `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>العميل</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th><th>إجراء</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table></div>`}
window.deletePayment=function(id){const p=state.payments.find(x=>x.id===id);if(!p)return;p.deleted=true;pushTrash('payment',JSON.parse(JSON.stringify(p)));saveAll(true);renderPayments();}

function renderReports(){
  const users=activeUsers();
  $('#view').innerHTML=`<div class="section no-print"><div class="section-head"><h2>إنشاء تقرير</h2></div><div class="grid4"><div class="field"><label>نوع التقرير</label><select id="rType" onchange="reportTypeChanged()"><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option><option value="range">من تاريخ إلى تاريخ</option></select></div><div class="field"><label>من</label><input id="rFrom" type="date" value="${todayISO()}"></div><div class="field"><label>إلى</label><input id="rTo" type="date" value="${todayISO()}"></div><div class="field"><label>المستخدم</label><select id="rUser"><option value="">كل المستخدمين</option>${users.map(u=>`<option value="${u.id}">${escapeHtml(u.fullName||u.username)}</option>`).join('')}</select></div></div><div class="form-actions"><button class="btn" onclick="buildReport()">عرض التقرير</button><button class="btn secondary" onclick="window.print()">طباعة / PDF</button><button class="btn green" onclick="saveCurrentReport()">حفظ في الأرشيف</button></div></div><div class="section"><div id="reportOut" class="print-area"><div class="empty">اختار الفترة واضغط عرض التقرير</div></div></div>`;
}
window.reportTypeChanged=function(){const t=$('#rType').value; const today=todayISO(); let from=today,to=today; const d=new Date(today+'T12:00:00'); if(t==='weekly'){const day=d.getDay(); const start=new Date(d); start.setDate(d.getDate()-day); const end=new Date(start); end.setDate(start.getDate()+6); from=start.toISOString().slice(0,10);to=end.toISOString().slice(0,10);} if(t==='monthly'){from=today.slice(0,8)+'01'; const end=new Date(d.getFullYear(),d.getMonth()+1,0); to=end.toISOString().slice(0,10);} $('#rFrom').value=from;$('#rTo').value=to;}
window.buildReport=function(){const from=$('#rFrom').value,to=$('#rTo').value,uidf=$('#rUser').value; let ms=state.models.filter(m=>!m.deleted&&m.date>=from&&m.date<=to); if(uidf)ms=ms.filter(m=>m.userId===uidf); const poses=ms.reduce((a,m)=>a+modelPoseCount(m),0); const byUser={}; ms.forEach(m=>{byUser[m.userId]=(byUser[m.userId]||0)+1}); const rows=ms.sort((a,b)=>a.date.localeCompare(b.date)||a.modelNumber-b.modelNumber).map(m=>{const u=state.users.find(x=>x.id===m.userId)||{};return `<tr><td>${m.modelNumber}</td><td>${m.date}</td><td>${escapeHtml(u.fullName||u.username||'-')}</td><td>${modelPoseCount(m)}</td><td>${m.generalStatus}</td><td>${escapeHtml(m.note||'')}</td></tr>`}).join(''); $('#reportOut').innerHTML=`<div class="report-title"><div><h2>تقرير ${$('#rType').selectedOptions[0].text}</h2><p>الفترة: ${from} إلى ${to}</p></div><img src="assets/logo.jpeg"></div><div class="cards" style="grid-template-columns:repeat(3,1fr)">${statCard('🖼️','إجمالي الموديلات',ms.length)}${statCard('🔗','إجمالي الوضعيات',poses)}${statCard('👥','عدد المستخدمين',Object.keys(byUser).length)}</div><div class="table-wrap"><table><thead><tr><th>رقم</th><th>التاريخ</th><th>المستخدم</th><th>وضعيات</th><th>الحالة</th><th>ملاحظات</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table></div>`;}
window.saveCurrentReport=function(){const html=$('#reportOut').innerHTML;if(!html||html.includes('اختار الفترة'))return toast('اعرض التقرير أولًا','warn');state.reports.push({id:uid('rep'),title:$('#rType').selectedOptions[0].text,from:$('#rFrom').value,to:$('#rTo').value,html,createdAt:nowISO(),createdBy:session.userId});logAction('حفظ تقرير',{});saveAll(true);toast('تم حفظ التقرير');}

function renderActivity(){ $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>سجل النشاط</h2></div>${activityTable(state.activity)}</div>`;}
function activityTable(items){const rows=items.map(a=>{const u=state.users.find(x=>x.id===a.userId)||{};return `<tr><td>${fmtDate(a.at?.slice(0,10)||todayISO())} ${fmtTime(a.at)}</td><td>${escapeHtml(u.username||a.userId||'system')}</td><td>${escapeHtml(a.action)}</td><td><code>${escapeHtml(JSON.stringify(a.details||{}).slice(0,220))}</code></td></tr>`}).join('');return `<div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>${rows||'<tr><td colspan="4">لا يوجد نشاط</td></tr>'}</tbody></table></div>`}
function renderTrash(){ if(!isAdmin())return renderDenied(); const rows=state.trash.map(t=>`<tr><td>${t.type}</td><td>${fmtDate(t.deletedAt.slice(0,10))} ${fmtTime(t.deletedAt)}</td><td>${state.users.find(u=>u.id===t.deletedBy)?.username||'-'}</td><td>${escapeHtml((t.item?.name||t.item?.username||t.item?.modelCode||t.item?.date||t.id))}</td><td><button class="btn small green" onclick="restoreTrash('${t.id}')">استعادة</button> <button class="btn small red" onclick="purgeTrash('${t.id}')">حذف نهائي</button></td></tr>`).join(''); $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>سلة المحذوفات</h2></div><div class="table-wrap"><table><thead><tr><th>النوع</th><th>تاريخ الحذف</th><th>بواسطة</th><th>العنصر</th><th>إجراءات</th></tr></thead><tbody>${rows||'<tr><td colspan="5">السلة فارغة</td></tr>'}</tbody></table></div></div>`;}
window.restoreTrash=function(id){const t=state.trash.find(x=>x.id===id);if(!t)return; const item=t.item; item.deleted=false; const map={user:'users',model:'models',day:'workDays',entry:'entries',payment:'payments',client:'clients',service:'services'}; if(map[t.type]&&!state[map[t.type]].find(x=>x.id===item.id)) state[map[t.type]].push(item); state.trash=state.trash.filter(x=>x.id!==id);logAction('استعادة من السلة',{type:t.type});saveAll(true);renderTrash();}
window.purgeTrash=function(id){if(!confirmBox('حذف نهائي لا يمكن التراجع؟'))return;state.trash=state.trash.filter(x=>x.id!==id);saveAll(true);renderTrash();}
function renderMessages(){ if(!isAdmin())return renderDenied(); $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>إعدادات الرسائل التحفيزية</h2></div><div class="grid4"><div class="field"><label>تشغيل الرسائل</label><select id="motOn"><option value="true">تشغيل</option><option value="false">إيقاف</option></select></div><div class="field"><label>كل كام موديل</label><input id="motModels" type="number" value="${state.settings.motivationEveryModels}"></div><div class="field"><label>الصوت</label><select id="motSound"><option value="false">إيقاف</option><option value="true">تشغيل</option></select></div><div class="field"><label>&nbsp;</label><button class="btn" onclick="saveMotSettings()">حفظ</button></div></div></div><div class="section"><div class="section-head"><h2>الرسائل الحالية</h2></div>${state.motivationalMessages.map(m=>`<div class="pose-box" style="margin-bottom:8px"><b>${m.type}</b><p>${escapeHtml(m.text)}</p></div>`).join('')}</div>`; $('#motOn').value=String(state.settings.motivationEnabled);$('#motSound').value=String(state.settings.motivationSound);}
window.saveMotSettings=function(){state.settings.motivationEnabled=$('#motOn').value==='true';state.settings.motivationSound=$('#motSound').value==='true';state.settings.motivationEveryModels=Number($('#motModels').value||10);saveAll(true);toast('تم حفظ الإعدادات')}
function renderSettings(){
  $('#view').innerHTML=`<div class="section"><div class="section-head"><h2>الإعدادات والنسخ الاحتياطي</h2></div><div class="cards"><div class="card"><b>حالة المزامنة</b><p id="cloudInfo"></p><button class="btn" onclick="saveAll(true)">حفظ Online الآن</button></div><div class="card"><b>تصدير Backup</b><p>تحميل نسخة كاملة من البيانات.</p><button class="btn secondary" onclick="downloadBackup()">تحميل Backup</button></div><div class="card"><b>استيراد Backup</b><p>استعادة نسخة محفوظة.</p><input type="file" id="backupFile" accept=".json"><button class="btn secondary" onclick="importBackup()">استيراد</button></div><div class="card"><b>اختبار الاتصال</b><p>اختبر حفظ Supabase.</p><button class="btn blue" onclick="testCloud()">اختبار</button></div></div></div>`; const ci=$('#cloudInfo'); if(ci)ci.textContent=`${cloudStatus} — آخر مزامنة: ${state.cloud.lastSync||'لا يوجد'} — خطأ: ${state.cloud.lastError||'لا يوجد'}`;
}
window.downloadBackup=function(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='youssef-v21-backup-'+todayISO()+'.json';a.click();URL.revokeObjectURL(a.href)}
window.importBackup=function(){const f=$('#backupFile').files[0]; if(!f)return toast('اختار ملف','warn'); const r=new FileReader(); r.onload=()=>{try{const s=migrate(JSON.parse(r.result)); if(!confirmBox('سيتم استبدال البيانات الحالية. تأكيد؟'))return; state=s;saveAll(true);toast('تم الاستيراد');render();}catch(e){toast('ملف غير صحيح','bad')}}; r.readAsText(f);}
window.testCloud=async function(){await saveAll(true);toast(cloudStatus==='ok'?'الاتصال يعمل وتم الحفظ':'فشل الاتصال: '+(state.cloud.lastError||''),cloudStatus==='ok'?'ok':'bad');}
function renderDenied(){ $('#view').innerHTML='<div class="section"><div class="empty">ليس لديك صلاحية لفتح هذه الصفحة</div></div>';}

function modal(title,body){const m=$('#modal');m.classList.remove('hidden');m.innerHTML=`<div class="modal-card"><div class="modal-head"><h3>${title}</h3><button class="close-x" onclick="closeModal()">×</button></div>${body}</div>`;}
window.closeModal=()=>{$('#modal').classList.add('hidden');$('#modal').innerHTML='';}
window.login=login; window.logout=logout;

boot();
