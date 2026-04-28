// CineManager — app.js (JS completo parametrizzato)
// Tutti i valori specifici del cinema vengono da window.CINEMA_CONFIG


import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import{getFirestore,doc,collection,setDoc,deleteDoc,onSnapshot,getDocs,getDoc,query,orderBy,limit}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const FB=window.CINEMA_CONFIG.firebase;
const app=initializeApp(FB);
const db=getFirestore(app);

// ── CONSTANTS ─────────────────────────────────────────────
const DIT=['Giovedì','Venerdì','Sabato','Domenica','Lunedì','Martedì','Mercoledì'];
const DSH=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
const FASCE=window.CINEMA_CONFIG.fasce||['14:00','16:00','18:00','20:30','22:00'];
const MAIN_SLOT='20:30';
const SALE=(function(){
  const s={};
  (window.CINEMA_CONFIG.sale||[]).forEach(function(sala){
    s[sala.id]={n:sala.nome,col:sala.colore,hc:'sgh'+sala.id,sc:'sp'+sala.id,bc:'sb'+sala.id};
  });
  return s;
})();
const OA_SALES={'OA1':{n:'CineTour A',col:'#0d5c8a'},'OA2':{n:'CineTour B',col:'#1a7a5c'}};
const sn=id=>SALE[id]?.n||(OA_SALES[id]?.n)||'Sala '+id;

// ── STATE ─────────────────────────────────────────────────
// ── DATE ──────────────────────────────────────────────────
// Giovedì precedente o uguale (usato internamente)
function thurDay(d){const dt=new Date(d),dy=dt.getDay(),diff=dy>=4?dy-4:dy+3;dt.setDate(dt.getDate()-diff);dt.setHours(0,0,0,0);return dt;}
// All'avvio: sempre il giovedì della settimana FUTURA (se oggi è già giovedì → +7)
function startThurDay(d){const dt=new Date(d),dow=dt.getDay(),ahead=dow===4?7:(4-dow+7)%7;dt.setDate(dt.getDate()+ahead);dt.setHours(0,0,0,0);return dt;}

let S={films:[],shows:[],bookings:[],staff:[],shifts:[],emails:[],ws:startThurDay(new Date()),permissions:{},distributors:[],media:[],oaClienti:[],oaLuoghi:[],oaAddetti:[],oaSlots:[],oaRichieste:[],oaServizi:[],oaListini:[]};
function fd(d){return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fs(d){return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});}
function am(t,m){const[h,mm]=t.split(':').map(Number),tot=h*60+mm+m;return`${String(Math.floor(tot/60)%24).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;}
function t2m(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
// Round down to nearest 5 minutes
function r5(t){const[h,m]=t.split(':').map(Number),rm=Math.floor(m/5)*5;return`${String(h).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;}
function r5m(mins){const rm=Math.floor(mins/5)*5;return`${String(Math.floor(rm/60)%24).padStart(2,'0')}:${String(rm%60).padStart(2,'0')}`;}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function toLocalDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function wdays(){return Array.from({length:7},(_,i)=>{const d=new Date(S.ws);d.setDate(d.getDate()+i);return d;});}
function wdates(){return wdays().map(d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}
function uwl(){
  const ds=wdays();
  const txt=`${fd(ds[0])} — ${fd(ds[6])}`;
  document.querySelectorAll('.wlbl').forEach(el=>el.textContent=txt);
}
// Ritorna l'id della pagina correntemente visibile
function currentPage(){
  const pages=['prog','lista','arch','prnt','mail','book','staff','users','playlist'];
  return pages.find(function(id){
    const el=document.getElementById('page-'+id);
    return el&&el.classList.contains('on');
  })||'prog';
}

// Aggiorna la pagina attiva in base alla settimana corrente
function refreshCurrentPage(){
  uwl(); // aggiorna sempre il label settimana nell'header
  const cur=currentPage();
  switch(cur){
    case 'prog':
      rs();
      break;
    case 'lista':
      rs(); rl(); // rs() aggiorna i filtri, rl() la lista
      break;
    case 'arch':
      rs(); rf(); // rf() usa wdates() per badge "questa settimana"
      break;
    case 'prnt':
      rs(); // aggiorna i dati per i PDF
      break;
    case 'mail':
      rs();
      // Aggiorna date distributori se presenti
      const df=document.getElementById('dist-week-from');
      const dt=document.getElementById('dist-week-to');
      if(df&&dt){const wd=wdates();df.value=wd[0];dt.value=wd[6];}
      break;
    case 'book':
      rs(); renderBookings();
      break;
    case 'staff':
      _shiftStart=null;_hoverSlot=null;
      renderAllDays();
      if(document.getElementById('stab-week')&&document.getElementById('stab-week').classList.contains('on'))renderWeekCompact();
      if(document.getElementById('stab-hours')&&document.getElementById('stab-hours').classList.contains('on'))renderStaffHours();
      break;
    case 'playlist':
      rs(); renderPlaylist();
      break;
    default:
      rs();
  }
}
window.refreshCurrentPage=refreshCurrentPage;

function cw(n){
  S.ws=new Date(S.ws);
  S.ws.setDate(S.ws.getDate()+n*7);
  refreshCurrentPage();

  if(document.getElementById('page-social')?.classList.contains('on'))socialGenerate();
}
window.cw=cw;

// ── SYNC ──────────────────────────────────────────────────
function syncSet(s,t){const el=document.getElementById('syncInd');el.className='sync '+s;document.getElementById('syncTxt').textContent=t;}

// ── FIREBASE ──────────────────────────────────────────────
function startListeners(){
  // Carica dati Excel settimana precedente dal localStorage subito
  // così sono disponibili in Programmazione senza dover aprire Prog-proposta
  try{
    var _rawPrev=localStorage.getItem('cm_propPrevData');
    var _lblPrev=localStorage.getItem('cm_propPrevLabel')||'';
    if(_rawPrev){var _parsed=JSON.parse(_rawPrev);if(_parsed&&Object.keys(_parsed).length){_propPrevData=_parsed;_propPrevWeekLabel=_lblPrev;}}
  }catch(e){}
  startUsersListener();
  onSnapshot(collection(db,'films'),snap=>{
    S.films=snap.docs.map(d=>({id:d.id,...d.data()})).map(f=>{if(f.poster&&f.poster.includes('noposter'))f.poster='';return f;}).sort((a,b)=>a.title.localeCompare(b.title,'it'));
    // Auto-fix noposter URLs in Firestore silently
    snap.docs.forEach(async d=>{
      const data=d.data();
      if(data.poster&&(data.poster.includes('noposter')||data.poster.includes('github.io/images'))){
        try{await setDoc(doc(db,'films',d.id),{...data,poster:''});}catch(e){}
      }
    });
    rf();rs();rl();syncSet('ok','Sincronizzato');
    var po=document.getElementById('page-oa');
    if(po&&po.classList.contains('on')&&_oaTab==='filmoa')oaRenderFilmOA();
  },()=>syncSet('err','Errore sync'));
  onSnapshot(collection(db,'shows'),snap=>{
    S.shows=snap.docs.map(d=>({id:d.id,...d.data()}));
    rs();rl();syncSet('ok','Sincronizzato');
    if(typeof checkOrphanBadge==='function')checkOrphanBadge();
    var sp=document.getElementById('page-staff');
    if(sp&&sp.classList.contains('on')){var at=document.getElementById('stab-days');if(at&&at.classList.contains('on'))renderAllDays();else if(document.getElementById('stab-week')&&document.getElementById('stab-week').classList.contains('on'))renderWeekCompact();}
  },()=>syncSet('err','Errore sync'));
  onSnapshot(doc(db,'settings','emails'),snap=>{S.emails=snap.exists()?snap.data().list||[]:[];rem();});
  onSnapshot(collection(db,'bookings'),snap=>{S.bookings=snap.docs.map(d=>({id:d.id,...d.data()}));rs();renderBookings();var p=document.getElementById('page-oa');if(p&&p.classList.contains('on')&&_oaTab==='prenot')oaRenderPrenot();});
  onSnapshot(collection(db,'staff'),snap=>{S.staff=snap.docs.map(d=>({id:d.id,...d.data()}));renderStaffGrid();renderStaffPeople();renderStaffHours();});
  onSnapshot(collection(db,'shifts'),snap=>{S.shifts=snap.docs.map(d=>({id:d.id,...d.data()}));var sp=document.getElementById('page-staff');if(sp&&sp.classList.contains('on')){var at=document.getElementById('stab-days');if(at&&at.classList.contains('on'))renderAllDays();else renderWeekCompact();}renderStaffHours();});
  onSnapshot(doc(db,'settings','distributors'),snap=>{S.distributors=snap.exists()?snap.data().list||[]:[]; if(document.getElementById('dist-list'))renderDist(); fillFilmDistDropdown();});
  onSnapshot(doc(db,'settings','media'),snap=>{S.media=snap.exists()?snap.data().list||[]:[];if(document.getElementById('media-list'))renderMedia();});
  // Carica trailer playlist salvati
  // Listener permessi ruoli
  onSnapshot(doc(db,'settings','filmOrder'),snap=>{
    if(snap.exists()){var d=snap.data();if(d.week===foCurrentWeek()){_filmOrder=d.order||{new:[],curr:[],coming:[]};_filmOrderWeek=d.week;}}
  });
  onSnapshot(doc(db,'settings','permissions'),snap=>{
    S.permissions=snap.exists()?snap.data():{};
    // Riapplica visibilità se utente già loggato
    if(currentUser)applyTabVisibility(currentUser.role);
    renderPermGrid();
  });
  onSnapshot(doc(db,'settings','playlists'),snap=>{
    if(snap.exists()){
      var data=snap.data().trailers||{};
      Object.keys(data).forEach(function(fid){_plTrailers[fid]=data[fid];});
      var pp=document.getElementById('page-playlist');
      if(pp&&pp.classList.contains('on'))renderPlaylist();
    }
  });
  // ── CineTour OA ──
  onSnapshot(collection(db,'oaClienti'),snap=>{S.oaClienti=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.ragione||'').localeCompare(b.ragione||'','it'));var p=document.getElementById('page-oa');if(p&&p.classList.contains('on'))oaRenderClienti();if(document.getElementById('ovBook')?.classList.contains('on'))fillOAClienteDropdown();if(document.getElementById('page-book')?.classList.contains('on'))renderBookings();});
  onSnapshot(collection(db,'oaLuoghi'),snap=>{S.oaLuoghi=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','it'));var p=document.getElementById('page-oa');if(p&&p.classList.contains('on'))oaRenderLuoghi();if(document.getElementById('ovBook')?.classList.contains('on'))fillOALuogoDropdown();});
  onSnapshot(collection(db,'oaAddetti'),snap=>{S.oaAddetti=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','it'));var p=document.getElementById('page-oa');if(p&&p.classList.contains('on'))oaRenderAddetti();});
  onSnapshot(collection(db,'oaServizi'),snap=>{
    S.oaServizi=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.ordine||0)-(b.ordine||0));
    var p=document.getElementById('page-oa');
    if(p&&p.classList.contains('on')&&_oaTab==='servizi')oaRenderServizi();
    if(!S.oaServizi.length)oaInitServiziDefault();
  });
  onSnapshot(collection(db,'oaListini'),snap=>{
    S.oaListini=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.anno||0)-(a.anno||0));
    var p=document.getElementById('page-oa');
    if(p&&p.classList.contains('on')&&_oaTab==='listino')oaRenderListino();
  });
  onSnapshot(collection(db,'oaSlots'),snap=>{S.oaSlots=snap.docs.map(d=>({id:d.id,...d.data()}));var p=document.getElementById('page-oa');if(p&&p.classList.contains('on')&&_oaTab==='slots')oaRenderSlots();});
  onSnapshot(collection(db,'oaRichieste'),snap=>{
    S.oaRichieste=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.seconds||0;const bt=b.createdAt?.seconds||0;
      return bt-at; // più recenti prima
    });
    var p=document.getElementById('page-oa');
    if(p&&p.classList.contains('on')){
      if(_oaTab==='richieste')oaRenderRichieste();
      if(_oaTab==='slots')oaRenderSlots();
    }
    // Badge notifica su tab
    oaUpdateBadgeRichieste();
  });
  // Presenze utenti online
  onSnapshot(collection(db,'presenze'),snap=>{
    window._presenze=snap.docs.map(d=>({id:d.id,...d.data()}));
    var up=document.getElementById('page-users');
    if(up&&up.classList.contains('on'))renderPresenze();
  });
}
async function fbSF(film){syncSet('busy','Salvataggio…');await setDoc(doc(db,'films',film.id),film);}
async function fbDF(id){syncSet('busy','Salvataggio…');await deleteDoc(doc(db,'films',id));}
async function fbSS(show){syncSet('busy','Salvataggio…');await setDoc(doc(db,'shows',show.id),show);}
async function fbDS(id){syncSet('busy','Salvataggio…');await deleteDoc(doc(db,'shows',id));}
async function fbSE(list){await setDoc(doc(db,'settings','emails'),{list});}
async function fbSetDoc(db2,col,docId,data){await setDoc(doc(db2,col,docId),data);}

// ── TABS ──────────────────────────────────────────────────
const TABS=['prog','prop','lista','arch','prnt','mail','book','staff','users','playlist','social','news','bo','monitor','oa'];
function gt(id){
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('on',TABS[i]===id));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  var _ps=document.getElementById('perm-section');
  if(_ps)_ps.style.display=(id==='users'&&window._userRole==='admin')?'block':'none';
  if(id==='lista')rl();if(id==='arch')rf();if(id==='mail')rem();if(id==='staff'){renderAllDays();}if(id==='playlist')renderPlaylist();if(id==='social'&&typeof socialGenerate==='function')socialGenerate();if(id==='users')renderPermGrid();if(id==='news')newsInit();
  if(id==='prop')propInit();
  if(id==='prog'){
    // Carica dati da localStorage se non ancora in memoria
    if(!Object.keys(_propPrevData||{}).length)propLoadLS();
    if(!Object.keys(_mboxData||{}).length)propLoadMboxLS();
    propRenderRankStrip();
    if(typeof propRenderMboxStrip==='function')propRenderMboxStrip();
  }
  if(id==='monitor'&&typeof monitorInit==='function')monitorInit();
  if(id==='oa')oaInit();
  if(id==='users'){renderPresenze();renderSessioni();}
  // Aggiorna tab corrente nella presenza
  var tabLabels={prog:'📅 Programmazione',prop:'📋 Prog-proposta',lista:'📋 Listato Prog',arch:'🎬 Archivio Film',prnt:'🖨 Stampa & PDF',mail:'✉ Email',book:'📅 Prenotazioni',staff:'👥 Turni',users:'👤 Utenti',playlist:'▶ Playlist',social:'📱 Social',news:'📰 Newsletter',bo:'📊 Box Office',monitor:'📡 Monitor',oa:'☀ CineTour OA'};
  presenzaSetTab(tabLabels[id]||id);
}
window.gt=gt;

// ── FILM STATUS ───────────────────────────────────────────
function filmStatus(f){
  const t=toLocalDate(new Date());
  if(f.endDate&&f.endDate<t)return'exp';
  if(f.release&&f.release>t)return'nd';
  return'ok';
}

// ── RENDER SCHEDULE (Vista A) ─────────────────────────────

// ── SALA ID HELPER ────────────────────────────────────
// Normalizza la sala a ID numerico ('1'-'4') indipendentemente dal formato salvato
function salaId(val){
  if(!val)return null;
  // Già numerico
  if(/^[1-4]$/.test(String(val)))return String(val);
  // Nome → numero
  const byName={'teatro':'1','ciak':'2','1908':'3','mignon':'4'};
  return byName[(val+'').toLowerCase()]||String(val);
}
window.salaId=salaId;

function rs(){
  const fSala=document.getElementById('fS').value;
  const wrap=document.getElementById('sw');
  const days=wdays();
  const todayStr=toLocalDate(new Date());

  const fd2=document.getElementById('fD'),cv=fd2.value;
  fd2.innerHTML='<option value="all">Tutti</option>';
  days.forEach((d,i)=>{const o=document.createElement('option');o.value=toLocalDate(d);o.textContent=`${DSH[i]} ${fs(d)}`;fd2.appendChild(o);});
  fd2.value=cv;const fDay=fd2.value;

  const ff=document.getElementById('fF'),cf=ff.value;
  ff.innerHTML='<option value="all">Tutti</option>';
  S.films.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.title;ff.appendChild(o);});
  ff.value=cf;const fFilm=ff.value;

  const wd=wdates();
  let shows=S.shows.filter(s=>{
    if(!wd.includes(s.day))return false;
    if(fSala!=='all'&&s.sala!=fSala)return false;
    if(fDay!=='all'&&s.day!==fDay)return false;
    if(fFilm!=='all'&&s.filmId!==fFilm)return false;
    return true;
  });

  let dArr=days.map((d,i)=>({d,i}));
  if(fDay!=='all')dArr=dArr.filter(x=>x.toLocalDate(d)===fDay);

  const sale=fSala==='all'?['1','2','3','4']:[String(fSala)];
  const html=[];

  dArr.forEach(({d,i})=>{
    const ds=toLocalDate(d);
    const dayShows=shows.filter(s=>s.day===ds);
    const count=dayShows.length;

    html.push(`<div class="day-block">`);
    html.push(`<div class="day-head">
      <span class="day-name">${DIT[i]}</span>
      <span class="day-date">${fd(d)}</span>
      ${count?`<span class="day-count">${count} spettacol${count===1?'o':'i'}</span>`:''}
      <div class="day-copy" style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn bg bs" onclick="clearDay('${ds}')" title="Cancella tutti gli spettacoli della giornata" style="color:var(--red);border-color:rgba(232,74,74,.35)">🗑 Cancella</button>
        <button class="btn bg bs" onclick="openDupDayModal('${ds}')" title="Duplica intera giornata" style="color:var(--c3);border-color:rgba(58,232,170,.35)">📅 Duplica</button>
        ${Object.keys(_propPrevData||{}).length?`<button class="btn bg bs" onclick="togglePropOverlay(this,'${ds}')" title="Mostra/nascondi dati proposta settimana precedente" style="color:var(--acc);border-color:rgba(232,200,74,.35)" data-ds="${ds}">📊 Proposta</button>`:''}
        ${sale.map(sid=>`
          <button class="btn bg bs" onclick="openOptModal('${ds}','${sid}')" title="Ottimizza orari ${SALE[sid].n}" style="color:var(--acc);border-color:rgba(232,200,74,.4)">⚡ ${SALE[sid].n}</button>
          <button class="btn bg bs" onclick="openCopyModal('${ds}','${sid}')" title="Copia ${SALE[sid].n}">📋 ${SALE[sid].n}</button>
        `).join('')}
      </div>
    </div>`);

    // ── GRIGLIA A FASCE FISSE ──────────────────────────────
    // Le righe sono sempre le 5 fasce standard + eventuali extra.
    // Ogni spettacolo viene assegnato alla fascia più vicina (entro 90 min).
    // Questo allinea visivamente le sale anche con orari leggermente diversi.

    // Collect all unique slots across all sale
    const allStartTimes=new Set();
    sale.forEach(sid=>dayShows.filter(s=>s.sala==sid).forEach(s=>allStartTimes.add(s.start)));

    // Map each real start time → nearest fascia (within 90 min window)
    // If no fascia within 90 min, use the real time as its own row
    function nearestFascia(t){
      const tm=t2m(t);
      let best=null,bestDiff=Infinity;
      FASCE.forEach(f=>{const diff=Math.abs(t2m(f)-tm);if(diff<bestDiff&&diff<=90){bestDiff=diff;best=f;}});
      return best||t; // fallback: use real time as row
    }

    // Build set of row keys (fascia labels) in order
    const rowSet=new Set(FASCE); // always show all 5 standard fasce
    allStartTimes.forEach(t=>rowSet.add(nearestFascia(t)));
    const rows=[...rowSet].sort();

    // Grid: 32px label + N sale columns
    const cols=`32px repeat(${sale.length},1fr)`;
    html.push(`<div class="slot-grid" style="grid-template-columns:${cols}">`);

    // Header row
    html.push(`<div class="sg-corner" style="min-height:40px"></div>`);
    sale.forEach(sid=>{
      const sl=SALE[sid];
      html.push(`<div class="sg-sala-head ${sl.hc}">
        <span class="sdot" style="background:${sl.col}"></span>
        <span>${sl.n}</span>
      </div>`);
    });

    // Slot rows — one per fascia
    rows.forEach(rowKey=>{
      const isMain=rowKey===MAIN_SLOT;
      const isFascia=FASCE.includes(rowKey);
      html.push(`<div class="sg-row-lbl${isMain?' main-slot':''}">${rowKey}</div>`);

      sale.forEach(sid=>{
        const salaShows=dayShows.filter(s=>s.sala==sid).sort((a,b)=>t2m(a.start)-t2m(b.start));
        // Shows whose nearest fascia is this rowKey
        const rowShows=salaShows.filter(s=>nearestFascia(s.start)===rowKey);

        // Bookings for this sala/day that fall in this row slot
        const rowBookings=(S.bookings||[]).filter(function(b){
          if(salaId(b.sala)!==sid)return false;
          return (b.dates||[]).some(function(bd){
            return bd.date===ds&&nearestFascia(bd.start)===rowKey;
          });
        });

        html.push(`<div class="sg-cell${isMain?' main-slot-row':''}" onclick="openShowSlot('${ds}','${rowKey}','${sid}')">`);

        // Render bookings as colored slots (same color as sala, dashed border)
        rowBookings.forEach(function(b){
          const bDate=(b.dates||[]).find(function(bd){return bd.date===ds;});
          if(!bDate)return;
          const canEdit=currentUser&&(currentUser.role==='admin'||currentUser.role==='segretaria'||currentUser.role==='operator');
          const sl=SALE[sid]||{col:'#888',n:'Sala '+sid};
          const bFilm=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
          const BOOK_ICONS={openair:'☀',privato:'🔒',compleanno:'🎂',scolastica:'🏫',ricorrente:'🔄'};
          const icon=BOOK_ICONS[b.type]||'📋';
          const typeLabel=BOOK_TYPES[b.type]||b.type;
          const delBtn=canEdit?'<button class="book-slot-del" data-bid="'+b.id+'" onclick="event.stopPropagation();(function(el){delBook(el.dataset.bid);})(this)" title="Elimina">×</button>':'';
          html.push(
            '<div class="book-slot" data-bid="'+b.id+'" style="color:'+sl.col+';border-color:'+sl.col+';border-left-color:'+sl.col+'" onclick="event.stopPropagation();(function(el){editBook(el.dataset.bid);})(this)" title="'+typeLabel+': '+b.name+'">'
            +delBtn
            +'<div class="book-slot-type">'+icon+' '+typeLabel+'</div>'
            +'<div class="book-slot-name">'+b.name+'</div>'
            +'<div class="book-slot-time">'+bDate.start+(bDate.end?' → '+bDate.end:'')+'</div>'
            +(b.seats?'<div class="book-slot-time">💺 '+b.seats+'</div>':'')
            +'</div>'
          );
        });

        if(rowShows.length){
          html.push(`<div class="add-above" onclick="event.stopPropagation();openShowSlot('${ds}','${rowKey}','${sid}')" title="Aggiungi spettacolo in questa fascia">＋ aggiungi</div>`);
          rowShows.forEach(s=>{
            const film=S.films.find(f=>f.id===s.filmId);
            const prevChip=buildPropOverlayChip(s.filmId,i,sid,s.start);
            const tag=userTag(s.createdBy,s.updatedBy);
            const tagHtml=tag?`<span style="position:absolute;bottom:3px;right:4px;font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.35);border-radius:3px;padding:1px 4px;line-height:1.4" title="${s.updatedBy||s.createdBy||''}">${tag}</span>`:'';
            // Giorni di programmazione: (data spettacolo - release film) + 1
            let daysBadge='';
            if(film&&film.release&&s.day){
              const diff=Math.round((new Date(s.day)-new Date(film.release))/86400000)+1;
              if(diff>0) daysBadge=`<span style="position:absolute;top:3px;right:4px;font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.35);border-radius:3px;padding:1px 4px;line-height:1.4" title="Giorno ${diff} di programmazione">gg.${diff}</span>`;
            }
            html.push(`<div class="show-pill ${SALE[s.sala].sc}" onclick="event.stopPropagation();editShow('${s.id}')" style="position:relative">
              <button class="sp-del" onclick="event.stopPropagation();delShow('${s.id}')">×</button>
              ${daysBadge}
              <div class="sp-title" style="${film?'':'color:#e84a4a'}">${film?film.title:'⚠ Film eliminato'}</div>
              <div class="sp-time">${s.start} → ${s.end}</div>
              ${prevChip}${tagHtml}
            </div>`);
          });
        } else if(isFascia){
          // Empty standard fascia — show + button
          html.push(`<div class="add-slot">＋</div>`);
        }
        // Non-standard row with no shows: leave blank (shouldn't happen)

        html.push(`</div>`);
      });
    });

    html.push(`</div>`); // close slot-grid
    var oaToday=(S.bookings||[]).filter(function(b){
      return b.type==='openair'&&(b.dates||[]).some(function(bd){return bd.date===ds;});
    });
    if(oaToday.length){
      html.push('<div class="oa-day-banner">');
      oaToday.forEach(function(b){
        var bDate=(b.dates||[]).find(function(bd){return bd.date===ds;});if(!bDate)return;
        var film=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
        var filmTitle=film?film.title:(b.oaFilmTitle||'');
        var loc=b.location?' · '+b.location:'';
        var timeStr=bDate.start+(bDate.end?' → '+bDate.end:'');
        html.push(
          '<div class="oa-banner-row" data-bid="'+b.id+'" onclick="editBook(this.dataset.bid)" title="Clicca per modificare">'
          +'<span class="oa-banner-star">☀︎</span>'
          +'<span class="oa-banner-label">CineTour Open Air</span>'
          +(b.location?'<span class="oa-banner-sep">·</span><span class="oa-banner-loc">'+b.location+'</span>':'')
          +(filmTitle?'<span class="oa-banner-sep">·</span><span class="oa-banner-film">'+filmTitle+'</span>':'')
          +'<span class="oa-banner-time">'+timeStr+'</span>'
          +(b.name?'<span class="oa-banner-sep">·</span><span class="oa-banner-name">'+b.name+'</span>':'')
          +'<span class="oa-banner-edit">✏</span>'
          +'</div>'
        );
      });
      html.push('</div>');
    }
    html.push('</div>'); // close day-block
  });

  wrap.innerHTML=html.length?html.join(''):`<div class="empty"><div class="ei2">📅</div><div class="et">Nessun dato da visualizzare</div></div>`;
  if(_progView==='table')rsTable();
}
window.rs=rs;

// ── Vista tabella per la programmazione ───────────────────────────────────
var _progView='day'; // 'day' | 'table'

function setProgView(v){
  _progView=v;
  var bd=document.getElementById('prog-view-day');
  var bt=document.getElementById('prog-view-table');
  var sw=document.getElementById('sw');
  var swt=document.getElementById('sw-table');
  if(bd){bd.className=v==='day'?'btn bs':'btn bg bs';bd.style=v==='day'?'background:var(--acc);color:#000;border-color:var(--acc)':'';}
  if(bt){bt.className=v==='table'?'btn bs':'btn bg bs';bt.style=v==='table'?'background:var(--acc);color:#000;border-color:var(--acc)':'';}
  if(sw)sw.style.display=v==='day'?'':'none';
  if(swt)swt.style.display=v==='table'?'':'none';
  if(v==='table')rsTable();
  else rs();
}
window.setProgView=setProgView;

// ── Render griglia tabella programmazione (sale×fasce / giorni) ───────────
function rsTable(){
  var swt=document.getElementById('sw-table');
  if(!swt)return;
  var days=wdays();
  var wd=wdates();
  var allShows=S.shows.filter(function(s){return wd.includes(s.day);});
  var fSala=document.getElementById('fS')?.value||'all';
  var fFilm=document.getElementById('fF')?.value||'all';
  var saleIds=fSala==='all'?Object.keys(SALE):[String(fSala)];
  var DAY_NAMES=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

  var html='<table style="border-collapse:collapse;width:100%;min-width:900px;font-size:11px">';

  // Header giorni
  html+='<thead><tr>';
  html+='<th style="width:80px;padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);font-size:10px;color:var(--txt2)">Sala</th>';
  html+='<th style="width:52px;padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);font-size:10px;color:var(--txt2)">Orario</th>';
  days.forEach(function(d,i){
    html+='<th style="padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);text-align:center;min-width:110px">';
    html+='<div style="font-weight:700;color:var(--txt);font-size:11px">'+DAY_NAMES[i]+' '+fs(d)+'</div>';
    html+='</th>';
  });
  html+='</tr></thead><tbody>';

  // Per ogni sala × fascia
  saleIds.forEach(function(sid){
    var sala=SALE[sid];
    if(!sala)return;

    FASCE.forEach(function(fascia,fi){
      html+='<tr>';

      // Colonna sala (rowspan su prima fascia)
      if(fi===0){
        html+='<td rowspan="'+FASCE.length+'" style="padding:6px;border:1px solid var(--bdr);background:var(--surf2);'
          +'border-left:3px solid '+sala.col+';font-weight:700;color:'+sala.col+';vertical-align:middle;text-align:center;font-size:11px">'
          +sala.n+'</td>';
      }

      // Colonna fascia
      html+='<td style="padding:3px 5px;border:1px solid var(--bdr);background:var(--surf2);color:var(--txt2);'
        +'font-size:10px;font-weight:600;white-space:nowrap;text-align:center">'+fascia+'</td>';

      var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);

      // 7 celle giorno
      days.forEach(function(d,di){
        var ds=wd[di];
        var dayShows=allShows.filter(function(s){
          if(s.day!==ds||String(s.sala)!==String(sid))return false;
          if(fFilm!=='all'&&s.filmId!==fFilm)return false;
          var sm=parseInt(s.start.split(':')[0])*60+parseInt(s.start.split(':')[1]);
          return Math.abs(sm-fm)<=30;
        });

        html+='<td style="padding:3px;border:1px solid var(--bdr);vertical-align:top;min-height:50px;cursor:pointer" '
          +'onclick="openShowSlot(\''+ds+'\',\''+fascia+'\',\''+sid+'\')">';

        if(dayShows.length){
          html+='<div class="add-above" onclick="event.stopPropagation();openShowSlot(\''+ds+'\',\''+fascia+'\',\''+sid+'\')" title="Aggiungi">＋</div>';
          dayShows.forEach(function(s){
            var film=S.films.find(function(f){return f.id===s.filmId;});
            var tag=userTag(s.createdBy,s.updatedBy);
            var tagHtml=tag?'<span style="position:absolute;bottom:3px;right:4px;font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.35);border-radius:3px;padding:1px 4px;line-height:1.4" title="'+(s.updatedBy||s.createdBy||'')+'">'+tag+'</span>':'';
            var daysBadge='';
            if(film&&film.release&&s.day){
              var diff=Math.round((new Date(s.day)-new Date(film.release))/86400000)+1;
              if(diff>0) daysBadge='<span style="position:absolute;top:3px;right:4px;font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.35);border-radius:3px;padding:1px 4px;line-height:1.4" title="Giorno '+diff+' di programmazione">gg.'+diff+'</span>';
            }
            html+='<div class="show-pill '+sala.sc+'" onclick="event.stopPropagation();editShow(\''+s.id+'\')" style="position:relative">'
              +'<button class="sp-del" onclick="event.stopPropagation();delShow(\''+s.id+'\')">×</button>'
              +daysBadge
              +'<div class="sp-title">'+(film?film.title:'⚠ Film eliminato')+'</div>'
              +'<div class="sp-time">'+s.start+' → '+s.end+'</div>'
              +tagHtml
              +'</div>';
          });
        } else {
          html+='<div class="add-slot">＋</div>';
        }
        html+='</td>';
      });
      html+='</tr>';
    });

    // Separatore sala
    html+='<tr><td colspan="'+(2+days.length)+'" style="height:4px;background:var(--surf2);border:none"></td></tr>';
  });

  html+='</tbody></table>';
  swt.innerHTML=html;
}
window.rsTable=rsTable;

// Show orphan badge in sync indicator if needed
function checkOrphanBadge(){
  var n=countOrphanShows();
  var el=document.getElementById('orphan-badge');
  if(!el)return;
  el.style.display=n>0?'inline-flex':'none';
  el.textContent='⚠ '+n+' spett. orfan'+(n===1?'o':'i');
  el.title='Spettacoli con film eliminato — clicca per pulire';
}
window.checkOrphanBadge=checkOrphanBadge;

// ── LIST ──────────────────────────────────────────────────
function rl(){
  const sort=document.getElementById('ls').value;
  const wd=wdates();const days=wdays();
  let shows=S.shows.filter(s=>wd.includes(s.day));
  const w=document.getElementById('lw');
  if(!shows.length){w.innerHTML='<div class="empty"><div class="ei2">\u{1F3AC}</div><div class="et">Nessuno spettacolo questa settimana</div></div>';return;}

  if(sort==='cards'){
    const filmIds=[...new Set(shows.map(s=>s.filmId))];
    const sortedFilms=filmIds.map(id=>S.films.find(f=>f.id===id)).filter(Boolean).sort((a,b)=>a.title.localeCompare(b.title,'it'));
    let h='<div class="lfc-grid">';
    sortedFilms.forEach(film=>{
      const fShows=shows.filter(s=>s.filmId===film.id).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
      const byDay={};
      fShows.forEach(s=>{if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      const dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
      const meta=[film.distributor,dur,film.rating,film.genre].filter(Boolean).join(' \xb7 ');
      h+=`<div class="lfc"><div class="lfc-head"><div class="lfc-title">${film.title}</div><div class="lfc-meta">${meta}</div><div class="lfc-count">${fShows.length} spettacol${fShows.length===1?'o':'i'}</div></div><div class="lfc-days">`;
      Object.keys(byDay).sort().forEach(ds=>{
        const di=wd.indexOf(ds);
        const dayLabel=di>=0?DIT[di]+' '+fs(days[di]):'?';
        h+=`<div><div class="lfc-day-name">${dayLabel}</div><div class="lfc-slots">`;
        byDay[ds].forEach(s=>{
          h+=`<span class="lfc-slot"><span class="lfc-slot-time">${s.start}</span><span class="lfc-slot-sala">${sn(s.sala)}</span></span>`;
        });
        h+='</div></div>';
      });
      h+='</div></div>';
    });
    h+='</div>';
    w.innerHTML=h;
    return;
  }

  // ── VISTA: Card per Giorno ──────────────────────────────
  // Una card per ogni giorno — dentro, ogni film con orario e sala come la Card Film
  if(sort==='giorno'){
    const dayMap={};
    shows.forEach(function(s){if(!dayMap[s.day])dayMap[s.day]=[];dayMap[s.day].push(s);});
    let h='';
    Object.keys(dayMap).sort().forEach(function(ds){
      const di=wd.indexOf(ds);
      const dayLabel=di>=0?DIT[di].toUpperCase()+' '+fs(days[di]):ds;
      const dayShows=dayMap[ds].slice().sort(function(a,b){return a.start.localeCompare(b.start);});
      // Group by film for this day
      const filmOrder=[];const byFilm={};
      dayShows.forEach(function(s){
        if(!byFilm[s.filmId]){filmOrder.push(s.filmId);byFilm[s.filmId]=[];}
        byFilm[s.filmId].push(s);
      });
      h+='<div class="lfc" style="border-top-color:var(--acc)">';
      h+='<div class="lfc-head">';
      h+='<div class="lfc-title">'+dayLabel+'</div>';
      h+='<div class="lfc-count">'+dayShows.length+' spettacol'+(dayShows.length===1?'o':'i')+'</div>';
      h+='</div>';
      h+='<div class="lfc-days">';
      filmOrder.forEach(function(fid){
        const film=S.films.find(function(f){return f.id===fid;});
        const dur=film&&film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
        const meta=[film&&film.distributor?film.distributor:'',dur,film&&film.rating?film.rating:'',film&&film.genre?film.genre:''].filter(Boolean).join(' · ');
        h+='<div>';
        h+='<div class="lfc-day-name">'+(film?film.title:'—')+'</div>';
        if(meta) h+='<div style="font-size:10px;color:var(--txt2);margin-bottom:3px">'+meta+'</div>';
        h+='<div class="lfc-slots">';
        byFilm[fid].forEach(function(s){
          const sl=SALE[s.sala]||{bc:'sb1',n:'Sala '+s.sala};
          h+='<span class="lfc-slot"><span class="lfc-slot-time">'+s.start+'</span><span class="lfc-slot-sala '+sl.bc+'">'+sl.n+'</span></span>';
        });
        h+='</div></div>';
      });
      h+='</div></div>';
    });
    w.innerHTML=h||'<div class="empty"><div class="ei2">📅</div><div class="et">Nessuno spettacolo questa settimana</div></div>';
    return;
  }

  // ── VISTA: Card Giorno × Sala ────────────────────────────
  // Card lfc per ogni film — mostrando i giorni raggruppati per sala
  // Stessa struttura Card Film ma la day-name è "SALA" e i slots sono gli orari
  if(sort==='giorno-sala'){
    const SALE_IDS=['1','2','3','4'];
    const dayMap={};
    shows.forEach(function(s){if(!dayMap[s.day])dayMap[s.day]=[];dayMap[s.day].push(s);});
    let h='';
    // Per ogni giorno
    Object.keys(dayMap).sort().forEach(function(ds){
      const di=wd.indexOf(ds);
      const dayLabel=di>=0?DIT[di].toUpperCase()+' '+fs(days[di]):ds;
      const dayShows=dayMap[ds];
      // Per ogni sala che ha spettacoli quel giorno
      SALE_IDS.forEach(function(sid){
        const sl=SALE[sid];
        const salaShows=dayShows.filter(function(s){return s.sala==sid;}).sort(function(a,b){return a.start.localeCompare(b.start);});
        if(!salaShows.length)return;
        // Raggruppa per film
        const filmOrder=[];const byFilm={};
        salaShows.forEach(function(s){
          if(!byFilm[s.filmId]){filmOrder.push(s.filmId);byFilm[s.filmId]=[];}
          byFilm[s.filmId].push(s);
        });
        h+='<div class="lfc" style="border-top-color:'+sl.col+'">';
        h+='<div class="lfc-head">';
        // Titolo = GIORNO · SALA
        h+='<div class="lfc-title">'+dayLabel+'</div>';
        h+='<div class="lfc-meta"><span class="sdot" style="background:'+sl.col+';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>'
          +'<span style="color:'+sl.col+';font-weight:600">'+sl.n+'</span></div>';
        h+='<div class="lfc-count">'+salaShows.length+' spettacol'+(salaShows.length===1?'o':'i')+'</div>';
        h+='</div>';
        h+='<div class="lfc-days">';
        filmOrder.forEach(function(fid){
          const film=S.films.find(function(f){return f.id===fid;});
          const dur=film&&film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
          const meta=[film&&film.distributor?film.distributor:'',dur,film&&film.rating?film.rating:'',film&&film.genre?film.genre:''].filter(Boolean).join(' · ');
          h+='<div>';
          h+='<div class="lfc-day-name" style="color:var(--txt)">'+(film?film.title:'—')+'</div>';
          if(meta) h+='<div style="font-size:10px;color:var(--txt2);margin-bottom:3px">'+meta+'</div>';
          h+='<div class="lfc-slots">';
          byFilm[fid].forEach(function(s){
            h+='<span class="lfc-slot"><span class="lfc-slot-time">'+s.start+'</span></span>';
          });
          h+='</div></div>';
        });
        h+='</div></div>';
      });
    });
    w.innerHTML=h||'<div class="empty"><div class="ei2">📅</div><div class="et">Nessuno spettacolo questa settimana</div></div>';
    return;
  }

  // ── VISTA: Card per Sala ────────────────────────────────
  // 4 card affiancate (una per sala) con tutti gli spettacoli della settimana
  // ordinati per giorno e orario di inizio
  if(sort==='per-sala'){
    const SALE_IDS=['1','2','3','4'];
    let h='<div class="lfc-grid-4">';
    SALE_IDS.forEach(function(sid){
      const sl=SALE[sid];
      const salaShows=shows.filter(function(s){return s.sala==sid;})
        .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
      // Raggruppa per giorno
      const byDay={};const dayOrder=[];
      salaShows.forEach(function(s){
        if(!byDay[s.day]){byDay[s.day]=[];dayOrder.push(s.day);}
        byDay[s.day].push(s);
      });
      h+='<div class="lfc" style="border-top:3px solid '+sl.col+'">';
      // Header sala
      h+='<div class="lfc-head" style="padding-bottom:10px">';
      h+='<div class="lfc-title" style="color:'+sl.col+';font-size:16px">'+sl.n+'</div>';
      h+='<div class="lfc-count">'+salaShows.length+' spettacol'+(salaShows.length===1?'o':'i')+'</div>';
      h+='</div>';
      // Corpo: per ogni giorno, elenco spettacoli
      h+='<div class="lfc-days">';
      if(!dayOrder.length){
        h+='<div style="font-size:12px;color:var(--txt2);padding:4px 0">Nessuno spettacolo questa settimana</div>';
      }
      dayOrder.forEach(function(ds){
        const di=wd.indexOf(ds);
        const dayLabel=di>=0?DIT[di].toUpperCase()+' '+fs(days[di]):ds;
        h+='<div>';
        h+='<div class="lfc-day-name">'+dayLabel+'</div>';
        // Ogni spettacolo su riga propria: orario bold + titolo film
        byDay[ds].forEach(function(s){
          const film=S.films.find(function(f){return f.id===s.filmId;});
          h+='<div style="display:flex;align-items:baseline;gap:7px;padding:2px 0;border-bottom:1px solid var(--bdr)">'
            +'<span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--txt);flex-shrink:0">'+s.start+'</span>'
            +'<span style="font-size:11px;color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(film?film.title:'—')+'</span>'
            +'</div>';
        });
        h+='</div>';
      });
      h+='</div></div>';
    });
    h+='</div>';
    w.innerHTML=h;
    return;
  }

  if(sort==='dt')  shows.sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  if(sort==='sala')shows.sort((a,b)=>a.sala-b.sala||a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  if(sort==='day') shows.sort((a,b)=>a.day.localeCompare(b.day)||a.sala-b.sala||a.start.localeCompare(b.start));
  let h=`<div class="lv"><div class="li lih"><span>GIORNO</span><span>FILM</span><span>SALA</span><span>INIZIO\u2192FINE</span><span>DURATA</span><span>AZIONI</span></div>`;
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
    h+=`<div class="li">
      <span>${di>=0?DIT[di]+' '+fs(days[di]):s.day}</span>
      <span style="font-weight:600">${film?.title||'\u2014'}</span>
      <span><span class="sb ${SALE[s.sala]?.bc||''}">${sn(s.sala)}</span></span>
      <span style="font-family:monospace;font-size:12px">${s.start} \u2192 ${s.end}</span>
      <span style="font-size:11px;color:var(--txt2)">${film?.duration||0} min</span>
      <div class="lac">
        <button class="btn bg bs" onclick="editShow('${s.id}')">&#9999;</button>
        <button class="btn bd bs" onclick="delShow('${s.id}')">&#10005;</button>
      </div>
    </div>`;
  });
  h+='</div>';w.innerHTML=h;
}
window.rl=rl;

// ── FILMS ─────────────────────────────────────────────────
// ── ARCHIVIO SEZIONI: Prossima uscita + In programma ──
function renderArchSections(){
  // ── Filtro ricerca ──────────────────────────────────────────────────────
  var searchEl=document.getElementById('arch-search');
  var searchQ=(searchEl?searchEl.value:'').toLowerCase().trim();
  // Mostra/nasconde pulsante clear
  var clearBtn=document.getElementById('arch-search-clear');
  if(clearBtn)clearBtn.style.display=searchQ?'block':'none';
  // Funzione filtro: true se il film matcha la query
  function matchSearch(f){
    if(!searchQ)return true;
    return (f.title||'').toLowerCase().includes(searchQ)
      ||(f.director||'').toLowerCase().includes(searchQ)
      ||(f.genre||'').toLowerCase().includes(searchQ)
      ||(f.distributor||'').toLowerCase().includes(searchQ)
      ||(f.cast||'').toLowerCase().includes(searchQ);
  }

  var today=new Date();today.setHours(0,0,0,0);
  var todayStr=toLocalDate(today);

  // +21 days: new releases window
  var in7=new Date(today);in7.setDate(in7.getDate()+21);
  var in7Str=toLocalDate(in7);

  // +10 days: prossimamente window (from tomorrow to +10)
  var tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
  var tomorrowStr=toLocalDate(tomorrow);
  var in10=new Date(today);in10.setDate(in10.getDate()+10);
  var in10Str=toLocalDate(in10);

  // Week range (Thu-Wed)
  var wd=wdates();
  var weekStart=wd[0];var weekEnd=wd[6];

  // All film IDs currently in shows (any date)
  var allShowFilmIds=new Set(S.shows.map(function(s){return s.filmId;}));

  // ── SECTION: Nuove uscite (oggi + prossimi 21 gg) ──
  var upcoming=S.films.filter(function(f){
    return f.release&&f.release>=todayStr&&f.release<=in7Str;
  }).sort(function(a,b){return a.release.localeCompare(b.release);});

  // ── SECTION: In programma questa settimana ──
  var weekFilmIds=new Set(S.shows.filter(function(s){
    return s.day>=weekStart&&s.day<=weekEnd;
  }).map(function(s){return s.filmId;}));
  var current=S.films.filter(function(f){return weekFilmIds.has(f.id);})
    .sort(function(a,b){return a.title.localeCompare(b.title);});

  // ── SECTION: Prossimamente (uscita > oggi, non ancora in shows) — tutti, ordinati per data ──
  var prossimamente=S.films.filter(function(f){
    return f.release&&f.release>in7Str&&!weekFilmIds.has(f.id);
  }).sort(function(a,b){return a.release.localeCompare(b.release);});
  // Mantieni anche coming (finestra stretta 10gg) per compatibilità ricerca
  var coming=S.films.filter(function(f){
    return f.release&&f.release>in7Str&&f.release<=in10Str;
  }).sort(function(a,b){return a.release.localeCompare(b.release);});

  // ── SECTION: Passati (release < oggi E non più in nessuno show) ──
  var past=S.films.filter(function(f){
    var hasFutureShow=S.shows.some(function(s){return s.filmId===f.id&&s.day>=todayStr;});
    var isExpired=f.endDate?f.endDate<todayStr:(f.release&&f.release<todayStr&&!hasFutureShow);
    return isExpired&&!hasFutureShow;
  }).sort(function(a,b){
    // Dal più vicino al più lontano (ascendente)
    return (a.release||'').localeCompare(b.release||'');
  });

  // ── Se c'è query ricerca → sezione unica risultati ──────────────────────
  if(searchQ){
    var allFiltered=S.films.filter(function(f){return matchSearch(f);})
      .sort(function(a,b){return a.title.localeCompare(b.title,'it');});
    ['arch-upcoming','arch-inweek','arch-prossimamente','arch-current',
     'arch-coming','arch-past','arch-rest','arch-nodate'].forEach(function(id){
      var el=document.getElementById(id);if(el)el.innerHTML='';
    });
    var resEl=document.getElementById('arch-upcoming');
    if(resEl){
      resEl.innerHTML=allFiltered.length
        ?'<div style="font-size:12px;color:var(--txt2);margin-bottom:14px">'+allFiltered.length+' film trovati per «<b style="color:var(--txt)">'+searchQ+'</b>»</div><div class="fg2">'+allFiltered.map(function(f){return archMiniCard(f);}).join('')+'</div>'
        :'<div style="color:var(--txt2);font-size:13px;padding:20px 0">Nessun film trovato per «'+searchQ+'»</div>';
    }
    return;
  }

  function renderSection(elId,title,badge,badgeStyle,films){
    var el=document.getElementById(elId);
    if(!el)return;
    if(!films.length){el.innerHTML='';return;}
    var html='<div class="arch-section-hdr">'
      +'<span class="arch-section-title">'+title+'</span>'
      +'<span class="arch-section-badge" style="'+badgeStyle+'">'+badge+'</span>'
      +'</div><div class="fg2">';
    films.forEach(function(f){html+=archMiniCard(f);});
    html+='</div>';
    el.innerHTML=html;
  }

  renderSection('arch-upcoming','🆕 Nuove uscite — prossimi 21 giorni',
    upcoming.length+' film','background:rgba(232,200,74,.15);color:var(--acc)',upcoming);

  renderSection('arch-current','🎬 In programma questa settimana',
    current.length+' film','background:rgba(74,232,122,.1);color:#4ae87a',current);

  renderSection('arch-prossimamente','📅 Prossimamente — in arrivo',
    prossimamente.length+' film','background:rgba(74,162,232,.15);color:#4ab4e8',prossimamente);

  renderSection('arch-coming','',
    coming.length+' film','background:rgba(74,162,232,.15);color:#4ab4e8',coming);

  // Passati — sempre per ultimi
  renderSection('arch-past','📦 Passati — non più in programma',
    past.length+' film','background:rgba(150,150,150,.15);color:var(--txt2)',past);


}
window.renderArchSections=renderArchSections;

function archMiniCard(f){
  var fmtD=function(d){return d?d.split('-').reverse().join('/'):'';}; 
  var st=filmStatus(f);
  var stBadge=st==='exp'?'<span class="fstatus exp">Scaduto</span>':
    st==='nd'?'<span class="fstatus nd">Non uscito</span>':
    f.release?'<span class="fstatus ok">In programmazione</span>':'';
  var wd=wdates();
  var weekShows=S.shows.filter(function(s){return s.filmId===f.id&&wd.includes(s.day);});
  var boLine=f.boITTotale?'<br>🇮🇹 BO IT: <strong>€ '+Math.round(f.boITTotale).toLocaleString('it-IT')+'</strong>'+(f.boITPos?' (#'+f.boITPos+')':''):'';
  return '<div class="fc">'
    +(f.poster?'<img class="fc-poster" src="'+f.poster+'" alt="">':'<div class="fc-poster-ph">🎬</div>')
    +(f.duration?'<div class="fdur">'+f.duration+' min</div>':'')
    +'<div class="fc-body">'
    +'<div class="fn">'+f.title+' '+stBadge+'</div>'
    +'<div class="fi">'
    +(f.titleOriginal&&f.titleOriginal!==f.title?'<div style="font-size:10px;color:var(--txt2);font-style:italic;margin-bottom:2px">'+f.titleOriginal+'</div>':'')
    +(f.director?'🎬 '+f.director+'<br>':'')
    +(f.distributor?'🏢 '+f.distributor+'<br>':'')
    +(f.rating?'⭐ '+f.rating:'')
    +(f.release?'<br>📅 Uscita: '+fmtD(f.release):'')
    +(f.endDate?'<br>🔚 Fine: '+fmtD(f.endDate):'')
    +(weekShows.length?'<br>🎬 '+weekShows.length+' spett. questa sett.':'')
    +boLine
    +'</div>'
    +(f.genre?'<div><span class="fg3">'+f.genre+'</span></div>':'')
    +'<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'
    +(f.trailer?'<a href="https://www.youtube.com/watch?v='+f.trailer+'" target="_blank" class="btn bg bs" style="font-size:11px;text-decoration:none">▶ Trailer</a>':'')
    +(f.ticketUrl?'<a href="'+f.ticketUrl+'" target="_blank" class="btn bg bs" style="font-size:11px;text-decoration:none">🎟 Biglietteria</a>':'')
    +'</div>'
    +'<div class="fac">'
    +'<button class="btn bg bs" data-fid="'+f.id+'" onclick="editFilm(this.dataset.fid)">✏ Modifica</button>'
    +'<button class="btn bd bs" data-fid="'+f.id+'" onclick="delFilm(this.dataset.fid)">✕</button>'
    +'</div>'
    +'</div></div>';
}
window.archMiniCard=archMiniCard;

function rf(){
  renderArchSections();
  const w=document.getElementById('fw');
  const showExp=document.getElementById('showExp')?.checked||false;
  let films=showExp?S.films:S.films.filter(f=>filmStatus(f)!=='exp');
  // Ordina: dal più vicino (release più alta) al più lontano
  films=films.slice().sort(function(a,b){
    var ar=a.release||'';var br=b.release||'';
    if(!ar&&!br)return a.title.localeCompare(b.title,'it');
    if(!ar)return 1;if(!br)return -1;
    return br.localeCompare(ar); // decrescente = più recente prima
  });
  if(!films.length){
    w.innerHTML=`<div class="empty"><div class="ei2">🎭</div><div class="et">${S.films.length?'Nessun film attivo':'Archivio vuoto'}</div></div>`;return;
  }
  const fmtD=d=>d?d.split('-').reverse().join('/'):'—';
  w.innerHTML=films.map(f=>{
    const st=filmStatus(f);
    const stBadge=st==='exp'?`<span class="fstatus exp">Scaduto</span>`:st==='nd'?`<span class="fstatus nd">Non uscito</span>`:f.release?`<span class="fstatus ok">In programmazione</span>`:'';
    const oaBadge=f.openAir?`<span class="fstatus" style="background:rgba(232,200,74,.15);color:#e8c84a;border-color:rgba(232,200,74,.3)">☀ Open Air</span>`:'';
    return`<div class="fc${st==='exp'?' film-expired':''}">
      ${f.poster?`<img class="fc-poster" src="${f.poster}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">`:`<div class="fc-poster-ph">🎬</div>`}
      <div class="fdur">${f.duration} min</div>
      <div class="fc-body">
        <div class="fn">${f.title} ${stBadge} ${oaBadge}</div>
        <div class="fi">
          ${f.titleOriginal&&f.titleOriginal!==f.title?`<div style="font-size:10px;color:var(--txt2);font-style:italic;margin-bottom:2px">${f.titleOriginal}</div>`:''}
          ${f.director?`🎬 ${f.director}<br>`:''}
          ${f.distributor?`🏢 ${f.distributor}<br>`:''}
          ⭐ ${f.rating||'N/D'}
          ${f.release?`<br>📅 Uscita: ${fmtD(f.release)}`:''}
          ${f.endDate?`<br>🔚 Fine: ${fmtD(f.endDate)}`:''}
          ${f.boITTotale?`<br>🇮🇹 Box Office IT: <strong>€ ${Math.round(f.boITTotale).toLocaleString('it-IT')}</strong>${f.boITPos?` (#${f.boITPos})`:''}${f.boITDate?` <span style='font-size:10px;color:var(--txt2)'>${f.boITDate}</span>`:''}`:''}
        </div>
        <div><span class="fg3">${f.genre}</span></div>
        ${(f.boxOfficeIT||f.boxOfficeUS)?`<div style="display:flex;gap:10px;margin-top:5px;padding:5px 8px;background:var(--surf2);border-radius:5px;flex-wrap:wrap">
          ${f.boxOfficeIT?`<div style="font-size:10px"><span style="color:var(--txt2)">🇮🇹 Italia</span> <strong style="color:var(--acc)">€${f.boxOfficeIT}</strong>${f.boxOfficeDaysIT?' <span style="color:var(--txt2);font-size:9px">('+f.boxOfficeDaysIT+'gg)</span>':''}</div>`:''}
          ${f.boxOfficeUS?`<div style="font-size:10px"><span style="color:var(--txt2)">🇺🇸 USA</span> <strong style="color:var(--acc)">$${f.boxOfficeUS}</strong>${f.boxOfficeDaysUS?' <span style="color:var(--txt2);font-size:9px">('+f.boxOfficeDaysUS+'gg)</span>':''}</div>`:''}
          ${f.boxOfficeUpdated?`<div style="font-size:9px;color:var(--txt2);align-self:center;margin-left:auto">${new Date(f.boxOfficeUpdated).toLocaleDateString('it-IT')}</div>`:''}
        </div>`:''}
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
          ${f.trailer?`<a href="https://www.youtube.com/watch?v=${f.trailer}" target="_blank" class="btn bg bs" style="font-size:11px;text-decoration:none">▶ Trailer</a>`:''}
          ${f.ticketUrl?`<a href="${f.ticketUrl}" target="_blank" class="btn bg bs" style="font-size:11px;text-decoration:none">🎟 Biglietteria</a>`:''}
          <button class="btn bg bs" id="bo-${f.id}" onclick="updateBoxOffice('${f.id}')" style="font-size:11px">📊</button>
        </div>
        <div class="fac">
          <button class="btn bg bs" onclick="editFilm('${f.id}')">✏ Modifica</button>
          <button class="btn bd bs" onclick="delFilm('${f.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
window.rf=rf;

// ── FASCIA ────────────────────────────────────────────────
function setFascia(t){document.getElementById('mStart').value=t;syncFasce();ce();}
function syncFasce(){const v=document.getElementById('mStart').value;document.querySelectorAll('.fascia-btn').forEach(b=>b.classList.toggle('active',b.textContent===v));}
window.setFascia=setFascia;window.syncFasce=syncFasce;

// ── SMART SUGGESTION ─────────────────────────────────────
function showSugg(sala,day,intv){
  const box=document.getElementById('suggBox');
  const salaShows=S.shows.filter(s=>s.sala==sala&&s.day===day).sort((a,b)=>t2m(b.end)-t2m(a.end));
  if(!salaShows.length){box.style.display='none';return;}
  const last=salaShows[0];
  const suggested=am(last.end,intv);
  const film=S.films.find(f=>f.id===last.filmId);
  const suggM=t2m(suggested);
  const nextFascia=FASCE.find(f=>t2m(f)>suggM);
  let h=`<div class="sugg-box"><div class="sugg-title">💡 Dopo ${film?film.title:'film precedente'} (fine ${last.end})</div>`;
  h+=`<div class="sugg-opt rec" onclick="applySugg('${suggested}')">
    <div><div class="so-time">${suggested}</div><div class="so-label">Senza buco — subito dopo l’intervallo</div></div>
    <div style="display:flex;align-items:center;gap:8px"><span class="so-gap ok">0 min buco</span><span class="so-use">Usa →</span></div>
  </div>`;
  if(nextFascia){
    const gap=t2m(nextFascia)-suggM;
    h+=`<div class="sugg-opt" onclick="applySugg('${nextFascia}')">
      <div><div class="so-time">${nextFascia}</div><div class="so-label">Fascia standard successiva</div></div>
      <div style="display:flex;align-items:center;gap:8px"><span class="so-gap">${gap} min buco</span><span class="so-use">Usa →</span></div>
    </div>`;
  }
  h+='</div>';
  box.innerHTML=h;box.style.display='block';
  // Pre-fill with no-gap option
  document.getElementById('mStart').value=suggested;
  syncFasce();
}
function applySugg(t){document.getElementById('mStart').value=t;syncFasce();ce();}
window.applySugg=applySugg;

// ── MODAL SHOW ────────────────────────────────────────────
function openShow(){
  const _g=id=>{const el=document.getElementById(id);if(!el)console.error('openShow: missing #'+id);return el;};
  const ovST=_g('ovST');if(ovST)ovST.textContent='Aggiungi Spettacolo';
  const mId=_g('mId');if(mId)mId.value='';
  const mNote=_g('mNote');if(mNote)mNote.value='';
  const mStart=_g('mStart');if(mStart)mStart.value='';
  const cb=_g('cb');if(cb)cb.style.display='none';
  const cfb=_g('cfb');if(cfb)cfb.style.display='none';
  const sBox=_g('suggBox');if(sBox){sBox.style.display='none';sBox.innerHTML='';}
  document.querySelectorAll('.fascia-btn').forEach(b=>b.classList.remove('active'));
  fillF();fillD();
  const ovS=_g('ovS');if(ovS)ovS.classList.add('on');
  else console.error('openShow: ovS modal not found — cannot open');
}
function openShowSlot(day,time,sala){
  openShow();
  if(day) document.getElementById('mDay').value=day;
  if(sala)document.getElementById('mSala').value=sala;
  // Pre-compila sempre l'ora della fascia cliccata
  if(time){
    document.getElementById('mStart').value=time;
    syncFasce();
  }
  const intv=parseInt(document.getElementById('mInt').value)||20;
  // Mostra suggerimenti se ci sono già spettacoli nella sala
  if(sala&&day) showSugg(sala,day,intv);
  ce();
}
function editShow(id){
  const s=S.shows.find(x=>x.id===id);if(!s)return;
  document.getElementById('ovST').textContent='Modifica Spettacolo';
  fillF(s.filmId);fillD(s.day);
  document.getElementById('mSala').value=s.sala;
  document.getElementById('mStart').value=s.start;
  document.getElementById('mInt').value=s.interval;
  document.getElementById('mNote').value=s.note||'';
  document.getElementById('mId').value=id;
  document.getElementById('suggBox').style.display='none';
  syncFasce();ce();
  document.getElementById('ovS').classList.add('on');
}
function fillF(sel){
  const el=document.getElementById('mFilm');
  if(!el){console.error('fillF: mFilm element not found');return;}
  el.innerHTML='<option value="">— Seleziona —</option>';
  const todayStr=toLocalDate(new Date());

  // Finestra: settimana selezionata + 6 settimane precedenti
  // wd[0] = giovedì della settimana corrente
  const wd=wdates();
  const weekStart=wd[0]; // inizio settimana corrente
  const d16wBack=new Date(wd[0]+'T12:00:00');
  d16wBack.setDate(d16wBack.getDate()-112); // 16 settimane indietro
  const d16wBackStr=toLocalDate(d16wBack);
  // Settimana corrente + 7 giorni avanti (per film che escono nella settimana successiva)
  const weekEndDate=new Date(wd[6]+'T12:00:00');
  weekEndDate.setDate(weekEndDate.getDate()+7);
  const weekEnd=toLocalDate(weekEndDate);

  S.films
    .filter(f=>{
      if(f.id===sel)return true; // sempre includi il film già selezionato
      if(f.endDate&&f.endDate<todayStr)return false; // escludi scaduti
      if(_planMode)return true; // in modalità pianificazione: tutti
      // Includi: release tra 6 sett. fa e fine settimana corrente
      if(f.release){
        if(f.release<d16wBackStr)return false; // troppo vecchio
        if(f.release>weekEnd)return false;    // troppo futuro
      }
      return true;
    })
    .sort((a,b)=>(a.release||'9999').localeCompare(b.release||'9999')||a.title.localeCompare(b.title,'it'))
    .forEach(f=>{
      const o=document.createElement('option');
      o.value=f.id;
      const isThisWeek=f.release&&f.release>=weekStart&&f.release<=weekEnd;
      if(isThisWeek){
        o.textContent=`🆕 ${f.title} (${f.duration} min) — uscita ${f.release.split('-').reverse().join('/')}`;
      } else {
        const rel=f.release?` — ${f.release.split('-').reverse().join('/')}`:' ';
        o.textContent=`${f.title} (${f.duration} min)${rel}`;
      }
      if(f.id===sel){o.selected=true;o.disabled=false;}
      el.appendChild(o);
    });
}
function fillD(sel){
  const el=document.getElementById('mDay');
  if(!el){console.error('fillD: mDay not found');return;}
  el.innerHTML='';
  wdays().forEach((d,i)=>{const o=document.createElement('option');o.value=toLocalDate(d);o.textContent=`${DIT[i]} ${fs(d)}`;if(o.value===sel)o.selected=true;el.appendChild(o);});
}
function ce(){
  const fid=document.getElementById('mFilm').value,st=document.getElementById('mStart').value;
  const intv=parseInt(document.getElementById('mInt').value);
  const film=S.films.find(f=>f.id===fid);
  const cbEl=document.getElementById('cb'),cfb=document.getElementById('cfb');
  if(!film||!st){cbEl.style.display='none';return;}
  const stR=r5(st); // rounded start
  const end=am(stR,film.duration),nxt=am(end,intv);
  cbEl.style.display='block';
  const roundedNote=stR!==st?` <span style="font-size:10px;color:var(--txt2)">(arrotondato da ${st})</span>`:'';
  cbEl.innerHTML=`🎬 Inizio: <strong>${stR}</strong>${roundedNote} · Fine: <strong>${end}</strong> · Prossimo slot: <strong>${nxt}</strong> (${film.duration}' + ${intv}')`;
  const sala=document.getElementById('mSala').value,day=document.getElementById('mDay').value,eid=document.getElementById('mId').value;
  const sm=t2m(stR),em=t2m(end);
  const clash=S.shows.some(s=>{if(s.id===eid||s.sala!=sala||s.day!==day)return false;return!(em<=t2m(s.start)||sm>=t2m(s.end));});
  cfb.style.display=clash?'block':'none';
}
async function svShow(){
  const fid=document.getElementById('mFilm').value,sala=document.getElementById('mSala').value;
  const day=document.getElementById('mDay').value,stRaw=document.getElementById('mStart').value;
  const intv=parseInt(document.getElementById('mInt').value),note=document.getElementById('mNote').value;
  const eid=document.getElementById('mId').value;
  if(!fid||!stRaw){toast('Seleziona film e ora inizio','err');return;}
  const st=r5(stRaw);
  const film=S.films.find(f=>f.id===fid);
  if(!film){toast('Film non trovato — ricarica la pagina','err');return;}
  const end=am(st,film.duration);
  const isNew = !eid;
  const show = {
    id: eid||uid(), filmId:fid, sala, day, start:st, end, interval:intv, note,
    ...(isNew && {
      createdBy: currentUser?.displayName||currentUser?.email||'',
      createdAt: new Date().toISOString()
    })
  };
  // Se è una modifica, preserva i campi originali
  if(eid){
    var orig=S.shows.find(function(s){return s.id===eid;});
    if(orig?.createdBy) show.createdBy=orig.createdBy;
    if(orig?.createdAt) show.createdAt=orig.createdAt;
    show.updatedBy=currentUser?.displayName||currentUser?.email||'';
    show.updatedAt=new Date().toISOString();
  }
  await fbSS(show);co('ovS');toast(eid?'Aggiornato':'Aggiunto','ok');
}
async function delShow(id){if(!confirm('Eliminare?'))return;await fbDS(id);toast('Eliminato','ok');}
window.openShow=openShow;window.openShowSlot=openShowSlot;window.editShow=editShow;
window.ce=ce;window.svShow=svShow;window.delShow=delShow;

// Helper: prime 3 lettere del nome utente per badge slot
function userTag(createdBy,updatedBy){
  var name=updatedBy||createdBy||'';
  // Usa displayName (es. "Luca Morandini") o email (es. "luca@...")
  if(name.includes('@'))name=name.split('@')[0];
  // Prende le prime lettere di ogni parola — max 3 char
  var parts=name.trim().split(/[\s._-]+/).filter(Boolean);
  var tag='';
  if(parts.length>=2){
    tag=(parts[0][0]||'')+(parts[1][0]||'');
    if(parts.length>=3)tag+=(parts[2][0]||'');
    else tag+=(parts[1][1]||'');
  } else if(parts.length===1){
    tag=parts[0].substring(0,3);
  }
  return tag.toUpperCase().substring(0,3);
}
window.userTag=userTag;
let _copyFrom={day:'',sala:''};
function openCopyModal(day,sala){
  _copyFrom={day,sala};
  const dayIdx=wdates().indexOf(day);
  document.getElementById('copyFromSalaName').textContent=sn(sala);
  document.getElementById('copyFromDayName').textContent=dayIdx>=0?`${DIT[dayIdx]} ${fd(wdays()[dayIdx])}`:day;
  const grid=document.getElementById('copyDayGrid');
  grid.innerHTML=wdays().map((d,i)=>{
    const ds=toLocalDate(d);
    if(ds===day)return'';
    return`<button class="copy-day-btn" onclick="execCopy('${ds}')">${DIT[i]}<br><span style="font-size:11px;color:var(--txt2)">${fs(d)}</span></button>`;
  }).join('');
  document.getElementById('ovCopy').classList.add('on');
}
async function execCopy(toDay){
  const{day:fromDay,sala}=_copyFrom;
  const toCopy=S.shows.filter(s=>s.day===fromDay&&s.sala===sala);
  if(!toCopy.length){toast('Nessuno spettacolo da copiare','err');return;}
  for(const s of toCopy){
    await fbSS({...s,id:uid(),day:toDay});
  }
  co('ovCopy');toast(`${toCopy.length} spettacol${toCopy.length===1?'o':'i'} copiati`,'ok');
}
window.openCopyModal=openCopyModal;window.execCopy=execCopy;

// ── DUPLICA GIORNATA INTERA ──────────────────────────────
let _dupDay='';
function openDupDayModal(day){
  _dupDay=day;
  const dayIdx=wdates().indexOf(day);
  const dayLabel=dayIdx>=0?`${DIT[dayIdx]} ${fd(wdays()[dayIdx])}`:day;
  document.getElementById('dupFromDayName').textContent=dayLabel;

  // Sale checkboxes — pre-check only those that have shows
  const saleWithShows=new Set(S.shows.filter(s=>s.day===day).map(s=>s.sala));
  document.getElementById('dupSaleChecks').innerHTML=
    ['1','2','3','4'].map(sid=>{
      const sl=SALE[sid];
      const hasSh=saleWithShows.has(sid);
      return`<label style="display:flex;align-items:center;gap:7px;padding:8px 12px;
        background:var(--surf2);border:1px solid ${hasSh?sl.col:'var(--bdr)'};
        border-radius:6px;cursor:pointer;font-size:13px;transition:all .15s;">
        <input type="checkbox" class="dupSalaCk" value="${sid}" ${hasSh?'checked':''} style="accent-color:${sl.col}">
        <span style="color:${hasSh?sl.col:'var(--txt2)'}">
          ${sl.n}${hasSh?` <span style="font-size:10px">(${S.shows.filter(s=>s.day===day&&s.sala==sid).length} sp.)</span>`:''}
        </span>
      </label>`;
    }).join('');

  // Day buttons
  document.getElementById('dupDayGrid').innerHTML=
    wdays().map((d,i)=>{
      const ds=toLocalDate(d);
      if(ds===day)return'';
      return`<button class="copy-day-btn" onclick="execDupDay('${ds}')">${DIT[i]}<br><span style="font-size:11px;color:var(--txt2)">${fs(d)}</span></button>`;
    }).join('');

  document.getElementById('ovDupDay').classList.add('on');
}

async function execDupDay(toDay){
  const selectedSale=[...document.querySelectorAll('.dupSalaCk:checked')].map(c=>c.value);
  if(!selectedSale.length){toast('Seleziona almeno una sala','err');return;}
  const toCopy=S.shows.filter(s=>s.day===_dupDay&&selectedSale.includes(s.sala));
  if(!toCopy.length){toast('Nessuno spettacolo nelle sale selezionate','err');return;}
  for(const s of toCopy){
    await fbSS({...s,id:uid(),day:toDay});
  }
  co('ovDupDay');
  toast(`${toCopy.length} spettacol${toCopy.length===1?'o':'i'} duplicati in ${DIT[wdates().indexOf(toDay)]||toDay}`,'ok');
}
window.openDupDayModal=openDupDayModal;window.execDupDay=execDupDay;

// ── OTTIMIZZA TUTTO (globale) ─────────────────────────────
// Shared pure function: compute optimized plan for one sala/day
// Returns array of {show, newStart, newEnd, changed, isAnchor, error}
function computeOptPlan(salaShows){
  if(salaShows.length<2) return salaShows.map(s=>({show:s,newStart:s.start,newEnd:s.end,changed:false,isAnchor:false,error:false}));
  const sorted=salaShows.slice().sort((a,b)=>t2m(a.start)-t2m(b.start));

  // Find anchor = closest to 20:30
  const ANCH=t2m('20:30');
  const anchor=sorted.reduce((b,s)=>Math.abs(t2m(s.start)-ANCH)<Math.abs(t2m(b.start)-ANCH)?s:b);
  const anchorFilm=S.films.find(f=>f.id===anchor.filmId);
  const anchorDur=anchorFilm?.duration||90;

  const before=sorted.filter(s=>t2m(s.start)<t2m(anchor.start));
  const after=sorted.filter(s=>t2m(s.start)>t2m(anchor.start));
  const plan=[];

  // ── ANCORA: fissa ──
  plan.push({show:anchor,newStart:anchor.start,newEnd:anchor.end,changed:false,isAnchor:true,error:false});

  // ── PRIMA DELL'ANCORA: calcola a ritroso ──
  let cursorBefore=t2m(anchor.start);
  [...before].reverse().forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId);
    const dur=film?.duration||90;
    const intv=s.interval||20;
    const newEndM=cursorBefore-intv;
    const newStartM=Math.floor((newEndM-dur)/5)*5;
    if(newStartM<0){
      plan.push({show:s,newStart:s.start,newEnd:s.end,changed:false,isAnchor:false,error:true});
      return;
    }
    const newStart=r5m(newStartM);
    const newEnd=am(newStart,dur);
    plan.push({show:s,newStart,newEnd,changed:newStart!==s.start||newEnd!==s.end,isAnchor:false,error:false});
    cursorBefore=newStartM;
  });

  // ── DOPO L'ANCORA: calcola in avanti, elimina buchi e sovrapposizioni ──
  let cursorAfter=t2m(anchor.start)+anchorDur; // fine dell'ancora
  after.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId);
    const dur=film?.duration||90;
    const intv=s.interval||20;
    // Orario attuale del film
    const currStart=t2m(s.start);
    const currEnd=t2m(s.end);
    // Orario minimo possibile: fine del precedente + intervallo
    const minStart=cursorAfter+intv;
    // Arrotonda al multiplo di 5 superiore
    const newStartM=Math.ceil(minStart/5)*5;
    const newStart=r5m(newStartM);
    const newEnd=am(newStart,dur);
    const hasOverlap=currStart<cursorAfter; // inizia prima che il precedente finisca
    const hasGap=currStart>cursorAfter+intv+2; // buco eccessivo
    const changed=newStart!==s.start||newEnd!==s.end;
    plan.push({show:s,newStart,newEnd,changed,isAnchor:false,error:false,
      wasOverlap:hasOverlap,wasGap:hasGap});
    cursorAfter=newStartM+dur;
  });

  return plan.sort((a,b)=>t2m(a.newStart)-t2m(b.newStart));
}

// Check if a sala/day has any incongruence:
// - orari non arrotondati
// - buchi tra spettacoli (gap > interval+2min)
// - sovrapposizioni (uno spettacolo inizia prima che il precedente finisca + intervallo)
function hasIncongruence(salaShows){
  if(!salaShows.length) return false;
  const sorted=salaShows.slice().sort((a,b)=>t2m(a.start)-t2m(b.start));
  // Check unrounded times
  if(sorted.some(s=>r5(s.start)!==s.start)) return true;
  // Check gaps and overlaps between consecutive shows
  for(let i=1;i<sorted.length;i++){
    const film=S.films.find(f=>f.id===sorted[i-1].filmId);
    const dur=film?.duration||90;
    const intv=sorted[i-1].interval||20;
    const expectedEnd=t2m(sorted[i-1].start)+dur+intv;
    const nextStart=t2m(sorted[i].start);
    const gap=nextStart-t2m(sorted[i-1].end);
    // Sovrapposizione: il prossimo inizia prima che il precedente finisca (con intervallo)
    if(nextStart<t2m(sorted[i-1].end)) return true;
    // Buco eccessivo: gap > interval + 2min di tolleranza
    if(gap>intv+2) return true;
  }
  return false;
}

let _goptPlan=[]; // [{salaDay, checked, plan:[]}]


// ── VERIFICA PROGRAMMAZIONE ──────────────────────────────
function openVerifica(){
  const wd=wdates(); const days=wdays();
  const DIT_IT=['Giovedì','Venerdì','Sabato','Domenica','Lunedì','Martedì','Mercoledì'];
  let issues=[];

  wd.forEach(function(ds,di){
    const dayShows=S.shows.filter(function(s){return s.day===ds;});
    const dayLabel=DIT_IT[di]+' '+fs(days[di]);

    // ── TIPO 1: Sovrapposizioni nella stessa sala ──
    ['1','2','3','4'].forEach(function(sid){
      const salaShows=dayShows.filter(function(s){return s.sala==sid;})
        .sort(function(a,b){return t2m(a.start)-t2m(b.start);});
      const sl=SALE[sid];
      for(let i=0;i<salaShows.length-1;i++){
        const a=salaShows[i], b=salaShows[i+1];
        const aEnd=t2m(a.end), bStart=t2m(b.start);
        if(bStart<aEnd){
          const filmA=S.films.find(function(f){return f.id===a.filmId;});
          const filmB=S.films.find(function(f){return f.id===b.filmId;});
          const overlap=aEnd-bStart;
          issues.push({
            type:'overlap', severity:'error',
            day:dayLabel, sala:sl.n, col:sl.col,
            msg:'<strong>'+(filmA?filmA.title:'?')+'</strong> (fine '+a.end+') si sovrappone di '+overlap+' min con <strong>'+(filmB?filmB.title:'?')+'</strong> (inizio '+b.start+')'
          });
        }
      }
    });

    // ── TIPO 2: Stesso film in più sale nella stessa fascia oraria ──
    const filmIds=[...new Set(dayShows.map(function(s){return s.filmId;}))];
    filmIds.forEach(function(fid){
      const filmShows=dayShows.filter(function(s){return s.filmId===fid;});
      if(filmShows.length<2)return;
      const film=S.films.find(function(f){return f.id===fid;});
      // Cerca coppie con fascia sovrapposta (stesso orario ±90min)
      for(let i=0;i<filmShows.length-1;i++){
        for(let j=i+1;j<filmShows.length;j++){
          const a=filmShows[i], b=filmShows[j];
          if(a.sala===b.sala)continue; // stessa sala già gestita sopra
          const fasciaA=nearestFasciaGlobal(a.start);
          const fasciaB=nearestFasciaGlobal(b.start);
          if(fasciaA===fasciaB){
            const slA=SALE[a.sala], slB=SALE[b.sala];
            issues.push({
              type:'double', severity:'warn',
              day:dayLabel, sala:slA.n+' + '+slB.n, col:'#f0c040',
              msg:'<strong>'+(film?film.title:'?')+'</strong> programmato in fascia <strong>'+fasciaA+'</strong> sia in <span style="color:'+slA.col+'">'+slA.n+'</span> ('+a.start+') che in <span style="color:'+slB.col+'">'+slB.n+'</span> ('+b.start+')'
            });
          }
        }
      }
    });
  });

  const content=document.getElementById('verificaContent');
  if(!issues.length){
    content.innerHTML='<div style="text-align:center;padding:30px"><div style="font-size:36px;margin-bottom:10px">✅</div><div style="font-family:var(--serif,serif);font-size:17px;color:var(--txt)">Nessun problema rilevato</div><div style="font-size:12px;color:var(--txt2);margin-top:6px">Programmazione pulita per tutta la settimana</div></div>';
    document.getElementById('ovVerifica').classList.add('on');
    return;
  }

  // Group by day
  const byDay={};
  issues.forEach(function(iss){
    if(!byDay[iss.day])byDay[iss.day]=[];
    byDay[iss.day].push(iss);
  });

  let html='<div style="margin-bottom:10px;font-size:12px;color:var(--txt2)">'+
    '<span style="color:#e84a4a;font-weight:700">⚠ '+issues.filter(function(i){return i.type==="overlap";}).length+' sovrapposizioni</span>'+
    (issues.filter(function(i){return i.type==="double";}).length?' · <span style="color:#f0c040;font-weight:700">ℹ '+issues.filter(function(i){return i.type==="double";}).length+' doppioni in fascia</span>':'')+'</div>';

  Object.keys(byDay).sort().forEach(function(day){
    html+='<div style="margin-bottom:12px">';
    html+='<div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--bdr)">'+day+'</div>';
    byDay[day].forEach(function(iss){
      const isErr=iss.type==='overlap';
      const bgCol=isErr?'rgba(232,74,74,.08)':'rgba(240,192,64,.06)';
      const borderCol=isErr?'#e84a4a':'#f0c040';
      const icon=isErr?'⚠':'ℹ';
      html+='<div style="background:'+bgCol+';border:1px solid '+borderCol+';border-left:3px solid '+borderCol+';border-radius:6px;padding:9px 13px;margin-bottom:6px">';
      html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
      html+='<span style="font-size:14px">'+icon+'</span>';
      html+='<span style="font-size:11px;font-weight:700;color:'+borderCol+'">'+iss.sala+'</span>';
      html+='</div>';
      html+='<div style="font-size:12px;color:var(--txt)">'+iss.msg+'</div>';
      html+='</div>';
    });
    html+='</div>';
  });

  content.innerHTML=html;
  document.getElementById('ovVerifica').classList.add('on');
}

function nearestFasciaGlobal(t){
  const FASCE_G=['14:00','16:00','18:00','20:30','22:00'];
  const tm=t2m(t);
  let best=null,bestDiff=Infinity;
  FASCE_G.forEach(function(f){const diff=Math.abs(t2m(f)-tm);if(diff<bestDiff&&diff<=90){bestDiff=diff;best=f;}});
  return best||t;
}
window.openVerifica=openVerifica;
window.nearestFasciaGlobal=nearestFasciaGlobal;

function openGlobalOpt(){
  const wd=wdates();const days=wdays();
  _goptPlan=[];
  let html='';
  let totalIssues=0;

  wd.forEach((ds,di)=>{
    ['1','2','3','4'].forEach(sid=>{
      const salaShows=S.shows.filter(s=>s.day===ds&&s.sala===sid);
      if(!salaShows.length) return; // skip empty
      if(!hasIncongruence(salaShows)) return; // skip clean

      const plan=computeOptPlan(salaShows);
      const changes=plan.filter(p=>p.changed&&!p.error);
      if(!changes.length) return; // no actual changes needed

      const key=`${ds}_${sid}`;
      _goptPlan.push({key,day:ds,sala:sid,plan,checked:true});
      totalIssues++;

      const sl=SALE[sid];
      const dayLabel=`${DIT[di]} ${fs(days[di])}`;
      html+=`<div class="gopt-item">
        <div class="gopt-header">
          <div>
            <div class="gopt-label">
              <span style="color:${sl.col}">■</span> ${sl.n} — ${dayLabel}
            </div>
            <div class="gopt-sublabel">${changes.length} orari da correggere</div>
          </div>
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px">
            <input type="checkbox" class="gopt-ck" data-key="${key}" checked style="accent-color:var(--acc);width:16px;height:16px">
            Applica
          </label>
        </div>
        <div class="gopt-changes">`;

      plan.forEach(p=>{
        const film=S.films.find(f=>f.id===p.show.filmId);
        const reason=p.wasOverlap?` <span style="color:#e84a4a;font-size:9px">⚡ sovrapposizione</span>`:p.wasGap?` <span style="color:#e8c84a;font-size:9px">◦ buco</span>`:'';
        html+=`<div class="gopt-change">
          <span class="film-name">${film?.title||'?'}${p.isAnchor?` <span class="gopt-anchor-lbl">⭐ fisso</span>`:''}${reason}</span>
          ${p.error
            ?`<span style="color:var(--red);font-size:11px">⚠ errore</span>`
            :p.changed
              ?`<span class="gopt-from">${p.show.start}</span><span class="gopt-arrow">→</span><span class="gopt-to">${p.newStart}</span>`
              :`<span class="gopt-same">${p.newStart} (invariato)</span>`
          }
        </div>`;
      });

      html+=`</div></div>`;
    });
  });

  const content=document.getElementById('goptContent');
  const empty=document.getElementById('goptEmpty');
  const applyBtn=document.getElementById('goptApplyBtn');
  const selAll=document.getElementById('goptSelAll');

  if(totalIssues===0){
    content.style.display='none';
    empty.style.display='block';
    applyBtn.style.display='none';
    selAll.style.display='none';
  } else {
    content.innerHTML=html;
    content.style.display='block';
    empty.style.display='none';
    applyBtn.style.display='';
    selAll.style.display='';
  }

  document.getElementById('ovGlobalOpt').classList.add('on');
}

function goptToggleAll(val){
  document.querySelectorAll('.gopt-ck').forEach(ck=>ck.checked=val);
  document.getElementById('goptSelAll').textContent=val?'Deseleziona tutto':'Seleziona tutto';
  document.getElementById('goptSelAll').onclick=()=>goptToggleAll(!val);
}

async function execGlobalOpt(){
  const checked=[...document.querySelectorAll('.gopt-ck:checked')].map(ck=>ck.dataset.key);
  if(!checked.length){toast('Nessuna voce selezionata','err');return;}

  let totalUpdated=0;
  for(const key of checked){
    const item=_goptPlan.find(x=>x.key===key);
    if(!item) continue;
    for(const p of item.plan.filter(p=>p.changed&&!p.error)){
      await fbSS({...p.show,start:p.newStart,end:p.newEnd});
      totalUpdated++;
    }
  }
  co('ovGlobalOpt');
  toast(`${totalUpdated} orari ottimizzati su ${checked.length} sala/giorno`,'ok');
}
window.openGlobalOpt=openGlobalOpt;window.goptToggleAll=goptToggleAll;window.execGlobalOpt=execGlobalOpt;
function openFilm(){
  ['fTit','fDir','fDist','fDes','fRelease','fEndDate','fPoster','fTicketUrl','fTrailer','fSuisa'].forEach(id=>{var el=document.getElementById(id);if(el)el.value='';});
  var foaEl=document.getElementById('fOpenAir');if(foaEl)foaEl.checked=false;
  document.getElementById('fDur').value=100;
  document.getElementById('fGen').value='Drammatico';
  document.getElementById('fRat').value='Per tutti';
  document.getElementById('fId').value='';
  document.getElementById('ovFT').textContent='Nuovo Film';
  fillFilmDistDropdown();
  document.getElementById('ovF').classList.add('on');
}
function editFilm(id){
  const f=S.films.find(x=>x.id===id);if(!f)return;
  document.getElementById('ovFT').textContent='Modifica Film';
  fillFilmDistDropdown();
  document.getElementById('fTit').value=f.title;
  document.getElementById('fDur').value=f.duration;
  document.getElementById('fGen').value=f.genre;
  document.getElementById('fDir').value=f.director||'';
  document.getElementById('fDist').value=f.distributor||'';
  document.getElementById('fRat').value=f.rating||'Per tutti';
  document.getElementById('fDes').value=f.desc||'';
  document.getElementById('fRelease').value=f.release||'';
  document.getElementById('fEndDate').value=f.endDate||'';
  document.getElementById('fPoster').value=f.poster||'';
  var fbEl=document.getElementById('fBackdrop');if(fbEl)fbEl.value=f.backdrop||'';
  tmdbUpdateBackdropPreview();
  var fsEl=document.getElementById('fSuisa');if(fsEl)fsEl.value=f.suisa||'';
  var ftmdbEl=document.getElementById('fTmdbId');if(ftmdbEl)ftmdbEl.value=f.tmdbId||'';
  var foaEl=document.getElementById('fOpenAir');if(foaEl)foaEl.checked=!!f.openAir;
  var foaFromEl=document.getElementById('fOaFrom');if(foaFromEl)foaFromEl.value=f.oaFrom||'';
  var ftEl=document.getElementById('fTicketUrl');if(ftEl)ftEl.value=f.ticketUrl||'';
  var ftrEl=document.getElementById('fTrailer');if(ftrEl)ftrEl.value=f.trailer||'';
  document.getElementById('fId').value=id;
  document.getElementById('ovF').classList.add('on');
}
function normalizeTrailerId(v){
  if(!v)return '';
  // Extract video ID from full YouTube URL or return bare ID
  var m=v.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m?m[1]:v.slice(0,11);
}
window.normalizeTrailerId=normalizeTrailerId;
async function svFilm(){
  const title=document.getElementById('fTit').value.trim(),dur=parseInt(document.getElementById('fDur').value);
  if(!title||!dur){toast('Titolo e durata obbligatori','err');return;}
  const eid=document.getElementById('fId').value;
  // Legge film esistente per preservare campi non nel form
  var existingFilm=eid?S.films.find(function(f){return f.id===eid;}):null;
  // Normalizza backdrop: w780→original
  var rawBackdrop=document.getElementById('fBackdrop')?document.getElementById('fBackdrop').value.trim()||'':'';
  rawBackdrop=rawBackdrop.replace('/t/p/w780/','/t/p/original/');
  const film=Object.assign({},existingFilm||{},{
    id:eid||uid(),title,duration:dur,
    genre:document.getElementById('fGen').value,
    director:document.getElementById('fDir').value,
    distributor:document.getElementById('fDist').value,
    rating:document.getElementById('fRat').value,
    desc:document.getElementById('fDes').value,
    release:document.getElementById('fRelease').value||'',
    endDate:document.getElementById('fEndDate').value||'',
    poster:document.getElementById('fPoster').value||'',
    ticketUrl:document.getElementById('fTicketUrl')?document.getElementById('fTicketUrl').value||'':'',
    trailer:document.getElementById('fTrailer')?normalizeTrailerId(document.getElementById('fTrailer').value||''):'',
    backdrop:rawBackdrop,
    openAir:document.getElementById('fOpenAir')?document.getElementById('fOpenAir').checked:false,
    oaFrom:document.getElementById('fOaFrom')?(document.getElementById('fOaFrom').value||null):null,
    tmdbId:document.getElementById('fTmdbId')?(parseInt(document.getElementById('fTmdbId').value.trim())||null):null,
    suisa:document.getElementById('fSuisa')?document.getElementById('fSuisa').value.trim()||'':(existingFilm?.suisa||'')
  });
  await fbSF(film);co('ovF');toast(eid?'Film aggiornato':'Film aggiunto','ok');
}
async function delFilm(id){
  if(S.shows.some(s=>s.filmId===id)&&!confirm('Film in uso. Eliminare?'))return;
  await fbDF(id);toast('Film eliminato','ok');
}
window.openFilm=openFilm;window.editFilm=editFilm;window.svFilm=svFilm;window.delFilm=delFilm;

// ── PDF ───────────────────────────────────────────────────
function durFmt(min){if(!min)return'';const h=Math.floor(min/60),m=min%60;return h+'h'+String(m).padStart(2,'0');}
function dayShort(ds,days,wd){const di=wd.indexOf(ds);if(di<0)return ds;const d=days[di];const ab=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];return ab[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');}

// Dense, professional PDF CSS — 8-9px type, 15-16px rows, no decorative waste
const PDF_STYLE=`<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:8.5px;color:#111;background:#fff;line-height:1.3;}
/* ── HEADER ── */
.H{padding:0 0 6px;border-bottom:1.5px solid #111;margin-bottom:8px;}
.H-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;}
.H-logo{height:22px;width:auto;display:block;}
.H-stamp{font-size:7px;color:#aaa;text-align:right;padding-top:2px;}
.H-bot{display:flex;align-items:baseline;gap:8px;}
.H-bot .rt{font-size:13px;font-weight:700;color:#f0801a;line-height:1;}
.H-bot .wl{font-size:13px;color:#888;}
/* ── PER TITOLO compatto 2 colonne ── */
.T-cols{column-count:2;column-gap:14px;column-rule:.5px solid #ddd;orphans:2;widows:2;}
.T-film{margin-bottom:6px;break-inside:avoid;page-break-inside:avoid;}
.T-film-head{display:flex;flex-direction:column;border-bottom:1px solid #f0801a;padding-bottom:2px;margin-bottom:2px;}
.T-ftit{font-size:11px;font-weight:700;color:#f0801a;line-height:1.3;}
.T-fmeta{font-size:7px;color:#999;margin-top:1px;}
.T-row{display:grid;grid-template-columns:68px 40px 32px auto;padding:1px 0 1px 6px;border-bottom:.3px solid #eee;align-items:baseline;}
.T-row:last-child{border-bottom:none;}
.T-d{color:#555;font-size:11px;white-space:nowrap;}.T-s{color:#333;font-weight:400;font-size:11px;white-space:nowrap;padding-left:4px;}.T-t{font-weight:700;font-size:11px;padding-left:6px;}.T-e{color:#999;font-size:9px;white-space:nowrap;padding-left:10px;}
/* ── PER SALA ── */
.S-head{display:flex;align-items:center;gap:5px;border-bottom:1px solid #f0801a;padding-bottom:2px;margin-bottom:2px;}
.S-htit{font-size:11px;font-weight:700;color:#f0801a;text-transform:uppercase;letter-spacing:.4px;}.S-hline{flex:1;height:.5px;background:#ddd;}
.S-cols{column-count:2;column-gap:14px;column-rule:.5px solid #ddd;}.S-row{display:grid;grid-template-columns:auto 38px 1fr 28px 38px;padding:1px 0 1px 6px;border-bottom:.3px solid #eee;}
.S-row:last-child{border-bottom:none;}
.S-t{font-weight:700;font-size:11px;}.S-f{font-weight:600;font-size:11px;}.S-d{color:#555;font-size:11px;white-space:nowrap;text-align:left;padding-right:8px;}.S-e{color:#999;font-size:11px;text-align:right;}.S-dur{color:#aaa;font-size:11px;text-align:right;}
.S-block{margin-bottom:7px;}
/* ── PER GIORNO compatto ── */
.G-block{margin-bottom:7px;break-inside:avoid;}
.G-chapter{display:flex;align-items:center;gap:5px;margin-bottom:2px;}
.G-day{font-size:11px;font-weight:700;color:#f0801a;text-transform:uppercase;letter-spacing:.4px;}
.G-line{flex:1;height:.5px;background:#ccc;}
.G-row{display:grid;grid-template-columns:38px 52px 1fr 28px 38px;padding:1px 0 1px 6px;border-bottom:.3px solid #eee;}
.G-row:last-child{border-bottom:none;}
.G-t{font-weight:700;font-size:11px;}.G-s{color:#555;font-size:11px;}.G-f{font-weight:600;font-size:11px;}.G-e{color:#999;font-size:9px;text-align:right;}.G-dur{color:#aaa;font-size:7.5px;text-align:right;}
/* ── COMPATTO 2 COLONNE ── */
.cols{column-count:2;column-gap:12px;column-rule:.5px solid #ccc;}
.D-chapter{break-inside:avoid;page-break-inside:avoid;margin-top:7px;margin-bottom:2px;display:flex;align-items:center;gap:5px;}
.D-day{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#f0801a;}
.D-line{flex:1;height:.5px;background:#999;}
.D-row{display:grid;grid-template-columns:27px 42px 1fr 22px;padding:1px 0 1px 6px;border-bottom:.3px solid #eee;break-inside:avoid;page-break-inside:avoid;}
.D-row:last-child{border-bottom:none;}
.D-t{font-weight:700;font-size:11px;}.D-s{color:#555;font-size:7.5px;}.D-f{}.D-d{color:#aaa;font-size:11px;}
/* ── CARTELLO ── */


/* ── OPEN AIR ── */
.oa-section{margin-top:16px;border:1px solid var(--bdr-strong);border-radius:10px;overflow:hidden;}
.oa-header{background:linear-gradient(135deg,#1a3a5c,#0d5c8a);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;}
.oa-title{font-family:var(--serif,serif);font-size:15px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px;}
.oa-star{color:#f0c040;font-size:16px;}
.oa-days{display:grid;gap:0;}
.oa-day{border-bottom:1px solid var(--bdr);padding:8px 14px;display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:start;}
.oa-day:last-child{border-bottom:none;}
.oa-day-name{font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.4px;padding-top:2px;}
.oa-cards{display:flex;flex-direction:column;gap:5px;}
.oa-card{background:rgba(13,92,138,.08);border:1px solid rgba(13,92,138,.2);border-left:3px solid #0d5c8a;border-radius:5px;padding:5px 9px;position:relative;cursor:pointer;transition:transform .1s;}
.oa-card:hover{transform:translateX(2px);}
.oa-label{font-size:9px;font-weight:700;color:#0d5c8a;text-transform:uppercase;letter-spacing:.5px;}
.oa-film{font-size:11px;font-weight:600;color:var(--txt);margin-top:1px;}
.oa-location{font-size:10px;color:var(--txt2);}
.oa-time{font-size:10px;font-family:monospace;color:var(--txt2);}
.oa-del{position:absolute;top:3px;right:3px;background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;opacity:0;padding:0;}
.oa-card:hover .oa-del{opacity:1;}.oa-del:hover{color:var(--red);}
.oa-empty{font-size:11px;color:var(--txt2);padding:4px 0;font-style:italic;}
.oa-add{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--txt2);padding:4px 0;cursor:pointer;}
.oa-add:hover{color:var(--acc);}
.oa-toggle-wrap{display:flex;align-items:center;gap:8px;}
.oa-count{font-size:10px;background:rgba(240,192,64,.2);color:#f0c040;border:1px solid rgba(240,192,64,.3);border-radius:4px;padding:1px 7px;font-family:monospace;}


/* ── TURNI / STAFF ── */
.color-dot{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .15s;}
.color-dot.active{border-color:var(--txt);transform:scale(1.2);}
.staff-grid-wrap{overflow-x:auto;}
.staff-grid{display:grid;gap:0;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;}
.staff-grid-head{display:grid;background:var(--surf2);border-bottom:1px solid var(--bdr);}
.staff-grid-head-cell{padding:6px 10px;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.4px;border-right:1px solid var(--bdr);}
.staff-row{display:grid;border-bottom:1px solid var(--bdr);}
.staff-row:last-child{border-bottom:none;}
.staff-row-label{padding:8px 10px;font-size:12px;font-weight:700;color:var(--txt);border-right:1px solid var(--bdr);display:flex;flex-direction:column;gap:2px;background:var(--surf2);}
.staff-role-badge{font-size:9px;font-weight:600;color:var(--txt2);text-transform:uppercase;}
.staff-cell{padding:4px;border-right:1px solid var(--bdr);min-height:52px;cursor:pointer;transition:background .1s;}
.staff-cell:hover{background:rgba(240,128,26,.06);}
.staff-cell:last-child{border-right:none;}
.shift-chip{border-radius:4px;padding:3px 7px;font-size:10px;font-weight:600;color:#fff;line-height:1.4;cursor:pointer;margin-bottom:2px;}
.shift-chip-time{font-size:9px;opacity:.85;font-family:monospace;}
.hours-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--bdr);}
.hours-name{font-weight:600;font-size:13px;flex:1;}
.hours-bar-wrap{flex:2;height:8px;background:var(--surf2);border-radius:4px;overflow:hidden;}
.hours-bar{height:100%;border-radius:4px;transition:width .4s;}
.hours-val{font-size:12px;font-family:monospace;color:var(--txt2);min-width:50px;text-align:right;}


/* ── ARCHIVIO SECTIONS ── */
#page-arch>div>.arch-section-hdr:first-child{margin-top:0!important;}
.arch-section-hdr{margin-top:32px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--bdr);display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--bdr);}
.arch-section-title{font-size:13px;font-weight:700;color:var(--txt);}
.arch-section-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}











/* ── BOOKING SLOTS IN PROGRAMMAZIONE GRID ── */
.book-slot{
  border-radius:5px;
  padding:5px 22px 5px 9px;
  margin-bottom:3px;
  cursor:pointer;
  position:relative;
  background:rgba(0,0,0,.30);
  border-left:3px solid currentColor;
  border-top:1px dashed currentColor;
  border-right:1px dashed currentColor;
  border-bottom:1px dashed currentColor;
  transition:transform .12s;
}
.book-slot:hover{transform:translateX(2px);}
.book-slot-type{
  font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.4px;opacity:.75;line-height:1.4;
}
.book-slot-name{
  font-size:12px;font-weight:700;line-height:1.3;
  margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:100%;
}
.book-slot-time{
  font-size:11px;font-family:monospace;
  font-weight:600;opacity:.85;margin-top:2px;
}
.book-slot-del{
  position:absolute;top:3px;right:4px;
  background:none;border:none;color:inherit;
  cursor:pointer;font-size:14px;opacity:0;padding:0;line-height:1;
}
.book-slot:hover .book-slot-del{opacity:.5;}
.book-slot-del:hover{opacity:1!important;}


/* ── LISTA: Card per Giorno ── */
.lday-card{background:var(--surf);border:1px solid var(--bdr-strong);border-radius:10px;margin-bottom:14px;overflow:hidden;}
.lday-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--surf2);border-bottom:2px solid var(--bdr);}
.lday-name{font-size:15px;font-weight:700;color:var(--txt);}
.lday-count{font-size:11px;font-weight:600;color:var(--acc);background:rgba(232,200,74,.12);border:1px solid rgba(232,200,74,.25);border-radius:10px;padding:2px 9px;}
.lday-shows{display:flex;flex-direction:column;}
.lday-row{display:grid;grid-template-columns:52px 90px 1fr 44px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--bdr);gap:8px;transition:background .1s;}
.lday-row:last-child{border-bottom:none;}
.lday-row:hover{background:var(--surf2);}
.lday-time{font-family:monospace;font-size:13px;font-weight:700;color:var(--txt);}
.lday-sala{font-size:11px;}
.lday-film{font-size:13px;font-weight:600;color:var(--txt);}
.lday-dur{font-size:11px;color:var(--txt2);text-align:right;}

/* ── LISTA: Card Giorno × Sala ── */
.lgs-day{margin-bottom:20px;}
.lgs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px;}
.lgs-sala-card{background:var(--surf);border:1px solid var(--bdr);border-top:3px solid;border-radius:8px;overflow:hidden;}
.lgs-sala-head{display:flex;align-items:center;gap:6px;padding:7px 12px;font-size:12px;font-weight:700;background:var(--surf2);border-bottom:1px solid var(--bdr);}
.lgs-sala-card .lday-row{grid-template-columns:50px 1fr 40px;padding:6px 12px;}


/* ══ PLAYLIST ══════════════════════════════════════════ */
.pl-trailers-section{padding:10px 14px;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);}
.pl-trailers-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--txt2);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
.pl-trailers-label::after{content:'';flex:1;height:1px;background:var(--bdr);}
.pl-4slots{display:flex;flex-direction:column;gap:5px;}
/* Ogni riga slot: thumb 48px + select + clear */
.pl-slot-row{display:grid;grid-template-columns:48px 1fr 22px;gap:5px;align-items:center;}
.pl-slot-thumb{
  width:48px;height:28px;border-radius:3px;overflow:hidden;
  background:var(--surf2);border:1px solid var(--bdr);
  display:flex;align-items:center;justify-content:center;
  position:relative;text-decoration:none;flex-shrink:0;
}
.pl-slot-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.pl-slot-empty{font-size:11px;color:var(--txt2);}
.pl-thumb-play{
  position:absolute;width:14px;height:14px;
  background:rgba(0,0,0,.65);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:6px;color:#fff;pointer-events:none;
}
.pl-trailer-sel{font-size:11px;padding:3px 5px;width:100%;background:var(--surf);border:1px solid var(--bdr);color:var(--txt);border-radius:4px;cursor:pointer;}
.pl-trailer-sel:focus{outline:2px solid var(--acc);}
.pl-trailer-clear{background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;padding:0;line-height:1;}
.pl-trailer-clear:hover{color:var(--red);}
.pl-empty{text-align:center;padding:40px 20px;color:var(--txt2);font-size:13px;}


/* ── OPEN AIR BANNER ── */
.oa-day-banner{padding:6px 10px 8px;border-top:2px dashed rgba(13,92,138,.4);background:linear-gradient(135deg,rgba(13,92,138,.08),rgba(13,92,138,.03));display:flex;flex-direction:column;gap:4px;}
.oa-banner-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:5px 10px;background:rgba(13,92,138,.1);border:1px solid rgba(13,92,138,.25);border-left:3px solid #0d5c8a;border-radius:5px;cursor:pointer;transition:background .12s;font-size:11px;}
.oa-banner-row:hover{background:rgba(13,92,138,.18);}
.oa-banner-star{font-size:13px;flex-shrink:0;}
.oa-banner-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#4ab4e8;flex-shrink:0;}
.oa-banner-sep{color:rgba(74,180,232,.5);font-size:11px;flex-shrink:0;}
.oa-banner-loc{color:#4ab4e8;font-weight:600;font-size:11px;}
.oa-banner-film{color:var(--txt);font-weight:700;font-size:11px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.oa-banner-time{font-family:monospace;font-weight:700;font-size:11px;color:#e8c84a;background:rgba(232,200,74,.1);border:1px solid rgba(232,200,74,.25);border-radius:3px;padding:1px 6px;flex-shrink:0;}
.oa-banner-name{font-size:10px;color:var(--txt2);flex-shrink:0;}
.oa-banner-edit{font-size:11px;color:var(--txt2);opacity:0;margin-left:auto;flex-shrink:0;transition:opacity .12s;}
.oa-banner-row:hover .oa-banner-edit{opacity:.7;}

/* ══ SOCIAL ════════════════════════════════════════════ */
.social-plat-btn,.social-tone-btn{
  padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
  border:1.5px solid var(--bdr);background:var(--surf2);color:var(--txt2);
  transition:all .15s;
}
.social-lay-btn{
  padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;
  border:1.5px solid var(--bdr);background:var(--surf2);color:var(--txt2);
  transition:all .15s;
}
.social-lay-btn.active{background:#f0801a;color:#fff;border-color:#f0801a;}
.social-lay-btn:hover:not(.active){background:var(--surf);}
.social-plat-btn.active,.social-tone-btn.active{
  border-color:var(--acc);background:rgba(232,200,74,.12);color:var(--acc);
}
.social-tag{
  font-size:10px;color:var(--acc);background:rgba(232,200,74,.1);
  border:1px solid rgba(232,200,74,.25);border-radius:12px;padding:2px 8px;
}
.social-slide-wrap{
  flex-shrink:0;cursor:pointer;position:relative;
}
.social-slide-wrap canvas{
  display:block;border-radius:6px;border:1px solid var(--bdr);
  transition:transform .15s;
}
.social-slide-wrap:hover canvas{transform:scale(1.03);}
.social-slide-label{
  font-size:10px;color:var(--txt2);text-align:center;margin-top:4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;
}


/* ── PRENOTAZIONI ── */
.book-pill{border-radius:5px;padding:5px 7px;margin-bottom:3px;border-left:3px solid #e84a4a;background:rgba(232,74,74,.12);position:relative;cursor:pointer;transition:transform .1s;}
.book-pill:hover{transform:translateX(2px);}
.book-pill-type{font-size:9px;font-weight:700;color:#e84a4a;text-transform:uppercase;letter-spacing:.5px;}
.book-pill-name{font-size:11px;font-weight:600;color:var(--txt);line-height:1.3;}
.book-pill-time{font-size:10px;color:var(--txt2);font-family:monospace;margin-top:1px;}
.book-pill-seats{font-size:9px;color:#e84a4a;}
.bp-del{position:absolute;top:3px;right:3px;background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;opacity:0;padding:0;}
.book-pill:hover .bp-del{opacity:1;}.bp-del:hover{color:var(--red);}
.date-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;min-height:32px;padding:4px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;}
.date-chip{display:inline-flex;align-items:center;gap:4px;background:rgba(232,74,74,.15);border:1px solid rgba(232,74,74,.3);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace;}
.date-chip button{background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0;line-height:1;}
.book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
.book-card{background:var(--surf);border:1px solid var(--bdr);border-top:3px solid #e84a4a;border-radius:8px;padding:12px 14px;}
.book-card-type{font-size:10px;font-weight:700;color:#e84a4a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.book-card-name{font-size:14px;font-weight:700;margin-bottom:4px;}
.book-card-info{font-size:11px;color:var(--txt2);line-height:1.7;}
.cart-page{
  page-break-after:always;
  display:grid;
  grid-template-columns:95mm 1fr;
  grid-template-rows:auto 1fr;
  gap:0;
  height:185mm;
  overflow:hidden;
}
.cart-page:last-child{page-break-after:auto;}
.cart-header{
  grid-column:1/-1;
  border-bottom:2px solid #111;
  padding-bottom:6px;
  margin-bottom:10px;
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:12px;
}
.cart-title{font-size:32px;font-weight:700;color:#f0801a;line-height:1.1;}
.cart-meta{font-size:15px;color:#666;font-weight:600;}
.cart-left-col{display:flex;flex-direction:column;overflow:hidden;padding-right:12px;border-right:1px solid #e8e8e8;}
.cart-poster-img{width:100%;height:100%;max-height:155mm;object-fit:cover;border-radius:3px;}
.cart-poster-ph{width:100%;flex:1;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:52px;}
.cart-right-col{padding-left:12px;display:flex;flex-direction:column;gap:5px;}
.cart-days-grid{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(3,1fr);gap:5px;flex:1;}
.cart-day-card{border:1px solid #e0e0e0;border-top:3px solid #f0801a;border-radius:3px;display:flex;flex-direction:column;}
.cart-day-head{padding:5px 8px 4px;border-bottom:1px solid #eee;}
.cart-day-name{font-size:22px;font-weight:700;color:#f0801a;text-transform:uppercase;letter-spacing:.3px;line-height:1.1;}
.cart-day-body{padding:3px 8px 4px;flex:1;display:flex;flex-direction:column;gap:1px;justify-content:flex-start;}
.cart-show-row{display:flex;align-items:baseline;gap:8px;padding:1px 0;}
.cart-show-time{font-size:35px;font-weight:700;color:#111;line-height:1;min-width:80px;}
.cart-show-sala{font-size:16px;color:#555;font-weight:600;}
.cart-no-show{font-size:14px;color:#ccc;font-style:italic;padding:4px 0;}

/* ── SCHEDE FILM (CARDS) ── */
.cards-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
.film-card{border:1px solid #ddd;border-top:3px solid #f0801a;border-radius:3px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;}
.fc-header{padding:5px 8px 4px;border-bottom:1px solid #eee;}
.fc-title{font-size:11px;font-weight:800;line-height:1.2;color:#f0801a;}
.fc-meta{font-size:7px;color:#aaa;margin-top:2px;}
.fc-body{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:0;}
.fc-slot-block{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:6px 4px;border:0.5px solid #f0f0f0;text-align:center;flex:1;}
.fc-slot-block:nth-child(3n+1){border-left:none;}
.fc-slot-block:nth-child(3n){border-right:none;}
.fc-slot-day{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#333;line-height:1.1;width:100%;}
.fc-slot-date{font-size:8px;color:#888;line-height:1.1;width:100%;}
.fc-slot-time{font-size:16px;font-weight:800;color:#f0801a;line-height:1.1;margin-top:3px;width:100%;}
.fc-slot-sala{font-size:8px;font-weight:600;color:#555;line-height:1.1;width:100%;}
/* ── CARTELLO DINAMICO (cards-new) ── */
/* ⚠️  ATTENZIONE — STILI DUPLICATI
   Queste regole .cn-* esistono in TRE posti:
     1. Qui dentro PDF_STYLE (app.js) → usato per il blob PDF
     2. css/print.css sezione CARTELLO → preview schermo nell'app
     3. css/print.css blocco @media print → stampa diretta
   Se modifichi una regola, aggiornala in tutti e tre i posti.
   TODO: refactoring → fare fetch('css/print.css') e usare quello
         come PDF_STYLE per eliminare la duplicazione. */
.cn-page{width:100%;height:100vh;display:flex;flex-direction:column;page-break-after:always;break-after:page;box-sizing:border-box;padding:10mm 10mm 8mm;}
.cn-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:5mm;border-bottom:2px solid #f0801a;padding-bottom:3mm;}
.cn-logo{height:9mm;width:auto;}
.cn-cinema{font-size:8pt;color:#999;letter-spacing:.5px;text-transform:uppercase;}
.cn-body{flex:1;display:flex;gap:6mm;min-height:0;}
.cn-left{width:28%;display:flex;flex-direction:column;flex-shrink:0;}
.cn-poster{flex:1;min-height:0;border-radius:4px;overflow:hidden;background:#f5f5f5;display:flex;align-items:center;justify-content:center;margin-bottom:3mm;aspect-ratio:2/3;}
.cn-poster img{width:100%;height:100%;object-fit:cover;object-position:center top;border-radius:4px;}
.cn-poster-ph{font-size:32pt;color:#ddd;}
.cn-title{font-size:12pt;font-weight:900;color:#f0801a;line-height:1.2;margin-bottom:2mm;}
.cn-meta{font-size:6.5pt;color:#aaa;line-height:1.4;}
.cn-right{flex:1;display:grid;gap:2.5mm;}
.cn-slot{display:flex;flex-direction:column;justify-content:center;align-items:center;border:1.5px solid #f0801a;border-radius:4px;padding:1.5mm 2mm;overflow:hidden;}
.cn-empty{border-color:#f0f0f0!important;opacity:.2;}
.cn-top{color:#333;font-weight:800;text-transform:uppercase;letter-spacing:.5px;line-height:1;margin-bottom:1mm;text-align:center;}
.cn-day{color:#222;}
.cn-date{color:#999;font-weight:400;margin-left:1mm;}
.cn-middle{display:flex;align-items:baseline;gap:2mm;line-height:1;}
.cn-time{font-weight:900;color:#f0801a;font-variant-numeric:tabular-nums;line-height:1;}
.cn-sala{font-weight:700;color:#666;line-height:1;}
@page{size:A4 portrait;margin:15mm;}
@page cartello{size:A4 landscape;margin:12mm;}


/* ── OPEN AIR ── */
.oa-section{margin-top:16px;border:1px solid var(--bdr-strong);border-radius:10px;overflow:hidden;}
.oa-header{background:linear-gradient(135deg,#1a3a5c,#0d5c8a);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;}
.oa-title{font-family:var(--serif,serif);font-size:15px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px;}
.oa-star{color:#f0c040;font-size:16px;}
.oa-days{display:grid;gap:0;}
.oa-day{border-bottom:1px solid var(--bdr);padding:8px 14px;display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:start;}
.oa-day:last-child{border-bottom:none;}
.oa-day-name{font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.4px;padding-top:2px;}
.oa-cards{display:flex;flex-direction:column;gap:5px;}
.oa-card{background:rgba(13,92,138,.08);border:1px solid rgba(13,92,138,.2);border-left:3px solid #0d5c8a;border-radius:5px;padding:5px 9px;position:relative;cursor:pointer;transition:transform .1s;}
.oa-card:hover{transform:translateX(2px);}
.oa-label{font-size:9px;font-weight:700;color:#0d5c8a;text-transform:uppercase;letter-spacing:.5px;}
.oa-film{font-size:11px;font-weight:600;color:var(--txt);margin-top:1px;}
.oa-location{font-size:10px;color:var(--txt2);}
.oa-time{font-size:10px;font-family:monospace;color:var(--txt2);}
.oa-del{position:absolute;top:3px;right:3px;background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;opacity:0;padding:0;}
.oa-card:hover .oa-del{opacity:1;}.oa-del:hover{color:var(--red);}
.oa-empty{font-size:11px;color:var(--txt2);padding:4px 0;font-style:italic;}
.oa-add{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--txt2);padding:4px 0;cursor:pointer;}
.oa-add:hover{color:var(--acc);}
.oa-toggle-wrap{display:flex;align-items:center;gap:8px;}
.oa-count{font-size:10px;background:rgba(240,192,64,.2);color:#f0c040;border:1px solid rgba(240,192,64,.3);border-radius:4px;padding:1px 7px;font-family:monospace;}


/* ── TURNI / STAFF ── */
.color-dot{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .15s;}
.color-dot.active{border-color:var(--txt);transform:scale(1.2);}
.staff-grid-wrap{overflow-x:auto;}
.staff-grid{display:grid;gap:0;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;}
.staff-grid-head{display:grid;background:var(--surf2);border-bottom:1px solid var(--bdr);}
.staff-grid-head-cell{padding:6px 10px;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.4px;border-right:1px solid var(--bdr);}
.staff-row{display:grid;border-bottom:1px solid var(--bdr);}
.staff-row:last-child{border-bottom:none;}
.staff-row-label{padding:8px 10px;font-size:12px;font-weight:700;color:var(--txt);border-right:1px solid var(--bdr);display:flex;flex-direction:column;gap:2px;background:var(--surf2);}
.staff-role-badge{font-size:9px;font-weight:600;color:var(--txt2);text-transform:uppercase;}
.staff-cell{padding:4px;border-right:1px solid var(--bdr);min-height:52px;cursor:pointer;transition:background .1s;}
.staff-cell:hover{background:rgba(240,128,26,.06);}
.staff-cell:last-child{border-right:none;}
.shift-chip{border-radius:4px;padding:3px 7px;font-size:10px;font-weight:600;color:#fff;line-height:1.4;cursor:pointer;margin-bottom:2px;}
.shift-chip-time{font-size:9px;opacity:.85;font-family:monospace;}
.hours-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--bdr);}
.hours-name{font-weight:600;font-size:13px;flex:1;}
.hours-bar-wrap{flex:2;height:8px;background:var(--surf2);border-radius:4px;overflow:hidden;}
.hours-bar{height:100%;border-radius:4px;transition:width .4s;}
.hours-val{font-size:12px;font-family:monospace;color:var(--txt2);min-width:50px;text-align:right;}


/* ── ARCHIVIO SECTIONS ── */
.arch-section-hdr{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--bdr);}
.arch-section-title{font-size:13px;font-weight:700;color:var(--txt);}
.arch-section-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}











/* ── BOOKING SLOTS IN PROGRAMMAZIONE GRID ── */
.book-slot{
  border-radius:5px;
  padding:5px 22px 5px 9px;
  margin-bottom:3px;
  cursor:pointer;
  position:relative;
  background:rgba(0,0,0,.30);
  border-left:3px solid currentColor;
  border-top:1px dashed currentColor;
  border-right:1px dashed currentColor;
  border-bottom:1px dashed currentColor;
  transition:transform .12s;
}
.book-slot:hover{transform:translateX(2px);}
.book-slot-type{
  font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.4px;opacity:.75;line-height:1.4;
}
.book-slot-name{
  font-size:12px;font-weight:700;line-height:1.3;
  margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:100%;
}
.book-slot-time{
  font-size:11px;font-family:monospace;
  font-weight:600;opacity:.85;margin-top:2px;
}
.book-slot-del{
  position:absolute;top:3px;right:4px;
  background:none;border:none;color:inherit;
  cursor:pointer;font-size:14px;opacity:0;padding:0;line-height:1;
}
.book-slot:hover .book-slot-del{opacity:.5;}
.book-slot-del:hover{opacity:1!important;}


/* ── LISTA: Card per Giorno ── */
.lday-card{background:var(--surf);border:1px solid var(--bdr-strong);border-radius:10px;margin-bottom:14px;overflow:hidden;}
.lday-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--surf2);border-bottom:2px solid var(--bdr);}
.lday-name{font-size:15px;font-weight:700;color:var(--txt);}
.lday-count{font-size:11px;font-weight:600;color:var(--acc);background:rgba(232,200,74,.12);border:1px solid rgba(232,200,74,.25);border-radius:10px;padding:2px 9px;}
.lday-shows{display:flex;flex-direction:column;}
.lday-row{display:grid;grid-template-columns:52px 90px 1fr 44px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--bdr);gap:8px;transition:background .1s;}
.lday-row:last-child{border-bottom:none;}
.lday-row:hover{background:var(--surf2);}
.lday-time{font-family:monospace;font-size:13px;font-weight:700;color:var(--txt);}
.lday-sala{font-size:11px;}
.lday-film{font-size:13px;font-weight:600;color:var(--txt);}
.lday-dur{font-size:11px;color:var(--txt2);text-align:right;}

/* ── LISTA: Card Giorno × Sala ── */
.lgs-day{margin-bottom:20px;}
.lgs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px;}
.lgs-sala-card{background:var(--surf);border:1px solid var(--bdr);border-top:3px solid;border-radius:8px;overflow:hidden;}
.lgs-sala-head{display:flex;align-items:center;gap:6px;padding:7px 12px;font-size:12px;font-weight:700;background:var(--surf2);border-bottom:1px solid var(--bdr);}
.lgs-sala-card .lday-row{grid-template-columns:50px 1fr 40px;padding:6px 12px;}


/* ══ PLAYLIST ══════════════════════════════════════════ */
.pl-trailers-section{padding:10px 14px;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);}
.pl-trailers-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--txt2);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
.pl-trailers-label::after{content:'';flex:1;height:1px;background:var(--bdr);}
.pl-4slots{display:flex;flex-direction:column;gap:5px;}
/* Ogni riga slot: thumb 48px + select + clear */
.pl-slot-row{display:grid;grid-template-columns:48px 1fr 22px;gap:5px;align-items:center;}
.pl-slot-thumb{
  width:48px;height:28px;border-radius:3px;overflow:hidden;
  background:var(--surf2);border:1px solid var(--bdr);
  display:flex;align-items:center;justify-content:center;
  position:relative;text-decoration:none;flex-shrink:0;
}
.pl-slot-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.pl-slot-empty{font-size:11px;color:var(--txt2);}
.pl-thumb-play{
  position:absolute;width:14px;height:14px;
  background:rgba(0,0,0,.65);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:6px;color:#fff;pointer-events:none;
}
.pl-trailer-sel{font-size:11px;padding:3px 5px;width:100%;background:var(--surf);border:1px solid var(--bdr);color:var(--txt);border-radius:4px;cursor:pointer;}
.pl-trailer-sel:focus{outline:2px solid var(--acc);}
.pl-trailer-clear{background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;padding:0;line-height:1;}
.pl-trailer-clear:hover{color:var(--red);}
.pl-empty{text-align:center;padding:40px 20px;color:var(--txt2);font-size:13px;}


/* ── OPEN AIR BANNER ── */
.oa-day-banner{padding:6px 10px 8px;border-top:2px dashed rgba(13,92,138,.4);background:linear-gradient(135deg,rgba(13,92,138,.08),rgba(13,92,138,.03));display:flex;flex-direction:column;gap:4px;}
.oa-banner-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:5px 10px;background:rgba(13,92,138,.1);border:1px solid rgba(13,92,138,.25);border-left:3px solid #0d5c8a;border-radius:5px;cursor:pointer;transition:background .12s;font-size:11px;}
.oa-banner-row:hover{background:rgba(13,92,138,.18);}
.oa-banner-star{font-size:13px;flex-shrink:0;}
.oa-banner-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#4ab4e8;flex-shrink:0;}
.oa-banner-sep{color:rgba(74,180,232,.5);font-size:11px;flex-shrink:0;}
.oa-banner-loc{color:#4ab4e8;font-weight:600;font-size:11px;}
.oa-banner-film{color:var(--txt);font-weight:700;font-size:11px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.oa-banner-time{font-family:monospace;font-weight:700;font-size:11px;color:#e8c84a;background:rgba(232,200,74,.1);border:1px solid rgba(232,200,74,.25);border-radius:3px;padding:1px 6px;flex-shrink:0;}
.oa-banner-name{font-size:10px;color:var(--txt2);flex-shrink:0;}
.oa-banner-edit{font-size:11px;color:var(--txt2);opacity:0;margin-left:auto;flex-shrink:0;transition:opacity .12s;}
.oa-banner-row:hover .oa-banner-edit{opacity:.7;}

/* ══ SOCIAL ════════════════════════════════════════════ */
.social-plat-btn,.social-tone-btn{
  padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
  border:1.5px solid var(--bdr);background:var(--surf2);color:var(--txt2);
  transition:all .15s;
}
.social-lay-btn{
  padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;
  border:1.5px solid var(--bdr);background:var(--surf2);color:var(--txt2);
  transition:all .15s;
}
.social-lay-btn.active{background:#f0801a;color:#fff;border-color:#f0801a;}
.social-lay-btn:hover:not(.active){background:var(--surf);}
.social-plat-btn.active,.social-tone-btn.active{
  border-color:var(--acc);background:rgba(232,200,74,.12);color:var(--acc);
}
.social-tag{
  font-size:10px;color:var(--acc);background:rgba(232,200,74,.1);
  border:1px solid rgba(232,200,74,.25);border-radius:12px;padding:2px 8px;
}
.social-slide-wrap{
  flex-shrink:0;cursor:pointer;position:relative;
}
.social-slide-wrap canvas{
  display:block;border-radius:6px;border:1px solid var(--bdr);
  transition:transform .15s;
}
.social-slide-wrap:hover canvas{transform:scale(1.03);}
.social-slide-label{
  font-size:10px;color:var(--txt2);text-align:center;margin-top:4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;
}


/* ══ NEWSLETTER ═══════════════════════════════════════ */
.nws-card{
  display:flex;align-items:stretch;width:100%;cursor:pointer;
  border-bottom:0.5px solid var(--bdr);
  background:var(--surf);transition:background .15s;
}
.nws-card:first-child{border-radius:0;}
.nws-card:last-child{border-bottom:none;}
.nws-card:hover{background:var(--surf2);}
.nws-card.selected{background:rgba(240,128,26,.05);border-left:3px solid #f0801a;}
.nws-card-poster{
  width:52px;min-width:52px;object-fit:cover;display:block;flex-shrink:0;align-self:stretch;
}
.nws-card-poster-ph{
  width:52px;min-width:52px;flex-shrink:0;
  background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:20px;
}
.nws-card-body{
  padding:10px 12px;flex:1;min-width:0;
  display:flex;flex-direction:column;justify-content:center;gap:3px;
  border-left:0.5px solid var(--bdr);
}
.nws-card-title{font-size:12px;font-weight:700;color:var(--txt);line-height:1.3;word-break:break-word;}
.nws-card-meta{font-size:11px;color:var(--txt2);line-height:1.4;}
.nws-card-badge{
  display:inline-block;background:#f0801a;color:#fff;font-size:8px;font-weight:700;
  padding:1px 5px;border-radius:2px;letter-spacing:.4px;align-self:flex-start;margin-bottom:3px;
}
.nws-card-release{font-size:11px;color:#f0801a;font-weight:700;margin-top:1px;}
.nws-card-ctrl{
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:8px 6px;flex-shrink:0;width:30px;
  border-left:0.5px solid var(--bdr);background:var(--surf2);
}
.nws-card-ctrl button{
  width:20px;height:20px;border:0.5px solid var(--bdr);border-radius:3px;
  background:var(--surf);color:var(--txt2);font-size:9px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:background .1s,color .1s;padding:0;flex-shrink:0;
}
.nws-card-ctrl button:hover{background:#f0801a;color:#fff;border-color:#f0801a;}
.nws-card-check{font-size:14px;color:var(--bdr);transition:color .15s;}
.nws-card.selected .nws-card-check{color:#f0801a;}
.nws-priority-badge{
  width:18px;height:18px;border-radius:50%;flex-shrink:0;
  background:#f0801a;color:#fff;font-size:9px;font-weight:700;
  display:flex;align-items:center;justify-content:center;
}

/* ── PRENOTAZIONI ── */
.book-pill{border-radius:5px;padding:5px 7px;margin-bottom:3px;border-left:3px solid #e84a4a;background:rgba(232,74,74,.12);position:relative;cursor:pointer;transition:transform .1s;}
.book-pill:hover{transform:translateX(2px);}
.book-pill-type{font-size:9px;font-weight:700;color:#e84a4a;text-transform:uppercase;letter-spacing:.5px;}
.book-pill-name{font-size:11px;font-weight:600;color:var(--txt);line-height:1.3;}
.book-pill-time{font-size:10px;color:var(--txt2);font-family:monospace;margin-top:1px;}
.book-pill-seats{font-size:9px;color:#e84a4a;}
.bp-del{position:absolute;top:3px;right:3px;background:none;border:none;color:var(--txt2);cursor:pointer;font-size:13px;opacity:0;padding:0;}
.book-pill:hover .bp-del{opacity:1;}.bp-del:hover{color:var(--red);}
.date-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;min-height:32px;padding:4px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;}
.date-chip{display:inline-flex;align-items:center;gap:4px;background:rgba(232,74,74,.15);border:1px solid rgba(232,74,74,.3);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace;}
.date-chip button{background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0;line-height:1;}
.book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
.book-card{background:var(--surf);border:1px solid var(--bdr);border-top:3px solid #e84a4a;border-radius:8px;padding:12px 14px;}
.book-card-type{font-size:10px;font-weight:700;color:#e84a4a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.book-card-name{font-size:14px;font-weight:700;margin-bottom:4px;}
.book-card-info{font-size:11px;color:var(--txt2);line-height:1.7;}
.cart-page{page:cartello;}
</style>`;

async function pPDF(type, landscape){
  const days=wdays();const wd=wdates();
  const CN=window.CINEMA_CONFIG.nome;
  // Include OA bookings as virtual shows in reports
  const oaVirtual=(S.bookings||[]).filter(function(b){return b.type==='openair';}).flatMap(function(b){return(b.dates||[]).filter(function(d){return wd.includes(d.date);}).map(function(d){return{id:b.id,filmId:b.filmId,sala:b.sala,day:d.date,start:d.start,end:d.end,_oa:true,_location:b.location,_post:b.postazione};});});
  const allShows=S.shows.filter(s=>wd.includes(s.day)).concat(oaVirtual).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  const wl=fd(days[0])+' \u2014 '+fd(days[6]);
  const DAB=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
  const now=new Date().toLocaleDateString('it-IT');
  let html='';
  const LOGO='data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iQ2FscXVlXzEiIGRhdGEtbmFtZT0iQ2FscXVlIDEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDE3MjYuMyAxMTE2Ljg1Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLmNscy0xIHsKICAgICAgICBmaWxsOiAjZWY3ODE1OwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8Zz4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTUxMy40OSw3NTEuMTZjLTEwNi4yMiwxMS44LTIwMS45LTY0Ljc1LTIxMy42OS0xNzAuOTgtMTEuOC0xMDYuMjIsNjQuNzUtMjAxLjksMTcwLjk4LTIxMy42OWw0Mi43MiwzODQuNjdaIi8+CiAgICA8Y2lyY2xlIGNsYXNzPSJjbHMtMSIgY3g9IjU4NC4yNSIgY3k9IjQ1OC4zOSIgcj0iNzEuNTYiLz4KICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSI1NTYuNzIgNTg5LjExIDU3Ny40OCA2ODYuNzkgOTIyLjYzIDc0NC41MyA5MDUuODggNDA2LjI1IDU1Ni43MiA1ODkuMTEiLz4KICA8L2c+CiAgPGc+CiAgICA8Zz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTA1Ni42NCw0MzYuNTZjLTYuODYsMi40OC0xMC42MywzLjI4LTE0LjkxLDMuMjgtMTEuNTMsMC0yMC4xNy00LjU3LTI1LjY0LTkuOTQtNi40Ni02LjQ2LTEwLjA0LTE1LjUtMTAuMDQtMjQuMTUsMC05LjQ0LDQuMDctMTguMzksMTAuMDQtMjQuNDUsNS44Ni01Ljk2LDE0LjcxLTEwLjM0LDI1LjA0LTEwLjM0LDMuMTgsMCw4LjM1LjUsMTUuNSwzLjM4djIwLjU3Yy01LjU3LTYuODYtMTIuMTItNy4yNi0xNS4wMS03LjI2LTQuOTcsMC04Ljc1LDEuNDktMTEuOTMsNC4zNy00LjA4LDMuNzgtNS43Niw4Ljk0LTUuNzYsMTMuNjFzMS44OSw5LjY0LDUuMzcsMTIuOTJjMi44OCwyLjY4LDcuNDUsNC41NywxMi4zMiw0LjU3LDIuNTgsMCw4Ljk0LS4zLDE1LjAxLTYuOTZ2MjAuMzdaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwNzQuMDMsMzY2LjQ5YzQuOTcsMCw4Ljk0LDMuOTgsOC45NCw4Ljk0cy0zLjk4LDguOTUtOC45NCw4Ljk1LTguOTQtMy45OC04Ljk0LTguOTUsMy45OC04Ljk0LDguOTQtOC45NFpNMTA4MS45OCwzOTMuOTJ2NDQuNDJoLTE1Ljl2LTQ0LjQyaDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwOTIuODEsMzkzLjkyaDE1Ljl2NS41N2M0LjM3LTUuNzcsMTAuMjQtNi41NiwxNC4xMS02LjU2LDQuNTcsMCw5LjQ0LDEuMDksMTMuMTIsNC43NywzLjc4LDMuNzgsNC4xNyw3LjU1LDQuMTcsMTIuNDJ2MjguMjJoLTE1Ljl2LTIyLjQ2YzAtMi41OC4xLTYuNDYtMS45OS04LjY1LTEuNDktMS41OS0zLjQ4LTEuODktNS4wNy0xLjg5LTIuNDgsMC00LjU3Ljg5LTUuODYsMi4wOS0xLjU5LDEuNDktMi41OCw0LjM3LTIuNTgsNy4wNnYyMy44NWgtMTUuOXYtNDQuNDJaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExOTguMDUsNDE5LjA2aC0zMy4wOWMwLDIuMzkuODksNS41NywyLjc4LDcuNDUuOTkuOTksMi45OCwyLjE5LDYuNTYsMi4xOS40LDAsMy4xOC0uMSw1LjE3LTEuMTkuOTktLjYsMi4wOS0xLjU5LDIuNzgtMi45OGgxNS4yMWMtLjcsMi40OS0yLjA5LDUuOTYtNS4zNyw5LjE0LTMuMjgsMy4xOC04LjQ1LDYuMTYtMTguMDksNi4xNi01Ljg2LDAtMTIuOTItMS4yOS0xOC4zOS02Ljc2LTIuODgtMi44OC02LjU2LTguMzUtNi41Ni0xNi44LDAtNy40NSwyLjc4LTEzLjQyLDYuNjYtMTcuMTksMy42OC0zLjU4LDkuNDQtNi40NiwxOC4xOS02LjQ2LDUuMTcsMCwxMS44MywxLjA5LDE3LjA5LDYuMDYsNi4yNiw1Ljk2LDcuMDYsMTMuNzEsNy4wNiwxOC42OHYxLjY5Wk0xMTgzLjQ0LDQwOS45MmMtLjQtMS42OS0xLjM5LTMuNTgtMi41OC00Ljc3LTIuMDktMi4wOS00Ljk3LTIuMzktNi41Ni0yLjM5LTIuNjgsMC00Ljc3LjctNi40NiwyLjM5LTEuMDksMS4xOS0yLjA5LDIuNzgtMi4zOSw0Ljc3aDE3Ljk5WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMjA3LjE4LDM5My45MmgxNS45djUuMzdjMy43OC00LjU3LDguOTQtNi4xNiwxMy4zMi02LjE2LDMuMTgsMCw2LjE2LjY5LDguNTUsMS45OSwzLjI4LDEuNjksNS4wNyw0LjE3LDYuMTYsNi4zNiwxLjc5LTMuMTgsNC4wOC01LjA3LDYuMDYtNi4xNiwzLjE4LTEuNzksNi4yNi0yLjE5LDkuMjQtMi4xOSwzLjI4LDAsOC42NS41LDEyLjMyLDQuMDcsMy45OCwzLjg4LDQuMTcsOS4xNCw0LjE3LDEyLjIydjI4LjkyaC0xNS45di0yMS45NmMwLTQuNjctLjUtNy44NS0yLjI5LTkuNTQtLjktLjgtMi4wOS0xLjQ5LTQuMTctMS40OS0xLjc5LDAtMy4yOC41LTQuNjcsMS43OS0yLjY4LDIuNTgtMi44OCw2LjI2LTIuODgsOC40NXYyMi43NmgtMTUuOXYtMjEuOTZjMC00LjI3LS4zLTcuNjUtMi4wOS05LjU0LTEuMzktMS40OS0zLjE4LTEuNzktNC43Ny0xLjc5LTEuNjksMC0zLjA4LjMtNC4zNywxLjU5LTIuNzgsMi42OC0yLjc4LDYuOTYtMi43OCw5Ljc0djIxLjk2aC0xNS45di00NC40MloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTMyOC4zMiwzOTMuOTJoMTUuOXY0NC40MmgtMTUuOXYtNC44N2MtMy42OCw1LjA3LTkuNDQsNi4zNi0xMy44MSw2LjM2LTQuNzcsMC0xMC42My0xLjM5LTE2LTcuMDYtNC4yNy00LjU3LTYuMzYtOS42NC02LjM2LTE2LjMsMC04LjM1LDMuMjgtMTQuMjEsNi44Ni0xNy43OSwzLjc4LTMuNzgsOS42NC02LjI2LDE2LTYuMjYsNy4xNiwwLDExLjQzLDMuNjgsMTMuMzIsNS43NnYtNC4yN1pNMTMxMS42Myw0MDguODNjLTIuMTksMi4wOS0zLjE4LDQuOTctMy4xOCw3LjI2LDAsMi41OCwxLjA5LDUuMzcsMy4wOCw3LjI2LDEuNjksMS41OSw0LjQ3LDIuOTgsNy4xNiwyLjk4czUuMTctMS4wOSw3LjE2LTMuMDhjMS4zOS0xLjM5LDIuOTgtMy41OCwyLjk4LTcuMTYsMC0yLjA5LS42LTQuODctMy4wOC03LjI2LTEuNDktMS4zOS0zLjc4LTIuODgtNy4xNi0yLjg4LTEuOTksMC00LjY3LjctNi45NiwyLjg4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMDA2LjA1LDU0MC4wOWwxMS4yMy02Ni4yOWgxNi45OWwxMy40MiwzNS4zOCwxNC4yMS0zNS4zOGgxNy4xOWw5Ljk0LDY2LjI5aC0xNy4xOWwtNC44Ny0zOC4xNi0xNiwzOC4xNmgtNi44NmwtMTUuMzEtMzguMTYtNS42NiwzOC4xNmgtMTcuMDlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExMTQuMzcsNDk1LjY3djI0Ljg1YzAsMS43OS4zLDQuNTcsMi4zOSw2LjQ2LDEuNTksMS4zOSwzLjY4LDEuNjksNS41NywxLjY5LDEuOTksMCwzLjg4LS4yLDUuNjYtMS44OSwxLjk5LTEuOTksMi4yOS00LjI3LDIuMjktNi4yNnYtMjQuODVoMTUuOXYyNy43M2MwLDMuNzgtLjMsNy44NS00LjI3LDExLjkzLTUuNDcsNS42Ny0xMy4xMiw2LjI2LTE5LjE4LDYuMjYtNi42NiwwLTE0LjgxLS42OS0yMC4wOC02LjM2LTMuMzgtMy41OC00LjE3LTcuNTUtNC4xNy0xMS44M3YtMjcuNzNoMTUuOVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE3Myw0NjcuNjR2NzIuNDVoLTE1Ljl2LTcyLjQ1aDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEyMDEuNDIsNTA4LjY5djMxLjRoLTE1Ljl2LTMxLjRoLTUuMDd2LTEzLjAyaDUuMDd2LTE0LjYxaDE1Ljl2MTQuNjFoOS4wNHYxMy4wMmgtOS4wNFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTIyNC4zOCw0NjguMjRjNC45NywwLDguOTQsMy45OCw4Ljk0LDguOTRzLTMuOTgsOC45NS04Ljk0LDguOTUtOC45NC0zLjk4LTguOTQtOC45NSwzLjk4LTguOTQsOC45NC04Ljk0Wk0xMjMyLjMzLDQ5NS42N3Y0NC40MmgtMTUuOXYtNDQuNDJoMTUuOVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI0Ni4wNCw1MjUuMzhjMS44OSwxLjM5LDQuMTcsMi41OSw2LjM2LDMuMjgsMS45OS43LDQuNDcsMS4wOSw2LjE2LDEuMDksMS4xOSwwLDMuMDgtLjMsNC4wOC0xLjE5LjY5LS42OS44LTEuMjkuOC0yLjA5LDAtLjY5LS4xLTEuMzktLjgtMS45OS0uOTktLjktMi41OC0xLjE5LTQuMTctMS41OWwtNC4xNy0uOTljLTIuMTktLjUtNS4zNy0xLjI5LTcuNzUtMy44OC0xLjY5LTEuNzktMi44OC00LjI3LTIuODgtNy42NSwwLTQuMjcsMS42OS04LjI1LDQuMTctMTAuODMsMy4zOC0zLjQ4LDkuMzQtNS4zNywxNS45LTUuMzdzMTEuNjMsMS43OSwxNC4yMSwyLjg4bC01LjM3LDEwLjE0Yy0yLjE5LS45OS01LjQ3LTIuMTktOC4zNS0yLjE5LTEuNTksMC0yLjY4LjMtMy42OC45LS45LjUtMS4zOSwxLjE5LTEuMzksMi4xOSwwLDEuMzkuODksMi4wOSwxLjg5LDIuNDgsMS40OS42LDIuNzguNiw1LjI3LDEuMjlsMi44OC43OWMyLjA5LjYsNS4yNywyLjE5LDYuNTYsMy40OCwyLjE5LDIuMDksMy4zOCw1LjU3LDMuMzgsOC44NSwwLDUuMzctMi4yOSw4Ljk0LTQuNDcsMTEuMDMtNS4xNyw1LjE3LTEyLjcyLDUuNTctMTYuNCw1LjU3LTMuOTgsMC0xMC4yNC0uNS0xNy44OS01LjE3bDUuNjYtMTEuMDNaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMjEuNjYsNDk1LjY3aDE1Ljl2NDQuNDJoLTE1Ljl2LTQuODdjLTMuNjgsNS4wNy05LjQ0LDYuMzYtMTMuODEsNi4zNi00Ljc3LDAtMTAuNjMtMS4zOS0xNi03LjA2LTQuMjctNC41Ny02LjM2LTkuNjQtNi4zNi0xNi4zLDAtOC4zNSwzLjI4LTE0LjIxLDYuODYtMTcuNzksMy43OC0zLjc4LDkuNjQtNi4yNiwxNi02LjI2LDcuMTYsMCwxMS40MywzLjY4LDEzLjMyLDUuNzZ2LTQuMjdaTTEzMDQuOTcsNTEwLjU4Yy0yLjE5LDIuMDktMy4xOCw0Ljk3LTMuMTgsNy4yNiwwLDIuNTgsMS4wOSw1LjM3LDMuMDgsNy4yNiwxLjY5LDEuNTksNC40NywyLjk4LDcuMTYsMi45OHM1LjE3LTEuMDksNy4xNi0zLjA4YzEuMzktMS4zOSwyLjk4LTMuNTgsMi45OC03LjE2LDAtMi4wOS0uNi00Ljg3LTMuMDgtNy4yNi0xLjQ5LTEuMzktMy43OC0yLjg4LTcuMTYtMi44OC0xLjk5LDAtNC42Ny43LTYuOTYsMi44OFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTM2NC4zOSw0NjcuNjR2NzIuNDVoLTE1Ljl2LTcyLjQ1aDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE0MDkuNjEsNDk1LjY3aDE1Ljl2NDQuNDJoLTE1Ljl2LTQuODdjLTMuNjgsNS4wNy05LjQ0LDYuMzYtMTMuODEsNi4zNi00Ljc3LDAtMTAuNjMtMS4zOS0xNi03LjA2LTQuMjctNC41Ny02LjM2LTkuNjQtNi4zNi0xNi4zLDAtOC4zNSwzLjI4LTE0LjIxLDYuODYtMTcuNzksMy43OC0zLjc4LDkuNjQtNi4yNiwxNi02LjI2LDcuMTYsMCwxMS40MywzLjY4LDEzLjMyLDUuNzZ2LTQuMjdaTTEzOTIuOTEsNTEwLjU4Yy0yLjE5LDIuMDktMy4xOCw0Ljk3LTMuMTgsNy4yNiwwLDIuNTgsMS4wOSw1LjM3LDMuMDgsNy4yNiwxLjY5LDEuNTksNC40NywyLjk4LDcuMTYsMi45OHM1LjE3LTEuMDksNy4xNi0zLjA4YzEuMzktMS4zOSwyLjk4LTMuNTgsMi45OC03LjE2LDAtMi4wOS0uNi00Ljg3LTMuMDgtNy4yNi0xLjQ5LTEuMzktMy43OC0yLjg4LTcuMTYtMi44OC0xLjk5LDAtNC42Ny43LTYuOTYsMi44OFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTAyOC40Miw1ODEuMTh2NTYuNzVoLTEwLjE0di01Ni43NWgtMTUuMjF2LTkuNTRoNDAuNTV2OS41NGgtMTUuMjFaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwODQuMjcsNjI4LjM5Yy0xLjc5LDMuMTgtNC4zNyw1Ljk2LTcuMDYsNy42NS0zLjM4LDIuMTktNy44NSwzLjE4LTEyLjMyLDMuMTgtNS41NywwLTEwLjE0LTEuMzktMTQuMTEtNS4zNy0zLjk4LTMuOTgtNi4xNi05Ljc0LTYuMTYtMTZzMi4yOS0xMi43Miw2LjY2LTE3LjE5YzMuNDgtMy40OCw4LjA1LTUuNjcsMTQuMDEtNS42Nyw2LjY2LDAsMTAuOTMsMi44OCwxMy40Miw1LjQ3LDUuMzcsNS41Nyw1Ljg2LDEzLjMyLDUuODYsMTcuNjl2MS4xOWgtMzAuMDFjLjIsMi45OCwxLjQ5LDYuMzYsMy41OCw4LjQ1LDIuMjksMi4yOSw1LjA3LDIuNjgsNy40NSwyLjY4LDIuNjgsMCw0LjY3LS42LDYuNjYtMi4wOSwxLjY5LTEuMjksMi45OC0yLjk4LDMuODgtNC41N2w4LjE1LDQuNTdaTTEwNzQuNjIsNjExLjM5Yy0uNC0yLjI5LTEuNDktNC4yNy0yLjk4LTUuNjYtMS4yOS0xLjE5LTMuMzgtMi4zOS02LjU2LTIuMzktMy4zOCwwLTUuNTcsMS4zOS02Ljg2LDIuNjgtMS4zOSwxLjI5LTIuNDgsMy4yOC0yLjk4LDUuMzdoMTkuMzhaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExMjUuMzEsNTk2LjA5aDkuNzR2NDEuODRoLTkuNzR2LTQuMzdjLTQuMjcsNC45Ny05LjU0LDUuNjctMTIuNTIsNS42Ny0xMi45MiwwLTIwLjI3LTEwLjczLTIwLjI3LTIyLjI2LDAtMTMuNjIsOS4zNC0yMS45NiwyMC4zNy0yMS45NiwzLjA4LDAsOC40NS44LDEyLjQyLDUuOTZ2LTQuODdaTTExMDIuNDUsNjE3LjE2YzAsNy4yNiw0LjU3LDEzLjMyLDExLjYzLDEzLjMyLDYuMTYsMCwxMS44My00LjQ3LDExLjgzLTEzLjIycy01LjY2LTEzLjUyLTExLjgzLTEzLjUyYy03LjA2LDAtMTEuNjMsNS45Ni0xMS42MywxMy40MloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE1Ny40LDYwNS4wM3YzMi45aC05Ljc0di0zMi45aC00LjA3di04Ljk0aDQuMDd2LTE1LjNoOS43NHYxNS4zaDcuNDV2OC45NGgtNy40NVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE3MS40MSw1OTYuMDloOS43NHYzLjc4YzEuMDktMS4yOSwyLjY4LTIuNjgsNC4wNy0zLjQ4LDEuODktMS4wOSwzLjc4LTEuMzksNS45Ni0xLjM5LDIuMzksMCw0Ljk3LjQsNy42NSwxLjk5bC0zLjk4LDguODVjLTIuMTktMS4zOS0zLjk4LTEuNDktNC45Ny0xLjQ5LTIuMDksMC00LjE3LjMtNi4wNiwyLjI5LTIuNjgsMi44OC0yLjY4LDYuODYtMi42OCw5LjY0djIxLjY2aC05Ljc0di00MS44NFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI0NC45NSw2MTcuMDZjMCwxMi44Mi05Ljc0LDIyLjE2LTIyLjM2LDIyLjE2cy0yMi4zNi05LjM0LTIyLjM2LTIyLjE2LDkuNzQtMjIuMDYsMjIuMzYtMjIuMDYsMjIuMzYsOS4xNCwyMi4zNiwyMi4wNlpNMTIzNS4wMSw2MTcuMTZjMC05LjU0LTYuMjYtMTMuNDItMTIuNDItMTMuNDJzLTEyLjQyLDMuODgtMTIuNDIsMTMuNDJjMCw4LjA1LDQuNzcsMTMuMzIsMTIuNDIsMTMuMzJzMTIuNDItNS4yNywxMi40Mi0xMy4zMloiLz4KICAgIDwvZz4KICAgIDxnPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzAxLjUxLDU5Mi43NGMtLjQ5LDEuMjItMi4zNSw1LjEzLTguMDksNS4xMy0yLjY2LDAtNC42Ny0uNzYtNi4zLTIuMzItMS44Mi0xLjcxLTIuNTgtMy44My0yLjU4LTYuNDIsMC0zLjI2LDEuMzMtNS4yOCwyLjUxLTYuNDUsMS45NC0xLjksNC4yMS0yLjMyLDYuMTktMi4zMiwzLjM0LDAsNS4yOCwxLjMzLDYuNDIsMi43LDEuNzUsMi4wOSwxLjk3LDQuNjcsMS45Nyw2LjQ1di4zOGgtMTIuM2MwLC45OS4yNywyLjA1LjgsMi43Ny40OS42OCwxLjUyLDEuNTYsMy4zLDEuNTZzMy4wNy0uODMsMy44My0yLjE2bDQuMjUuNjhaTTEyOTcuMjUsNTg2LjkzYy0uMzgtMi4yNC0yLjItMy4zLTMuOTEtMy4zcy0zLjQ5LDEuMS0zLjg3LDMuM2g3Ljc4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzE0LjE0LDU4NC44MWMtMS4xLTEuMDItMi4yLTEuMS0yLjctMS4xLTEuMSwwLTEuNzguNTMtMS43OCwxLjMzLDAsLjQyLjE5LDEuMDYsMS40OCwxLjQ4bDEuMS4zNGMxLjI5LjQyLDMuMjMsMS4wNiw0LjE4LDIuMzUuNDkuNjguODMsMS42Ny44MywyLjczLDAsMS40OC0uNDksMi45Ni0xLjgyLDQuMTgtMS4zMywxLjIxLTIuOTIsMS43NS00Ljk0LDEuNzUtMy40MiwwLTUuMzUtMS42My02LjM4LTIuNzNsMi40My0yLjgxYy45MSwxLjA2LDIuMjgsMS45LDMuNjQsMS45LDEuMjksMCwyLjI4LS42NCwyLjI4LTEuNzgsMC0xLjAzLS44My0xLjQ0LTEuNDQtMS42N2wtMS4wNi0uMzhjLTEuMTgtLjQyLTIuNTQtLjk1LTMuNTMtMS45Ny0uNzYtLjgtMS4yNS0xLjgyLTEuMjUtMy4xNSwwLTEuNTkuNzYtMi45MiwxLjcxLTMuNzIsMS4yOS0xLjAzLDIuOTYtMS4xOCw0LjI5LTEuMTgsMS4yMSwwLDMuMTUuMTUsNS4yNCwxLjc1bC0yLjI4LDIuNjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMjUuMTUsNTg0Ljg0djEyLjQ5aC00LjYzdi0xMi40OWgtMS44MnYtMy45NWgxLjgydi01LjYyaDQuNjN2NS42MmgzLjE5djMuOTVoLTMuMTlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMzMuMzUsNTkxLjkxYzEuNjcsMCwyLjk2LDEuMjksMi45NiwyLjk2cy0xLjI5LDIuOTYtMi45NiwyLjk2LTIuOTYtMS4yOS0yLjk2LTIuOTYsMS4yOS0yLjk2LDIuOTYtMi45NloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTM1NS42Myw1NzYuMjZoLTMuNjV2LTQuMjVoOC41OHYyNS4zMmgtNC45NHYtMjEuMDdaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzNzAuODEsNTk2LjA4bDYuMDQtNy45Yy0uOC4yNy0xLjc4LjQ5LTIuNjkuNDktMS43OCwwLTQuMDYtLjcyLTUuNTQtMi4xNi0xLjMzLTEuMjUtMi4zOS0zLjQyLTIuMzktNi4wOCwwLTIuMTMuNjEtNC4yNSwyLjMxLTYuMTEsMi4xNi0yLjM1LDQuNjMtMi44OCw3LjIxLTIuODhzNS4xMy40OSw3LjIxLDIuNThjMS4zNywxLjM3LDIuNDcsMy4zLDIuNDcsNi4xNSwwLDMuMDctMS40LDUuNTQtMy4xOSw3LjlsLTcuNDQsOS45NS0zLjk5LTEuOTRaTTEzNzIuNTIsNTc2LjY4Yy0uNjEuNjEtMS4zNywxLjY3LTEuMzcsMy4zNCwwLDEuNTIuNTMsMi42NiwxLjQsMy40OS45NS45MSwyLjAxLDEuMjEsMy4yNiwxLjIxLDEuMzcsMCwyLjM5LS40MiwzLjMtMS4zNy45MS0uOTUsMS4zNy0yLjAxLDEuMzctMy4zLDAtMS42LS42NC0yLjctMS40LTMuNDItLjY0LS42MS0xLjc1LTEuMjUtMy4yNy0xLjI1cy0yLjY2LjY0LTMuMywxLjI5WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzg4LjQyLDU4NC42NWMwLTguNjksNC43NS0xMy4yMSw5Ljc5LTEzLjIxczkuNzksNC41Miw5Ljc5LDEzLjI1LTQuNzQsMTMuMjEtOS43OSwxMy4yMS05Ljc5LTQuNTItOS43OS0xMy4yNVpNMTM5My4zNSw1ODQuNjVjMCw2LjYxLDIuNyw5LDQuODYsOXM0Ljg2LTIuMzksNC44Ni05LTIuNzMtOC45Ni00Ljg2LTguOTYtNC44NiwyLjM5LTQuODYsOC45NloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTQyNy43LDU5MC40MmMwLDQuMTgtMy4zNCw3LjQ4LTguODEsNy40OHMtOC44MS0zLjMtOC44MS03LjQ4YzAtMi45MiwxLjcxLTUuMzksNC41Mi02LjMtMS45NC0uOTUtMy42NS0yLjgxLTMuNjUtNS42MiwwLTMuNjgsMi42Ni03LjA2LDcuOTQtNy4wNnM3LjkzLDMuMzgsNy45Myw3LjA2YzAsMi44MS0xLjcxLDQuNjctMy42NSw1LjYyLDIuODEuOTEsNC41MiwzLjM4LDQuNTIsNi4zWk0xNDIyLjc3LDU5MC4wOGMwLTIuMzEtMS42Ny0zLjk1LTMuODctMy45NXMtMy44NywxLjYzLTMuODcsMy45NSwxLjY3LDMuOTUsMy44NywzLjk1LDMuODctMS42MywzLjg3LTMuOTVaTTE0MjIuNDMsNTc4LjU0YzAtMi4wOS0xLjQ0LTMuNTMtMy41My0zLjUzcy0zLjUzLDEuNDQtMy41MywzLjUzLDEuNDQsMy41MywzLjUzLDMuNTMsMy41My0xLjQ0LDMuNTMtMy41M1oiLz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPg=='
  const hdr=(title)=>'<div class="H"><div class="H-top"><img class="H-logo" src="'+LOGO+'" alt=""><span class="H-stamp">Stampato il '+now+'</span></div><div class="H-bot"><span class="rt">'+title+'</span><span class="wl">'+wl+'</span></div></div>';

  if(type==='titolo'){
    html=hdr('Programmazione per Titolo — Cinema Multisala Teatro Mendrisio');
    html+='<div class="T-cols">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' \u00b7 ');
      html+='<div class="T-film"><div class="T-film-head"><span class="T-ftit">'+f.title+'</span><span class="T-fmeta">'+meta+'</span></div>';
      fS.forEach(function(s){
        const di=wd.indexOf(s.day);
        html+='<div class="T-row"><span class="T-d">'+(di>=0?DAB[di]+' '+fs(days[di]):'')+'</span><span class="T-s">'+sn(s.sala)+'</span><span class="T-t">'+s.start+'</span><span class="T-e">fine '+s.end+'</span></div>';
      });
      html+='</div>';
    });
  }
  else if(type==='sala'){
    html=hdr('Programmazione per Sala — Cinema Multisala Teatro Mendrisio');
    html+='<div class="S-cols">';
    ['1','2','3','4'].forEach(function(sid){
      const sS=allShows.filter(s=>s.sala==sid);
      html+='<div class="S-block"><div class="S-head"><span class="S-htit">'+sid+' — '+sn(sid)+'</span><span class="S-hline"></span></div>';
      sS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
        const ds=di>=0?DAB[di]+' '+String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        html+='<div class="S-row">'
          +'<span class="S-d">'+ds+'</span>'
          +'<span class="S-t">'+s.start+'</span>'
          +'<span class="S-f">'+(film?film.title:'?')+'</span>'
          +'<span class="S-dur">'+(film&&film.duration?durFmt(film.duration):'')+'</span>'
          +'<span class="S-e">'+s.end+'</span></div>';
      });
      html+='</div>';
    });
    html+='</div>';
  }
  else if(type==='giorno'){
    html=hdr('Programmazione Giornaliera — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cols">';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dS=allShows.filter(s=>s.day===ds);if(!dS.length)return;
      html+='<div class="G-block">';
      html+='<div class="G-chapter"><span class="G-day">'+DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</span><span class="G-line"></span></div>';
      dS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId);
        html+='<div class="G-row">'
          +'<span class="G-t">'+s.start+'</span>'
          +'<span class="G-s">'+sn(s.sala)+'</span>'
          +'<span class="G-f">'+(film?film.title:'?')+'</span>'
          +'<span class="G-dur">'+(film&&film.duration?durFmt(film.duration):'')+'</span>'
          +'<span class="G-e">'+s.end+'</span></div>';
      });
      html+='</div>';
    });
    html+='</div>';
  }
  else if(type==='cards-poster'){
    // Formato poster 70x100 cm — schede film grandi, griglia 4 colonne
    const posterCSS=`
      @page{size:700mm 1000mm;margin:14mm;}
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;background:#fff;line-height:1.3;}
      h1{font-size:22px;font-weight:900;margin-bottom:4px;color:#111;}
      .sub{font-size:13px;color:#777;margin-bottom:14px;}
      .poster-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
      .film-card{border:1px solid #e0e0e0;border-top:4px solid #f0801a;border-radius:5px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}
      .fc-header{padding:8px 10px 6px;border-bottom:1px solid #eee;}
      .fc-title{font-size:15px;font-weight:800;line-height:1.3;color:#f0801a;}
      .fc-meta{font-size:10px;color:#aaa;margin-top:3px;line-height:1.5;}
      .fc-body{padding:6px 10px;}
      .fc-day{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;}
      .fc-day-name{font-size:10px;font-weight:700;text-transform:uppercase;color:#555;min-width:72px;}
      .fc-slots{display:flex;flex-wrap:wrap;gap:4px;}
      .fc-slot{display:inline-flex;align-items:center;gap:3px;background:#fff8f0;border:1px solid #f0c080;border-radius:3px;padding:2px 6px;}
      .fc-slot-time{font-size:11px;font-weight:700;color:#333;}
      .fc-slot-sala{font-size:9px;color:#999;}
      .poster-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f0801a;padding-bottom:10px;margin-bottom:16px;}
      .cinema-name{font-size:13px;color:#999;}
    `;
    html='<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+posterCSS+'</style></head><body>';
    const wd2p=wdates();const daysp=wdays();
    html+='<div class="poster-header">';
    html+='<div><h1>Programmazione Settimanale</h1>';
    html+='<div class="sub">'+fd(daysp[0])+' — '+fd(daysp[6])+'</div></div>';
    html+='<div class="cinema-name">Cinema Multisala<br>Teatro Mendrisio</div>';
    html+='</div>';
    html+='<div class="poster-grid">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating].filter(Boolean).join(' · ');
      const byDay={};
      fS.forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      html+='<div class="film-card">'
        +'<div class="fc-header"><div class="fc-title">'+f.title+'</div><div class="fc-meta">'+meta+'</div></div>'
        +'<div class="fc-body">';
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd2p.indexOf(ds);
        const dayLabel=di>=0?dayShort(ds,daysp,wd2p):'?';
        html+='<div class="fc-day"><span class="fc-day-name">'+dayLabel+'</span><div class="fc-slots">';
        byDay[ds].sort((a,b)=>a.start.localeCompare(b.start)).forEach(function(s){
          html+='<span class="fc-slot"><span class="fc-slot-time">'+s.start+'</span><span class="fc-slot-sala">'+sn(s.sala)+'</span></span>';
        });
        html+='</div></div>';
      });
      html+='</div></div>';
    });
    html+='</div></body></html>';
    const blobP=new Blob([html],{type:'text/html;charset=utf-8'});
    const urlP=URL.createObjectURL(blobP);
    const aP=document.createElement('a');
    aP.href=urlP;
    aP.download='programmazione-poster-70x100-'+wdates()[0]+'.html';
    document.body.appendChild(aP);aP.click();document.body.removeChild(aP);
    setTimeout(()=>URL.revokeObjectURL(urlP),5000);
    toast('Poster 70×100 cm generato — apri e stampa con Cmd+P','ok');
    return;
  }
  else if(type==='compatto'){
    html=hdr('Programma Settimanale — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cols">';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dS=allShows.filter(s=>s.day===ds);if(!dS.length)return;
      html+='<div class="D-chapter"><span class="D-day">'+DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</span><span class="D-line"></span></div>';
      dS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId);
        html+='<div class="D-row"><span class="D-t">'+s.start+'</span><span class="D-s">'+sn(s.sala)+'</span><span class="D-f">'+(film?film.title:'?')+'</span><span class="D-d">'+(film&&film.duration?durFmt(film.duration):'')+'</span></div>';
      });
    });
    html+='</div>';
  }
  else if(type==='cartelli'){
    html='<style>@page{size:A4 landscape;margin:12mm;}</style>'+hdr('Cartelli Film — Cinema Multisala Teatro Mendrisio');
    const filmIds=[...new Set(allShows.map(s=>s.filmId))];
    filmIds.forEach(function(fid){
      const film=S.films.find(f=>f.id===fid);
      const fS=allShows.filter(s=>s.filmId===fid);
      if(!film||!fS.length)return;
      const meta=[film.distributor,film.duration?durFmt(film.duration):'',film.rating||'',film.genre].filter(Boolean).join(' · ');
      // byDay includes ALL shows for this film (not just current week)
      const byDay={};
      S.shows.filter(function(s){return s.filmId===fid;}).forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      // Martedi e Mercoledi settimana precedente
      const prevTue=new Date(days[0]);prevTue.setDate(prevTue.getDate()-2);
      const prevWed=new Date(days[0]);prevWed.setDate(prevWed.getDate()-1);
      const allCartDays=[prevTue,prevWed].concat(days);
      const allCartDAB=['Mar','Mer'].concat(DAB);
      const dayCells=allCartDays.map(function(d,di){
        const ds=toLocalDate(d);
        const dS=byDay[ds]||[];
        const isPrev=di<2;
        const dn=allCartDAB[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+(isPrev?' ▸':' ');
        const rows=dS.length
          ? dS.slice().sort(function(a,b){return a.start.localeCompare(b.start);}).map(function(s){return '<div class="cart-show-row"><span class="cart-show-time">'+s.start+'</span><span class="cart-show-sala">'+sn(s.sala)+'</span></div>';}).join('')
          : '<div class="cart-no-show">—</div>';
        return '<div class="cart-day-card'+(isPrev?' cart-prev-day':'')+'">'
          +'<div class="cart-day-head"><div class="cart-day-name">'+dn+'</div></div>'
          +'<div class="cart-day-body">'+rows+'</div>'
          +'</div>';
      }).join('');
      const posterHTML=film.poster
        ? '<img class="cart-poster-img" src="'+film.poster+'" alt="">'
        : '<div class="cart-poster-ph">🎬</div>';
      html+='<div class="cart-page">'
        +'<div class="cart-header"><span class="cart-title">'+film.title+'</span><span class="cart-meta">'+meta+'</span></div>'
        +'<div class="cart-left-col">'+posterHTML+'</div>'
        +'<div class="cart-right-col"><div class="cart-days-grid">'+dayCells+'</div></div>'
        +'</div>';
    });
  }


  else if(type==='cards-new'){
    const LOGO_TAG='<img class="cn-logo" src="'+LOGO+'" alt="">';
    const DAB2=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

    // ⚠️  DUPLICATO — questa funzione esiste identica anche in js/stampa.js
    // Se modifichi il calcolo font, aggiorna ENTRAMBI i file.
    function cnLayout(n){
      var cfgs=[[1,1],[1,2],[1,3],[2,2],[2,3],[2,3],[3,3],[3,3],[3,3],[2,5],[3,4],[3,4],[2,7],[3,5],[3,5],[4,5],[4,5],[4,5],[4,5],[4,5],[5,5],[5,5],[5,5],[5,5],[5,5],[5,6],[5,6],[5,6],[5,6],[5,6],[5,7],[5,7],[5,7],[5,7],[5,7]];
      var cfg=n<=35?cfgs[n-1]:cfgs[34];
      var rows=cfg[0],cols=cfg[1];
      // Altezza disponibile reale: pagina landscape 190mm − header 16mm − padding 8mm = ~166mm
      var availH=166;
      var cellH=(availH-rows*3)/rows; // sottrae gap tra celle
      // timePt: font size orario in pt. Cap 58pt (celle alte), minimo 9pt
      var timePt=Math.min(58,Math.max(9,Math.round(cellH*0.50/0.353)));
      var dayPt=Math.max(6,Math.round(timePt*0.38));
      var subPt=Math.max(5,Math.round(timePt*0.30));
      return{rows:rows,cols:cols,timePt:timePt,dayPt:dayPt,subPt:subPt};
    }

    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' · ');
      const byDay={};
      fS.forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      const slots=[];
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd.indexOf(ds);
        const dayName=di>=0?DAB2[di]:'?';
        const dayDate=di>=0?String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        byDay[ds].sort((a,b)=>a.start.localeCompare(b.start)).forEach(function(s){
          slots.push({dayName:dayName,dayDate:dayDate,start:s.start,sala:sn(s.sala)});
        });
      });
      const n=slots.length;
      const lay=cnLayout(n);
      const total=lay.rows*lay.cols;
      while(slots.length<total)slots.push(null);

      const posterHTML2=f.poster
        ?'<div class="cn-poster"><img src="'+f.poster+'" alt=""></div>'
        :'<div class="cn-poster"><span class="cn-poster-ph">🎬</span></div>';

      html+='<div class="cn-page">';
      html+='<div class="cn-header">'+LOGO_TAG+'<span class="cn-cinema">Cinema Multisala Teatro Mendrisio</span></div>';
      html+='<div class="cn-body">';
      html+='<div class="cn-left">'+posterHTML2
        +'<div class="cn-title">'+f.title+'</div>'
        +'<div class="cn-meta">'+meta+'</div>'
        +'</div>';
      html+='<div class="cn-right" style="grid-template-columns:repeat('+lay.cols+',1fr);grid-template-rows:repeat('+lay.rows+',1fr)">';
      slots.slice(0,total).forEach(function(sl){
        if(sl){
          html+='<div class="cn-slot">'
            +'<div class="cn-top" style="font-size:'+lay.dayPt+'pt">'
              +'<span class="cn-day">'+sl.dayName+'</span>'
              +' <span class="cn-date">'+sl.dayDate+'</span>'
            +'</div>'
            +'<div class="cn-middle">'
              +'<span class="cn-time" style="font-size:'+lay.timePt+'pt">'+sl.start+'</span>'
              +'<span class="cn-sala" style="font-size:'+lay.subPt+'pt">'+sl.sala+'</span>'
            +'</div>'
            +'</div>';
        } else {
          html+='<div class="cn-slot cn-empty"></div>';
        }
      });
      html+='</div></div></div>';
    });
  }
  else if(type==='cards'){
    html=hdr('Programma Settimanale — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cards-grid">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' · ');
      // Group shows by day
      const byDay={};
      fS.forEach(function(s){
        if(!byDay[s.day])byDay[s.day]=[];
        byDay[s.day].push(s);
      });
      // Raccoglie tutti gli slot ordinati per data+orario
      const allSlots=[];
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd.indexOf(ds);
        const dayName=di>=0?DAB[di]:'?';
        const dayDate=di>=0?String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        byDay[ds].forEach(function(s){
          allSlots.push({dayName,dayDate,start:s.start,sala:sn(s.sala)});
        });
      });
      // Riempi fino a 9 slot (griglia 3x3)
      while(allSlots.length<9)allSlots.push(null);
      html+='<div class="film-card">'
        +'<div class="fc-header"><div class="fc-title">'+f.title+'</div><div class="fc-meta">'+meta+'</div></div>'
        +'<div class="fc-body">';
      allSlots.slice(0,9).forEach(function(sl){
        if(sl){
          html+='<div class="fc-slot-block">'
            +'<div class="fc-slot-day">'+sl.dayName+'</div>'
            +'<div class="fc-slot-date">'+sl.dayDate+'</div>'
            +'<div class="fc-slot-time">'+sl.start+'</div>'
            +'<div class="fc-slot-sala">'+sl.sala+'</div>'
            +'</div>';
        } else {
          html+='<div class="fc-slot-block" style="opacity:.15"><div class="fc-slot-day">—</div></div>';
        }
      });
      html+='</div></div>';
    });
    html+='</div>';
  }


  // ── Genera il PDF tramite Blob URL (non richiede popup) ──
  const pageOverride=type==='cartelli'?'<style>@page{size:A4 landscape!important;margin:12mm;}body{width:277mm;}</style>':landscape?'<style>@page{size:A4 landscape!important;margin:12mm;}body{width:277mm;}</style>':'';
  const fullHTML='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+CN+'</title>'+PDF_STYLE+pageOverride+'</head><body>'+html+'</body></html>';
  const blob=new Blob([fullHTML],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  // Use download attribute to avoid popup blocker
  const typeNames={titolo:'per-titolo',sala:'per-sala',giorno:'giornaliero',
    cartelli:'cartelli',compatto:'compatto',cards:'schede'};
  const wd2=wdates();
  const fname='programmazione-'+(typeNames[type]||type)+(landscape?'-orizzontale':'')+'-'+wd2[0]+'.html';
  a.download=fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},10000);
  toast('PDF in download — apri il file e usa Cmd+P per stampare','ok');
}
window.pPDF=pPDF;

// ── BOOKING PDF helper ────────────────────────────────────
function buildBookCard(b,type,today){
  var isOA=type==='openair';
  var accent=isOA?'#0d5c8a':'#e84a4a';
  var linkedFilm=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
  var filmName=linkedFilm?linkedFilm.title:(b.oaFilmTitle||'');
  var displayName=isOA&&filmName?filmName:b.name;
  var upDates=(b.dates||[]).filter(function(d){return d.date>=(today||'');}).slice(0,6);
  var allDates=b.dates||[];
  var showDates=upDates.length?upDates:allDates.slice(0,4);
  var card='<div class="bk-card" style="border-top:3px solid '+accent+'">';
  card+='<div class="bk-head" style="background:'+accent+'11">';
  card+='<div class="bk-type" style="color:'+accent+'">'+(isOA?(b.postazione||'CineTour Open Air'):(type||'evento').toUpperCase())+'</div>';
  card+='<div class="bk-name">'+displayName+'</div>';
  if(isOA&&b.location)card+='<div class="bk-sub">'+b.location+'</div>';
  if(!isOA&&b.contact)card+='<div class="bk-sub">'+b.contact+'</div>';
  card+='</div><div class="bk-body">';
  if(b.seats)card+=b.seats+' posti riservati<br>';
  if(b.oaDistributor)card+=b.oaDistributor+'<br>';
  if(isOA&&linkedFilm&&linkedFilm.distributor)card+=linkedFilm.distributor+'<br>';
  showDates.forEach(function(d){
    var p=d.date.split('-');
    card+=p[2]+'/'+p[1]+' '+d.start+(d.end?' - '+d.end:'')+'<br>';
  });
  if(allDates.length>showDates.length)card+='<span style="color:#aaa;font-size:10px">+ altre '+(allDates.length-showDates.length)+' date</span><br>';
  if(b.note)card+=b.note;
  card+='</div></div>';
  return card;
}
function pPDFBook(type){
  var days=wdays();var wd=wdates();
  var today=toLocalDate(new Date());
  var curMonth=today.slice(0,7);
  var CN=window.CINEMA_CONFIG.nome;
  var books=S.bookings||[];
  var title='';
  if(type==='book-week'){
    title='Prenotazioni -- '+fd(days[0])+' / '+fd(days[6]);
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return wd.includes(d.date);});});
  } else if(type==='book-oa'){
    title='CineTour Open Air -- Stagione Completa';
    books=books.filter(function(b){return b.type==='openair';});
  } else if(type==='book-future'){
    title='Prossimi Eventi';
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date>=today;});});
  } else if(type==='book-month'){
    var mLabel=new Date().toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    title='Prenotazioni '+mLabel.charAt(0).toUpperCase()+mLabel.slice(1);
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date.slice(0,7)===curMonth;});});
  }
  books.sort(function(a,b2){
    var aD=(a.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    var bD=(b2.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    return aD>bD?1:-1;
  });
  var BTYPE={openair:'CineTour Open Air',privato:'Evento Privato',compleanno:'Compleanno / Ricorrenza',scolastica:'Proiezione Scolastica',ricorrente:'Evento Ricorrente'};
  var css='@page{size:A4 portrait;margin:15mm;}body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px;}.hdr-title{font-size:16px;font-weight:700;}.hdr-sub{font-size:11px;color:#555;}.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.bk-card{border:1px solid #ddd;border-radius:6px;overflow:hidden;break-inside:avoid;}.bk-head{padding:8px 12px;}.bk-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}.bk-name{font-size:13px;font-weight:700;color:#111;margin-bottom:1px;}.bk-sub{font-size:11px;color:#555;}.bk-body{padding:7px 12px;border-top:1px solid #eee;font-size:11px;color:#444;line-height:1.8;}.bk-sect{font-size:12px;font-weight:700;color:#333;border-left:3px solid #e84a4a;padding-left:8px;margin:14px 0 8px;}';
  var dateStr=new Date().toLocaleDateString('it-IT');
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>';
  html+='<div class="hdr"><div><div class="hdr-title">'+title+'</div><div class="hdr-sub">'+CN+'</div></div><div class="hdr-sub">'+dateStr+'</div></div>';
  if(type==='book-future'){
    ['openair','privato','compleanno','scolastica','ricorrente'].forEach(function(t){
      var tBooks=books.filter(function(b){return b.type===t;});
      if(!tBooks.length)return;
      html+='<div class="bk-sect">'+(BTYPE[t]||t)+'</div><div class="bk-grid">';
      tBooks.forEach(function(b){html+=buildBookCard(b,t,today);});
      html+='</div>';
    });
  } else {
    html+='<div class="bk-grid">';
    books.forEach(function(b){html+=buildBookCard(b,b.type,today);});
    html+='</div>';
  }
  html+='</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=u;
  a.download='prenotazioni-'+type+'-'+toLocalDate(new Date())+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(u);},10000);
  toast('PDF in download — apri il file e usa Cmd+P per stampare','ok');
}
window.pPDFBook=pPDFBook;window.buildBookCard=buildBookCard;

// ══════════════════════════════════════════════════════════
// MONITOR FOYER
// Gestione playlist per i 6 monitor del foyer cinema.
// Dati salvati in Firestore: collection 'monitors', doc id = '1'..'6'
// Ogni doc: { orient:'h'|'v', sec:7, items:[{type,filmId,url,videoId,sec,enabled}] }
// ══════════════════════════════════════════════════════════

let _monitorId=1; // monitor attualmente selezionato
let _monitorData={}; // cache dati per tutti i monitor

// ── Inizializza tab monitor ──
function monitorInit(){
  selectMonitor(1);
}
window.monitorInit=monitorInit;

// ── Seleziona monitor ──
function selectMonitor(id){
  _monitorId=id;
  // Aggiorna tab buttons
  for(let i=1;i<=6;i++){
    const btn=document.getElementById('mtab-'+i);
    if(btn)btn.className=i===id?'btn ba':'btn bg';
  }
  // Aggiorna URL display
  const base=location.origin+location.pathname.replace('index.html','').replace(/\/[^/]*$/,'/');
  const urlEl=document.getElementById('mon-url');
  const idEl=document.getElementById('mon-url-id');
  if(urlEl)urlEl.textContent=base+'monitor.html?id='+id+'&orient='+(_monitorData[id]?.orient||'h')+'&sec='+(_monitorData[id]?.sec||7);
  if(idEl)idEl.textContent=id;
  // Carica dati
  loadMonitorData(id);
}
window.selectMonitor=selectMonitor;

// ── Carica dati monitor da Firestore ──
async function loadMonitorData(id){
  try{
    const{getDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const snap=await getDoc(doc(db,'monitors',String(id)));
    const data=snap.exists()?snap.data():{orient:'h',sec:7,items:[]};
    _monitorData[id]=data;
    renderMonitorUI(id,data);
  }catch(e){
    console.error('Monitor load error',e);
  }
}

// ── Render UI monitor ──
function renderMonitorUI(id,data){
  if(_monitorId!==id)return;
  const orient=document.getElementById('mon-orient');
  const sec=document.getElementById('mon-sec');
  if(orient)orient.value=data.orient||'h';
  if(sec)sec.value=data.sec||7;
  // Aggiorna URL
  const base=location.origin+location.pathname.replace(/\/[^/]*$/,'/');
  const urlEl=document.getElementById('mon-url');
  if(urlEl)urlEl.textContent=base+'monitor.html?id='+id+'&orient='+(data.orient||'h')+'&sec='+(data.sec||7);
  renderMonitorPlaylist(data.items||[]);
}

// ── Render playlist ──
function renderMonitorPlaylist(items){
  const wrap=document.getElementById('mon-playlist');
  if(!wrap)return;
  if(!items.length){
    wrap.innerHTML='<div style="font-size:12px;color:var(--txt2);padding:20px;text-align:center;border:1px dashed var(--bdr);border-radius:8px">Nessun elemento — aggiungi film, video o trailer YouTube</div>';
    return;
  }
  wrap.innerHTML=items.map((item,i)=>{
    const enabled=item.enabled!==false;
    let label='',icon='';
    if(item.type==='film'){
      const film=S.films.find(f=>f.id===item.filmId);
      label=film?film.title:'Film non trovato';icon='🎬';
    } else if(item.type==='video'){
      label=item.url||'URL video';icon='▶';
    } else if(item.type==='youtube'){
      label=item.videoId||'ID YouTube';icon='▶';
    }
    const secVal=item.sec||0;
    return `<div style="display:flex;align-items:center;gap:8px;background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:8px 12px;${!enabled?'opacity:.45':''}">
      <span style="font-size:16px;flex-shrink:0">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
        <div style="font-size:10px;color:var(--txt2);margin-top:1px">${item.type==='film'?'Film':'item.type==="video"?"Video MP4":"YouTube"'}${secVal?' · '+secVal+'s':' · durata video'}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn bg bs" onclick="moveMonitorItem(${i},-1)" ${i===0?'disabled':''}>↑</button>
        <button class="btn bg bs" onclick="moveMonitorItem(${i},1)" ${i===items.length-1?'disabled':''}>↓</button>
        <button class="btn bg bs" onclick="toggleMonitorItem(${i})">${enabled?'⏸':'▶'}</button>
        <button class="btn bd bs" onclick="removeMonitorItem(${i})">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Salva meta (orient, sec) ──
async function saveMonitorMeta(){
  const orient=document.getElementById('mon-orient')?.value||'h';
  const sec=parseInt(document.getElementById('mon-sec')?.value||'7',10);
  const data=_monitorData[_monitorId]||{items:[]};
  data.orient=orient;data.sec=sec;
  _monitorData[_monitorId]=data;
  await saveMonitorDoc();
  // Aggiorna URL display
  const base=location.origin+location.pathname.replace(/\/[^/]*$/,'/');
  const urlEl=document.getElementById('mon-url');
  if(urlEl)urlEl.textContent=base+'monitor.html?id='+_monitorId+'&orient='+orient+'&sec='+sec;
}
window.saveMonitorMeta=saveMonitorMeta;

// ── Aggiungi elemento ──
function addMonitorItem(type){
  const data=_monitorData[_monitorId]||{orient:'h',sec:7,items:[]};
  if(!data.items)data.items=[];
  if(type==='film'){
    // Mostra selezione film
    const films=S.films.filter(f=>f.id).sort((a,b)=>a.title.localeCompare(b.title,'it'));
    if(!films.length){toast('Nessun film in archivio','err');return;}
    const filmId=prompt('ID film (o titolo parziale):\n'+films.slice(0,15).map(f=>f.id+' — '+f.title).join('\n'));
    if(!filmId)return;
    const film=S.films.find(f=>f.id===filmId||f.title.toLowerCase().includes(filmId.toLowerCase()));
    if(!film){toast('Film non trovato','err');return;}
    const sec=parseInt(prompt('Secondi visualizzazione (default 7):',7)||7,10);
    data.items.push({type:'film',filmId:film.id,sec,enabled:true});
  } else if(type==='video'){
    const url=prompt('URL del file video MP4 (URL diretta):');
    if(!url)return;
    const sec=parseInt(prompt('Durata massima in secondi (0 = tutta la durata del video):',0)||0,10);
    data.items.push({type:'video',url,sec,enabled:true});
  } else if(type==='youtube'){
    const vid=prompt('URL o ID YouTube (es. https://youtu.be/XXXXX oppure solo XXXXX):');
    if(!vid)return;
    const m=(vid).match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    const videoId=m?m[1]:vid;
    const sec=parseInt(prompt('Durata in secondi (0 = tutta la durata del video, max 4 min):',0)||0,10);
    data.items.push({type:'youtube',videoId,sec,enabled:true});
  }
  _monitorData[_monitorId]=data;
  renderMonitorPlaylist(data.items);
  saveMonitorDoc();
}
window.addMonitorItem=addMonitorItem;

// ── Sposta elemento ──
function moveMonitorItem(idx,dir){
  const items=(_monitorData[_monitorId]||{}).items||[];
  const ni=idx+dir;
  if(ni<0||ni>=items.length)return;
  [items[idx],items[ni]]=[items[ni],items[idx]];
  renderMonitorPlaylist(items);
  saveMonitorDoc();
}
window.moveMonitorItem=moveMonitorItem;

// ── Toggle enable ──
function toggleMonitorItem(idx){
  const items=(_monitorData[_monitorId]||{}).items||[];
  if(!items[idx])return;
  items[idx].enabled=items[idx].enabled===false;
  renderMonitorPlaylist(items);
  saveMonitorDoc();
}
window.toggleMonitorItem=toggleMonitorItem;

// ── Rimuovi elemento ──
function removeMonitorItem(idx){
  const items=(_monitorData[_monitorId]||{}).items||[];
  items.splice(idx,1);
  renderMonitorPlaylist(items);
  saveMonitorDoc();
}
window.removeMonitorItem=removeMonitorItem;

// ── Salva su Firestore ──
async function saveMonitorDoc(){
  try{
    const{setDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const data=_monitorData[_monitorId]||{orient:'h',sec:7,items:[]};
    await setDoc(doc(db,'monitors',String(_monitorId)),data);
    toast('Monitor '+_monitorId+' salvato','ok');
  }catch(e){toast('Errore salvataggio monitor: '+e.message,'err');}
}

// ── Copia URL ──
function copyMonitorUrl(){
  const url=document.getElementById('mon-url')?.textContent||'';
  navigator.clipboard.writeText(url).then(()=>toast('URL copiata','ok')).catch(()=>{
    prompt('Copia questo URL:',url);
  });
}
window.copyMonitorUrl=copyMonitorUrl;

// ── Apri anteprima ──
function openMonitorPreview(){
  const url=document.getElementById('mon-url')?.textContent||'';
  if(url)window.open(url,'_blank');
}
window.openMonitorPreview=openMonitorPreview;





// ── EMAIL ─────────────────────────────────────────────────

// Mail tab navigation
function gMailTab(t){
  if(t==='dist'){const wd=wdates();const days=wdays();const f=document.getElementById('dist-week-from');const tEl=document.getElementById('dist-week-to');if(f&&!f.value)f.value=wd[0];if(tEl&&!tEl.value)tEl.value=wd[6];const s=document.getElementById('dist-subj');if(s&&!s.value.includes(' — '))s.value='Programmazione dei vostri film — Cinema Multisala Teatro Mendrisio — '+fd(days[0])+' / '+fd(days[6]);}
  ['gen','dist','media'].forEach(x=>{
    document.getElementById('mtab-'+x).classList.toggle('on',x===t);
    document.getElementById('mtab-'+x+'-content').style.display=x===t?'block':'none';
  });
}
window.gMailTab=gMailTab;

// ── Destinatari generali ──
async function addMail(){
  const v=document.getElementById('ne').value.trim();
  if(!v||!v.includes('@')){toast('Email non valida','err');return;}
  if(S.emails.includes(v)){toast('Già presente','err');return;}
  S.emails.push(v);document.getElementById('ne').value='';
  await fbSE(S.emails);rem();toast('Aggiunta','ok');
}
async function remMail(e){S.emails=S.emails.filter(x=>x!==e);await fbSE(S.emails);rem();}
function rem(){
  const w=document.getElementById('el');
  if(!S.emails.length){w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun destinatario</div>';return;}
  w.innerHTML=S.emails.map(e=>`<div class="ei"><span>📧 ${e}</span><button class="btn bd bs" onclick="remMail('${e}')">✕</button></div>`).join('');
}
function sendMail(){
  if(!S.emails.length){toast('Aggiungi destinatari','err');return;}
  const subj=encodeURIComponent(document.getElementById('ms').value);
  const note=document.getElementById('mn').value;
  const days=wdays();const wd=wdates();
  let shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let body=`PROGRAMMAZIONE SETTIMANALE\n${fd(days[0])} - ${fd(days[6])}\n\n`;
  if(note)body+=note+'\n\n';
  body+='——————————————————————\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
    body+=`\n${di>=0?DIT[di]+' '+fs(days[di]):s.day}  |  ${s.start}-${s.end}  |  ${sn(s.sala)}  |  ${film?.title||'?'}`;
  });
  body+='\n\n——————————————————————\nInviato da CineManager';
  window.location.href=`mailto:${S.emails.join(',')}?subject=${subj}&body=${encodeURIComponent(body)}`;
  toast('Client email aperto','ok');
}
window.addMail=addMail;window.remMail=remMail;window.sendMail=sendMail;

// ── Distributori (multi-contact) ──
// S.distributors = [{name, contacts:[{email}]}, ...]

async function addDistributor(){
  const name=document.getElementById('dist-name').value.trim();
  if(!name){toast('Inserisci il nome del distributore','err');return;}
  if(!S.distributors)S.distributors=[];
  if(S.distributors.find(d=>d.name.toLowerCase()===name.toLowerCase())){toast('Distributore già presente','err');return;}
  S.distributors.push({name,contacts:[]});
  document.getElementById('dist-name').value='';
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();
  fillDistDropdown();
  toast(name+' aggiunto','ok');
}
async function addDistContact(){
  const sel=document.getElementById('dist-sel').value;
  const email=document.getElementById('dist-contact-email').value.trim();
  if(!sel){toast('Seleziona un distributore','err');return;}
  if(!email||!email.includes('@')){toast('Email non valida','err');return;}
  const dist=S.distributors.find(d=>d.name===sel);
  if(!dist){toast('Distributore non trovato','err');return;}
  if(!dist.contacts)dist.contacts=[];
  if(dist.contacts.find(c=>c.email===email)){toast('Email già presente','err');return;}
  dist.contacts.push({email});
  document.getElementById('dist-contact-email').value='';
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();toast('Contatto aggiunto','ok');
}
async function remDistContact(distName,email){
  const dist=S.distributors.find(d=>d.name===distName);
  if(!dist)return;
  dist.contacts=dist.contacts.filter(c=>c.email!==email);
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();
}
async function remDistributor(name){
  if(!confirm('Eliminare '+name+' e tutti i suoi contatti?'))return;
  S.distributors=S.distributors.filter(d=>d.name!==name);
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();fillDistDropdown();
}
function renderDist(){
  const w=document.getElementById('dist-list');
  if(!w)return;
  if(!S.distributors||!S.distributors.length){
    w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun distributore</div>';return;
  }
  w.innerHTML=S.distributors.map(function(d){
    const contacts=d.contacts||[];
    const hasFilms=S.films.some(f=>(f.distributor||'').toLowerCase()===d.name.toLowerCase());
    const filmBadge=hasFilms?' <span style="color:var(--acc);font-size:10px">(film abbinati)</span>':'';
    const contactRows=contacts.length
      ? contacts.map(function(ct){return '<div class="ei" style="padding:5px 12px"><span style="font-size:12px">📧 '+ct.email+'</span><button class="btn bd bs" onclick="remDistContact(\''+d.name+'\',\''+ct.email+'\')">✕</button></div>';}).join('')
      : '<div style="padding:6px 12px;font-size:11px;color:var(--txt2)">Nessun contatto — aggiungine uno sopra</div>';
    return '<div style="margin-bottom:8px;background:var(--surf2);border:1px solid var(--bdr);border-radius:7px;overflow:hidden">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--bdr)">'
      +'<span style="font-weight:600">🏢 '+d.name+filmBadge+'</span>'
      +'<button class="btn bd bs" onclick="remDistributor(\''+d.name+'\')">✕</button>'
      +'</div>'+contactRows+'</div>';
  }).join('');
  // update dist-sel dropdown
  fillDistDropdown();
}
function fillDistDropdown(){
  const sel=document.getElementById('dist-sel');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Seleziona distributore —</option>';
  (S.distributors||[]).forEach(d=>{
    const o=document.createElement('option');
    o.value=d.name;o.textContent=d.name;
    if(d.name===cur)o.selected=true;
    sel.appendChild(o);
  });
  // Also update film modal dropdown
  fillFilmDistDropdown();
}
function fillFilmDistDropdown(){
  const sel=document.getElementById('fDist');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Nessuno —</option>';
  (S.distributors||[]).forEach(d=>{
    const o=document.createElement('option');
    o.value=d.name;o.textContent=d.name;
    if(d.name===cur)o.selected=true;
    sel.appendChild(o);
  });
}

function distGetRange(){
  const fromEl=document.getElementById('dist-week-from');
  const toEl=document.getElementById('dist-week-to');
  const from=fromEl&&fromEl.value?fromEl.value:wdates()[0];
  const to=toEl&&toEl.value?toEl.value:wdates()[6];
  // Build array of all days in range
  const days=[];
  let cur=new Date(from+'T12:00:00');
  const end=new Date(to+'T12:00:00');
  while(cur<=end){days.push(toLocalDate(cur));cur.setDate(cur.getDate()+1);}
  return{from,to,days};
}
function distSetWeek(){
  const wd=wdates();const days=wdays();
  const fromEl=document.getElementById('dist-week-from');
  const toEl=document.getElementById('dist-week-to');
  if(fromEl)fromEl.value=wd[0];
  if(toEl)toEl.value=wd[6];
  // Update subject
  const subj=document.getElementById('dist-subj');
  if(subj)subj.value='Programmazione dei vostri film — Cinema Multisala Teatro Mendrisio — '+fd(days[0])+' / '+fd(days[6]);
  previewDist();
}
window.distSetWeek=distSetWeek;
window.distGetRange=distGetRange;
function previewDist(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori','err');return;}
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day));
  const box=document.getElementById('dist-preview');
  let html='';
  S.distributors.forEach(function(dist){
    const contacts=(dist.contacts||[]).map(c=>c.email);
    const distFilms=S.films.filter(f=>(f.distributor||'').toLowerCase()===dist.name.toLowerCase());
    if(!distFilms.length&&!contacts.length)return;
    const distShows=shows.filter(s=>distFilms.find(f=>f.id===s.filmId));
    html+='<div style="margin-bottom:8px;padding:8px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;font-size:11px">'
      +'<strong style="color:var(--acc)">'+dist.name+'</strong><br>'
      +'<span style="color:var(--txt2)">Contatti: '+(contacts.length?contacts.join(', '):'<em>nessuno</em>')+'</span><br>'
      +(distFilms.length?'<span style="color:var(--txt2)">Film: '+distFilms.map(f=>f.title).join(', ')+' ('+distShows.length+' spettacoli)</span>':'<span style="color:var(--red);font-size:10px">⚠ Nessun film abbinato</span>')
      +'</div>';
  });
  box.innerHTML=html||'<div style="font-size:11px;color:var(--txt2)">Nessun distributore presente</div>';
}
function buildDistBody(dist){
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day));
  const distFilms=S.films.filter(f=>(f.distributor||'').toLowerCase()===dist.name.toLowerCase());
  if(!distFilms.length)return null;
  const distShows=shows.filter(s=>distFilms.find(f=>f.id===s.filmId));
  if(!distShows.length)return null;
  const LINE='\u2014'.repeat(30);
  let body='Gentile '+dist.name+',\n\n';
  body+='di seguito la programmazione dei vostri film\n';
  body+='per la settimana '+fd(days[0])+' - '+fd(days[6])+':\n';
  body+='\n'+LINE+'\n';
  distFilms.forEach(function(film){
    const fShows=distShows.filter(s=>s.filmId===film.id).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
    if(!fShows.length)return;
    const meta=[film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'',film.rating,film.genre].filter(Boolean).join(' - ');
    body+='\n'+film.title.toUpperCase();
    if(meta)body+='  ('+meta+')';
    body+='\n\n';
    const byDay={};
    fShows.forEach(s=>{if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
    Object.keys(byDay).sort().forEach(function(ds){
      const di=wd.indexOf(ds);
      const dayLabel=di>=0?DIT[di]+' '+fs(days[di]):ds;
      const times=byDay[ds].map(s=>s.start+' ('+sn(s.sala)+')').join('   ');
      body+=dayLabel+':\n'+times+'\n\n';
    });
  });
  body+=LINE+'\n';
  body+=window.CINEMA_CONFIG.nome;
  return body;
}
async function sendDistMails(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori prima','err');return;}
  const range=distGetRange();
  const subj=document.getElementById('dist-subj').value||'Programmazione dei vostri film';

  // Costruisce lista distributori con email e corpo email
  const queue=[];
  for(const dist of S.distributors){
    const contacts=(dist.contacts||[]).map(function(c){return c.email;}).filter(Boolean);
    if(!contacts.length)continue;
    const body=buildDistBody(dist,range);
    if(!body)continue;
    queue.push({name:dist.name,emails:contacts,subject:subj,body:body});
  }

  if(!queue.length){
    toast('Nessun film in programmazione per i distributori con contatti nel periodo selezionato','ok');
    return;
  }

  // Apre il modale sequenziale
  openDistMailModal(queue,0);
}
window.sendDistMails=sendDistMails;

// Stato modale
var _distMailQueue=[];
var _distMailIdx=0;

function openDistMailModal(queue,idx){
  _distMailQueue=queue;
  _distMailIdx=idx;
  renderDistMailModal();
  document.getElementById('ovDistMail').classList.add('on');
}
window.openDistMailModal=openDistMailModal;

function renderDistMailModal(){
  var q=_distMailQueue;
  var idx=_distMailIdx;
  var total=q.length;
  var item=q[idx];
  if(!item)return;

  // Contatore
  document.getElementById('dm-counter').textContent=(idx+1)+' di '+total;
  document.getElementById('dm-progress').style.width=Math.round((idx+1)/total*100)+'%';

  // Info distributore
  document.getElementById('dm-dist-name').textContent=item.name;
  document.getElementById('dm-dist-email').textContent=item.emails.join(', ');

  // Anteprima corpo email (primi 300 char)
  var preview=item.body.slice(0,400)+(item.body.length>400?'\n[...]':'');
  document.getElementById('dm-preview').textContent=preview;

  // Pulsanti navigazione
  var prevBtn=document.getElementById('dm-prev');
  var nextBtn=document.getElementById('dm-next');
  prevBtn.style.display=idx>0?'inline-flex':'none';
  nextBtn.textContent=idx<total-1?'Prossimo →':'✓ Fine';
  nextBtn.style.background=idx<total-1?'':'var(--acc)';
  nextBtn.style.color=idx<total-1?'':'#000';
}
window.renderDistMailModal=renderDistMailModal;

function dmOpenEmail(){
  var item=_distMailQueue[_distMailIdx];
  if(!item)return;
  var mailto='mailto:'+item.emails.join(',');
  mailto+='?subject='+encodeURIComponent(item.subject);
  mailto+='&body='+encodeURIComponent(item.body);
  window.location.href=mailto;
  // Marca come aperta
  document.getElementById('dm-open-btn').textContent='✓ Aperta';
  document.getElementById('dm-open-btn').style.background='rgba(74,232,122,.2)';
  document.getElementById('dm-open-btn').style.color='#4ae87a';
  document.getElementById('dm-open-btn').style.borderColor='rgba(74,232,122,.4)';
}
window.dmOpenEmail=dmOpenEmail;

function dmNext(){
  var total=_distMailQueue.length;
  if(_distMailIdx>=total-1){
    // Fine — chiudi modale
    document.getElementById('ovDistMail').classList.remove('on');
    toast(_distMailQueue.length+' email gestite','ok');
    return;
  }
  _distMailIdx++;
  // Reset pulsante "Apri"
  var btn=document.getElementById('dm-open-btn');
  btn.textContent='📧 Apri nel client email';
  btn.style.background='';btn.style.color='';btn.style.borderColor='';
  renderDistMailModal();
}
window.dmNext=dmNext;

function dmPrev(){
  if(_distMailIdx<=0)return;
  _distMailIdx--;
  var btn=document.getElementById('dm-open-btn');
  btn.textContent='📧 Apri nel client email';
  btn.style.background='';btn.style.color='';btn.style.borderColor='';
  renderDistMailModal();
}
window.dmPrev=dmPrev;



function circSetWeek(){var wd=wdates();var f=document.getElementById('circ-from-date');var t=document.getElementById('circ-to-date');if(f)f.value=wd[0];if(t)t.value=wd[6];}
window.circSetWeek=circSetWeek;
function previewCircolare(){
  var el=document.getElementById('circ-preview');if(!el)return;
  if(!S.distributors||!S.distributors.length){el.innerHTML='<span style="color:var(--red)">Nessun distributore</span>';return;}
  var emails=[];S.distributors.forEach(function(d){(d.contacts||[]).forEach(function(ct){if(ct.email&&emails.indexOf(ct.email)<0)emails.push(ct.email);});});
  var from=(document.getElementById('circ-from')||{value:''}).value||'(non impostato)';
  var fd2=(document.getElementById('circ-from-date')||{value:''}).value;
  var td2=(document.getElementById('circ-to-date')||{value:''}).value;
  var pl=(fd2&&td2)?(fd2.split('-').reverse().join('/')+' → '+td2.split('-').reverse().join('/')):'settimana corrente';
  var h='<div style="margin-bottom:5px"><strong style="color:var(--acc)">'+emails.length+'</strong> destinatari CCN</div>';
  h+='<div style="font-size:10px;color:var(--txt2);margin-bottom:4px">Da: <strong>'+from+'</strong> · '+pl+'</div>';
  h+=emails.length?'<div style="font-size:10px;color:var(--txt2);word-break:break-all;max-height:70px;overflow-y:auto">'+emails.join(', ')+'</div>':'<div style="color:var(--red);font-size:11px">Nessun contatto email</div>';
  el.innerHTML=h;
}
window.previewCircolare=previewCircolare;
function sendCircolare(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori prima','err');return;}
  var emails=[];S.distributors.forEach(function(d){(d.contacts||[]).forEach(function(ct){if(ct.email&&emails.indexOf(ct.email)<0)emails.push(ct.email);});});
  if(!emails.length){toast('Nessun contatto email','err');return;}
  var fromEmail=((document.getElementById('circ-from')||{value:''}).value).trim();
  var subj=(document.getElementById('circ-subj')||{value:'Programmazione Settimanale'}).value||'Programmazione Settimanale';
  var note=((document.getElementById('circ-note')||{value:''}).value).trim();
  var fromDate=(document.getElementById('circ-from-date')||{value:wdates()[0]}).value||wdates()[0];
  var toDate=(document.getElementById('circ-to-date')||{value:wdates()[6]}).value||wdates()[6];
  var range=[];var cur=new Date(fromDate+'T12:00:00');var endD=new Date(toDate+'T12:00:00');
  while(cur<=endD){range.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
  var shows=S.shows.filter(function(s){return range.indexOf(s.day)>=0;});
  var SEP='─'.repeat(44);
  var lines=['CINEMA MULTISALA TEATRO MENDRISIO',''];
  lines.push('Gentili Distributori,');lines.push('');
  if(note){lines.push(note);lines.push('');}
  lines.push('di seguito la programmazione settimanale dei vostri film');
  lines.push('dal '+fromDate.split('-').reverse().join('/')+' al '+toDate.split('-').reverse().join('/'));
  lines.push('');lines.push(SEP);
  var fids=[];shows.forEach(function(s){if(fids.indexOf(s.filmId)<0)fids.push(s.filmId);});
  fids.map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean)
    .sort(function(a,b){return a.title.localeCompare(b.title,'it');})
    .forEach(function(film){
      var fs2=shows.filter(function(s){return s.filmId===film.id;}).sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
      if(!fs2.length)return;
      var dur=film.duration?(Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0')):'';
      lines.push('');lines.push(film.title+(dur||film.rating?' ('+[dur,film.rating].filter(Boolean).join(' · ')+')':''));
      var bd={};fs2.forEach(function(s){if(!bd[s.day])bd[s.day]=[];bd[s.day].push(s);});
      Object.keys(bd).sort().forEach(function(ds){
        var d=new Date(ds+'T12:00:00');var dl=d.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
        dl=dl.charAt(0).toUpperCase()+dl.slice(1);
        var bds={};bd[ds].forEach(function(s){if(!bds[s.sala])bds[s.sala]=[];bds[s.sala].push(s.start);});
        Object.keys(bds).sort().forEach(function(sala){
          lines.push('  '+dl+' → '+bds[sala].join(' / ')+'  ('+sn(sala)+')');
        });
      });
      lines.push('');lines.push(SEP);
    });
  lines.push('');lines.push(window.CINEMA_CONFIG.nome);
  var body=lines.join('\n');
  var mailto='mailto:'+(fromEmail||'');
  mailto+='?bcc='+encodeURIComponent(emails.join(','));
  mailto+='&subject='+encodeURIComponent(subj);
  mailto+='&body='+encodeURIComponent(body);
  window.location.href=mailto;toast(emails.length+' destinatari CCN','ok');
}
window.sendCircolare=sendCircolare;

window.addDistributor=addDistributor;window.addDistContact=addDistContact;window.remDistContact=remDistContact;window.remDistributor=remDistributor;window.renderDist=renderDist;window.fillDistDropdown=fillDistDropdown;window.fillFilmDistDropdown=fillFilmDistDropdown;window.previewDist=previewDist;window.sendDistMails=sendDistMails;

// ── Media ──
async function addMedia(){
  const name=document.getElementById('media-name').value.trim();
  const email=document.getElementById('media-email').value.trim();
  if(!name||!email||!email.includes('@')){toast('Nome e email obbligatori','err');return;}
  if(!S.media)S.media=[];
  if(S.media.find(m=>m.email===email)){toast('Già presente','err');return;}
  S.media.push({name,email});
  document.getElementById('media-name').value='';
  document.getElementById('media-email').value='';
  await fbSetDoc(db,'settings','media',{list:S.media});
  renderMedia();toast('Media aggiunto','ok');
}
async function remMedia(email){
  S.media=S.media.filter(m=>m.email!==email);
  await fbSetDoc(db,'settings','media',{list:S.media});
  renderMedia();
}
function renderMedia(){
  const w=document.getElementById('media-list');
  if(!S.media||!S.media.length){
    w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun media</div>';return;
  }
  w.innerHTML=S.media.map(m=>`<div class="ei"><span>📰 <strong>${m.name}</strong> — ${m.email}</span><button class="btn bd bs" onclick="remMedia('${m.email}')">✕</button></div>`).join('');
}
function genCSVLink(){
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let csv='Data,Giorno,Ora,Fine,Sala,Film,Durata,Distributore\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId);
    const di=wd.indexOf(s.day);
    const dataFmt=di>=0?fs(days[di]):'';
    const giorno=di>=0?DIT[di]:'';
    const row=[dataFmt,giorno,s.start,s.end,sn(s.sala),
      '"'+(film?.title||'').replace(/"/g,'""')+'"',
      film?.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'',
      '"'+(film?.distributor||'').replace(/"/g,'""')+'"'
    ].join(',');
    csv+=row+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const box=document.getElementById('csv-link-box');
  box.style.display='block';
  box.innerHTML=`<a href="${url}" download="programmazione_${fd(days[0]).replace(/\//g,'-')}.csv" style="color:var(--acc)">⬇ Scarica CSV programmazione</a><br><span style="font-size:10px;color:var(--txt2)">${shows.length} spettacoli esportati</span>`;
  toast('CSV pronto','ok');
}
async function sendMediaMails(){
  if(!S.media||!S.media.length){toast('Aggiungi media','err');return;}
  const subj=encodeURIComponent(document.getElementById('media-subj').value);
  const note=document.getElementById('media-note').value;
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let body=`PROGRAMMAZIONE SETTIMANALE\nCinema Multisala Teatro Mendrisio\n${fd(days[0])} - ${fd(days[6])}\n\n`;
  if(note)body+=note+'\n\n';
  body+='——————————————\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
    body+=`\n${di>=0?DIT[di]+' '+fs(days[di]):s.day}  ${s.start}  ${sn(s.sala)}  ${film?.title||'?'}`;
  });
  body+='\n\n——————————————\nInviato da CineManager\nhttps://lucamora1970.github.io/cinemanager';
  const to=S.media.map(m=>m.email).join(',');
  window.location.href=`mailto:${to}?subject=${subj}&body=${encodeURIComponent(body)}`;
  toast('Client email aperto','ok');
}
window.addMedia=addMedia;window.remMedia=remMedia;window.genCSVLink=genCSVLink;window.sendMediaMails=sendMediaMails;



// ── OPEN AIR ─────────────────────────────────────────────
function toggleLocation(){
  const sala=document.getElementById('mSala').value;
  const isOA=sala==='OA1'||sala==='OA2';
  // Show/hide location field
  const locRow=document.getElementById('locationRow');
  if(locRow)locRow.style.display=isOA?'block':'none';
  // Hide sala row label when OA (sala already known)
  const salaRow=document.getElementById('salaRow');
  if(salaRow)salaRow.style.display=isOA?'none':'block';
  // Switch fasce buttons
  const fn=document.getElementById('fasceNormal');
  const fo=document.getElementById('fasceOA');
  if(fn)fn.style.display=isOA?'none':'flex';
  if(fo)fo.style.display=isOA?'flex':'none';
  // Pre-set time for OA
  if(isOA&&!document.getElementById('mStart').value){
    document.getElementById('mStart').value='21:00';
    syncFasce();ce();
  }
  // Hide suggestion box for OA (not relevant)
  const sb=document.getElementById('suggBox');
  if(sb)sb.style.display=isOA?'none':sb.style.display;
}
async function toggleOA(active){
  S.oaActive=active;
  await setDoc(doc(db,'settings','oa'),{active});
  renderOAToggle();renderOA();
}
function renderOAToggle(){
  const sec=document.getElementById('oa-section');
  if(sec)sec.style.display='block';
  const tog=document.getElementById('oaToggle');
  if(tog)tog.checked=S.oaActive;
}
function renderOA(){
  const body=document.getElementById('oa-body');
  if(!body)return;
  if(!S.oaActive){
    body.innerHTML='<div style="padding:12px 16px;font-size:12px;color:var(--txt2)">Attiva il toggle per gestire le proiezioni Open Air</div>';
    return;
  }
  const days=wdays();const wd=wdates();
  const oaCount=S.oaShows.filter(function(s){return wd.includes(s.day);}).length;
  const cnt=document.getElementById('oa-count');
  if(cnt){cnt.style.display=oaCount?'inline':'none';cnt.textContent=oaCount+' proiezioni';}
  const canEdit=!!currentUser;
  body.innerHTML='';
  ['OA1','OA2'].forEach(function(oaId){
    const oaInfo=OA_SALES[oaId];
    const wrap=document.createElement('div');
    wrap.style.cssText='padding:10px 16px;border-bottom:1px solid var(--bdr)';
    const head=document.createElement('div');
    head.style.cssText='font-size:12px;font-weight:700;color:var(--txt);margin-bottom:8px;display:flex;align-items:center;gap:6px';
    head.innerHTML='<span style="width:10px;height:10px;border-radius:50%;background:'+oaInfo.col+';display:inline-block"></span>'+oaInfo.n;
    wrap.appendChild(head);
    const grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(7,1fr);gap:6px';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dayShow=S.oaShows.find(function(s){return s.sala===oaId&&s.day===ds;});
      const cell=document.createElement('div');
      cell.style.cssText='background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;padding:6px;min-height:70px';
      const dayLabel=DIT[di].slice(0,3)+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
      const dlEl=document.createElement('div');
      dlEl.style.cssText='font-size:9px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:4px';
      dlEl.textContent=dayLabel;
      cell.appendChild(dlEl);
      if(dayShow){
        const film=S.films.find(function(f){return f.id===dayShow.filmId;});
        const card=document.createElement('div');
        card.className='oa-card';
        card.onclick=function(){editShow(dayShow.id);};
        if(canEdit){
          const del=document.createElement('button');
          del.className='oa-del';del.textContent='×';
          del.onclick=function(e){e.stopPropagation();delShow(dayShow.id);};
          card.appendChild(del);
        }
        card.innerHTML+='<div class="oa-film">'+(film?film.title:'?')+'</div>'
          +'<div class="oa-location">📍 '+(dayShow.location||'')+'</div>'
          +'<div class="oa-time">'+dayShow.start+'</div>';
        cell.appendChild(card);
      } else if(canEdit){
        const add=document.createElement('div');
        add.className='oa-add';add.textContent='＋ Aggiungi';
        add.onclick=function(){openShowSlot(ds,'21:30',oaId);};
        cell.appendChild(add);
      }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    body.appendChild(wrap);
  });
}
window.toggleOA=toggleOA;window.toggleLocation=toggleLocation;

// ── PRENOTAZIONI ─────────────────────────────────────────
const BOOK_TYPES={openair:'CineTour Open Air',privato:'Evento Privato',compleanno:'Compleanno',scolastica:'Scolastica',ricorrente:'Ricorrente'};
let _bDates=[]; // [{date,start,end}]

function onBTypeChange(){
  const t=document.getElementById('bType').value;
  const isOA=t==='openair';
  document.getElementById('oaFields').style.display=isOA?'block':'none';
  const nonOaFields=['bNameRow','bContactRow','bFilmRow','bNoteRow'];
  nonOaFields.forEach(function(id){const el=document.getElementById(id);if(el)el.style.display=isOA?'none':'';});
  if(isOA){
    const pno=document.getElementById('bOAPrenNo');if(pno)pno.checked=true;
    const sno=document.getElementById('bOAScarNo');if(sno)sno.checked=true;
    fillOAFilmDropdown();
    fillOADistDropdown();
    // OA usa sempre mode manuale
    setBMode('manual');
  } else {
    // Non-OA: torna a mode exist
    setBMode('exist');
    fillBShows();
  }
}
function fillOAFilmDropdown(){
  const sel=document.getElementById('bOAFilm');
  if(!sel)return;
  sel.innerHTML='<option value="">— Seleziona film —</option>';
  S.films.forEach(function(f){
    const o=document.createElement('option');o.value=f.id;o.textContent=f.title;sel.appendChild(o);
  });
}
function fillOADistDropdown(){
  const sel=document.getElementById('bOADistSel');
  if(!sel)return;
  sel.innerHTML='<option value="">— Seleziona —</option>';
  (S.distributors||[]).forEach(function(d){
    const o=document.createElement('option');o.value=d.name;o.textContent=d.name;sel.appendChild(o);
  });
}
function onOAFilmMode(){
  const mode=document.querySelector('input[name="bOAFilmMode"]:checked')?.value||'arch';
  document.getElementById('bOAFilm').style.display=mode==='arch'?'block':'none';
  document.getElementById('bOAFilmFree').style.display=mode==='free'?'block':'none';
  document.getElementById('bOADistRow').style.display=mode==='free'?'block':'none';
}
window.onBTypeChange=onBTypeChange;window.onOAFilmMode=onOAFilmMode;
function setBMode(mode){
  document.getElementById('bMode').value=mode;
  document.getElementById('bExistPanel').style.display=mode==='exist'?'block':'none';
  document.getElementById('bManualPanel').style.display=mode==='manual'?'block':'none';
  document.getElementById('bModeExist').style.borderColor=mode==='exist'?'var(--acc)':'var(--bdr)';
  document.getElementById('bModeExist').style.color=mode==='exist'?'var(--acc)':'var(--txt2)';
  document.getElementById('bModeManual').style.borderColor=mode==='manual'?'var(--acc)':'var(--bdr)';
  document.getElementById('bModeManual').style.color=mode==='manual'?'var(--acc)':'var(--txt2)';
  if(mode==='exist')fillBShows();
  if(mode==='manual'){fillBManualFilms();}
}
function fillBShows(){
  const sel=document.getElementById('bWeekSel').value;
  const days=sel==='next'?wdays().map(function(d){const nd=new Date(d);nd.setDate(nd.getDate()+7);return nd;}):wdays();
  const wd=days.map(function(d){return toLocalDate(d);});
  const shows=S.shows.filter(function(s){return wd.includes(s.day);});
  const films=[...new Set(shows.map(function(s){return s.filmId;}))];
  const fsel=document.getElementById('bFilmSel');
  fsel.innerHTML='<option value="">— Seleziona film —</option>';
  films.forEach(function(fid){
    const film=S.films.find(function(f){return f.id===fid;});
    if(!film)return;
    const o=document.createElement('option');o.value=fid;o.textContent=film.title;fsel.appendChild(o);
  });
  document.getElementById('bShowSel').innerHTML='<option value="">— Prima seleziona film —</option>';
  document.getElementById('bShowInfo').style.display='none';
}
function fillBShowTimes(){
  const fid=document.getElementById('bFilmSel').value;
  const sel=document.getElementById('bWeekSel').value;
  const days=sel==='next'?wdays().map(function(d){const nd=new Date(d);nd.setDate(nd.getDate()+7);return nd;}):wdays();
  const wd=days.map(function(d){return toLocalDate(d);});
  const shows=S.shows.filter(function(s){return wd.includes(s.day)&&s.filmId===fid;}).sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
  const ssel=document.getElementById('bShowSel');
  ssel.innerHTML='<option value="">— Seleziona spettacolo —</option>';
  shows.forEach(function(s){
    const di=wd.indexOf(s.day);
    const dayLabel=di>=0?DIT[di]+' '+fs(days[di]):'';
    const o=document.createElement('option');o.value=s.id;o.textContent=dayLabel+' '+s.start+' — '+sn(s.sala);ssel.appendChild(o);
  });
  document.getElementById('bShowInfo').style.display='none';
}
function onBShowSelect(){
  const sid=document.getElementById('bShowSel').value;
  if(!sid){document.getElementById('bShowInfo').style.display='none';return;}
  const show=S.shows.find(function(s){return s.id===sid;});
  if(!show)return;
  document.getElementById('bLinkedShowId').value=sid;
  const film=S.films.find(function(f){return f.id===show.filmId;});
  const info=document.getElementById('bShowInfo');
  info.style.display='block';
  info.textContent=(film?film.title:'?')+' · '+sn(show.sala)+' · '+show.start+' → '+show.end;
}
function fillBManualFilms(){
  const sel=document.getElementById('bFilmManual');
  if(!sel)return;
  sel.innerHTML='<option value="">— Nessun film specifico —</option>';
  S.films.forEach(function(f){
    const o=document.createElement('option');o.value=f.id;o.textContent=f.title;sel.appendChild(o);
  });
}
function openBook(tipoIniziale){
  document.getElementById('ovBookT').textContent='Nuova Prenotazione';
  ['bId','bLinkedShowId'].forEach(function(id){document.getElementById(id).value='';});
  ['bName','bContact','bNote','bOAVia'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('bSeats').value='';
  var tipo=tipoIniziale||'compleanno';
  document.getElementById('bType').value=tipo;
  document.getElementById('bSala').value='1';
  _bDates=[];
  renderBDates();
  var oaCId=document.getElementById('bOAClienteId');if(oaCId)oaCId.value='';
  var oaLId=document.getElementById('bOALuogoId');if(oaLId)oaLId.value='';
  var oaInfo=document.getElementById('bOALuogoInfo');if(oaInfo)oaInfo.style.display='none';
  // Reset campi OA testo
  ['bOAName','bOAContact','bOANote','bOACliente','bLocation','bOAKm'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  var kmRes=document.getElementById('bOAKmResult');if(kmRes)kmRes.style.display='none';
  fillOAClienteDropdown();fillOALuogoDropdown();
  // Attiva il tipo corretto
  onBTypeChange();
  // Per OA usa sempre modalità manuale (date libere)
  if(tipo==='openair'){
    setBMode('manual');
  } else {
    setBMode('exist');
    fillBShows();
  }
  document.getElementById('ovBook').classList.add('on');
}
function editBook(id){
  const b=S.bookings.find(function(x){return x.id===id;});if(!b)return;
  document.getElementById('ovBookT').textContent='Modifica Prenotazione';
  document.getElementById('bId').value=id;
  document.getElementById('bName').value=b.name||'';
  document.getElementById('bContact').value=b.contact||'';
  document.getElementById('bSeats').value=b.seats||'';
  document.getElementById('bNote').value=b.note||'';
  document.getElementById('bType').value=b.type||'compleanno';
  document.getElementById('bLinkedShowId').value=b.linkedShowId||'';
  _bDates=(b.dates||[]).slice();
  renderBDates();
  // Restore OA fields if needed
  if(document.getElementById('bType'))document.getElementById('bType').value=b.type||'compleanno';
  onBTypeChange();
  if(b.type==='openair'){
    fillOAClienteDropdown();fillOALuogoDropdown();
    if(document.getElementById('bOAVersione'))document.getElementById('bOAVersione').value=b.oaVersione||'IT';
    if(document.getElementById('bLocation'))document.getElementById('bLocation').value=b.location||'';
    if(document.getElementById('bOAVia'))document.getElementById('bOAVia').value=b.oaVia||'';
    if(document.getElementById('bOAKm'))document.getElementById('bOAKm').value=b.oaKm||'';
    // Mostra km se già calcolato
    var kmEl=document.getElementById('bOAKmResult');
    if(kmEl&&b.oaKm){
      kmEl.textContent='🚗 A/R: '+b.oaKm+' km (da archivio)';
      kmEl.style.color='var(--grn)';
      kmEl.style.display='block';
    }
    if(document.getElementById('bOACliente'))document.getElementById('bOACliente').value=b.oaCliente||'';
    if(document.getElementById('bOAClienteId'))document.getElementById('bOAClienteId').value=b.oaClienteId||'';
    if(document.getElementById('bOALuogoId')){
      document.getElementById('bOALuogoId').value=b.oaLuogoId||'';
      if(b.oaLuogoId)setTimeout(function(){oaFillLuogoFromSel();},50);
    }
    if(document.getElementById('bOAName'))document.getElementById('bOAName').value=b.name||'';
    if(document.getElementById('bOAContact'))document.getElementById('bOAContact').value=b.contact||'';
    if(document.getElementById('bOANote'))document.getElementById('bOANote').value=b.note||'';
    // Film mode (archivio o titolo libero)
    const fMode=b.oaFilmMode||'arch';
    const fmEl=document.querySelector('input[name="bOAFilmMode"][value="'+fMode+'"]');
    if(fmEl){fmEl.checked=true;}
    if(fMode==='arch'){
      if(document.getElementById('bOAFilm')&&b.filmId)document.getElementById('bOAFilm').value=b.filmId;
    } else {
      if(document.getElementById('bOAFilmFree'))document.getElementById('bOAFilmFree').value=b.oaFilmTitle||'';
      // Distributore
      const distSel=document.getElementById('bOADistSel');
      const distFree=document.getElementById('bOADistFree');
      if(b.oaDistributor){
        // Prova a selezionarlo nel dropdown, altrimenti campo libero
        let found=false;
        if(distSel){Array.from(distSel.options).forEach(o=>{if(o.value===b.oaDistributor){distSel.value=b.oaDistributor;found=true;}});}
        if(!found&&distFree)distFree.value=b.oaDistributor;
      }
      if(document.getElementById('bOADistRow'))document.getElementById('bOADistRow').style.display='block';
    }
    // Trigger per aggiornare visibilità distributore
    if(typeof onOAFilmMode==='function')onOAFilmMode();
    // Radios prenotato/scaricato
    const pVal=b.oaPrenotato||'no';
    const pEl=document.querySelector('input[name="bOAPrenotato"][value="'+pVal+'"]');
    if(pEl)pEl.checked=true;
    const sVal=b.oaScaricato||'no';
    const sEl=document.querySelector('input[name="bOAScaricato"][value="'+sVal+'"]');
    if(sEl)sEl.checked=true;
    setBMode('manual');
    document.getElementById('ovBook').classList.add('on');
    return;
  }
  if(b.linkedShowId){
    setBMode('exist');
    // Pre-select the linked show info
    const show=S.shows.find(function(s){return s.id===b.linkedShowId;});
    if(show){
      const film=S.films.find(function(f){return f.id===show.filmId;});
      const info=document.getElementById('bShowInfo');
      info.style.display='block';
      info.textContent=(film?film.title:'?')+' · '+sn(show.sala)+' · '+show.start+' → '+show.end;
    }
  } else {
    setBMode('manual');
    if(b.sala)document.getElementById('bSala').value=b.sala;
    fillBManualFilms();
    if(b.filmId)document.getElementById('bFilmManual').value=b.filmId;
  }
  document.getElementById('ovBook').classList.add('on');
}
function addBookDate(){
  // Determina se siamo in modalità OA
  const isOA=document.getElementById('bType')?.value==='openair';
  // Legge data dal campo visibile
  let el=null;
  document.querySelectorAll('#ovBook input[type="date"]').forEach(function(inp){
    if(inp.offsetParent!==null&&!el)el=inp;
  });
  if(!el){toast('Campo data non trovato','err');return;}
  let d=el.value||'';
  if(!d&&el.valueAsDate){
    const vd=el.valueAsDate;
    const local=new Date(vd.getTime()+vd.getTimezoneOffset()*60000);
    d=local.getFullYear()+'-'+String(local.getMonth()+1).padStart(2,'0')+'-'+String(local.getDate()).padStart(2,'0');
  }
  if(!d){d=el.getAttribute('value')||'';}
  if(!d){toast('Seleziona una data','err');return;}
  // Legge orari dal campo corretto (OA: bOAStart/bOAEnd, non-OA: bStart/bEnd)
  const sId=isOA?'bOAStart':'bStart';
  const eId=isOA?'bOAEnd':'bEnd';
  const s=document.getElementById(sId)?.value||'';
  const e=document.getElementById(eId)?.value||'';
  if(_bDates.find(x=>x.date===d)){toast('Data già aggiunta','err');return;}
  _bDates.push({date:d,start:s,end:e});
  _bDates.sort((a,b)=>a.date.localeCompare(b.date));
  renderBDates();
  el.value='';el.removeAttribute('value');
}
function removeBookDate(date){
  _bDates=_bDates.filter(x=>x.date!==date);
  renderBDates();
}
function renderBDates(){
  const isOA=document.getElementById('bType')?.value==='openair';
  const containerId=isOA?'bOADates':'bDates';
  const w=document.getElementById(containerId);
  if(!w)return;
  if(!_bDates.length){w.innerHTML='<span style="font-size:11px;color:var(--txt2);padding:4px">Nessuna data aggiunta</span>';return;}
  w.innerHTML='';
  const bookId=document.getElementById('bId')?.value||'';
  _bDates.forEach(function(x,idx){
    const di=x.date.split('-');
    const label=di[2]+'/'+di[1]+' '+x.start+(x.end?' → '+x.end:'');
    const chip=document.createElement('span');
    chip.className='date-chip';
    chip.style.cssText='cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px';
    chip.dataset.date=x.date;
    // Indicatore stato dossier
    const ds=x.dossier;
    const statusDot=document.createElement('span');
    statusDot.title=ds?.status==='confermata'?'Confermata':ds?.status==='annullata'?'Annullata':'Standby';
    statusDot.style.cssText='width:7px;height:7px;border-radius:50%;flex-shrink:0;background:'+(ds?.status==='confermata'?'#4ae87a':ds?.status==='annullata'?'#e84a4a':'#888');
    // Label cliccabile per editare orario
    const lbl=document.createElement('span');
    lbl.textContent=label;
    lbl.style.cssText='cursor:pointer;text-decoration:underline dotted';
    lbl.onclick=function(e){e.stopPropagation();openBDateEdit(idx);};
    // Bottone dossier (solo OA)
    chip.appendChild(statusDot);
    chip.appendChild(lbl);
    if(isOA){
      const btnD=document.createElement('button');
      btnD.textContent='📋';
      btnD.title='Apri dossier evento';
      btnD.style.cssText='background:none;border:none;cursor:pointer;font-size:11px;padding:0 2px';
      btnD.onclick=function(e){e.stopPropagation();openOADossier(bookId,idx);};
      chip.appendChild(btnD);
    }
    // Bottone rimozione
    const btn=document.createElement('button');
    btn.textContent='×';
    btn.title='Rimuovi';
    btn.onclick=function(e){e.stopPropagation();removeBookDate(x.date);};
    chip.appendChild(btn);
    w.appendChild(chip);
  });
}

function openBDateEdit(idx){
  // Chiudi eventuale editor già aperto
  const existing=document.getElementById('bDateEditBox');
  if(existing)existing.remove();
  const x=_bDates[idx];
  if(!x)return;
  // Crea mini-form sovrapposto
  const box=document.createElement('div');
  box.id='bDateEditBox';
  box.style.cssText='position:fixed;z-index:3000;background:var(--surf);border:1px solid var(--bdr-strong);border-radius:10px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,.18);min-width:280px;max-width:95vw';
  box.innerHTML=
    '<div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Modifica data e orario</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:end">'
      +'<div><label style="font-size:10px;color:var(--txt2);display:block;margin-bottom:3px">Data</label>'
        +'<input type="date" id="bDateEditDate" value="'+x.date+'" style="width:100%;font-size:12px;padding:5px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt)"></div>'
      +'<div><label style="font-size:10px;color:var(--txt2);display:block;margin-bottom:3px">Inizio</label>'
        +'<input type="time" id="bDateEditStart" value="'+x.start+'" style="width:100%;font-size:12px;padding:5px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt)"></div>'
      +'<div><label style="font-size:10px;color:var(--txt2);display:block;margin-bottom:3px">Fine</label>'
        +'<input type="time" id="bDateEditEnd" value="'+(x.end||'')+'" style="width:100%;font-size:12px;padding:5px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt)"></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
      +'<button id="bDateEditCancel" style="padding:6px 14px;border:1px solid var(--bdr);border-radius:6px;background:none;cursor:pointer;font-size:12px;color:var(--txt2)">Annulla</button>'
      +'<button id="bDateEditSave" style="padding:6px 14px;border:none;border-radius:6px;background:#f0801a;color:#fff;cursor:pointer;font-size:12px;font-weight:600">✓ Salva</button>'
    +'</div>';
  document.body.appendChild(box);
  // Posiziona al centro dello schermo
  box.style.top='50%';box.style.left='50%';
  box.style.transform='translate(-50%,-50%)';
  // Overlay per chiudere cliccando fuori
  const ov=document.createElement('div');
  ov.id='bDateEditOv';
  ov.style.cssText='position:fixed;inset:0;z-index:2999';
  ov.onclick=function(){box.remove();ov.remove();};
  document.body.insertBefore(ov,box);
  // Focus sulla data
  const dateEl=document.getElementById('bDateEditDate');
  if(dateEl)dateEl.focus();
  // Handlers
  document.getElementById('bDateEditCancel').onclick=function(){box.remove();ov.remove();};
  document.getElementById('bDateEditSave').onclick=function(){
    const newDate=document.getElementById('bDateEditDate').value;
    const newStart=document.getElementById('bDateEditStart').value;
    const newEnd=document.getElementById('bDateEditEnd').value;
    if(!newDate||!newStart){toast('Data e orario inizio obbligatori','err');return;}
    // Controlla duplicati (escludi la data corrente)
    const otherDates=_bDates.filter(function(_,i){return i!==idx;});
    if(otherDates.find(function(d){return d.date===newDate;})){toast('Data già presente','err');return;}
    _bDates[idx]={date:newDate,start:newStart,end:newEnd};
    _bDates.sort(function(a,b){return a.date.localeCompare(b.date);});
    renderBDates();
    box.remove();ov.remove();
  };
}
window.openBDateEdit=openBDateEdit;
function removeBD(el){removeBookDate(el.dataset.date);}
window.removeBD=removeBD;

// ── OA DOSSIER PER DATA ────────────────────────────────────
let _oaDossierBookId='';
let _oaDossierIdx=0;

function openOADossier(bookId,idx){
  const b=S.bookings.find(function(x){return x.id===bookId;});
  if(!b&&bookId){toast('Salva prima la prenotazione','err');return;}
  // Se non ancora salvata, usa _bDates direttamente
  const dates=b?b.dates:_bDates;
  const x=dates?dates[idx]:null;
  if(!x)return;
  _oaDossierBookId=bookId;
  _oaDossierIdx=idx;
  const d=x.dossier||{};
  const di=x.date.split('-');
  const dateLabel=di[2]+'/'+di[1]+'/'+di[0]+' '+x.start+(x.end?' → '+x.end:'');
  // Luogo info
  const luogo=S.oaLuoghi.find(function(l){return l.id===(b?.oaLuogoId||'');});
  document.getElementById('oaDossierTitle').textContent='📋 Dossier — '+dateLabel;
  // Luogo info con km
  var luogoInfo='';
  if(luogo){
    luogoInfo=luogo.nome+(luogo.comune?' — '+luogo.comune:'');
    if(luogo.kmAR)luogoInfo+=' · 🚗 '+luogo.km+' km andata | '+luogo.kmAR+' km A/R ('+luogo.minAR+' min)';
  } else if(b?.oaKm){
    luogoInfo='🚗 '+b.oaKm+' km A/R';
  }
  document.getElementById('oaDLuogoInfo').textContent=luogoInfo;  // Fase 1: commerciale
  document.getElementById('oaDRisProv').checked=!!(d.risProv);
  document.getElementById('oaDRisConf').checked=!!(d.risConf);
  document.getElementById('oaDLuogoScelto').checked=!!(d.luogoScelto);
  document.getElementById('oaDConfirmaSent').checked=!!(d.confirmaSent);
  document.getElementById('oaDConfirmaSigned').checked=!!(d.confirmaSigned);
  // Fase 2: servizi
  ['sedie','bibita','popcorn','pubblicita'].forEach(function(s){
    var el=document.getElementById('oaDS_'+s);if(el)el.checked=!!(d.servizi&&d.servizi[s]);
  });
  document.getElementById('oaDSpettAnnunciati').value=d.spettAnnunciati||'';
  // Fase 3: film
  document.getElementById('oaDFilmRichiesto').checked=!!(d.filmRichiesto);
  document.getElementById('oaDFilmConfermato').checked=!!(d.filmConfermato);
  document.getElementById('oaDFilmInArchivio').checked=!!(d.filmInArchivio);
  document.getElementById('oaDFilmCabina').value=d.filmCabina||'';
  // Fase 4: status
  document.querySelectorAll('input[name="oaDStatus"]').forEach(function(r){r.checked=r.value===(d.status||'standby');});
  document.getElementById('oaDStatusAt').textContent=d.statusAt?new Date(d.statusAt).toLocaleString('it-IT'):'';
  // Fase 5: operativo
  document.getElementById('oaDTimerStart').value=d.timerStart||'';
  document.getElementById('oaDTimerEnd').value=d.timerEnd||'';
  document.getElementById('oaDSpettEff').value=d.spettEff||'';
  document.getElementById('oaDOsservazioni').value=d.osservazioni||'';
  // Fase 5b: foto e addetti
  oaDossierRenderFoto(d.foto||[]);
  oaDossierRenderAddetti(d.addettiAssegnati||[]);
  // Fase 6: amministrativa
  document.getElementById('oaDFattura').checked=!!(d.fatturaEmessa);
  document.getElementById('oaDChiuso').checked=!!(d.chiuso);
  document.getElementById('ovOADossier').classList.add('on');
}
window.openOADossier=openOADossier;

function oaDossierRenderAddetti(assegnati){
  var w=document.getElementById('oaDAddettiChecks');
  if(!w)return;
  if(!S.oaAddetti.length){w.innerHTML='<span style="font-size:11px;color:var(--txt2)">Nessun addetto in archivio</span>';return;}
  w.innerHTML=S.oaAddetti.map(function(a){
    var checked=(assegnati||[]).includes(a.id)?'checked':'';
    return '<label class="oa-check">'
      +'<input type="checkbox" class="oa-addetto-chk" value="'+a.id+'" '+checked+' style="accent-color:'+a.color+'">'
      +'<span style="display:inline-flex;align-items:center;gap:5px">'
        +'<span style="width:12px;height:12px;border-radius:50%;background:'+a.color+';flex-shrink:0"></span>'
        +a.nome+(a.ruolo?' <span style="color:var(--txt2);font-size:10px">— '+a.ruolo+'</span>':'')
      +'</span>'
      +'</label>';
  }).join('');
}
window.oaDossierRenderAddetti=oaDossierRenderAddetti;

function printOADossier(){
  const b=S.bookings.find(function(x){return x.id===_oaDossierBookId;});
  if(!b)return;
  const x=b.dates?b.dates[_oaDossierIdx]:null;
  if(!x)return;
  const d=x.dossier||{};
  const luogo=S.oaLuoghi.find(function(l){return l.id===b.oaLuogoId;});
  const cliente=S.oaClienti.find(function(c){return c.id===b.oaClienteId;});
  const di=x.date.split('-');
  const dateLabel=di[2]+'/'+di[1]+'/'+di[0]+' '+x.start+(x.end?' → '+x.end:'');
  const CN=window.CINEMA_CONFIG.nome;
  const statusColor=d.status==='confermata'?'#1a7a3a':d.status==='annullata'?'#a32d2d':'#555';
  const statusLabel=d.status==='confermata'?'✅ CONFERMATA':d.status==='annullata'?'❌ ANNULLATA':'⏳ STANDBY';
  // Addetti assegnati
  const addettiIds=d.addettiAssegnati||[];
  const addettiAssegnati=S.oaAddetti.filter(function(a){return addettiIds.includes(a.id);});
  var html='<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}'
    +'.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0d5c8a;padding-bottom:8px;margin-bottom:14px}'
    +'.hdr-title{font-size:18px;font-weight:700;color:#0d5c8a}'
    +'.hdr-sub{font-size:10px;color:#555;margin-top:3px}'
    +'.status{font-size:13px;font-weight:700;padding:4px 12px;border-radius:5px;border:2px solid '+statusColor+';color:'+statusColor+'}'
    +'.fase{border:1px solid #ddd;border-radius:6px;margin-bottom:10px;overflow:hidden;break-inside:avoid}'
    +'.fase-hdr{padding:6px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}'
    +'.fase-body{padding:8px 12px}'
    +'.check{display:inline-flex;align-items:center;gap:5px;margin:2px 12px 2px 0;font-size:10px}'
    +'.chk-ok{color:#1a7a3a;font-weight:700} .chk-no{color:#aaa}'
    +'.row{display:flex;gap:8px;margin-bottom:5px;font-size:10px}'
    +'.lbl{color:#666;min-width:130px;flex-shrink:0}'
    +'.foto-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}'
    +'.foto-item{width:120px;height:90px;object-fit:cover;border-radius:4px;border:1px solid #ddd}'
    +'.pdf-item{width:120px;height:90px;border-radius:4px;border:1px solid #ddd;background:#f5f5f5;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;font-size:9px;color:#555}'
    +'.footer{margin-top:14px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#aaa;display:flex;justify-content:space-between}'
    +'</style></head><body>'
    +'<div class="hdr"><div>'
      +'<div class="hdr-title">☀ CineTour Open Air — Dossier Evento</div>'
      +'<div class="hdr-sub">'+CN+' · Generato il '+new Date().toLocaleDateString('it-IT')+' alle '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'</div>'
    +'</div><div class="status">'+statusLabel+'</div></div>'
    // Intestazione evento
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'
      +'<div><div style="font-size:14px;font-weight:700;color:#0d5c8a;margin-bottom:4px">'+b.name+'</div>'
        +(cliente?'<div class="row"><span class="lbl">🏢 Cliente:</span><span>'+cliente.ragione+'</span></div>':'')
        +(cliente?.respOrg?'<div class="row"><span class="lbl">👤 Resp. Org.:</span><span>'+cliente.respOrg+'</span></div>':'')
        +(b.contact?'<div class="row"><span class="lbl">📞 Contatto:</span><span>'+b.contact+'</span></div>':'')
      +'</div>'
      +'<div><div style="font-size:13px;font-weight:700;margin-bottom:4px">📅 '+dateLabel+'</div>'
        +(luogo?'<div class="row"><span class="lbl">📍 Luogo:</span><span>'+luogo.nome+(luogo.comune?' — '+luogo.comune:'')+'</span></div>':'')
        +(b.oaVia?'<div class="row"><span class="lbl">🗺 Via:</span><span>'+b.oaVia+'</span></div>':'')
        +(b.oaKm?'<div class="row"><span class="lbl">🚗 Distanza A/R:</span><span><strong>'+b.oaKm+' km</strong></span></div>':luogo?.kmAR?'<div class="row"><span class="lbl">🚗 Distanza A/R:</span><span><strong>'+luogo.kmAR+' km</strong> ('+luogo.minAR+' min)</span></div>':'')
        +(d.spettAnnunciati?'<div class="row"><span class="lbl">👥 Spett. annunciati:</span><span>'+d.spettAnnunciati+'</span></div>':'')
        +(d.spettEff?'<div class="row"><span class="lbl">👥 Spett. effettivi:</span><span><strong>'+d.spettEff+'</strong></span></div>':'')
      +'</div>'
    +'</div>';
  // Fase 1
  html+='<div class="fase"><div class="fase-hdr" style="background:rgba(56,138,221,.08);color:#185FA5">Fase 1 — Commerciale</div><div class="fase-body">';
  [{id:'risProv',l:'Riservazione provvisoria'},{id:'risConf',l:'Riservazione confermata'},{id:'luogoScelto',l:'Luogo scelto'},{id:'confirmaSent',l:'Conferma inviata'},{id:'confirmaSigned',l:'Conferma firmata ritornata'}].forEach(function(c){
    html+='<span class="check"><span class="'+(d[c.id]?'chk-ok':'chk-no')+'">'+(d[c.id]?'✓':'○')+'</span>'+c.l+'</span>';
  });
  html+='</div></div>';
  // Fase 2
  html+='<div class="fase"><div class="fase-hdr" style="background:rgba(29,158,117,.08);color:#0F6E56">Fase 2 — Servizi</div><div class="fase-body">';
  [{id:'sedie',l:'Sedie'},{id:'bibita',l:'Bibita'},{id:'popcorn',l:'Popcorn'},{id:'pubblicita',l:'Pubblicità'}].forEach(function(c){
    html+='<span class="check"><span class="'+(d.servizi?.[c.id]?'chk-ok':'chk-no')+'">'+(d.servizi?.[c.id]?'✓':'○')+'</span>'+c.l+'</span>';
  });
  html+='</div></div>';
  // Fase 3
  html+='<div class="fase"><div class="fase-hdr" style="background:rgba(186,117,23,.08);color:#633806">Fase 3 — Film</div><div class="fase-body">';
  [{id:'filmRichiesto',l:'Titolo richiesto'},{id:'filmConfermato',l:'Titolo confermato'},{id:'filmInArchivio',l:'Film in archivio'}].forEach(function(c){
    html+='<span class="check"><span class="'+(d[c.id]?'chk-ok':'chk-no')+'">'+(d[c.id]?'✓':'○')+'</span>'+c.l+'</span>';
  });
  if(d.filmCabina)html+='<span class="check" style="margin-left:16px"><strong>Cabina '+d.filmCabina+'</strong></span>';
  html+='</div></div>';
  // Fase 5 operativo
  html+='<div class="fase"><div class="fase-hdr" style="background:rgba(83,74,183,.08);color:#3C3489">Fase 5 — Operativo</div><div class="fase-body">';
  if(d.timerStart)html+='<div class="row"><span class="lbl">⏱ Partenza team:</span><span>'+new Date(d.timerStart).toLocaleString('it-IT')+'</span></div>';
  if(d.timerEnd)html+='<div class="row"><span class="lbl">⏱ Rientro team:</span><span>'+new Date(d.timerEnd).toLocaleString('it-IT')+'</span></div>';
  if(d.timerStart&&d.timerEnd){
    var mins=Math.round((new Date(d.timerEnd)-new Date(d.timerStart))/60000);
    html+='<div class="row"><span class="lbl">⏳ Ore lavoro:</span><span><strong>'+Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0')+'</strong></span></div>';
  }
  if(addettiAssegnati.length)html+='<div class="row"><span class="lbl">👷 Addetti:</span><span>'+addettiAssegnati.map(function(a){return a.nome+(a.ruolo?' ('+a.ruolo+')':'');}).join(', ')+'</span></div>';
  if(d.osservazioni)html+='<div class="row"><span class="lbl">📝 Osservazioni:</span><span>'+d.osservazioni+'</span></div>';
  // Foto
  if(d.foto&&d.foto.length){
    html+='<div style="margin-top:8px;font-size:10px;color:#555;margin-bottom:4px">📷 Foto e documenti ('+d.foto.length+'):</div><div class="foto-grid">';
    d.foto.forEach(function(f){
      if(f.contentType==='application/pdf'){
        html+='<div class="pdf-item"><span style="font-size:24px">📄</span><span>'+f.nome+'</span></div>';
      } else {
        html+='<img class="foto-item" src="'+f.url+'" alt="'+f.nome+'">';
      }
    });
    html+='</div>';
  }
  html+='</div></div>';
  // Fase 6
  html+='<div class="fase"><div class="fase-hdr" style="background:rgba(216,90,48,.08);color:#712B13">Fase 6 — Amministrativa</div><div class="fase-body">';
  [{id:'fatturaEmessa',l:'Fattura emessa'},{id:'chiuso',l:'Evento chiuso e archiviato'}].forEach(function(c){
    html+='<span class="check"><span class="'+(d[c.id]?'chk-ok':'chk-no')+'">'+(d[c.id]?'✓':'○')+'</span>'+c.l+'</span>';
  });
  html+='</div></div>';
  // Luogo — scheda tecnica
  if(luogo){
    html+='<div class="fase"><div class="fase-hdr" style="background:#f5f5f5;color:#333">📍 Scheda tecnica luogo</div><div class="fase-body">';
    if(luogo.capienza)html+='<div class="row"><span class="lbl">👥 Capienza max:</span><span>'+luogo.capienza+' posti</span></div>';
    html+='<div class="row"><span class="lbl">⚡ Allacciamento:</span><span>'+(luogo.elettrico==='si'?'✓ Disponibile':luogo.elettrico==='no'?'✗ Non disponibile':'Non definito')+(luogo.elettricoNote?' — '+luogo.elettricoNote:'')+'</span></div>';
    if(luogo.luci)html+='<div class="row"><span class="lbl">💡 Luci da spegnere:</span><span>'+luogo.luci+'</span></div>';
    if(luogo.vetrine)html+='<div class="row"><span class="lbl">🪟 Vetrine:</span><span>'+luogo.vetrine+'</span></div>';
    if(luogo.strade)html+='<div class="row"><span class="lbl">🚧 Strade:</span><span>'+luogo.strade+'</span></div>';
    if(luogo.accesso)html+='<div class="row"><span class="lbl">🚗 Limite accesso:</span><span>'+luogo.accesso+'</span></div>';
    if(luogo.note)html+='<div class="row"><span class="lbl">📝 Note:</span><span>'+luogo.note+'</span></div>';
    html+='</div></div>';
  }
  html+='<div class="footer"><span>'+CN+' — CineTour Open Air</span><span>Dossier generato il '+new Date().toLocaleDateString('it-IT')+'</span></div>';
  html+='</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var w2=window.open(u,'_blank');
  if(w2)setTimeout(function(){w2.print();},800);
  setTimeout(function(){URL.revokeObjectURL(u);},30000);
}
window.printOADossier=printOADossier;

function oaDossierRenderFoto(fotoArr){
  var w=document.getElementById('oaDFotoList');
  if(!w)return;
  if(!fotoArr||!fotoArr.length){
    w.innerHTML='<span style="font-size:11px;color:var(--txt2)">Nessun file caricato</span>';
    return;
  }
  w.innerHTML=fotoArr.map(function(f,i){
    var isPdf=f.nome&&f.nome.toLowerCase().endsWith('.pdf')||f.contentType==='application/pdf';
    var preview=isPdf
      ? '<div onclick="window.open(\''+f.url+'\',\'_blank\')" title="'+f.nome+'" style="width:80px;height:60px;border-radius:5px;border:1px solid var(--bdr);background:var(--surf2);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:4px">'
          +'<span style="font-size:22px">📄</span>'
          +'<span style="font-size:8px;color:var(--txt2);font-family:monospace">PDF</span>'
        +'</div>'
      : '<img src="'+f.url+'" style="width:80px;height:60px;object-fit:cover;border-radius:5px;border:1px solid var(--bdr);cursor:pointer" onclick="window.open(\''+f.url+'\',\'_blank\')" title="'+f.nome+'">';
    var tipoLabel={'luogo':'📍','serata':'🎬','doc':'📋'}[f.tipo]||'📎';
    return '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;margin:4px">'
      +preview
      +'<span style="font-size:9px;color:var(--txt2);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center" title="'+f.nome+'">'+tipoLabel+' '+f.nome+'</span>'
      +'<button onclick="oaDossierDelFoto('+i+')" style="font-size:9px;background:none;border:none;color:var(--red);cursor:pointer;padding:0">✕</button>'
      +'</div>';
  }).join('');
}
window.oaDossierRenderFoto=oaDossierRenderFoto;

async function oaDossierUploadFoto(input,tipo){
  const files=input.files;
  if(!files||!files.length)return;
  if(!_oaDossierBookId){toast('Salva prima la prenotazione','err');input.value='';return;}
  const allowedTypes=['image/jpeg','image/png','image/gif','image/webp','application/pdf'];
  const maxSize=20*1024*1024;
  // Valida tutti i file prima di caricare
  for(var j=0;j<files.length;j++){
    if(!allowedTypes.includes(files[j].type)){toast('Tipo non supportato: '+files[j].name,'err');input.value='';return;}
    if(files[j].size>maxSize){toast(files[j].name+' supera 20 MB','err');input.value='';return;}
  }
  toast('Caricamento '+(files.length>1?files.length+' file':'file')+'...','ok');
  const {getStorage,ref,uploadBytes,getDownloadURL}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
  const storage=getStorage();
  const b=S.bookings.find(function(x){return x.id===_oaDossierBookId;});
  const dates=(b?.dates||[]).slice();
  const d=(dates[_oaDossierIdx]?.dossier)||{};
  const foto=(d.foto||[]).slice();
  for(var i=0;i<files.length;i++){
    const file=files[i];
    // Estensione dal nome file originale
    const ext=file.name.split('.').pop().toLowerCase();
    const path='oa/'+_oaDossierBookId+'/'+_oaDossierIdx+'/'+tipo+'_'+Date.now()+'_'+i+'.'+ext;
    const storageRef=ref(storage,path);
    await uploadBytes(storageRef,file,{contentType:file.type});
    const url=await getDownloadURL(storageRef);
    foto.push({
      url,
      nome:file.name,
      tipo,
      contentType:file.type,
      size:file.size,
      uploadedAt:new Date().toISOString()
    });
  }
  d.foto=foto;
  dates[_oaDossierIdx]={...dates[_oaDossierIdx],dossier:d};
  await setDoc(doc(db,'bookings',_oaDossierBookId),{...b,dates});
  oaDossierRenderFoto(foto);
  toast(files.length+' file caricati','ok');
  input.value='';
}
window.oaDossierUploadFoto=oaDossierUploadFoto;

async function oaDossierDelFoto(fotoIdx){
  if(!confirm('Rimuovere questo file?'))return;
  const b=S.bookings.find(function(x){return x.id===_oaDossierBookId;});
  if(!b)return;
  const dates=b.dates.slice();
  const d=(dates[_oaDossierIdx]?.dossier)||{};
  const foto=(d.foto||[]).slice();
  foto.splice(fotoIdx,1);
  d.foto=foto;
  dates[_oaDossierIdx]={...dates[_oaDossierIdx],dossier:d};
  await setDoc(doc(db,'bookings',_oaDossierBookId),{...b,dates});
  oaDossierRenderFoto(foto);
}
window.oaDossierDelFoto=oaDossierDelFoto;

async function svOADossier(){
  if(!_oaDossierBookId){toast('Salva prima la prenotazione principale','err');return;}
  const b=S.bookings.find(function(x){return x.id===_oaDossierBookId;});
  if(!b){toast('Prenotazione non trovata','err');return;}
  const dates=b.dates.slice();
  const prevDossier=dates[_oaDossierIdx]?.dossier||{};
  // Status con timestamp se cambiato
  const newStatus=document.querySelector('input[name="oaDStatus"]:checked')?.value||'standby';
  const statusAt=(newStatus!==prevDossier.status)?new Date().toISOString():(prevDossier.statusAt||'');
  const dossier={
    ...prevDossier,
    // Fase 1
    risProv:document.getElementById('oaDRisProv').checked,
    risConf:document.getElementById('oaDRisConf').checked,
    luogoScelto:document.getElementById('oaDLuogoScelto').checked,
    confirmaSent:document.getElementById('oaDConfirmaSent').checked,
    confirmaSigned:document.getElementById('oaDConfirmaSigned').checked,
    // Fase 2
    servizi:{
      sedie:document.getElementById('oaDS_sedie').checked,
      bibita:document.getElementById('oaDS_bibita').checked,
      popcorn:document.getElementById('oaDS_popcorn').checked,
      pubblicita:document.getElementById('oaDS_pubblicita').checked,
    },
    spettAnnunciati:parseInt(document.getElementById('oaDSpettAnnunciati').value)||0,
    // Fase 3
    filmRichiesto:document.getElementById('oaDFilmRichiesto').checked,
    filmConfermato:document.getElementById('oaDFilmConfermato').checked,
    filmInArchivio:document.getElementById('oaDFilmInArchivio').checked,
    filmCabina:document.getElementById('oaDFilmCabina').value,
    // Fase 4
    status:newStatus,statusAt,
    // Fase 5
    timerStart:document.getElementById('oaDTimerStart').value,
    timerEnd:document.getElementById('oaDTimerEnd').value,
    spettEff:parseInt(document.getElementById('oaDSpettEff').value)||0,
    osservazioni:document.getElementById('oaDOsservazioni').value.trim(),
    addettiAssegnati:Array.from(document.querySelectorAll('.oa-addetto-chk:checked')).map(function(el){return el.value;}),
    // Fase 6
    fatturaEmessa:document.getElementById('oaDFattura').checked,
    chiuso:document.getElementById('oaDChiuso').checked,
    updatedAt:new Date().toISOString()
  };
  dates[_oaDossierIdx]={...dates[_oaDossierIdx],dossier};
  await setDoc(doc(db,'bookings',_oaDossierBookId),{...b,dates});
  co('ovOADossier');
  toast('Dossier salvato','ok');
}
window.svOADossier=svOADossier;

async function svBook(){
  const bType0=document.getElementById('bType').value;
  const isOA0=bType0==='openair';
  const name=(isOA0?document.getElementById('bOAName'):document.getElementById('bName'))?.value.trim()||'';
  if(!name){toast('Inserisci il nome evento','err');return;}
  const mode=document.getElementById('bMode').value;
  const linkedShowId=document.getElementById('bLinkedShowId').value;
  if(!isOA0&&mode==='exist'&&!linkedShowId){toast('Seleziona uno spettacolo','err');return;}
  if(mode==='manual'&&!_bDates.length){toast('Aggiungi almeno una data','err');return;}
  const eid=document.getElementById('bId').value;
  const bType=document.getElementById('bType').value;
  const isOA=bType==='openair';
  let dates=_bDates;
  let sala=isOA?(document.getElementById('bOAPost')?.value||'OA1'):salaId(document.getElementById('bSala').value)||document.getElementById('bSala').value;
  const oaFilmMode=document.querySelector('input[name="bOAFilmMode"]:checked')?.value||'arch';
  let filmId='';let oaFilmTitle='';let oaDistributor='';
  if(isOA){
    if(oaFilmMode==='arch'){
      filmId=document.getElementById('bOAFilm')?.value||'';
    } else {
      oaFilmTitle=document.getElementById('bOAFilmFree')?.value||'';
      const distSel=document.getElementById('bOADistSel')?.value||'';
      const distFree=document.getElementById('bOADistFree')?.value||'';
      oaDistributor=distSel||distFree;
    }
  } else {
    filmId='';
  }
  if(mode==='exist'&&linkedShowId){
    const show=S.shows.find(function(s){return s.id===linkedShowId;});
    if(show){
      sala=show.sala;
      filmId=show.filmId;
      dates=[{date:show.day,start:show.start,end:show.end}];
    }
  } else if(!isOA){
    // Per non-OA in modalità manuale, leggi filmId dal selettore manuale
    filmId=document.getElementById('bFilmManual').value||'';
  }
  // Per OA, filmId è già stato impostato dalla sezione OA sopra
  const book={
    id:eid||uid(),
    name,
    type:bType,
    sala,
    filmId,
    location:isOA?(document.getElementById('bLocation')?.value||''):'',
    oaVia:isOA?(document.getElementById('bOAVia')?.value.trim()||''):'',
    oaKm:isOA?(parseFloat(document.getElementById('bOAKm')?.value)||0):0,
    oaClienteId:isOA?(document.getElementById('bOAClienteId')?.value||''):'',
    oaLuogoId:isOA?(document.getElementById('bOALuogoId')?.value||''):'',
    postazione:isOA?(OA_SALES[sala]?.n||sala):'',
    oaFilmTitle:oaFilmTitle,
    oaFilmMode:isOA?oaFilmMode:'',
    oaDistributor:oaDistributor,
    oaVersione:isOA?(document.getElementById('bOAVersione')?.value||'IT'):'',
    oaCliente:isOA?(document.getElementById('bOACliente')?.value.trim()||''):'',
    oaPrenotato:isOA?(document.querySelector('input[name="bOAPrenotato"]:checked')?.value||'no'):'',
    oaScaricato:isOA?(document.querySelector('input[name="bOAScaricato"]:checked')?.value||'no'):'',
    linkedShowId:linkedShowId||'',
    contact:(isOA?document.getElementById('bOAContact'):document.getElementById('bContact'))?.value||'',
    seats:parseInt(document.getElementById('bSeats').value)||0,
    note:(isOA?document.getElementById('bOANote'):document.getElementById('bNote'))?.value||'',
    dates,
    createdBy:eid?undefined:(currentUser?currentUser.email:''),
    createdAt:eid?undefined:new Date().toISOString(),
    updatedBy:currentUser?currentUser.email:'',
    updatedAt:new Date().toISOString()
  };
  await setDoc(doc(db,'bookings',book.id),book);
  co('ovBook');
  toast(eid?'Prenotazione aggiornata':'Prenotazione salvata','ok');
}
async function delBook(id){
  if(!confirm('Eliminare questa prenotazione?'))return;
  await deleteDoc(doc(db,'bookings',id));
  toast('Eliminata','ok');
}
function renderBookings(){
  const w=document.getElementById('book-list');
  if(!w)return;
  const filter=document.getElementById('book-filter')?document.getElementById('book-filter').value:'upcoming';
  const searchRaw=(document.getElementById('book-search')?document.getElementById('book-search').value:'').trim().toLowerCase();
  const sort=document.getElementById('book-sort')?document.getElementById('book-sort').value:'date-asc';
  const today=toLocalDate(new Date());
  let books=S.bookings||[];

  // ── Mostra/nascondi filtro cliente OA ──
  const isOAFilter=filter==='openair'||filter==='upcoming'||filter==='all';
  const clienteWrap=document.getElementById('book-cliente-filter-wrap');
  const clienteSel=document.getElementById('book-cliente-filter');
  const prenWrap=document.getElementById('book-pren-filter-wrap');
  const prenSel=document.getElementById('book-pren-filter');
  if(clienteWrap) clienteWrap.style.display=isOAFilter?'flex':'none';
  if(prenWrap) prenWrap.style.display=isOAFilter?'flex':'none';

  // Popola il select clienti OA se necessario
  if(clienteSel&&isOAFilter){
    const curCliente=clienteSel.value;
    clienteSel.innerHTML='<option value="">Tutti i clienti</option>';
    const oaBooks=books.filter(function(b){return b.type==='openair'&&b.oaClienteId;});
    const usedIds=new Set(oaBooks.map(function(b){return b.oaClienteId;}));
    S.oaClienti.filter(function(c){return usedIds.has(c.id);}).forEach(function(c){
      var o=document.createElement('option');
      o.value=c.id;o.textContent=c.ragione;
      clienteSel.appendChild(o);
    });
    if(curCliente)clienteSel.value=curCliente;
  }

  // ── Filtro tipo ──
  if(filter==='upcoming') books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date>=today;});});
  else if(filter!=='all') books=books.filter(function(b){return b.type===filter;});

  // ── Filtro cliente OA ──
  const clienteId=clienteSel?clienteSel.value:'';
  if(clienteId) books=books.filter(function(b){return b.oaClienteId===clienteId;});

  // ── Filtro prenotato ──
  const prenFiltro=prenSel?prenSel.value:'';
  if(prenFiltro) books=books.filter(function(b){return b.oaPrenotato===prenFiltro;});

  // ── Ricerca full-text ──
  if(searchRaw){
    const terms=searchRaw.split(/\s+/).filter(Boolean);
    books=books.filter(function(b){
      const linkedFilm=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
      const sid=salaId(b.sala);
      const salaNome=sid&&SALE[sid]?SALE[sid].n:(b.postazione||b.sala||'');
      const distrib=linkedFilm?.distributor||b.oaDistributor||'';
      const prenStatoLabel=b.oaPrenotato==='si'?'prenotato si':'prenotato no';
      const haystack=[
        b.name||'',
        b.oaFilmTitle||'',
        linkedFilm?linkedFilm.title:'',
        BOOK_TYPES[b.type]||b.type||'',
        salaNome,
        b.contact||'',
        b.oaCliente||'',
        b.oaDistributor||'',
        distrib,
        b.location||'',
        b.oaVia||'',
        b.note||'',
        b.seats?String(b.seats):'',
        b.postazione||'',
        prenStatoLabel,
        (b.dates||[]).map(function(d){return d.date;}).join(' ')
      ].join(' ').toLowerCase();
      return terms.every(function(t){return haystack.includes(t);});
    });
  }

  // ── Ordinamento ──
  books=books.slice().sort(function(a,b2){
    const aMin=(a.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    const bMin=(b2.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    const aSid=salaId(a.sala);const bSid=salaId(b2.sala);
    const aSala=aSid&&SALE[aSid]?SALE[aSid].n:(a.sala||'');
    const bSala=bSid&&SALE[bSid]?SALE[bSid].n:(b2.sala||'');
    const aType=BOOK_TYPES[a.type]||a.type||'';
    const bType=BOOK_TYPES[b2.type]||b2.type||'';
    switch(sort){
      case 'date-asc':  return aMin>bMin?1:-1;
      case 'date-desc': return aMin<bMin?1:-1;
      case 'name-asc':  return (a.name||'').localeCompare(b2.name||'','it');
      case 'name-desc': return (b2.name||'').localeCompare(a.name||'','it');
      case 'type-asc':  return aType.localeCompare(bType,'it');
      case 'sala-asc':  return aSala.localeCompare(bSala,'it');
      case 'seats-desc':return (b2.seats||0)-(a.seats||0);
      case 'count-desc':return (b2.dates||[]).length-(a.dates||[]).length;
      default: return aMin>bMin?1:-1;
    }
  });

  // ── Contatore ──
  const countEl=document.getElementById('book-count');
  if(countEl)countEl.textContent=books.length+' prenotazion'+(books.length===1?'e':'i');

  if(!books.length){
    w.innerHTML='<div class="empty"><div class="ei2">📋</div><div class="et">'+(searchRaw?'Nessun risultato per "'+searchRaw+'"':'Nessuna prenotazione')+'</div></div>';
    return;
  }

  const canEdit=currentUser&&(currentUser.role==='admin'||currentUser.role==='segretaria'||currentUser.role==='operator');

  // ── Highlight ricerca ──
  function hl(text){
    if(!searchRaw||!text)return text||'';
    const terms=searchRaw.split(/\s+/).filter(Boolean);
    let out=text;
    terms.forEach(function(t){
      const re=new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
      out=out.replace(re,'<mark style="background:#f0801a33;color:inherit;border-radius:2px">$1</mark>');
    });
    return out;
  }

  let h='<div class="lfc-grid">';
  books.forEach(function(b){
    const allDates=b.dates||[];
    const upDates=allDates.filter(function(d){return d.date>=today;});
    const linkedFilm=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
    const isOA=b.type==='openair';
    const title=isOA?(linkedFilm?linkedFilm.title:(b.oaFilmTitle||b.name)):b.name;
    const typeLabel=BOOK_TYPES[b.type]||b.type;
    const accent=isOA?'#0d5c8a':'#e84a4a';
    const sid=salaId(b.sala);
    const salaNome=sid&&SALE[sid]?SALE[sid].n:(b.postazione||b.sala||'');
    const luogoArch=isOA&&b.oaLuogoId?S.oaLuoghi.find(function(l){return l.id===b.oaLuogoId;}):null;
    const clienteArch=isOA&&b.oaClienteId?S.oaClienti.find(function(c){return c.id===b.oaClienteId;}):null;
    const luogoLabel=luogoArch?(luogoArch.nome+(luogoArch.comune?' — '+luogoArch.comune:'')):b.location;
    const clienteLabel=clienteArch?clienteArch.ragione:b.oaCliente;
    // Distributore: da film in archivio o campo libero
    const distributore=isOA?(linkedFilm?.distributor||b.oaDistributor||''):'';
    // Stato prenotazione film
    const prenSi=isOA&&b.oaPrenotato==='si';
    const prenNo=isOA&&b.oaPrenotato==='no';
    const prenLabel=prenSi?'Film Prenotato ✅':prenNo?'Film NON Prenotato ❌':'';
    // Sigla utente
    const uTag=userTag(b.createdBy,b.updatedBy);
    const meta=[typeLabel,salaNome?'🎭 '+salaNome:'',b.contact?'📞 '+b.contact:'',isOA&&luogoLabel?'📍 '+luogoLabel:'',isOA&&b.oaVia?'🗺 '+b.oaVia:'',isOA&&clienteLabel?'👤 '+clienteLabel:'',isOA&&b.oaKm?'🚗 '+b.oaKm+' km A/R':'',b.seats?'💺 '+b.seats+' posti':''].filter(Boolean).join(' · ');
    const showDates=(upDates.length?upDates:allDates).slice(0,8);
    const byDay={};
    showDates.forEach(function(d){if(!byDay[d.date])byDay[d.date]=[];byDay[d.date].push(d);});
    h+='<div class="lfc" style="border-top-color:'+accent+'">';
    h+='<div class="lfc-head">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">';
    h+='<div class="lfc-title" style="color:'+accent+'">'+hl(title)+'</div>';
    if(uTag)h+='<span style="font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.3);border-radius:3px;padding:1px 5px;flex-shrink:0;margin-top:2px" title="'+(b.updatedBy||b.createdBy||'')+'">'+uTag+'</span>';
    h+='</div>';
    // Distributore sotto il titolo
    if(isOA&&distributore) h+='<div style="font-size:11px;font-weight:600;color:var(--txt2);margin-bottom:4px">🏢 '+hl(distributore)+'</div>';
    // Badge Film Prenotato
    if(isOA&&prenLabel){
      var badgeColor=prenSi?'rgba(74,232,122,.15)':'rgba(232,74,74,.12)';
      var badgeBorder=prenSi?'rgba(74,232,122,.4)':'rgba(232,74,74,.35)';
      var badgeTxt=prenSi?'#16a34a':'#e84a4a';
      h+='<div style="display:inline-block;font-size:10px;font-weight:700;color:'+badgeTxt+';background:'+badgeColor+';border:1px solid '+badgeBorder+';border-radius:4px;padding:1px 7px;margin-bottom:5px">'+prenLabel+'</div>';
    }
    h+='<div class="lfc-meta">'+hl(meta)+'</div>';
    h+='<div class="lfc-count" style="background:'+accent+'22;color:'+accent+'">'+allDates.length+' data'+(allDates.length===1?'':'te')+' totali'+(upDates.length?' · '+upDates.length+' future':'')+'</div>';
    h+='</div><div class="lfc-days">';
    Object.keys(byDay).sort().forEach(function(ds){
      const d=new Date(ds+'T12:00:00');
      const dayLabel=d.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
      h+='<div><div class="lfc-day-name">'+dayLabel+'</div><div class="lfc-slots">';
      byDay[ds].forEach(function(slot){
        // Per OA: mostra indicatore stato dossier
        let statusDot='';
        if(isOA&&slot.dossier){
          const sc=slot.dossier.status==='confermata'?'#4ae87a':slot.dossier.status==='annullata'?'#e84a4a':'#888';
          const sl=slot.dossier.status==='confermata'?'Confermata':slot.dossier.status==='annullata'?'Annullata':'Standby';
          statusDot='<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+sc+';margin-right:3px;vertical-align:middle" title="'+sl+'"></span>';
        }
        h+='<span class="lfc-slot"><span class="lfc-slot-time">'+statusDot+slot.start+(slot.end?' → '+slot.end:'')+'</span></span>';
      });
      h+='</div></div>';
    });
    if(allDates.length>showDates.length)h+='<div style="font-size:10px;color:var(--txt2);padding:4px 14px">+ altre '+(allDates.length-showDates.length)+' date</div>';
    h+='</div>';
    if(b.note)h+='<div style="font-size:11px;color:var(--txt2);padding:6px 14px;border-top:1px solid var(--bdr)">📝 '+hl(b.note)+'</div>';
    if(canEdit){
      h+='<div class="fac" style="padding:8px 14px;border-top:1px solid var(--bdr)">';
      h+='<button class="btn bg bs" data-bid="'+b.id+'" onclick="editBook(this.dataset.bid)">✏ Modifica</button>';
      h+='<button class="btn bd bs" data-bid="'+b.id+'" onclick="delBook(this.dataset.bid)">✕ Elimina</button>';
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  w.innerHTML=h;
}

// ── PLAYLIST ─────────────────────────────────────────
// Stato locale: {filmId: [ytId1, ytId2, ...]} per sala corrente
let _plTrailers = {};

function renderPlaylist(){
  var wd=wdates();var days=wdays();var today=new Date().toISOString().slice(0,10);
  var weekEl=document.getElementById('pl-week-all');
  if(weekEl)weekEl.textContent='Settimana '+fd(days[0])+' — '+fd(days[6]);
  var allShows=S.shows.filter(function(s){return wd.includes(s.day);});
  var seenMap={};var filmOrder=[];
  allShows.sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);})
    .forEach(function(s){if(!seenMap[s.filmId]){seenMap[s.filmId]=true;filmOrder.push(s.filmId);}});
  filmOrder.sort(function(a,b){
    var fa=S.films.find(function(f){return f.id===a;})||{title:''};
    var fb=S.films.find(function(f){return f.id===b;})||{title:''};
    return fa.title.localeCompare(fb.title,'it');
  });
  var w=document.getElementById('pl-list-all');if(!w)return;
  if(!filmOrder.length){w.innerHTML='<div class="pl-empty">Nessun film in programmazione questa settimana</div>';renderPlaylistSala();return;}
  var d8m=new Date();d8m.setMonth(d8m.getMonth()+8);var d8mStr=toLocalDate(d8m);
  var trailerCandidates=S.films.filter(function(f){
    if(!f.release)return false; // solo film con data uscita
    if(f.release<today)return false; // escludi già usciti
    if(f.release>d8mStr)return false; // escludi oltre 8 mesi
    return true;
  }).sort(function(a,b){return (a.release||'9999').localeCompare(b.release||'9999')||a.title.localeCompare(b.title,'it');});
  var html='<div class="lfc-grid">';
  filmOrder.forEach(function(fid){
    var film=S.films.find(function(f){return f.id===fid;});if(!film)return;
    if(!_plTrailers[fid])_plTrailers[fid]=[film.trailer||'','','',''];
    var dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
    var meta=[film.distributor,dur,film.rating,film.genre].filter(Boolean).join(' · ');
    var slots='';
    for(var i=0;i<4;i++){
      var ytId=(_plTrailers[fid]||[])[i]||'';
      var opts='<option value="">— Seleziona trailer —</option>';
      trailerCandidates.forEach(function(tf){
        if(!tf.trailer)return;
        var rel=tf.release?' ('+tf.release.split('-').slice(1).reverse().join('/')+')':'';
        var sel=(tf.trailer===ytId&&ytId)?' selected':'';
        opts+='<option value="'+tf.trailer+'"'+sel+'>'+tf.title+rel+'</option>';
      });
      slots+='<div class="pl-slot-box"><div style="display:flex;gap:4px;align-items:center">'
        +'<select class="pl-trailer-sel" data-fid="'+fid+'" data-slot="'+i+'" onchange="plPickTrailer(this)">'+opts+'</select>'
        +(ytId?'<button class="pl-trailer-clear" data-fid="'+fid+'" data-slot="'+i+'" onclick="plClearSlot(this)" title="Rimuovi">×</button>'
              :'<button class="pl-trailer-clear" style="opacity:.2" disabled>×</button>')
        +'</div></div>';
    }
    html+='<div class="lfc" style="border-top:3px solid var(--acc)">'
      +'<div class="lfc-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">'
        +'<div style="flex:1;min-width:0">'
          +'<div class="lfc-title" style="color:var(--acc)">'+film.title+'</div>'
          +(meta?'<div class="lfc-meta">'+meta+'</div>':'')
        +'</div>'
        +'<button class="pl-suggest-btn" data-fid="'+fid+'" onclick="plSuggestForFilm(this.dataset.fid)" title="Suggerisci trailer per questo film">💡</button>'
      +'</div>'
      +'<div class="pl-trailers-section"><div class="pl-4slots">'+slots+'</div></div>'
      +'</div>';
  });
  html+='</div>';w.innerHTML=html;renderPlaylistSala();
}
window.renderPlaylist=renderPlaylist;
function plSetSala(btn,sid){
  document.querySelectorAll('.pl-sala-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');var sel=document.getElementById('pl-sala');if(sel)sel.value=sid;renderPlaylistSala();
}
window.plSetSala=plSetSala;
function renderPlaylistSala(){
  var wd=wdates();var days=wdays();var sel=document.getElementById('pl-sala');var sid=sel?sel.value:'all';
  var w=document.getElementById('pl-list-sala');if(!w)return;
  var SALE_IDS=sid==='all'?['1','2','3','4']:[sid];var html='';
  SALE_IDS.forEach(function(salaId){
    var sl=SALE[salaId];
    var salaShows=S.shows.filter(function(s){return s.sala==salaId&&wd.includes(s.day);})
      .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
    if(!salaShows.length)return;
    var seenS={};var salaFilmOrder=[];
    salaShows.forEach(function(s){if(!seenS[s.filmId]){seenS[s.filmId]=true;salaFilmOrder.push(s.filmId);}});
    salaFilmOrder.sort(function(a,b){
      var fa=S.films.find(function(f){return f.id===a;})||{title:''};
      var fb=S.films.find(function(f){return f.id===b;})||{title:''};
      return fa.title.localeCompare(fb.title,'it');
    });
    html+='<div style="margin-bottom:24px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid '+sl.col+'">'
      +'<span class="sdot" style="background:'+sl.col+';width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0"></span>'
      +'<span style="font-size:14px;font-weight:700;color:'+sl.col+'">'+sl.n+'</span>'
      +'<span style="font-size:11px;color:var(--txt2)">'+salaShows.length+' spettacol'+(salaShows.length===1?'o':'i')+'</span></div>';
    html+='<div class="lfc-grid">';
    salaFilmOrder.forEach(function(fid){
      var film=S.films.find(function(f){return f.id===fid;});if(!film)return;
      if(!_plTrailers[fid])_plTrailers[fid]=[film.trailer||'','','',''];
      var filmSalaShows=salaShows.filter(function(s){return s.filmId===fid;});
      var byDay={};var dayOrd=[];
      filmSalaShows.forEach(function(s){if(!byDay[s.day]){byDay[s.day]=[];dayOrd.push(s.day);}byDay[s.day].push(s);});
      var chosen=(_plTrailers[fid]||[]).filter(Boolean);
      var dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
      var meta=[film.distributor,dur].filter(Boolean).join(' · ');
      html+='<div class="lfc" style="border-top:3px solid '+sl.col+'">';
      html+='<div class="lfc-head"><div class="lfc-title" style="color:var(--acc)">'+film.title+'</div>';
      if(meta)html+='<div class="lfc-meta">'+meta+'</div>';html+='</div>';
      html+='<div class="pl-trailers-section">';
      if(chosen.length){
        html+='<div class="lfc-slots" style="flex-wrap:wrap;gap:4px;margin-bottom:4px">';
        chosen.forEach(function(ytId){var tf=S.films.find(function(f){return f.trailer===ytId;});html+='<span class="lfc-slot"><span class="lfc-slot-time" style="font-size:10px;color:var(--txt2)">'+(tf?tf.title:ytId)+'</span></span>';});
        html+='</div>';
      }else{html+='<div class="pl-sala-trailer-empty">—</div>';}
      html+='</div><div class="lfc-days">';
      dayOrd.forEach(function(ds){
        var di=wd.indexOf(ds);var dl=di>=0?DIT[di].toUpperCase()+' '+fs(days[di]):ds;
        html+='<div><div class="lfc-day-name">'+dl+'</div><div class="lfc-slots">';
        byDay[ds].forEach(function(s){html+='<span class="lfc-slot"><span class="lfc-slot-time">'+s.start+'</span></span>';});
        html+='</div></div>';
      });
      html+='</div></div>';
    });
    html+='</div></div>';
  });
  w.innerHTML=html||'<div class="pl-empty">Nessun film</div>';
}
window.renderPlaylistSala=renderPlaylistSala;

// ── SUGGERIMENTO TRAILER ─────────────────────────────
// Score: genere (40) + rating compatibile (25) + uscita imminente (25) + stesso distributore (10)
var GENRE_AFFINITY = {
  'Animazione':    ['Animazione','Commedia','Avventura','Fantasy'],
  'Commedia':      ['Commedia','Romantico','Drammatico'],
  'Drammatico':    ['Drammatico','Romantico','Thriller','Biografico'],
  'Thriller':      ['Thriller','Horror','Azione','Drammatico'],
  'Horror':        ['Horror','Thriller'],
  'Azione':        ['Azione','Avventura','Sci-Fi','Thriller'],
  'Avventura':     ['Avventura','Azione','Fantasy','Animazione'],
  'Sci-Fi':        ['Sci-Fi','Azione','Avventura','Thriller'],
  'Fantasy':       ['Fantasy','Avventura','Animazione','Azione'],
  'Romantico':     ['Romantico','Commedia','Drammatico'],
  'Documentario':  ['Documentario','Biografico','Drammatico'],
  'Biografico':    ['Biografico','Drammatico','Documentario'],
  'Musical':       ['Musical','Commedia','Romantico'],
  'Western':       ['Western','Azione','Avventura'],
  'Altro':         []
};

var RATING_ORDER = ['Per tutti','6+','12+','14+','16+','18+'];

function ratingLevel(r){
  var idx = RATING_ORDER.indexOf(r);
  return idx >= 0 ? idx : 3; // default 12+
}

function trailerScore(mainFilm, trailerFilm, today){
  if(!trailerFilm || !trailerFilm.trailer) return -1;
  // Non suggerire il proprio trailer come trailer di un altro film
  if(trailerFilm.id === mainFilm.id) return -1;

  var score = 0;

  // 1. Genere (0-40 punti)
  var mainGenre = mainFilm.genre || 'Altro';
  var trailerGenre = trailerFilm.genre || 'Altro';
  var affinities = GENRE_AFFINITY[mainGenre] || [];
  if(trailerGenre === mainGenre) score += 40;
  else if(affinities.indexOf(trailerGenre) >= 0) score += 20 + (affinities.length - affinities.indexOf(trailerGenre)) * 2;

  // 2. Rating compatibile (0-25 punti)
  // Il trailer non deve avere rating più alto del film principale
  var mainLevel = ratingLevel(mainFilm.rating);
  var trailerLevel = ratingLevel(trailerFilm.rating);
  if(trailerLevel <= mainLevel) score += 25;
  else if(trailerLevel === mainLevel + 1) score += 10; // 1 livello sopra: accettabile
  else return -1; // rating troppo alto: escludi

  // 3. Uscita imminente (0-25 punti)
  if(trailerFilm.release){
    var daysUntil = Math.round((new Date(trailerFilm.release) - new Date(today)) / 86400000);
    if(daysUntil >= 0 && daysUntil <= 14) score += 25;       // uscita entro 2 settimane
    else if(daysUntil > 14 && daysUntil <= 30) score += 18;  // entro 1 mese
    else if(daysUntil > 30 && daysUntil <= 60) score += 10;  // entro 2 mesi
    else if(daysUntil < 0 && daysUntil >= -7) score += 8;    // uscito da meno di 1 settimana
    else if(daysUntil > 60) score += 3;                       // futuro remoto
  } else {
    score += 5; // nessuna data = film evergreen
  }

  // 4. Stesso distributore (0-10 punti)
  if(mainFilm.distributor && trailerFilm.distributor &&
     mainFilm.distributor.toLowerCase() === trailerFilm.distributor.toLowerCase()){
    score += 10;
  }

  return score;
}

function plSuggestTrailersForFilm(mainFilm){
  var today = new Date().toISOString().slice(0,10);

  // Candidati: film con trailer, con data uscita >= oggi o usciti da meno di 7 giorni
  var candidates = S.films.filter(function(f){
    if(!f.trailer) return false;
    if(f.id === mainFilm.id) return false;
    if(f.release){
      var daysUntil = Math.round((new Date(f.release) - new Date(today)) / 86400000);
      return daysUntil >= -7; // escludi film usciti da più di una settimana
    }
    return true; // nessuna data: includi sempre
  });

  // Calcola score per ogni candidato
  var scored = candidates.map(function(f){
    return { film: f, score: trailerScore(mainFilm, f, today) };
  }).filter(function(x){ return x.score > 0; })
    .sort(function(a,b){ return b.score - a.score; });

  return scored.slice(0, 4); // top 4
}

function plSuggestAll(){
  var wd = wdates();
  var allShows = S.shows.filter(function(s){ return wd.includes(s.day); });
  var filmIds = [...new Set(allShows.map(function(s){ return s.filmId; }))];
  var weekFilms = filmIds.map(function(id){
    return S.films.find(function(f){ return f.id === id; });
  }).filter(Boolean);

  if(!weekFilms.length){ toast('Nessun film in programmazione','err'); return; }

  var assigned = 0;
  weekFilms.forEach(function(film){
    var suggestions = plSuggestTrailersForFilm(film);
    if(!suggestions.length) return;

    // Assegna i trailer suggeriti agli slot (max 4)
    if(!_plTrailers[film.id]) _plTrailers[film.id] = ['','','',''];
    suggestions.forEach(function(s, i){
      if(i < 4) _plTrailers[film.id][i] = s.film.trailer;
    });
    assigned++;
  });

  // Salva su Firestore e aggiorna UI
  fbSetDoc(db,'settings','playlists',{trailers:_plTrailers}).catch(function(){});
  renderPlaylist();
  toast(assigned + ' film aggiornati con trailer suggeriti', 'ok');
}
window.plSuggestAll = plSuggestAll;

// Suggerisci per un singolo film (dal pulsante nella card)
function plSuggestForFilm(fid){
  var film = S.films.find(function(f){ return f.id === fid; });
  if(!film){ toast('Film non trovato','err'); return; }

  var suggestions = plSuggestTrailersForFilm(film);
  if(!suggestions.length){ toast('Nessun trailer compatibile trovato','err'); return; }

  if(!_plTrailers[fid]) _plTrailers[fid] = ['','','',''];
  suggestions.forEach(function(s, i){
    if(i < 4) _plTrailers[fid][i] = s.film.trailer;
  });

  fbSetDoc(db,'settings','playlists',{trailers:_plTrailers}).catch(function(){});
  renderPlaylist();
  toast('Trailer suggeriti per ' + film.title, 'ok');
}
window.plSuggestForFilm = plSuggestForFilm;

function plPickTrailer(sel){
  const fid=sel.dataset.fid, slot=parseInt(sel.dataset.slot), ytId=sel.value;
  if(!_plTrailers[fid])_plTrailers[fid]=['','','',''];
  _plTrailers[fid][slot]=ytId;
  // Salva su Firestore
  fbSetDoc(db,'settings','playlists',{trailers:_plTrailers}).catch(function(){});
  const row=sel.parentElement;
  if(!row)return;
  const old=row.querySelector('.pl-thumb,a.pl-thumb');
  if(old)old.outerHTML=ytId
    ?'<a class="pl-thumb" href="https://www.youtube.com/watch?v='+ytId+'" target="_blank"><img src="https://img.youtube.com/vi/'+ytId+'/mqdefault.jpg" alt=""><span class="pl-thumb-play">&#9658;</span></a>'
    :'<div class="pl-thumb"><span class="pl-thumb-ph">&#9658;</span></div>';
  const cb=row.querySelector('.pl-trailer-clear');
  if(cb){cb.disabled=!ytId;cb.style.opacity=ytId?'1':'.25';}
}
window.plPickTrailer=plPickTrailer;

function plClearSlot(btn){
  const fid=btn.dataset.fid, slot=parseInt(btn.dataset.slot);
  if(!_plTrailers[fid])return;
  _plTrailers[fid][slot]='';
  const row=btn.parentElement;
  const sel=row.querySelector('.pl-trailer-sel');
  if(sel)sel.value='';
  const old=row.querySelector('.pl-thumb,a.pl-thumb');
  if(old)old.outerHTML='<div class="pl-thumb"><span class="pl-thumb-ph">&#9658;</span></div>';
  btn.disabled=true;btn.style.opacity='.25';
  // Salva su Firestore
  fbSetDoc(db,'settings','playlists',{trailers:_plTrailers}).catch(function(){});
}
window.plClearSlot=plClearSlot;

function copyPlaylist(){
  const sid = document.getElementById('pl-sala').value;
  const sl  = SALE[sid];
  const wd  = wdates();
  const days = wdays();
  const today = new Date().toISOString().slice(0,10);
  const salaShows = S.shows
    .filter(s => s.sala==sid && wd.includes(s.day))
    .sort((a,b) => a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  const filmOrder=[];const filmShows={};
  salaShows.forEach(s=>{if(!filmShows[s.filmId]){filmOrder.push(s.filmId);filmShows[s.filmId]=[];}filmShows[s.filmId].push(s);});

  let txt = 'PLAYLIST ' + sl.n.toUpperCase() + ' · ' + fd(days[0]) + ' — ' + fd(days[6]) + '\n';
  txt += '═'.repeat(50) + '\n\n';

  filmOrder.forEach((fid,i) => {
    const film = S.films.find(f=>f.id===fid);
    if(!film) return;
    const dur = film.duration ? Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0') : '';
    txt += (i+1)+'. '+film.title.toUpperCase()+(dur?' ('+dur+')':'')+'\n';
    // Showtimes
    filmShows[fid].forEach(s=>{
      const di=wd.indexOf(s.day);
      const dl=di>=0?['Gio','Ven','Sab','Dom','Lun','Mar','Mer'][di]+' '+fd(days[di]):s.day;
      txt+='   📅 '+dl+' → '+s.start+'\n';
    });
    // Trailers
    const slots = _plTrailers[fid]||[];
    const activeTrailers = slots.filter(Boolean);
    if(activeTrailers.length){
      txt += '   ▶ TRAILER:\n';
      activeTrailers.forEach((ytId,ti)=>{
        const tFilm = S.films.find(f=>f.trailer===ytId);
        const tTitle = tFilm ? tFilm.title : ytId;
        txt += '     '+(ti+1)+'. '+tTitle+' → https://youtu.be/'+ytId+'\n';
      });
    }
    txt += '\n';
  });

  navigator.clipboard.writeText(txt).then(()=>toast('Lista copiata negli appunti','ok')).catch(()=>toast('Errore copia','err'));
}
window.copyPlaylist = copyPlaylist;

function printPlaylist(){
  const sid = document.getElementById('pl-sala').value;
  const sl  = SALE[sid];
  const wd  = wdates();
  const days = wdays();
  const today = new Date().toISOString().slice(0,10);
  const salaShows = S.shows
    .filter(s => s.sala==sid && wd.includes(s.day))
    .sort((a,b) => a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  const filmOrder=[];const filmShows={};
  salaShows.forEach(s=>{if(!filmShows[s.filmId]){filmOrder.push(s.filmId);filmShows[s.filmId]=[];}filmShows[s.filmId].push(s);});

  let html = '<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;}'+
    'h1{font-size:16px;border-bottom:2px solid #111;padding-bottom:6px;}'+
    '.fc{margin-bottom:16px;border:1px solid #ddd;border-radius:6px;overflow:hidden;}'+
    '.fh{background:#f5f5f5;padding:8px 12px;border-bottom:1px solid #ddd;}'+
    '.ft{font-size:13px;font-weight:700;}.fm{font-size:10px;color:#777;}'+
    '.fb{padding:8px 12px;}'+
    '.st{display:inline-block;background:#fff8e0;border:1px solid #e8c84a;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;margin:1px;}'+
    '.tr{margin-top:6px;font-size:10px;}'+
    '.trt{font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.4px;}'+
    '.tri{margin:2px 0;color:#333;}'+
    '</style>';
  html += '<h1>▶ Playlist '+sl.n+' · '+fd(days[0])+' — '+fd(days[6])+'</h1>';

  filmOrder.forEach((fid,i) => {
    const film = S.films.find(f=>f.id===fid);
    if(!film) return;
    const dur = film.duration ? Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0') : '';
    const meta = [film.distributor,dur,film.rating].filter(Boolean).join(' · ');
    const slots = (_plTrailers[fid]||[]).filter(Boolean);
    html += '<div class="fc"><div class="fh"><div class="ft">'+(i+1)+'. '+film.title+'</div><div class="fm">'+meta+'</div></div><div class="fb">';
    filmShows[fid].forEach(s=>{
      const di=wd.indexOf(s.day);
      const dl=di>=0?['Gio','Ven','Sab','Dom','Lun','Mar','Mer'][di]+' '+fd(days[di]):s.day;
      html+='<span class="st">'+dl+' '+s.start+'</span> ';
    });
    if(slots.length){
      html+='<div class="tr"><div class="trt">Trailer:</div>';
      slots.forEach((ytId,ti)=>{
        const tFilm=S.films.find(f=>f.trailer===ytId);
        html+='<div class="tri">'+(ti+1)+'. '+(tFilm?tFilm.title:ytId)+' · youtu.be/'+ytId+'</div>';
      });
      html+='</div>';
    }
    html+='</div></div>';
  });

  const blob=new Blob(['<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>'+html+'</body></html>'],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='playlist-'+sl.n.toLowerCase()+'-'+wd[0]+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast('Playlist scaricata','ok');
}
window.printPlaylist = printPlaylist;
window.renderPlaylist = renderPlaylist;

// ── Email Distributori OA ─────────────────────────────────────────────────
function openEmailDistributori(){
  // Filtra prenotazioni OA non ancora prenotate, con date future, ordinate per data
  var oggi=new Date().toISOString().slice(0,10);
  var books=(S.bookings||[])
    .filter(function(b){
      return b.type==='openair'
        && b.oaPrenotato!=='si'
        && (b.dates||[]).some(function(d){return d.date>=oggi;});
    });

  // Per ogni prenotazione raccogli le date future e costruisci righe
  var rows=[];
  books.forEach(function(b){
    var film=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
    var titolo=film?film.title:(b.oaFilmTitle||b.name||'—');
    var distributore=film?.distributor||b.oaDistributor||'—';
    var versione=b.oaVersione||'IT';
    var luogoArch=b.oaLuogoId?S.oaLuoghi.find(function(l){return l.id===b.oaLuogoId;}):null;
    var luogo=luogoArch?(luogoArch.nome+(luogoArch.comune?' ('+luogoArch.comune+')':'')):b.location||'—';
    var dateFuture=(b.dates||[]).filter(function(d){return d.date>=oggi;});
    dateFuture.forEach(function(d){
      rows.push({
        date:d.date,
        titolo:titolo,
        luogo:luogo,
        versione:versione,
        distributore:distributore,
        bookId:b.id
      });
    });
  });

  // Ordina per data crescente
  rows.sort(function(a,b){return a.date.localeCompare(b.date);});

  // Raggruppa per distributore per info
  var distSet=new Set(rows.map(function(r){return r.distributore;}).filter(function(d){return d&&d!=='—';}));
  var nFilm=new Set(rows.map(function(r){return r.titolo;})).size;

  // Formatta tabella testo
  function padR(s,n){s=String(s||'');while(s.length<n)s+=' ';return s.substring(0,n);}
  function fmtDate(iso){
    var d=new Date(iso+'T12:00:00');
    return d.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
  }

  var header='  '+padR('Data',16)+padR('Titolo',32)+padR('Luogo',28)+padR('Vers.',6);
  var sep='  '+'-'.repeat(82);
  var lines=rows.map(function(r){
    return '  '+padR(fmtDate(r.date),16)+padR(r.titolo,32)+padR(r.luogo,28)+padR(r.versione,6);
  });

  var body='Gentili Colleghi,\n\n'
    +'Vi inviamo di seguito le richieste di prenotazione DCP\n'
    +'per le prossime proiezioni CineTour Open Air:\n\n'
    +header+'\n'+sep+'\n'
    +lines.join('\n')
    +'\n'+sep+'\n\n'
    +'NOTE:\n'
    +'• Non serve pubblicità\n'
    +'• DCP da inviare sui server del Multisala Teatro Mendrisio\n\n'
    +'Prenotazione a cura di:\n'
    +'Fabbrica dei Sogni Sagl\n'
    +'Cinema Multisala Teatro Mendrisio\n'
    +'CineTour Open Air\n\n'
    +'Cordiali saluti,\n'
    +'Fabbrica dei Sogni Sagl';

  // Popola modal
  document.getElementById('edBody').value=body;
  document.getElementById('edTo').value='';
  document.getElementById('ed-preview-info').textContent=
    rows.length+' proiezioni · '+nFilm+' titoli · '+distSet.size+' distributori — solo film NON ancora prenotati';
  document.getElementById('ovEmailDistrib').classList.add('on');
}
window.openEmailDistributori=openEmailDistributori;

function edOpenMail(){
  var to=encodeURIComponent(document.getElementById('edTo').value||'');
  var subject=encodeURIComponent(document.getElementById('edSubject').value||'');
  var body=encodeURIComponent(document.getElementById('edBody').value||'');
  window.open('mailto:'+to+'?subject='+subject+'&body='+body);
}
window.edOpenMail=edOpenMail;

function edStampa(){
  var body=document.getElementById('edBody').value||'';
  var subject=document.getElementById('edSubject').value||'';
  var w=window.open('','_blank');
  w.document.write('<html><head><title>'+subject+'</title>'
    +'<style>body{font-family:monospace;font-size:12px;line-height:1.7;padding:30px;max-width:800px;margin:auto}'
    +'h2{font-family:sans-serif;font-size:16px;margin-bottom:20px}'
    +'pre{white-space:pre-wrap;word-break:break-word}'
    +'@media print{body{padding:15px}}</style></head>'
    +'<body><h2>'+subject+'</h2><pre>'+body.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>'
    +'<script>window.onload=function(){window.print();}<\/script></body></html>');
  w.document.close();
}
window.edStampa=edStampa;
window.setBMode=setBMode;window.fillBShows=fillBShows;window.fillBShowTimes=fillBShowTimes;window.onBShowSelect=onBShowSelect;
window.delBook=delBook;window.addBookDate=addBookDate;window.removeBookDate=removeBookDate;
window.renderBookings=renderBookings;

// ── OTTIMIZZA ORARI ──────────────────────────────────────
// State for optimize modal
let _opt={day:'',sala:'',plan:[]};

function openOptModal(day,sala){
  _opt={day,sala,plan:[]};
  const sl=SALE[sala];
  const dayIdx=wdates().indexOf(day);
  const dayLabel=dayIdx>=0?`${DIT[dayIdx]} ${fd(wdays()[dayIdx])}`:day;

  document.getElementById('optSalaName').textContent=sl.n;
  document.getElementById('optDayName').textContent=dayLabel;
  document.getElementById('optWarn').style.display='none';
  document.getElementById('optConfirmBtn').disabled=false;

  // Get all shows in this sala/day sorted by start time
  const salaShows=S.shows
    .filter(s=>s.sala==sala&&s.day===day)
    .sort((a,b)=>t2m(a.start)-t2m(b.start));

  if(salaShows.length<2){
    document.getElementById('optPreview').innerHTML=
      `<div style="padding:16px;text-align:center;color:var(--txt2);font-size:13px">Servono almeno 2 film in questa sala per ottimizzare.</div>`;
    document.getElementById('optConfirmBtn').disabled=true;
    document.getElementById('optAnchorName').textContent='—';
    document.getElementById('optAnchorTime').textContent='';
    document.getElementById('ovOpt').classList.add('on');
    return;
  }

  // Find the "anchor" film: the one whose start time is closest to 20:30
  // (between 19:30 and 21:30 range, else just the one nearest to 20:30)
  const ANCHOR_TARGET=t2m('20:30');
  const anchor=salaShows.reduce((best,s)=>{
    const d=Math.abs(t2m(s.start)-ANCHOR_TARGET);
    const bd=Math.abs(t2m(best.start)-ANCHOR_TARGET);
    return d<bd?s:best;
  });
  const anchorFilm=S.films.find(f=>f.id===anchor.filmId);

  document.getElementById('optAnchorName').textContent=anchorFilm?.title||'?';
  document.getElementById('optAnchorTime').textContent=`${anchor.start} → ${anchor.end}`;

  // Separate: films BEFORE the anchor (to be rescheduled backwards)
  // Films AFTER anchor remain untouched
  const before=salaShows.filter(s=>t2m(s.start)<t2m(anchor.start));
  const afterAnchor=salaShows.filter(s=>t2m(s.start)>t2m(anchor.start));

  // Compute new start times working backwards from anchor.start
  // anchor stays fixed. For each film before (in reverse order):
  // newEnd = prevFilm.newStart
  // newStart = newEnd - film.duration - interval
  let plan=[]; // {show, newStart, newEnd, changed}

  // Anchor is fixed
  plan.push({show:anchor, newStart:anchor.start, newEnd:anchor.end, changed:false, isAnchor:true});

  // Work backwards
  let cursor=t2m(anchor.start); // next film must end at or before this
  [...before].reverse().forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId);
    const dur=film?.duration||90;
    const intv=s.interval||20;
    const newEndM=cursor-intv;
    const newStartM=Math.floor((newEndM-dur)/5)*5; // round DOWN to nearest 5
    if(newStartM<0){
      plan.push({show:s, newStart:s.start, newEnd:s.end, changed:false, error:true});
    } else {
      const newStart=r5m(newStartM);
      const newEnd=am(newStart,dur);
      plan.push({show:s, newStart, newEnd, changed:newStart!==s.start, isAnchor:false});
      cursor=newStartM; // next iteration: must end before this rounded start
    }
  });

  // After anchor stays unchanged
  afterAnchor.forEach(s=>plan.push({show:s, newStart:s.start, newEnd:s.end, changed:false, isAnchor:false}));

  // Sort by new start time for display
  plan.sort((a,b)=>t2m(a.newStart)-t2m(b.newStart));
  _opt.plan=plan;

  // Check for errors (would go negative)
  const hasError=plan.some(p=>p.error);
  if(hasError){
    document.getElementById('optWarn').style.display='block';
    document.getElementById('optWarn').textContent='⚠ Alcuni film andrebbero collocati prima della mezzanotte precedente. Verifica la durata dei film o riduci il numero di slot.';
  }

  // Build preview table
  let html=`<div class="opt-row hdr">
    <div class="opt-cell lbl">Film</div>
    <div class="opt-cell lbl" style="text-align:center">Ora attuale</div>
    <div class="opt-cell lbl" style="text-align:center">Nuova ora</div>
  </div>`;
  plan.forEach(p=>{
    const film=S.films.find(f=>f.id===p.show.filmId);
    const isAnchor=p.isAnchor;
    html+=`<div class="opt-row${isAnchor?' opt-anchor-row':''}">
      <div class="opt-cell">${film?.title||'?'}${isAnchor?` <span style="font-size:10px;color:var(--acc);margin-left:4px">⭐ FISSO</span>`:''}</div>
      <div class="opt-cell" style="text-align:center">
        ${p.changed?`<span class="t-old">${p.show.start}</span>`:`<span class="t-same">${p.show.start}</span>`}
      </div>
      <div class="opt-cell" style="text-align:center">
        ${isAnchor?`<span class="t-anchor">${p.newStart}</span>`:
          p.error?`<span style="color:var(--red);font-size:11px">⚠ Errore</span>`:
          p.changed?`<span class="t-new">${p.newStart}</span>`:`<span class="t-same">${p.newStart}</span>`}
      </div>
    </div>`;
  });
  document.getElementById('optPreview').innerHTML=html;
  document.getElementById('ovOpt').classList.add('on');
}

async function execOptimize(){
  const toUpdate=_opt.plan.filter(p=>p.changed&&!p.error);
  if(!toUpdate.length){toast('Nessuna modifica da applicare','ok');co('ovOpt');return;}
  for(const p of toUpdate){
    const updated={...p.show, start:p.newStart, end:p.newEnd};
    await fbSS(updated);
  }
  co('ovOpt');
  toast(`${toUpdate.length} orari aggiornati`,'ok');
}
window.openOptModal=openOptModal;window.execOptimize=execOptimize;

// ── SOCIAL POST GENERATOR ────────────────────────────
var _socialPlat='ig';
var _socialTone='friendly';

var SOCIAL_LIMITS={ig:2200,fb:63206,wa:4096};
var SALA_COLORS={'1':'#4a9ee8','2':'#e89a3a','3':'#3ae8aa','4':'#c84ae8'};
var SALA_EMOJI={'1':'🔵','2':'🟠','3':'🟢','4':'🟣'};

function socialSetPlat(btn,p){
  document.querySelectorAll('.social-plat-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');_socialPlat=p;socialGenerate();
}
window.socialSetPlat=socialSetPlat;

function socialSetTone(btn,t){
  document.querySelectorAll('.social-tone-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');_socialTone=t;socialGenerate();
}
var _socialLayout='classic';
function socialSetLayout(btn,layout){
  document.querySelectorAll('.social-lay-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  window._socialLayout=layout;
  socialGenerate();
}
window.socialSetLayout=socialSetLayout;
window.socialSetTone=socialSetTone;

function socialGenerate(){
  var wd=wdates();var days=wdays();
  var allShows=S.shows.filter(function(s){return wd.includes(s.day);});
  var filmIds=[...new Set(allShows.map(function(s){return s.filmId;}))];
  var weekFilms=filmIds.map(function(id){return S.films.find(function(f){return f.id===id;});})
    .filter(Boolean);

  // ── Ordina: 1) nuove uscite settimana corrente, 2) più spettacoli, 3) priorità manuale, 4) alfabetico
  var d14s=wd.length?wd[0]:'';
  var d7s=wd.length?wd[wd.length-1]:'';
  weekFilms.sort(function(a,b){
    // Spettacoli questa settimana
    var aShows=allShows.filter(function(s){return s.filmId===a.id;}).length;
    var bShows=allShows.filter(function(s){return s.filmId===b.id;}).length;
    // Nuova uscita = release dentro la settimana corrente
    var aIsNew=a.release&&a.release>=d14s&&a.release<=d7s;
    var bIsNew=b.release&&b.release>=d14s&&b.release<=d7s;
    if(aIsNew&&!bIsNew)return -1;
    if(!aIsNew&&bIsNew)return 1;
    // Più spettacoli prima
    if(bShows!==aShows)return bShows-aShows;
    // Poi data release: più recente prima (nuovo→vecchio)
    if(a.release&&b.release){var rc=b.release.localeCompare(a.release);if(rc!==0)return rc;}
    if(a.release&&!b.release)return -1;
    if(!a.release&&b.release)return 1;
    // Infine alfabetico
    return a.title.localeCompare(b.title,'it');
  });

  // Week label
  var wl=document.getElementById('social-week');
  if(wl)wl.textContent='Settimana '+fd(days[0])+' — '+fd(days[6])+' · '+weekFilms.length+' film in programmazione';

  if(!weekFilms.length){
    ['social-text1','social-text2'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent='Nessun film questa settimana.';});
    return;
  }

  // Raggruppa orari per film: giorno → orari principali
  // Abbreviazioni giorni per schedule compatto
  var _ABB=['Gi','Ve','Sa','Do','Lu','Ma','Me'];

  function filmScheduleSummary(film){
    var fShows=allShows.filter(function(s){return s.filmId===film.id;})
      .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
    if(!fShows.length)return '';

    // Raggruppa per orario → lista di indici giorno
    var byTime={};
    fShows.forEach(function(s){
      var di=wd.indexOf(s.day);
      if(di<0)return;
      if(!byTime[s.start])byTime[s.start]=[];
      if(byTime[s.start].indexOf(di)<0)byTime[s.start].push(di);
    });

    // Per ogni orario, costruisce la stringa giorni abbreviata
    // Raggruppa giorni consecutivi in range (es. Gi-Me), singoli separati da /
    function daysStr(idxArr){
      idxArr=idxArr.slice().sort(function(a,b){return a-b;});
      if(idxArr.length===7)return 'ogni g';
      // Trova runs consecutivi
      var parts=[];var run=[idxArr[0]];
      for(var k=1;k<idxArr.length;k++){
        if(idxArr[k]===run[run.length-1]+1){run.push(idxArr[k]);}
        else{parts.push(run);run=[idxArr[k]];}
      }
      parts.push(run);
      return parts.map(function(r){
        if(r.length>=3)return _ABB[r[0]]+'–'+_ABB[r[r.length-1]];
        if(r.length===2)return _ABB[r[0]]+'/'+_ABB[r[1]];
        return _ABB[r[0]];
      }).join('/');
    }

    // Ordina orari per frequenza (più frequente prima)
    var times=Object.keys(byTime).sort(function(a,b){
      return byTime[b].length-byTime[a].length||a.localeCompare(b);
    });

    // Costruisce stringa compatta: "Gi-Me 20:30  Sa/Do 14:30"
    // Separatore ◆ tra blocchi orario diversi
    return times.map(function(t){
      return daysStr(byTime[t])+' '+t;
    }).join('  →  ');
  }

  var cinemaUrl='mendrisiocinema.ch';

    // ── POST 1: Programma completo ──
  function buildPost1(){
    var p=_socialPlat;var t=_socialTone;
    var d14s=wd.length?wd[0]:'';
    var d7s=wd.length?wd[wd.length-1]:'';
    var lines=[];

    // Intestazione comune
    var nFilm=weekFilms.length;
    var headerLine='🎬 Questa settimana '+nFilm+' film al Cinema Multisala Teatro Mendrisio!';
    if(p==='wa')headerLine='🎬 *Questa settimana '+nFilm+' film al Cinema Multisala Teatro Mendrisio!*';

    lines.push(headerLine);
    lines.push('');

    // "Nuovo" = release un giorno prima dell'inizio settimana o durante la settimana
    var d14sMinus1=new Date(d14s+'T12:00:00');
    d14sMinus1.setDate(d14sMinus1.getDate()-1);
    var d14sMinus1Str=toLocalDate(d14sMinus1);

    var ordered=weekFilms.slice().sort(function(a,b){
      var aIsNew=a.release&&a.release>=d14sMinus1Str&&a.release<=d7s;
      var bIsNew=b.release&&b.release>=d14sMinus1Str&&b.release<=d7s;
      // 1) Nuovi prima
      if(aIsNew&&!bIsNew)return -1;
      if(!aIsNew&&bIsNew)return 1;
      // 2) Più spettacoli questa settimana
      var aShows=allShows.filter(function(s){return s.filmId===a.id;}).length;
      var bShows=allShows.filter(function(s){return s.filmId===b.id;}).length;
      if(bShows!==aShows)return bShows-aShows;
      // 3) A parità: data release più recente prima
      if(a.release&&b.release)return b.release.localeCompare(a.release);
      if(a.release)return -1;
      if(b.release)return 1;
      return a.title.localeCompare(b.title,'it');
    });

    ordered.forEach(function(f){
      var aIsNew=f.release&&f.release>=d14sMinus1Str&&f.release<=d7s;
      var sched=filmScheduleSummary(f);
      var newTag=aIsNew?'🆕 ':'';
      var titleStr=p==='wa'?'*'+f.title+'*':f.title;
      if(t==='formale'){
        lines.push((aIsNew?'★ ':' ▸ ')+f.title);
        if(sched)lines.push('   '+sched);
      } else if(t==='conciso'){
        lines.push(newTag+f.title+(sched?' → '+sched:''));
      } else {
        // friendly (default)
        lines.push(newTag+titleStr+(sched?' → '+sched:''));
      }
    });

    lines.push('');
    if(p==='fb'||p==='ig'){
      lines.push('🎟 Prenota su '+cinemaUrl);
      lines.push('📍 Via Vincenzo Vela 2, Mendrisio');
    } else {
      lines.push('Prenotazioni: '+cinemaUrl);
    }
    return lines.join('\n');
  }

// ── POST 2: Consigli per pubblico ──
  function buildPost2(){
    var p=_socialPlat;var t=_socialTone;
    var lines=[];
    // Categorizza film
    var perTutti=weekFilms.filter(function(f){return f.rating==='Per tutti'||f.genre==='Animazione';});
    var animazione=weekFilms.filter(function(f){return f.genre==='Animazione';});
    var commedia=weekFilms.filter(function(f){return f.genre==='Commedia';});
    var drammatico=weekFilms.filter(function(f){return f.genre==='Drammatico'||f.genre==='Thriller';});
    var scifi=weekFilms.filter(function(f){return f.genre==='Sci-Fi'||f.genre==='Azione'||f.genre==='Avventura';});
    if(p==='wa'){
      lines.push('\uD83C\uDF7F Non sai cosa vedere questo weekend?');lines.push('');
      if(animazione.length){lines.push('\uD83D\uDC76 *Per tutta la famiglia:*');animazione.forEach(function(f){lines.push('  \uD83C\uDFAC '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
      if(commedia.length){lines.push('\uD83D\uDE02 *Per ridere:*');commedia.forEach(function(f){lines.push('  \uD83C\uDFAC '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
      if(scifi.length){lines.push('\uD83D\uDE80 *Per l\'avventura:*');scifi.forEach(function(f){lines.push('  \uD83C\uDFAC '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
      if(drammatico.length){lines.push('\uD83C\uDFA5 *Per emozionarsi:*');drammatico.forEach(function(f){lines.push('  \uD83C\uDFAC '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
      lines.push('Ti aspettiamo! '+cinemaUrl);
    }else{
      if(t==='conciso'){
        lines.push('\uD83D\uDCA1 Cosa vedere questo weekend?');lines.push('');
        if(perTutti.length)lines.push('\uD83D\uDC76 Famiglie: '+perTutti.slice(0,2).map(function(f){return f.title;}).join(', '));
        if(commedia.length)lines.push('\uD83D\uDE02 Commedia: '+commedia.slice(0,2).map(function(f){return f.title;}).join(', '));
        if(scifi.length)lines.push('\uD83D\uDE80 Azione: '+scifi.slice(0,2).map(function(f){return f.title;}).join(', '));
        lines.push('');lines.push(cinemaUrl);
      }else{
        lines.push(t==='formale'?'Selezione della settimana:':'\uD83D\uDCA1 Non sai cosa vedere questo weekend? \uD83D\uDC47');lines.push('');
        if(animazione.length){lines.push(t==='formale'?'Per le famiglie:':'\uD83D\uDC76 Per tutta la famiglia:');animazione.forEach(function(f){lines.push('  \uD83C\uDFAC '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
        if(commedia.length){lines.push(t==='formale'?'Commedia:':'\uD83D\uDE02 Per ridere:');commedia.forEach(function(f){lines.push('  '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
        if(scifi.length){lines.push(t==='formale'?'Azione/Avventura:':'\uD83D\uDE80 Per l\'avventura:');scifi.forEach(function(f){lines.push('  '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
        if(drammatico.length){lines.push(t==='formale'?'Drammatico:':'\uD83C\uDFA5 Per emozionarsi:');drammatico.forEach(function(f){lines.push('  '+f.title+' \u2192 '+filmScheduleSummary(f));});lines.push('');}
        lines.push(t==='formale'?'Prenotazioni: '+cinemaUrl:'Vi aspettiamo al Cinema Multisala! \uD83C\uDFAB\n'+cinemaUrl);
      }
    }
    return lines.join('\n');
  }

  var t1=buildPost1();var t2=buildPost2();
  var lim=SOCIAL_LIMITS[_socialPlat]||2200;
  var el1=document.getElementById('social-text1');
  var el2=document.getElementById('social-text2');
  if(el1)el1.textContent=t1;
  if(el2)el2.textContent=t2;
  var cc1=document.getElementById('social-cc1');
  var cc2=document.getElementById('social-cc2');
  if(cc1)cc1.textContent=t1.length+' / '+lim.toLocaleString('it-IT');
  if(cc2)cc2.textContent=t2.length+' / '+lim.toLocaleString('it-IT');

  // Hashtags
  var tagsIG=['#cinema','#mendrisio','#film','#programmazione','#ticino','#weekend','#cinemanager'];
  var tagsFB=['#cinema','#mendrisio','#film','#cosafareticino','#famiglia'];
  var tagsWA=[];
  var tags=_socialPlat==='ig'?tagsIG:_socialPlat==='fb'?tagsFB:tagsWA;
  ['social-tags1','social-tags2'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el)return;
    el.innerHTML=tags.map(function(t){return '<span class="social-tag">'+t+'</span>';}).join('');
  });

  // Carosello
  socialRenderCarousel();
}
window.socialGenerate=socialGenerate;

// ── Carosello: canvas per ogni film ──────────────────
function socialRenderCarousel(){
  var container=document.getElementById('social-carousel');
  if(!container)return;
  var wd=wdates();var days=wdays();
  var allShows=S.shows.filter(function(s){return wd.includes(s.day);});
  var filmIds=[...new Set(allShows.map(function(s){return s.filmId;}))];
  var weekFilms=filmIds.map(function(id){return S.films.find(function(f){return f.id===id;});})
    .filter(Boolean);

  // ── Ordina: 1) nuove uscite settimana corrente, 2) più spettacoli, 3) priorità manuale, 4) alfabetico
  var d14s=wd.length?wd[0]:'';
  var d7s=wd.length?wd[wd.length-1]:'';
  weekFilms.sort(function(a,b){
    // Spettacoli questa settimana
    var aShows=allShows.filter(function(s){return s.filmId===a.id;}).length;
    var bShows=allShows.filter(function(s){return s.filmId===b.id;}).length;
    // Nuova uscita = release dentro la settimana corrente
    var aIsNew=a.release&&a.release>=d14s&&a.release<=d7s;
    var bIsNew=b.release&&b.release>=d14s&&b.release<=d7s;
    if(aIsNew&&!bIsNew)return -1;
    if(!aIsNew&&bIsNew)return 1;
    // Più spettacoli prima
    if(bShows!==aShows)return bShows-aShows;
    // Poi data release: più recente prima (nuovo→vecchio)
    if(a.release&&b.release){var rc=b.release.localeCompare(a.release);if(rc!==0)return rc;}
    if(a.release&&!b.release)return -1;
    if(!a.release&&b.release)return 1;
    // Infine alfabetico
    return a.title.localeCompare(b.title,'it');
  });

  var fmt=document.getElementById('social-img-fmt')?document.getElementById('social-img-fmt').value:'square';
  var W=fmt==='story'?405:fmt==='landscape'?540:fmt==='portrait'?405:405;
  var H=fmt==='story'?720:fmt==='landscape'?283:fmt==='portrait'?506:405;
  var SCALE=fmt==='story'?1080/405:fmt==='landscape'?1200/540:fmt==='portrait'?1080/405:1080/405;

  container.innerHTML='';

  weekFilms.forEach(function(film){
    var fShows=allShows.filter(function(s){return s.filmId===film.id;})
      .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});

    var wrap=document.createElement('div');
    wrap.className='social-slide-wrap';
    wrap.title='Clicca per scaricare';

    var canvas=document.createElement('canvas');
    canvas.width=W;canvas.height=H;
    canvas.style.width=W+'px';canvas.style.height=H+'px';
    var ctx=canvas.getContext('2d');

    // Sfondo scuro
    ctx.fillStyle='#0d1117';ctx.fillRect(0,0,W,H);

    // Gradient overlay
    var grad=ctx.createLinearGradient(0,H*0.4,0,H);
    grad.addColorStop(0,'rgba(0,0,0,0)');
    grad.addColorStop(1,'rgba(0,0,0,0.92)');

    // Funzione interna draw — eseguita dopo eventuale caricamento immagine
    function drawSlide(bgImg){
      var is2BFoto=(window._socialLayout==='tipobg');
      if(bgImg){
        var iw=bgImg.naturalWidth,ih=bgImg.naturalHeight;
        var sc2=Math.max(W/iw,H/ih);
        var sw=iw*sc2,sh=ih*sc2;
        var sx=(W-sw)/2,sy=0; // âncora in alto — volti/soggetti visibili
        ctx.save();
        ctx.globalAlpha=is2BFoto?0.90:1.0;
        ctx.drawImage(bgImg,sx,sy,sw,sh);
        ctx.restore();
      }
      // Per 2B Foto: NON applicare il grad del Classic (il gradient è in drawLayout2BContent)
      if(!is2BFoto){
        ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
      }
      ctx.letterSpacing="0px";
      drawSlideText(ctx,film,fShows,wd,days,W,H,fmt);
    }

    // Sceglie immagine: tipobg→solo backdrop, altri layout→poster
    var _is2BFoto=(window._socialLayout==='tipobg');
    // Per tipobg: prova backdrop, poi poster come fallback, poi nero
    var imgSrc=_is2BFoto?(film.backdrop||film.poster||''):film.poster;
    if(imgSrc){
      var img=new Image();
      img.crossOrigin='anonymous';
      img.onload=function(){drawSlide(img);};
      img.onerror=function(){
        // Fallback 1: se era backdrop, prova con poster
        if(_is2BFoto&&film.poster&&img.src!==film.poster){
          var img2=new Image();
          img2.crossOrigin='anonymous';
          img2.onload=function(){drawSlide(img2);};
          img2.onerror=function(){drawSlide(null);};
          img2.src=film.poster;
        // Fallback 2: prova senza crossOrigin
        } else if(img.crossOrigin){
          var img3=new Image();
          img3.onload=function(){drawSlide(img3);};
          img3.onerror=function(){drawSlide(null);};
          img3.src=imgSrc+'?nocors=1';
        } else {
          drawSlide(null);
        }
      };
      img.src=imgSrc;
    } else {
      // Nessuna immagine disponibile
      if(!_is2BFoto){
        var bgGrad=ctx.createLinearGradient(0,0,W,H);
        bgGrad.addColorStop(0,'#1a1a2e');bgGrad.addColorStop(1,'#16213e');
        ctx.fillStyle=bgGrad;ctx.fillRect(0,0,W,H);
      }
      drawSlide(null);
    }

    wrap.appendChild(canvas);

    var label=document.createElement('div');
    label.className='social-slide-label';
    label.textContent=film.title;
    wrap.appendChild(label);

    // Click per download
    wrap.onclick=(function(f,cnv){
      return function(){
        var a=document.createElement('a');
        a.href=cnv.toDataURL('image/png');
        a.download='slide-'+f.title.replace(/[^a-z0-9]/gi,'-').toLowerCase()+'.png';
        a.click();
      };
    })(film,canvas);

    container.appendChild(wrap);
  });
}
window.socialRenderCarousel=socialRenderCarousel;

// ── Mobile: centra il modal quando la tastiera virtuale appare ────────────
if('visualViewport' in window){
  window.visualViewport.addEventListener('resize',function(){
    document.querySelectorAll('.ov.on').forEach(function(ov){
      var modal=ov.querySelector('.modal');
      if(!modal)return;
      var vvh=window.visualViewport.height;
      var mh=modal.getBoundingClientRect().height;
      if(mh<vvh){
        // Il modal ci sta — centralo nella viewport visibile
        var top=Math.max(12,Math.round((vvh-mh)/2));
        modal.style.marginTop=top+'px';
      } else {
        // Il modal è più alto — inizia dall'alto con margine
        modal.style.marginTop='12px';
      }
    });
  });
  // Focus su input dentro modal → scrolla per mostrarlo
  document.addEventListener('focusin',function(e){
    var modal=e.target.closest?.('.modal');
    if(!modal)return;
    setTimeout(function(){
      e.target.scrollIntoView({block:'center',behavior:'smooth'});
    },300);
  });
}

// ── LAYOUT 2B: Tipografico con orari ───────────────────────────────────────
function drawLayout2B(ctx,film,fShows,wd,days,W,H,fmt,withBackdrop){
  var ORA='#f0801a';
  var DIT2=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

  // Raggruppa orari per giorno
  var byDay={};var dayOrd=[];
  fShows.forEach(function(s){
    var di=wd.indexOf(s.day);if(di<0)return;
    if(!byDay[di]){byDay[di]={times:[],date:s.day};dayOrd.push(di);}
    if(byDay[di].times.indexOf(s.start)<0)byDay[di].times.push(s.start);
  });
  dayOrd.sort(function(a,b){return a-b;});

  var isStory=fmt==='story';
  var scale=W/1080;
  var S=function(n){return Math.round(n*scale);};
  // Film nuovo = release nella settimana corrente o 1 giorno prima
  var _weekStart=wd&&wd.length?wd[0]:'';
  var _weekEnd=wd&&wd.length?wd[wd.length-1]:'';
  var _dayBefore='';
  if(_weekStart){var _d=new Date(_weekStart+'T12:00:00');_d.setDate(_d.getDate()-1);_dayBefore=toLocalDate(_d);}
  var isNew=film.release&&film.release>=_dayBefore&&film.release<=_weekEnd;

  // ── Sfondo nero (solo per layout tipo puro)
  var isTypoBg=(window._socialLayout==='tipobg');
  if(!isTypoBg){
    ctx.fillStyle='#0d0d0d';
    ctx.fillRect(0,0,W,H);
  } else {
    // Dissolvenza sul backdrop già disegnato
    var bdGrad=ctx.createLinearGradient(0,0,0,H);
    bdGrad.addColorStop(0,'rgba(10,10,18,0.25)');
    bdGrad.addColorStop(0.30,'rgba(10,10,18,0.45)');
    bdGrad.addColorStop(0.55,'rgba(10,10,18,0.82)');
    bdGrad.addColorStop(0.75,'rgba(10,10,18,0.96)');
    bdGrad.addColorStop(1,'rgba(10,10,18,1.0)');
    ctx.fillStyle=bdGrad;ctx.fillRect(0,0,W,H);
  }

  // ── Backdrop (25% opacity) ───────────────────────────────────────────────
  if(withBackdrop&&film.backdrop){
    var img=new Image();
    img.crossOrigin='anonymous';
    var loaded=false;
    img.onload=function(){
      loaded=true;
      ctx.save();
      ctx.globalAlpha=0.45;
      // Scala per coprire tutta la slide
      var iR=img.width/img.height;
      var sR=W/H;
      var dw,dh,dx,dy;
      if(iR>sR){dh=H;dw=H*iR;dx=(W-dw)/2;dy=0;}
      else{dw=W;dh=W/iR;dx=0;dy=(H-dh)/2;}
      ctx.drawImage(img,dx,dy,dw,dh);
      ctx.restore();
      // Dissolvenza verticale sopra il backdrop
      var grad=ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,'rgba(10,10,18,0.20)');
      grad.addColorStop(0.30,'rgba(10,10,18,0.40)');
      grad.addColorStop(0.55,'rgba(10,10,18,0.80)');
      grad.addColorStop(0.75,'rgba(10,10,18,0.96)');
      grad.addColorStop(1,'rgba(10,10,18,1.0)');
      ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
      drawLayout2BContent(ctx,film,byDay,dayOrd,DIT2,W,H,fmt,scale,S,ORA,isStory,isNew);
    };
    img.onerror=function(){
      drawLayout2BContent(ctx,film,byDay,dayOrd,DIT2,W,H,fmt,scale,S,ORA,isStory,isNew);
    };
    img.src=film.backdrop;
    // Timeout fallback nel caso l'immagine non carichi
    setTimeout(function(){
      if(!loaded)drawLayout2BContent(ctx,film,byDay,dayOrd,DIT2,W,H,fmt,scale,S,ORA,isStory,isNew);
    },3000);
    return; // il resto verrà disegnato in onload
  }

  drawLayout2BContent(ctx,film,byDay,dayOrd,DIT2,W,H,fmt,scale,S,ORA,isStory,isNew);
}
window.drawLayout2B=drawLayout2B;

function drawLayout2BContent(ctx,film,byDay,dayOrd,DIT2,W,H,fmt,scale,S,ORA,isStory,isNew){
  var isTypoBg=(window._socialLayout==='tipobg');

  // ── Sfondo / dissolvenza ──────────────────────────────────────────────────
  if(!isTypoBg){
    ctx.fillStyle='#0d0d0d';
    ctx.fillRect(0,0,W,H);
  } else {
    // Dissolvenza: trasparente fino a 70%, nero pieno a 95%
    var bdGrad=ctx.createLinearGradient(0,0,0,H);
    bdGrad.addColorStop(0,    'rgba(0,0,16,0.00)');
    bdGrad.addColorStop(0.70, 'rgba(0,0,16,0.00)');
    bdGrad.addColorStop(0.95, 'rgba(0,0,16,1.00)');
    bdGrad.addColorStop(1.0,  'rgba(0,0,16,1.00)');
    ctx.fillStyle=bdGrad;
    ctx.fillRect(0,0,W,H);
  }

  // ── Cerchi geometrici decorativi ──────────────────────────────────────────
  ctx.save();ctx.globalAlpha=0.08;ctx.strokeStyle=ORA;ctx.lineWidth=S(1);
  ctx.beginPath();ctx.arc(W*0.85,H*-0.05,S(260),0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(W*0.85,H*-0.05,S(180),0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(W*0.05,H*0.95,S(340),0,Math.PI*2);ctx.stroke();
  ctx.restore();

  // ── Banda arancio superiore ───────────────────────────────────────────────
  ctx.fillStyle=ORA;ctx.globalAlpha=0.9;ctx.fillRect(0,0,W,S(4));
  ctx.fillStyle=ORA;ctx.globalAlpha=0.35;ctx.fillRect(0,H-S(3),W,S(3));
  ctx.globalAlpha=1;

  var PL=S(52);  // padding left
  var PR=S(52);  // padding right
  var PT=S(36);  // padding top header

  // ── HEADER: CINEMA MULTISALA TEATRO (sx) + MENDRISIO (dx) ────────────────
  ctx.font='700 '+S(14)+'px Arial';
  ctx.letterSpacing=S(2)+'px';
  // Sinistra: logo img o testo
  var logoH=S(32);
  if(typeof _logoImg!=='undefined'&&_logoImg&&_logoImg.naturalWidth>0){
    var lw=Math.round(logoH*(_logoImg.naturalWidth/_logoImg.naturalHeight));
    ctx.drawImage(_logoImg,PL,PT,lw,logoH);
  } else {
    ctx.fillStyle=ORA;
    ctx.textAlign='left';
    ctx.fillText('CINEMA',PL,PT+S(14));
    ctx.font='500 '+S(11)+'px Arial';
    ctx.fillStyle='rgba(255,255,255,0.55)';
    ctx.fillText('MULTISALA TEATRO',PL,PT+S(28));
  }
  // Destra: MENDRISIO
  ctx.font='700 '+S(13)+'px Arial';
  ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.textAlign='right';
  ctx.fillText('MENDRISIO',W-PR,PT+S(22));
  ctx.textAlign='left';
  ctx.letterSpacing='0px';

  // ── CALCOLO ALTEZZA BLOCCO TESTI per centratura verticale ─────────────────
  // Stima altezza di ogni elemento prima di disegnare
  var blockH=0;
  if(film.director)blockH+=S(34); // regista
  blockH+=S(32); // badge novità/ancora

  // Titolo: calcola quante righe servono
  var titleUP=film.title.toUpperCase();
  var titleWords=titleUP.split(' ');
  var maxW=W-PL-PR;
  var tSize=S(82),line1T=titleUP,line2T='',line3T='',lineH;
  ctx.font='900 '+S(82)+'px Arial';
  for(var ts=82;ts>=38;ts-=6){
    tSize=S(ts);ctx.font='900 '+tSize+'px Arial';
    if(ctx.measureText(titleUP).width<=maxW){line1T=titleUP;line2T='';line3T='';break;}
    var found2=false;
    for(var split=1;split<titleWords.length;split++){
      var l1=titleWords.slice(0,split).join(' ');
      var l2=titleWords.slice(split).join(' ');
      if(ctx.measureText(l1).width<=maxW&&ctx.measureText(l2).width<=maxW){
        line1T=l1;line2T=l2;line3T='';found2=true;break;
      }
    }
    if(found2)break;
    if(titleWords.length>=3){
      var t3=Math.ceil(titleWords.length/3);
      var la=titleWords.slice(0,t3).join(' ');
      var lb=titleWords.slice(t3,t3*2).join(' ');
      var lc=titleWords.slice(t3*2).join(' ');
      if(ctx.measureText(la).width<=maxW&&ctx.measureText(lb).width<=maxW&&ctx.measureText(lc).width<=maxW){
        line1T=la;line2T=lb;line3T=lc;break;
      }
    }
  }
  lineH=tSize*1.05;
  blockH+=line3T?lineH*3+S(28):line2T?lineH*2+S(28):lineH+S(28);

  var metaParts=[film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):null,film.rating,film.genre].filter(Boolean);
  if(metaParts.length)blockH+=S(34);
  if(film.cast)blockH+=S(30);
  blockH+=S(8)+S(3)+S(24); // spazio + riga arancio + margine
  blockH+=dayOrd.length*S(50); // orari

  // Centro verticale disponibile (sotto header, sopra footer)
  var headerBottom=PT+S(52);
  var footerTop=H-S(44);
  var available=footerTop-headerBottom;
  // Blocco spostato verso il basso: 65% dello spazio disponibile invece di 50%
  var cy=headerBottom+Math.max(0,Math.min((available-blockH)*0.95,(available-blockH)));

  // ── Regista ───────────────────────────────────────────────────────────────
  if(film.director){
    ctx.font='700 '+S(21)+'px Arial';
    ctx.fillStyle='rgba(255,255,255,0.55)';
    ctx.letterSpacing=S(2)+'px';
    ctx.textAlign='left';
    ctx.fillText((film.director).toUpperCase(),PL,cy);
    ctx.letterSpacing='0px';
    cy+=S(34);
  }

  // ── Badge: NOVITÀ IN SALA o ANCORA IN SALA ───────────────────────────────
  ctx.font='700 '+S(20)+'px Arial';
  ctx.fillStyle=ORA;
  ctx.textAlign='left';
  ctx.fillText(isNew?'— NOVITÀ IN SALA':'— ANCORA IN SALA',PL,cy);
  cy+=S(32);

  // ── Titolo grande ─────────────────────────────────────────────────────────
  ctx.font='900 '+tSize+'px Arial';
  ctx.fillStyle='#ffffff';
  ctx.textAlign='left';
  ctx.fillText(line1T,PL,cy+lineH);
  if(line2T)ctx.fillText(line2T,PL,cy+lineH*2);
  if(line3T)ctx.fillText(line3T,PL,cy+lineH*3);
  cy+=line3T?lineH*3+S(28):line2T?lineH*2+S(28):lineH+S(28);

  // ── Meta ──────────────────────────────────────────────────────────────────
  if(metaParts.length){
    ctx.font=S(21)+'px Arial';
    ctx.fillStyle='rgba(255,255,255,0.45)';
    ctx.letterSpacing=S(1.5)+'px';
    ctx.textAlign='left';
    ctx.fillText(metaParts.join(' · ').toUpperCase(),PL,cy);
    ctx.letterSpacing='0px';
    cy+=S(34);
  }

  // ── Cast ──────────────────────────────────────────────────────────────────
  if(film.cast){
    var castNames=film.cast.split(',').map(function(n){return n.trim();}).filter(Boolean).slice(0,5);
    ctx.font=S(20)+'px Arial';
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.textAlign='left';
    ctx.fillText(castNames.join(' · '),PL,cy);
    cy+=S(30);
  }
  cy+=S(8);

  // ── Riga arancio ──────────────────────────────────────────────────────────
  ctx.fillStyle=ORA;ctx.fillRect(PL,cy,S(50),S(3));
  cy+=S(24);

  // ── Tabella orari: giorno sx, orario dx, NON centrati ─────────────────────
  dayOrd.forEach(function(di){
    var dayLabel=DIT2[di].toUpperCase();
    var times=byDay[di].times.slice().sort();

    // Giorno — allineato a sinistra
    ctx.font='700 '+S(28)+'px Arial';
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.letterSpacing=S(1)+'px';
    ctx.textAlign='left';
    ctx.fillText(dayLabel,PL,cy+S(32));
    ctx.letterSpacing='0px';

    // Puntini tratteggiati
    var dayLabelW=ctx.measureText(dayLabel).width;
    ctx.letterSpacing='0px';
    var dotsX=PL+dayLabelW+S(12);
    var dotsEndX=W-PR-S(120);
    ctx.save();ctx.setLineDash([S(2),S(5)]);
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=S(1);
    ctx.beginPath();ctx.moveTo(dotsX,cy+S(20));ctx.lineTo(dotsEndX,cy+S(20));ctx.stroke();
    ctx.restore();

    // Orari — allineati a destra
    ctx.font='700 '+S(34)+'px "Courier New",monospace';
    ctx.fillStyle=ORA;
    ctx.textAlign='right';
    ctx.fillText(times.join('  ·  '),W-PR,cy+S(34));
    ctx.textAlign='left';

    cy+=S(50);
  });

  // ── Footer centrato ───────────────────────────────────────────────────────
  ctx.font=S(13)+'px Arial';
  ctx.fillStyle='rgba(255,255,255,0.22)';
  ctx.textAlign='center';
  ctx.fillText('mendrisiocinema.ch  ·  Via Vincenzo Vela 2, Mendrisio',W/2,H-S(20));
  ctx.textAlign='left';

  // ── Corner accent ─────────────────────────────────────────────────────────
  ctx.strokeStyle='rgba(240,128,26,0.5)';ctx.lineWidth=S(3);
  ctx.beginPath();ctx.moveTo(W-PR,H-S(40));ctx.lineTo(W-PR,H-S(20));ctx.lineTo(W-PR-S(20),H-S(20));ctx.stroke();
}
window.drawLayout2BContent=drawLayout2BContent;


function drawSlideText(ctx,film,fShows,wd,days,W,H,fmt){
  // ── Dispatcher layout ────────────────────────────────────────────────
  var layout=window._socialLayout||'classic';
  if(layout==='tipo')   {drawLayout2B(ctx,film,fShows,wd,days,W,H,fmt,false);return;}
  if(layout==='tipobg') {drawLayout2B(ctx,film,fShows,wd,days,W,H,fmt,false);return;} // backdrop già disegnato
  // layout==='classic' → continua con il codice originale
  var isStory=fmt==='story';
  var isLand=fmt==='landscape';
  var DIT2=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
  var ORA='#f0801a';
  var ORA2='rgba(240,128,26,';

  // ── Raggruppa orari per giorno ──────────────────────
  var byDay={};var dayOrd=[];
  fShows.forEach(function(s){
    var di=wd.indexOf(s.day);if(di<0)return;
    if(!byDay[di]){byDay[di]={times:[],date:s.day};dayOrd.push(di);}
    if(byDay[di].times.indexOf(s.start)<0)byDay[di].times.push(s.start);
  });
  dayOrd.sort(function(a,b){return a-b;});
  var nDays=dayOrd.length;

  // ── Altezze zone ─────────────────────────────────────
  var HEADER_H=isStory?42:isLand?30:36;      // banda superiore
  var FOOTER_H=isStory?14:isLand?10:12;      // banda inferiore
  var INFO_H=isStory?70:isLand?46:58;        // titolo+meta
  var SCHED_ROWS=nDays>4?2:1;
  var BLOCK_H=isStory?38:isLand?28:32;       // altezza singolo blocco orario
  var SCHED_GAP=4;
  var SCHED_H=(BLOCK_H*SCHED_ROWS)+(SCHED_GAP*(SCHED_ROWS-1))+(isStory?28:22); // label+blocchi
  var OVERLAY_H=INFO_H+SCHED_H+FOOTER_H+8;

  // ── Poster: copre tutta la slide ────────────────────
  // (già disegnato fuori da questa funzione)

  // ── Gradient overlay scuro in basso ─────────────────
  var gradStart=H-OVERLAY_H-40;
  var grad=ctx.createLinearGradient(0,gradStart,0,H);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(0.35,'rgba(0,0,0,0.82)');
  grad.addColorStop(1,'rgba(0,0,0,0.97)');
  ctx.fillStyle=grad;
  ctx.fillRect(0,gradStart,W,H-gradStart);

  // ── BANDA SUPERIORE: nera opaca ─────────────────────
  ctx.fillStyle='rgba(0,0,0,0.9)';
  ctx.fillRect(0,0,W,HEADER_H);

  // Accento arancio a sinistra
  ctx.fillStyle=ORA;
  ctx.fillRect(0,0,isStory?5:4,HEADER_H);

  // Testo Cinema Multisala
  var hl=isStory?17:isLand?11:14;
  ctx.fillStyle=ORA;
  ctx.font='bold '+hl+'px Arial,sans-serif';
  ctx.textAlign='left';
  ctx.fillText('CINEMA MULTISALA',isStory?14:11,isStory?18:14);

  ctx.fillStyle='rgba(255,255,255,0.52)';
  ctx.font=(isStory?11:isLand?8:10)+'px Arial,sans-serif';
  ctx.fillText('TEATRO MENDRISIO',isStory?14:11,isStory?32:24);

  // Punto decorativo in alto a destra
  ctx.fillStyle=ORA;
  ctx.globalAlpha=0.75;
  ctx.beginPath();
  ctx.arc(W-(isStory?16:12),HEADER_H/2,isStory?6:4,0,Math.PI*2);
  ctx.fill();
  ctx.globalAlpha=1;

  // ── AREA INFO (titolo+meta) ──────────────────────────
  var infoY=H-FOOTER_H-SCHED_H-INFO_H;

  // Linea arancio separatrice
  ctx.fillStyle=ORA;
  ctx.globalAlpha=0.65;
  ctx.fillRect(0,infoY,W,isStory?3:2);
  ctx.globalAlpha=1;

  // Titolo film
  var titleSize=isStory?26:isLand?15:20;
  var title=film.title.toUpperCase();
  ctx.font='bold '+titleSize+'px Arial,sans-serif';
  var maxTW=W-(isStory?30:22);
  while(ctx.measureText(title).width>maxTW&&title.length>5){title=title.slice(0,-1);}
  if(title!==film.title.toUpperCase())title=title.trim()+'\u2026';
  ctx.fillStyle='#ffffff';
  var titleY=infoY+(isStory?32:isLand?20:26);
  ctx.fillText(title,isStory?14:10,titleY);

  // Badge genere (se disponibile)
  if(film.genre){
    var genreX=isStory?14:10;
    var genreY=titleY+(isStory?8:6);
    var genreW=ctx.measureText(film.genre).width;
    ctx.font=(isStory?10:8)+'px Arial,sans-serif';
    genreW=ctx.measureText(film.genre).width+16;
    ctx.fillStyle=ORA2+'0.22)';
    ctx.strokeStyle=ORA2+'0.45)';
    ctx.lineWidth=0.5;
    roundRect(ctx,genreX,genreY,genreW,isStory?16:13,3);
    ctx.fill();ctx.stroke();
    ctx.fillStyle=ORA;
    ctx.textAlign='left';
    ctx.fillText(film.genre,genreX+8,genreY+(isStory?11:9));
  }

  // Meta: durata · rating
  var dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
  var metaParts=[dur,film.rating,film.distributor].filter(Boolean);
  if(metaParts.length){
    ctx.fillStyle='rgba(255,255,255,0.42)';
    ctx.font=(isStory?11:isLand?8:9)+'px Arial,sans-serif';
    ctx.textAlign='left';
    var metaY=infoY+(isStory?66:isLand?36:48);
    ctx.fillText(metaParts.join('  \u00b7  '),isStory?14:10,metaY);
  }

  // ── AREA ORARI ────────────────────────────────────────
  var schedY=H-FOOTER_H-SCHED_H;

  // Separatore tratteggiato
  var sepY=schedY+(isStory?5:3);
  ctx.strokeStyle=ORA2+'0.28)';
  ctx.lineWidth=0.5;
  ctx.setLineDash([2,4]);
  ctx.beginPath();ctx.moveTo(isStory?14:10,sepY);ctx.lineTo(W-(isStory?14:10),sepY);ctx.stroke();
  ctx.setLineDash([]);

  // Label "IN PROGRAMMAZIONE"
  var lblY=sepY+(isStory?14:11);
  ctx.fillStyle=ORA2+'0.55)';
  ctx.font='bold '+(isStory?8:7)+'px Arial,sans-serif';
  ctx.textAlign='center';
  ctx.letterSpacing='1.5px';
  ctx.fillText('IN PROGRAMMAZIONE',W/2,lblY);
  ctx.letterSpacing='0px';

  // Griglia blocchi
  var COLS=Math.min(4,nDays);
  if(nDays===1)COLS=1;
  if(nDays===2)COLS=2;
  if(nDays===3)COLS=3;
  var ROWS=Math.ceil(nDays/COLS);
  var padX=isStory?14:10;
  var bGap=3;
  var bW=Math.floor((W-padX*2-bGap*(COLS-1))/COLS);
  var bStartY=lblY+(isStory?6:4);

  dayOrd.forEach(function(di,i){
    var col=i%COLS;
    var row=Math.floor(i/COLS);
    var bx=padX+col*(bW+bGap);
    var by=bStartY+row*(BLOCK_H+SCHED_GAP);
    var isNear=i<4;
    var alpha=isNear?0.22:0.09;
    var borderAlpha=isNear?0.50:0.25;

    ctx.fillStyle=ORA2+alpha+')';
    ctx.strokeStyle=ORA2+borderAlpha+')';
    ctx.lineWidth=0.5;
    roundRect(ctx,bx,by,bW,BLOCK_H,4);
    ctx.fill();ctx.stroke();

    // Giorno + data
    var dateStr='';
    if(wd[di]){var dp=wd[di].split('-');dateStr=' '+dp[2]+'/'+dp[1];}
    var dayLabel=(DIT2[di]||'?').toUpperCase()+dateStr;
    ctx.fillStyle=isNear?ORA:ORA2+'0.65)';
    ctx.font='bold '+(isStory?8:7)+'px Arial,sans-serif';
    ctx.textAlign='center';
    var cx=bx+bW/2;
    ctx.fillText(dayLabel,cx,by+(isStory?13:10));

    // Orari
    var times=byDay[di].times.slice().sort();
    var timeStr=times.join(' ');
    var tSize=isStory?14:12;
    ctx.font='bold '+tSize+'px Arial,sans-serif';
    while(ctx.measureText(timeStr).width>bW-6&&tSize>9){tSize--;ctx.font='bold '+tSize+'px Arial,sans-serif';}
    ctx.fillStyle=isNear?'#ffffff':'rgba(255,255,255,0.62)';
    ctx.fillText(timeStr,cx,by+BLOCK_H-(isStory?7:5));
  });

  // ── BANDA FOOTER ─────────────────────────────────────
  ctx.fillStyle='rgba(0,0,0,0.85)';
  ctx.fillRect(0,H-FOOTER_H,W,FOOTER_H);

  // Barra arancio in fondo
  ctx.fillStyle=ORA2+'0.45)';
  ctx.fillRect(0,H-3,W,3);

  // Sito web
  ctx.fillStyle='rgba(255,255,255,0.38)';
  ctx.font=(isStory?9:8)+'px Arial,sans-serif';
  ctx.textAlign='left';
  ctx.fillText('mendrisiocinema.ch',isStory?14:10,H-(isStory?4:3));

  // Indirizzo a destra
  ctx.textAlign='right';
  ctx.fillStyle='rgba(255,255,255,0.25)';
  ctx.fillText('Via Vincenzo Vela 2, Mendrisio',W-(isStory?14:10),H-(isStory?4:3));
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function socialDownloadAll(){
  var canvases=document.querySelectorAll('#social-carousel canvas');
  var wraps=document.querySelectorAll('#social-carousel .social-slide-wrap');
  canvases.forEach(function(canvas,i){
    var wrap=wraps[i];
    var title=wrap?wrap.querySelector('.social-slide-label')?.textContent||('slide-'+i):'slide-'+i;
    var a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download='slide-'+title.replace(/[^a-z0-9]/gi,'-').toLowerCase()+'.png';
    setTimeout(function(){a.click();},i*300);
  });
  toast('Download di '+canvases.length+' slide avviato','ok');
}
window.socialDownloadAll=socialDownloadAll;

function socialCopy(n){
  var el=document.getElementById('social-text'+n);
  var tags=document.getElementById('social-tags'+n);
  if(!el)return;
  var txt=el.textContent;
  if(tags&&tags.textContent.trim()){
    var tagText=[...tags.querySelectorAll('.social-tag')].map(function(t){return t.textContent;}).join(' ');
    txt+='\n\n'+tagText;
  }
  navigator.clipboard.writeText(txt).then(function(){toast('Testo copiato','ok');}).catch(function(){toast('Errore copia','err');});
}
window.socialCopy=socialCopy;

function socialWhatsApp(n){
  var el=document.getElementById('social-text'+n);
  if(!el)return;
  var url='https://wa.me/?text='+encodeURIComponent(el.textContent);
  window.open(url,'_blank');
}
window.socialWhatsApp=socialWhatsApp;

function co(id){document.getElementById(id).classList.remove('on');}
function toast(msg,t='ok'){
  const el=document.getElementById('tst');el.textContent=msg;el.className=`toast on ${t==='ok'?'tok':'terr'}`;
  setTimeout(()=>{el.className='toast';},2800);
}
document.querySelectorAll('.ov').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('on');}));
window.co=co;window.toast=toast;

// ── AUTH ─────────────────────────────────────────────────
const auth=getAuth(app);
const provider=new GoogleAuthProvider();
let currentUser=null;

async function signInGoogle(){
  try{
    document.getElementById('login-error').style.display='none';
    await signInWithPopup(auth,provider);
  }catch(e){
    const errEl=document.getElementById('login-error');
    errEl.style.display='block';
    errEl.textContent='Errore di accesso: '+e.message;
  }
}
async function signOutGoogle(){
  await presenzaEnd();
  await signOut(auth);
  currentUser=null;
  showLoginScreen();
}
window.signInGoogle=signInGoogle;window.signOutGoogle=signOutGoogle;

function showLoginScreen(){
  document.getElementById('load-connecting').style.display='none';
  document.getElementById('load-login').style.display='flex';
  document.getElementById('load-denied').style.display='none';
  document.getElementById('loading').style.display='flex';
  document.querySelector('header').style.display='none';
  document.querySelector('.tabs').style.display='none';
  document.querySelector('main').style.display='none';
  document.querySelector('.fab').style.display='none';
}
function showDeniedScreen(email){
  document.getElementById('load-connecting').style.display='none';
  document.getElementById('load-login').style.display='none';
  document.getElementById('load-denied').style.display='flex';
  document.getElementById('denied-email').textContent=email;
  document.getElementById('loading').style.display='flex';
  document.querySelector('header').style.display='none';
  document.querySelector('.tabs').style.display='none';
  document.querySelector('main').style.display='none';
  document.querySelector('.fab').style.display='none';
}
function showApp(user,role){
  document.getElementById('loading').style.display='none';
  document.querySelector('header').style.display='flex';
  document.querySelector('.tabs').style.display='flex';
  document.querySelector('main').style.display='block';
  // Reveal the header actions block (has display:none !important by default)
  const hact=document.querySelector('.hact');
  if(hact){hact.style.cssText='align-items:center;gap:8px;';}
  // Show FAB
  const fab=document.querySelector('.fab');
  if(fab)fab.style.display='flex';
  // User info in header
  const ui=document.getElementById('userInfo');
  ui.style.display='flex';
  document.getElementById('userAvatar').src=user.photoURL||'';
  document.getElementById('userName').textContent=user.displayName||user.email;
  // Tab visibility by role (gestito da applyTabVisibility con permessi Firestore)
  applyTabVisibility(role);
  // Assicura che la tab iniziale (prog) sia attivata correttamente
  // in modo da mostrare/nascondere la wnav
  gt('prog');
  // Hide prog edit buttons per segretaria e operatore senza permessi
  const isSecy=role==='segretaria';
  document.getElementById('btnGlobalOpt').style.display=isSecy?'none':'';
  // Operatore cannot manage users (already hidden), but can do bookings
  // canManageBook = admin OR operatore OR segretaria
  window._userRole=role;
  // Current user info in users page
  const cui=document.getElementById('current-user-info');
  if(cui)cui.innerHTML='<strong>'+(user.displayName||'')+'</strong><br><span style="color:var(--txt2);font-size:12px">'+user.email+'</span><br><span style="font-size:11px;color:var(--acc)">Ruolo: '+role+'</span>';
}

// ══════════════════════════════════════════════════════════
// SISTEMA PRESENZA — tracking utenti online e sessioni
// ══════════════════════════════════════════════════════════
let _presenzaHeartbeat=null;
let _sessionStart=null;
let _presenzaUid=null;
let _currentTabLabel='—';

async function presenzaSetTab(label){
  _currentTabLabel=label;
  if(!_presenzaUid)return;
  await setDoc(doc(db,'presenze',_presenzaUid),{
    currentTab:label,
    lastSeen:new Date().toISOString(),
  },{merge:true});
}

async function presenzaStart(user,ruolo){
  _presenzaUid=user.uid;
  _sessionStart=new Date();
  const data={
    uid:user.uid,
    email:user.email,
    nome:user.displayName||user.email,
    ruolo:ruolo||'—',
    online:true,
    sessionStart:_sessionStart.toISOString(),
    lastSeen:new Date().toISOString(),
    device:navigator.userAgent.includes('Mobile')?'mobile':'desktop',
    currentTab:'—',
    currentAction:'',
  };
  await setDoc(doc(db,'presenze',user.uid),data);
  // Heartbeat ogni 30 secondi con tab corrente
  _presenzaHeartbeat=setInterval(async function(){
    await setDoc(doc(db,'presenze',user.uid),{
      lastSeen:new Date().toISOString(),
      currentTab:_currentTabLabel||'—',
    },{merge:true});
  },30000);
  window.addEventListener('beforeunload',presenzaEnd);
}

async function presenzaEnd(){
  if(!_presenzaUid||!_sessionStart)return;
  clearInterval(_presenzaHeartbeat);
  const fine=new Date();
  const durata=Math.round((fine-_sessionStart)/60000); // minuti
  // Aggiorna presenza → offline
  await setDoc(doc(db,'presenze',_presenzaUid),{
    online:false,
    lastSeen:fine.toISOString(),
  },{merge:true});
  // Salva sessione storica (solo se durata >= 1 minuto)
  if(durata>=1){
    await setDoc(doc(db,'sessioni',_presenzaUid+'_'+_sessionStart.toISOString()),{
      uid:_presenzaUid,
      email:currentUser?.email||'',
      nome:currentUser?.name||'',
      ruolo:currentUser?.role||'—',
      start:_sessionStart.toISOString(),
      end:fine.toISOString(),
      durata,
    });
  }
  _presenzaUid=null;
  _sessionStart=null;
}
window.presenzaEnd=presenzaEnd;

// Auto-refresh presenze ogni 30 secondi se la tab utenti è aperta
setInterval(function(){
  var up=document.getElementById('page-users');
  if(up&&up.classList.contains('on'))renderPresenze();
},30000);

onAuthStateChanged(auth,async function(user){
  if(!user){showLoginScreen();return;}
  // Timeout: se dopo 15s non si connette mostra errore
  var _authTimeout=setTimeout(function(){
    var errEl=document.getElementById('load-err');
    var retryBtn=document.getElementById('load-retry-btn');
    if(errEl){errEl.style.display='block';errEl.textContent='Impossibile connettersi a Firebase. Verifica la connessione internet e riprova.';}
    if(retryBtn)retryBtn.style.display='block';
  },15000);
  // Check if user is authorized
  const snap=await new Promise(res=>{
    const unsub=onSnapshot(doc(db,'settings','users'),s=>{unsub();res(s);},(err)=>{unsub();console.error('Firebase auth error:',err);res({exists:()=>false,data:()=>({})});});
  });
  const users=snap.exists()?snap.data().list||[]:[];
  // First user ever → auto admin
  if(users.length===0){
    const newUser={email:user.email,name:user.displayName||'',role:'admin',uid:user.uid};
    await setDoc(doc(db,'settings','users'),{list:[newUser]});
    currentUser=newUser;
    if(typeof _authTimeout!=='undefined')clearTimeout(_authTimeout);
    startListeners();
    showApp(user,'admin');
    presenzaStart(user,'admin');
    return;
  }
  const found=users.find(u=>u.email.toLowerCase()===user.email.toLowerCase());
  if(!found){showDeniedScreen(user.email);return;}
  currentUser=found;
  if(typeof _authTimeout!=='undefined')clearTimeout(_authTimeout);
  startListeners();
  showApp(user,found.role);
  presenzaStart(user,found.role);
});

// ── USERS MANAGEMENT ─────────────────────────────────────
async function addUser(){
  const email=document.getElementById('new-user-email').value.trim();
  const name=document.getElementById('new-user-name').value.trim();
  const role=document.getElementById('new-user-role').value;
  if(!email||!email.includes('@')){toast('Email non valida','err');return;}
  const snap=await new Promise(res=>{const u=onSnapshot(doc(db,'settings','users'),s=>{u();res(s);});});
  const users=snap.exists()?snap.data().list||[]:[];
  if(users.find(u=>u.email.toLowerCase()===email.toLowerCase())){toast('Utente già presente','err');return;}
  users.push({email,name:name||email,role,uid:''});
  await setDoc(doc(db,'settings','users'),{list:users});
  document.getElementById('new-user-email').value='';
  document.getElementById('new-user-name').value='';
  toast(name||email+' aggiunto','ok');
}
async function removeUser(email){
  if(email===currentUser?.email){toast('Non puoi rimuovere te stesso','err');return;}
  if(!confirm('Rimuovere '+email+'?'))return;
  const snap=await new Promise(res=>{const u=onSnapshot(doc(db,'settings','users'),s=>{u();res(s);});});
  const users=(snap.exists()?snap.data().list||[]:[] ).filter(u=>u.email.toLowerCase()!==email.toLowerCase());
  await setDoc(doc(db,'settings','users'),{list:users});
  toast('Utente rimosso','ok');
}
async function changeRole(email,role){
  const snap=await new Promise(res=>{const u=onSnapshot(doc(db,'settings','users'),s=>{u();res(s);});});
  const users=snap.exists()?snap.data().list||[]:[];
  const u=users.find(u=>u.email.toLowerCase()===email.toLowerCase());
  if(u)u.role=role;
  await setDoc(doc(db,'settings','users'),{list:users});
  toast('Ruolo aggiornato','ok');
}
function renderUsers(users){
  const w=document.getElementById('users-list');
  if(!w)return;
  if(!users.length){w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun utente</div>';return;}
  w.innerHTML=users.map(function(u){
    const isMe=u.email===currentUser?.email;
    const avatar=u.name?u.name.charAt(0).toUpperCase():'?';
    const emailB64=btoa(u.email);
    return '<div class="ei" style="padding:8px 12px;align-items:center;gap:10px">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:rgba(232,200,74,.2);color:var(--acc);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">'+avatar+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">'+u.name+(isMe?' <span style="font-size:10px;color:var(--acc)">(tu)</span>':'')+'</div><div style="font-size:11px;color:var(--txt2)">'+u.email+'</div></div>'
      +'<select data-email="'+emailB64+'" onchange="handleRoleChange(this)" style="font-size:11px;padding:2px 6px;width:120px">'
        +'<option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option>'
        +'<option value="operator"'+(u.role==='operator'?' selected':'')+'>Operatore</option>'
        +'<option value="segretaria"'+(u.role==='segretaria'?' selected':'')+'>Segretaria</option>'
        +'<option value="programmatore"'+(u.role==='programmatore'?' selected':'')+'>Programmatore</option>'
        +'<option value="social"'+(u.role==='social'?' selected':'')+'>Social Mgr</option>'
      +'</select>'
      +(isMe?'':'<button class="btn bd bs" data-email="'+emailB64+'" onclick="handleRemoveUser(this)">✕</button>')
      +'</div>';
  }).join('');
}
function handleRoleChange(sel){changeRole(atob(sel.dataset.email),sel.value);}
function handleRemoveUser(btn){removeUser(atob(btn.dataset.email));}
window.handleRoleChange=handleRoleChange;window.handleRemoveUser=handleRemoveUser;
window.addUser=addUser;window.removeUser=removeUser;window.changeRole=changeRole;

// Listen for users list changes
function startUsersListener(){
  onSnapshot(doc(db,'settings','users'),snap=>{
    const users=snap.exists()?snap.data().list||[]:[];
    renderUsers(users);
  });
}

// ── PRESENZE UTENTI ───────────────────────────────────────
function renderPresenze(){
  var w=document.getElementById('presenze-list');
  if(!w)return;
  var presenze=window._presenze||[];
  var ora=new Date();
  // Considera online chi ha lastSeen negli ultimi 2 minuti
  var soglia=2*60*1000;
  var online=presenze.filter(function(p){
    if(!p.online)return false;
    var ls=p.lastSeen?new Date(p.lastSeen):null;
    return ls&&(ora-ls)<soglia;
  });
  var offline=presenze.filter(function(p){
    var ls=p.lastSeen?new Date(p.lastSeen):null;
    var isFresh=ls&&(ora-ls)<soglia;
    return !p.online||!isFresh;
  }).sort(function(a,b){
    return (b.lastSeen||'').localeCompare(a.lastSeen||'');
  }).slice(0,10);

  var html='';
  // Online ora
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
  html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2)">🟢 Online ora ('+online.length+')</div>';
  html+='<div style="font-size:10px;color:var(--txt2)">aggiorn. ogni 30s · soglia 2 min</div>';
  html+='</div>';
  if(!online.length){
    html+='<div style="font-size:12px;color:var(--txt2);margin-bottom:16px">Nessun utente online al momento.</div>';
  } else {
    html+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
    online.forEach(function(p){
      var inizio=p.sessionStart?new Date(p.sessionStart):null;
      var durataMin=inizio?Math.round((ora-inizio)/60000):0;
      var durataStr=durataMin<60?durataMin+'min':Math.floor(durataMin/60)+'h '+String(durataMin%60).padStart(2,'0')+'min';
      var ls=p.lastSeen?new Date(p.lastSeen):null;
      var secsAgo=ls?Math.round((ora-ls)/1000):0;
      var attivitaStr=secsAgo<60?secsAgo+'s fa':Math.round(secsAgo/60)+'min fa';
      var currentTab=p.currentTab||'—';
      html+='<div style="padding:12px 14px;background:rgba(74,232,122,.06);border:1px solid rgba(74,232,122,.25);border-radius:10px">';
      // Riga principale
      html+='<div style="display:flex;align-items:center;gap:10px">';
      html+='<span style="width:10px;height:10px;border-radius:50%;background:#4ae87a;flex-shrink:0;animation:pulse-green 2s infinite"></span>';
      html+='<div style="flex:1;min-width:0">';
      html+='<div style="font-size:13px;font-weight:600;color:var(--txt)">'+p.nome+'</div>';
      html+='<div style="font-size:11px;color:var(--txt2)">'+p.email+' · '+p.ruolo+' · '+(p.device==='mobile'?'📱':'🖥')+'</div>';
      html+='</div>';
      html+='<div style="text-align:right;flex-shrink:0">';
      html+='<div style="font-size:12px;font-weight:600;color:#4ae87a">'+durataStr+'</div>';
      html+='<div style="font-size:10px;color:var(--txt2)">nella sessione</div>';
      html+='</div>';
      html+='</div>';
      // Riga attività corrente
      html+='<div style="margin-top:8px;display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(74,232,122,.06);border-radius:6px">';
      html+='<span style="font-size:12px">📍</span>';
      html+='<span style="font-size:12px;font-weight:600;color:var(--txt);flex:1">'+currentTab+'</span>';
      html+='<span style="font-size:10px;color:var(--txt2)">'+attivitaStr+'</span>';
      html+='</div>';
      html+='</div>';
    });
    html+='</div>';
  }
  // Recenti offline
  if(offline.length){
    html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:8px">⚫ Ultimi accessi</div>';
    html+='<div style="display:flex;flex-direction:column;gap:5px">';
    offline.forEach(function(p){
      var ls=p.lastSeen?new Date(p.lastSeen):null;
      var lsStr=ls?ls.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      html+='<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;opacity:.7">';
      html+='<span style="width:8px;height:8px;border-radius:50%;background:var(--txt2);flex-shrink:0"></span>';
      html+='<div style="flex:1;min-width:0">';
      html+='<div style="font-size:13px;font-weight:500;color:var(--txt)">'+p.nome+'</div>';
      html+='<div style="font-size:11px;color:var(--txt2)">'+p.email+' · '+p.ruolo+' · '+(p.lastTab||'')+'</div>';
      html+='</div>';
      html+='<div style="font-size:10px;color:var(--txt2);text-align:right">'+lsStr+'</div>';
      html+='</div>';
    });
    html+='</div>';
  }
  w.innerHTML=html;
}
window.renderPresenze=renderPresenze;

async function renderSessioni(){
  var w=document.getElementById('sessioni-list');
  if(!w)return;
  w.innerHTML='<div style="font-size:12px;color:var(--txt2)">Caricamento...</div>';
  try{
    const snap=await getDocs(query(collection(db,'sessioni'),orderBy('start','desc'),limit(50)));
    var sessioni=snap.docs.map(d=>d.data());
    if(!sessioni.length){w.innerHTML='<div style="font-size:12px;color:var(--txt2)">Nessuna sessione registrata.</div>';return;}
    // Raggruppa per utente per statistiche
    var perUtente={};
    sessioni.forEach(function(s){
      if(!perUtente[s.email])perUtente[s.email]={nome:s.nome,email:s.email,ruolo:s.ruolo,sessioni:0,totMin:0};
      perUtente[s.email].sessioni++;
      perUtente[s.email].totMin+=s.durata||0;
    });
    var utenti=Object.values(perUtente).sort(function(a,b){return b.totMin-a.totMin;});
    var html='<div style="margin-bottom:16px">';
    html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:8px">📊 Utilizzo totale (ultime 50 sessioni)</div>';
    html+='<div style="display:flex;flex-direction:column;gap:6px">';
    utenti.forEach(function(u){
      var ore=Math.floor(u.totMin/60);
      var min=u.totMin%60;
      var maxMin=utenti[0].totMin||1;
      var pct=Math.round(u.totMin/maxMin*100);
      html+='<div style="padding:10px 14px;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px">';
      html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
      html+='<div><span style="font-size:13px;font-weight:600;color:var(--txt)">'+u.nome+'</span> <span style="font-size:11px;color:var(--txt2)">'+u.ruolo+'</span></div>';
      html+='<div style="font-size:12px;font-weight:700;color:var(--acc)">'+ore+'h '+String(min).padStart(2,'0')+'min</div>';
      html+='</div>';
      html+='<div style="height:5px;background:var(--bdr);border-radius:3px;overflow:hidden">';
      html+='<div style="height:100%;width:'+pct+'%;background:var(--acc);border-radius:3px;transition:width .4s"></div>';
      html+='</div>';
      html+='<div style="font-size:10px;color:var(--txt2);margin-top:4px">'+u.sessioni+' sessioni</div>';
      html+='</div>';
    });
    html+='</div></div>';
    // Lista sessioni recenti
    html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:8px">🕐 Sessioni recenti</div>';
    html+='<div style="display:flex;flex-direction:column;gap:4px">';
    sessioni.slice(0,20).forEach(function(s){
      var start=s.start?new Date(s.start):null;
      var startStr=start?start.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      var dur=s.durata||0;
      var durStr=dur<60?dur+'min':Math.floor(dur/60)+'h '+String(dur%60).padStart(2,'0')+'min';
      html+='<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--bdr);font-size:12px">';
      html+='<span style="color:var(--txt2);min-width:130px;flex-shrink:0">'+startStr+'</span>';
      html+='<span style="flex:1;color:var(--txt);font-weight:500">'+s.nome+'</span>';
      html+='<span style="color:var(--txt2);font-size:11px">'+s.ruolo+'</span>';
      html+='<span style="color:var(--acc);font-weight:600;min-width:50px;text-align:right">'+durStr+'</span>';
      html+='</div>';
    });
    html+='</div>';
    w.innerHTML=html;
  }catch(e){
    w.innerHTML='<div style="font-size:12px;color:var(--red)">Errore caricamento sessioni: '+e.message+'</div>';
  }
}
window.renderSessioni=renderSessioni;

// ── TURNI TIMELINE GRID ───────────────────────────────────
var STAFF_ROLES={cassiere:'Cassiere',proiezionista:'Proiezionista',maschera:'Maschera',bar:'Bar',responsabile:'Responsabile'};
var _stColor='#4a9ee8';
var _staffDayIdx=0; // current day index 0-6
var _shiftStart=null; // {slotIdx, staffId} first click

// Slot config: 12:00 - 24:00, every 15 min = 48 slots
var SLOT_START=12*60; // 720 min
var SLOT_END=24*60;   // 1440 min
var SLOT_STEP=15;
var SLOT_COUNT=(SLOT_END-SLOT_START)/SLOT_STEP; // 48

function slotToTime(idx){
  var m=SLOT_START+idx*SLOT_STEP;
  return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}
function timeToSlot(t){
  var p=t.split(':');
  var m=parseInt(p[0])*60+parseInt(p[1]);
  return Math.round((m-SLOT_START)/SLOT_STEP);
}

function pickColor(el){
  document.querySelectorAll('.color-dot').forEach(function(d){d.classList.remove('active');});
  el.classList.add('active');
  _stColor=el.dataset.col;
  document.getElementById('stColor').value=_stColor;
}
window.pickColor=pickColor;

function gStaffTab(t){
  ['days','week','people','hours'].forEach(function(x){
    document.getElementById('stab-'+x).classList.toggle('on',x===t);
    document.getElementById('staff-'+x+'-view').style.display=x===t?'block':'none';
  });
  if(t==='days')renderAllDays();
  if(t==='week')renderWeekCompact();
  if(t==='people')renderStaffPeople();
  if(t==='hours')renderStaffHours();
}
window.gStaffTab=gStaffTab;

function staffNavDay(dir){
  _staffDayIdx=Math.max(0,Math.min(6,_staffDayIdx+dir));
  _shiftStart=null;
  var at=document.getElementById('stab-days');
  if(at&&at.classList.contains('on'))renderAllDays();
  else renderWeekCompact();
}
function staffGoDay(val){
  var days=wdays();
  var wd=wdates();
  var idx=wd.indexOf(val);
  if(idx>=0){_staffDayIdx=idx;_shiftStart=null;renderAllDays();}
}
window.staffNavDay=staffNavDay;window.staffGoDay=staffGoDay;

// ── Main grid render ──
function renderStaffGrid(){
  var w=document.getElementById('staff-grid');
  if(!w)return;
  var days=wdays();var wd=wdates();
  var d=days[_staffDayIdx];var ds=wd[_staffDayIdx];

  // Update day label and selector
  var lbl=document.getElementById('staff-day-label');
  if(lbl)lbl.textContent=DIT[_staffDayIdx]+' '+fs(d);
  var sel=document.getElementById('staff-day-sel');
  if(sel){
    sel.innerHTML='';
    days.forEach(function(day,di){
      var o=document.createElement('option');
      o.value=wd[di];o.textContent=DIT[di]+' '+fs(day);
      if(di===_staffDayIdx)o.selected=true;
      sel.appendChild(o);
    });
  }

  if(!S.staff.length){
    w.innerHTML='<div class="empty"><div class="ei2">\u{1F465}</div><div class="et">Aggiungi dipendenti per iniziare</div></div>';
    renderStaffTotals(ds);return;
  }

  var dayShows=S.shows.filter(function(sh){return sh.day===ds;}).sort(function(a,b){return a.start.localeCompare(b.start);});
  var dayShifts=S.shifts.filter(function(sh){return sh.day===ds;});

  // Layout constants
  var NAME_COL=130;  // fixed left column with staff name
  var CELL_W=28;     // width per 15min slot
  var ROW_H=52;      // height per staff row
  var PROG_ROW=36;   // height of prog reference row
  var HEADER_H=32;   // time header row height

  var totalW=NAME_COL+SLOT_COUNT*CELL_W;

  // ── Build HTML ──
  var html='<div style="display:flex;flex-direction:column;min-width:'+totalW+'px">';

  // ── TIME HEADER ROW ──
  html+='<div style="display:flex;position:sticky;top:0;z-index:20;background:var(--surf)">';
  // Corner cell
  html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+HEADER_H+'px;background:var(--surf2);border:1px solid var(--bdr);border-right:2px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--txt2)">TURNI</div>';
  // Time slots header
  for(var si=0;si<SLOT_COUNT;si++){
    var slotMin=SLOT_START+si*SLOT_STEP;
    var isHour=slotMin%60===0;
    var isHalf=slotMin%60===30;
    var label=isHour?String(Math.floor(slotMin/60)).padStart(2,'0')+':00':(isHalf?':30':'');
    html+='<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+HEADER_H+'px;border-bottom:2px solid '+(isHour?'var(--bdr)':'rgba(255,255,255,.08)')+';border-right:1px solid '+(isHour?'var(--bdr)':'rgba(255,255,255,.03)')+';display:flex;align-items:flex-end;justify-content:flex-start;padding-bottom:3px;overflow:visible">'
      +(label?'<span style="font-size:'+(isHour?'11':'9')+'px;font-weight:'+(isHour?'700':'400')+';color:'+(isHour?'var(--txt)':'var(--txt2)')+';white-space:nowrap;position:relative;left:-1px">'+label+'</span>':'')
      +'</div>';
  }
  html+='</div>';

  // ── PROG REFERENCE ROW ──
  html+='<div style="display:flex">';
  html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+PROG_ROW+'px;background:#0a2a0a;border-right:2px solid rgba(74,232,122,.3);display:flex;align-items:center;padding:0 8px;gap:6px">'
    +'<span style="font-size:11px;font-weight:700;color:#4ae87a">PROG</span>'
    +'<span style="font-size:9px;color:rgba(74,232,122,.5)">'+dayShows.length+' spett.</span>'
    +'</div>';
  // Prog slots
  for(var si2=0;si2<SLOT_COUNT;si2++){
    var slotMin2=SLOT_START+si2*SLOT_STEP;
    var isHour2=slotMin2%60===0;
    var covered=dayShows.some(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return slotMin2>=sm&&slotMin2<em;
    });
    var showStart=dayShows.find(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      return slotMin2===sm;
    });
    html+='<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+PROG_ROW+'px;background:'+(covered?'rgba(74,232,122,.15)':'transparent')+';border-right:1px solid '+(isHour2?'rgba(74,232,122,.2)':'rgba(74,232,122,.05)')+';border-left:'+(showStart?'2px solid rgba(74,232,122,.7)':'none')+';position:relative">';
    // No text in PROG — only color fills
    html+='</div>';
  }
  html+='</div>';

  // ── STAFF ROWS ──
  S.staff.forEach(function(s){
    var sShifts=dayShifts.filter(function(sh){return sh.staffId===s.id;});
    var totalMins=sShifts.reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;

    html+='<div style="display:flex;border-bottom:1px solid var(--bdr)">';
    // Name cell — fixed left
    html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+ROW_H+'px;background:var(--surf2);border-right:2px solid '+s.color+';padding:6px 10px;display:flex;flex-direction:column;justify-content:center;position:sticky;left:0;z-index:10">'
      +'<div style="font-size:13px;font-weight:700;color:'+s.color+'">'+s.name+'</div>'
      +'<div style="font-size:10px;color:var(--txt2)">'+(STAFF_ROLES[s.role]||s.role)+'</div>'
      +(totalMins?'<div style="font-size:10px;color:var(--acc);font-weight:600">'+hh+'h'+String(mm).padStart(2,'0')+'</div>':'')
      +'</div>';

    // Time slots for this staff member
    for(var si3=0;si3<SLOT_COUNT;si3++){
      var slotMin3=SLOT_START+si3*SLOT_STEP;
      var isHour3=slotMin3%60===0;
      var cellShift=sShifts.find(function(sh){
        return timeToSlot(sh.start)<=si3&&timeToSlot(sh.end)>si3;
      });
      var isSelStart=_shiftStart&&_shiftStart.staffId===s.id&&_shiftStart.slotIdx===si3;
      var cellBg=cellShift?(s.color+'30'):(isSelStart?'rgba(232,200,74,.4)':'transparent');
      var borderR=isHour3?'1px solid var(--bdr)':'1px solid rgba(255,255,255,.04)';
      var borderL=cellShift&&timeToSlot(cellShift.start)===si3?('2px solid '+s.color):'none';

      html+='<div data-si="'+si3+'" data-sid="'+s.id+'" data-shid="'+(cellShift?cellShift.id:'')+'" style="width:'+CELL_W+'px;flex-shrink:0;height:'+ROW_H+'px;background:'+cellBg+';border-right:'+borderR+';border-left:'+borderL+';position:relative;cursor:pointer;box-sizing:border-box">';
      // Show role label at shift start
      if(cellShift&&timeToSlot(cellShift.start)===si3){
        var shDurMins=(timeToSlot(cellShift.end)-timeToSlot(cellShift.start))*SLOT_STEP;
        var shDurSlots=timeToSlot(cellShift.end)-timeToSlot(cellShift.start);
        html+='<div style="position:absolute;top:4px;left:4px;right:2px;font-size:9px;font-weight:700;color:'+s.color+';overflow:hidden;white-space:nowrap">'
          +(STAFF_ROLES[cellShift.role]||cellShift.role)+'</div>'
          +'<div style="position:absolute;bottom:4px;left:4px;font-size:8px;color:'+s.color+';opacity:.8">'+cellShift.start+'-'+cellShift.end+'</div>';
      }
      html+='</div>';
    }
    html+='</div>';
  });

  html+='</div>';
  w.innerHTML=html;

  // ── Store layout for coordinate-based hit testing ──
  var _gridLayout={
    nameCol:NAME_COL, cellW:CELL_W, rowH:ROW_H,
    progRow:PROG_ROW, headerH:HEADER_H,
    staffCount:S.staff.length,
    staffIds:S.staff.map(function(s){return s.id;})
  };

  function getSlotFromEvent(ev){
    var rect=w.getBoundingClientRect();
    var x=(ev.clientX||ev.touches&&ev.touches[0].clientX||0)-rect.left+w.scrollLeft;
    var y=(ev.clientY||ev.touches&&ev.touches[0].clientY||0)-rect.top;
    var contentX=x-_gridLayout.nameCol;
    var contentY=y-_gridLayout.headerH-_gridLayout.progRow;
    if(contentX<0||contentY<0)return null;
    var si=Math.floor(contentX/_gridLayout.cellW);
    var staffIdx=Math.floor(contentY/_gridLayout.rowH);
    if(si<0||si>=SLOT_COUNT)return null;
    if(staffIdx<0||staffIdx>=_gridLayout.staffCount)return null;
    return{si:si,staffId:_gridLayout.staffIds[staffIdx],staffIdx:staffIdx};
  }

  function highlightRange(){
    if(!_shiftStart||_hoverSlot===null)return;
    w.querySelectorAll('[data-sid="'+_shiftStart.staffId+'"]').forEach(function(el){
      var csi=parseInt(el.dataset.si);
      if(!el.dataset.shid){
        if(csi>=_shiftStart.slotIdx&&csi<=_hoverSlot) el.style.background='rgba(232,200,74,.28)';
        else if(csi===_shiftStart.slotIdx) el.style.background='rgba(232,200,74,.4)';
        else el.style.background='transparent';
      }
    });
  }

  w.addEventListener('pointerdown',function(ev){
    var hit=getSlotFromEvent(ev);
    if(!hit)return;
    var existingShift=dayShifts.find(function(sh){
      return sh.staffId===hit.staffId&&timeToSlot(sh.start)<=hit.si&&timeToSlot(sh.end)>hit.si;
    });
    if(existingShift){editShiftById(existingShift.id);return;}
    onStaffCellClick(hit.si,hit.staffId,'',ev);
    ev.preventDefault();
  },{passive:false});

  w.addEventListener('pointermove',function(ev){
    if(!_shiftStart)return;
    var hit=getSlotFromEvent(ev);
    if(!hit||hit.staffId!==_shiftStart.staffId||hit.si<=_shiftStart.slotIdx)return;
    if(hit.si===_hoverSlot)return;
    _hoverSlot=hit.si;
    var mins=(hit.si-_shiftStart.slotIdx+1)*SLOT_STEP;
    var hh=Math.floor(mins/60);var mm=mins%60;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='Inizio: '+slotToTime(_shiftStart.slotIdx)+' \u2192 Fine: '+slotToTime(hit.si+1)+' ('+hh+'h'+String(mm).padStart(2,'0')+')';
    highlightRange();
    ev.preventDefault();
  },{passive:false});

  w.addEventListener('pointerup',function(ev){
    if(!_shiftStart||_hoverSlot===null)return;
    var hit=getSlotFromEvent(ev);
    if(!hit||hit.staffId!==_shiftStart.staffId||hit.si<=_shiftStart.slotIdx){
      // Single tap — just mark start, wait for second tap
      return;
    }
    var startT=slotToTime(_shiftStart.slotIdx);
    var endT=slotToTime(hit.si+1);
    _pendingShift={staffId:hit.staffId,day:wdates()[_staffDayIdx],start:startT,end:endT};
    openShiftConfirm(hit.staffId,startT,endT);
    _shiftStart=null;_hoverSlot=null;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='';
    renderStaffGrid();
  });

  w.style.touchAction='pan-y';
  w.style.minWidth='max-content';

  renderStaffTotals(ds);
}



function onStaffCellClick(si,staffId,shiftId,ev){
  if(shiftId){editShiftById(shiftId);return;}
  if(!_shiftStart){
    // First click — mark start
    _shiftStart={slotIdx:si,staffId:staffId};
    _hoverSlot=null;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='Inizio: '+slotToTime(si)+' — clicca su un\'altra cella più in basso per impostare la fine turno';
    // Highlight just the start cell
    var startEl=document.querySelector('[data-si="'+si+'"][data-sid="'+staffId+'"]');
    if(startEl)startEl.style.background='rgba(232,200,74,.4)';
  } else if(_shiftStart.staffId===staffId&&si>_shiftStart.slotIdx){
    // Second click — open confirm modal
    var startT=slotToTime(_shiftStart.slotIdx);
    var endT=slotToTime(si+1);
    _pendingShift={staffId:staffId,day:wdates()[_staffDayIdx],start:startT,end:endT};
    openShiftConfirm(staffId,startT,endT);
    _shiftStart=null;_hoverSlot=null;
    var h2=document.getElementById('staff-hint');
    if(h2)h2.textContent='';
    renderStaffGrid();
  } else {
    // Reset or different staff
    _shiftStart=null;_hoverSlot=null;
    var h3=document.getElementById('staff-hint');
    if(h3)h3.textContent='';
    renderStaffGrid();
  }
}
window.onStaffCellClick=onStaffCellClick;

var _pendingShift=null;
var _hoverSlot=null;
function onStaffCellHover(si,staffId){
  if(!_shiftStart||_shiftStart.staffId!==staffId)return;
  if(si<=_shiftStart.slotIdx)return;
  // Now handled by pointermove listener on container
  _hoverSlot=si;
}
window.onStaffCellHover=onStaffCellHover;
function openShiftConfirm(staffId,startT,endT){
  var s=S.staff.find(function(x){return x.id===staffId;});
  var el=function(i){return document.getElementById(i);};
  el('shStaff').innerHTML='';
  S.staff.forEach(function(st){
    var o=document.createElement('option');
    o.value=st.id;o.textContent=st.name;
    if(st.id===staffId)o.selected=true;
    el('shStaff').appendChild(o);
  });
  var days=wdays();var wd=wdates();
  el('shDay').innerHTML='';
  days.forEach(function(day,di){
    var o=document.createElement('option');
    o.value=wd[di];o.textContent=DIT[di]+' '+fs(day);
    if(di===_staffDayIdx)o.selected=true;
    el('shDay').appendChild(o);
  });
  el('shStart').value=startT;
  el('shEnd').value=endT;
  el('shRole').value=(s&&s.role)||'cassiere';
  el('shNote').value='';
  el('shId').value='';
  el('shDelBtn').style.display='none';
  el('ovShiftT').textContent='Nuovo turno — '+( s?s.name:'')+' '+startT+' → '+endT;
  el('ovShift').classList.add('on');
}

function editShiftById(id){
  var sh=S.shifts.find(function(s){return s.id===id;});
  if(!sh)return;
  var el=function(i){return document.getElementById(i);};
  el('ovShiftT').textContent='Modifica turno';
  el('shId').value=id;
  el('shDelBtn').style.display='inline-flex';
  el('shStaff').innerHTML='';
  S.staff.forEach(function(s){
    var o=document.createElement('option');o.value=s.id;o.textContent=s.name;
    if(s.id===sh.staffId)o.selected=true;
    el('shStaff').appendChild(o);
  });
  var days=wdays();var wd=wdates();
  el('shDay').innerHTML='';
  days.forEach(function(day,di){
    var o=document.createElement('option');o.value=wd[di];o.textContent=DIT[di]+' '+fs(day);
    if(wd[di]===sh.day)o.selected=true;
    el('shDay').appendChild(o);
  });
  el('shStart').value=sh.start;
  el('shEnd').value=sh.end;
  el('shRole').value=sh.role||'cassiere';
  el('shNote').value=sh.note||'';
  el('ovShift').classList.add('on');
}
window.editShiftById=editShiftById;
function openShift(day,staffId,shiftId){if(shiftId)editShiftById(shiftId);else{_staffDayIdx=wdates().indexOf(day);_shiftStart=null;renderStaffGrid();}}
window.openShift=openShift;

function renderStaffTotals(ds){
  var w=document.getElementById('staff-totals');
  if(!w||!S.staff.length)return;
  var dayShifts=S.shifts.filter(function(sh){return sh.day===ds;});
  var rows='';
  var grandTotal=0;
  S.staff.forEach(function(s){
    var sShifts=dayShifts.filter(function(sh){return sh.staffId===s.id;});
    var totalMins=sShifts.reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    grandTotal+=totalMins;
    if(!totalMins)return;
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;
    rows+='<div style="display:flex;align-items:center;gap:8px;padding:4px 8px">'
      +'<div style="width:10px;height:10px;border-radius:50%;background:'+s.color+'"></div>'
      +'<div style="font-size:12px;font-weight:600;flex:1">'+s.name+'</div>'
      +'<div style="font-size:11px;font-family:monospace,monospace;color:var(--acc)">'+hh+'h'+String(mm).padStart(2,'0')+'</div>'
      +'</div>';
  });
  if(!rows){w.innerHTML='';return;}
  var gh=Math.floor(grandTotal/60);var gm=grandTotal%60;
  w.innerHTML='<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:6px 4px">'
    +'<div style="font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;margin-bottom:4px">Totali giornata</div>'
    +rows
    +'<div style="border-top:1px solid var(--bdr);margin-top:4px;padding:4px 8px;display:flex;justify-content:space-between">'
    +'<span style="font-size:11px;font-weight:700">Totale</span>'
    +'<span style="font-size:11px;font-family:monospace,monospace;color:var(--acc);font-weight:700">'+gh+'h'+String(gm).padStart(2,'0')+'</span>'
    +'</div></div>';
}

// ── Staff members CRUD ──
function openStaffMember(id){
  var el=function(i){return document.getElementById(i);};
  if(id){
    var m=S.staff.find(function(s){return s.id===id;});
    if(!m)return;
    el('ovStaffT').textContent='Modifica Dipendente';
    el('stId').value=id;el('stName').value=m.name||'';
    el('stRole').value=m.role||'cassiere';
    el('stEmail').value=m.email||'';el('stPhone').value=m.phone||'';
    _stColor=m.color||'#4a9ee8';el('stColor').value=_stColor;
    document.querySelectorAll('.color-dot').forEach(function(d){d.classList.toggle('active',d.dataset.col===_stColor);});
  } else {
    el('ovStaffT').textContent='Nuovo Dipendente';
    el('stId').value='';el('stName').value='';el('stRole').value='cassiere';
    el('stEmail').value='';el('stPhone').value='';
    _stColor='#4a9ee8';el('stColor').value=_stColor;
    document.querySelectorAll('.color-dot').forEach(function(d,i){d.classList.toggle('active',i===0);});
  }
  el('ovStaff').classList.add('on');
}
async function svStaffMember(){
  var name=document.getElementById('stName').value.trim();
  if(!name){toast('Inserisci il nome','err');return;}
  var id=document.getElementById('stId').value||uid();
  var m={id:id,name:name,role:document.getElementById('stRole').value,
    email:document.getElementById('stEmail').value,
    phone:document.getElementById('stPhone').value,
    color:document.getElementById('stColor').value};
  await setDoc(doc(db,'staff',id),m);
  co('ovStaff');toast('Salvato','ok');
}
async function delStaffMember(id){
  if(!confirm('Eliminare questo dipendente?'))return;
  await deleteDoc(doc(db,'staff',id));toast('Eliminato','ok');
}
window.openStaffMember=openStaffMember;window.svStaffMember=svStaffMember;window.delStaffMember=delStaffMember;

// ── Shift save/delete ──
async function svShift(){
  var staffId=document.getElementById('shStaff').value;
  var day=document.getElementById('shDay').value;
  if(!staffId||!day){toast('Seleziona dipendente e giorno','err');return;}
  var id=document.getElementById('shId').value||uid();
  var sh={id:id,staffId:staffId,day:day,
    start:document.getElementById('shStart').value,
    end:document.getElementById('shEnd').value,
    role:document.getElementById('shRole').value,
    note:document.getElementById('shNote').value};
  await setDoc(doc(db,'shifts',id),sh);
  co('ovShift');toast('Turno salvato','ok');
}
async function delShift(){
  var id=document.getElementById('shId').value;
  if(!id)return;
  if(!confirm('Eliminare?'))return;
  await deleteDoc(doc(db,'shifts',id));
  co('ovShift');toast('Eliminato','ok');
}
window.svShift=svShift;window.delShift=delShift;

// ── Render people list ──
function renderStaffPeople(){
  var w=document.getElementById('staff-people-list');
  if(!w)return;
  if(!S.staff.length){w.innerHTML='<div class="empty"><div class="et">Nessun dipendente</div></div>';return;}
  var wd=wdates();
  w.innerHTML='';
  S.staff.forEach(function(s){
    var weekShifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&wd.includes(sh.day);});
    var totalMins=weekShifts.reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;
    var card=document.createElement('div');
    card.className='book-card';card.style.borderTopColor=s.color;
    card.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      +'<div style="width:36px;height:36px;border-radius:50%;background:'+s.color+'22;border:2px solid '+s.color+';display:flex;align-items:center;justify-content:center;font-weight:700;color:'+s.color+'">'+s.name.charAt(0).toUpperCase()+'</div>'
      +'<div style="flex:1"><div style="font-weight:700;font-size:14px">'+s.name+'</div>'
      +'<div style="font-size:11px;color:var(--txt2)">'+(STAFF_ROLES[s.role]||s.role)+'</div></div>'
      +'<div style="display:flex;gap:5px">'
      +'<button class="btn bg bs" data-sid="'+s.id+'" onclick="openStaffMember(this.dataset.sid)">✏</button>'
      +'<button class="btn bd bs" data-sid="'+s.id+'" onclick="delStaffMember(this.dataset.sid)">✕</button>'
      +'</div></div>'
      +(s.email?'<div style="font-size:11px;color:var(--txt2);margin-bottom:2px">📧 '+s.email+'</div>':'')
      +(s.phone?'<div style="font-size:11px;color:var(--txt2);margin-bottom:6px">📞 '+s.phone+'</div>':'')
      +'<div style="font-size:11px;color:var(--acc)">'+weekShifts.length+' turni · '+(totalMins?hh+'h'+String(mm).padStart(2,'0'):'-')+'</div>';
    w.appendChild(card);
  });
}

// ── Hours summary ──
function renderStaffHours(){
  var w=document.getElementById('staff-hours-list');
  if(!w)return;
  var wd=wdates();var days=wdays();
  var rows=S.staff.map(function(s){
    var mins=S.shifts.filter(function(sh){return sh.staffId===s.id&&wd.includes(sh.day);}).reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    return {s:s,mins:mins};
  }).sort(function(a,b){return b.mins-a.mins;});
  var maxMins=rows.length&&rows[0].mins?rows[0].mins:1;
  var html='<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;overflow:hidden">'
    +'<div style="padding:10px 14px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--txt2)">Settimana '+fd(days[0])+' - '+fd(days[6])+'</div>';
  rows.forEach(function(r){
    var hh=Math.floor(r.mins/60);var mm=r.mins%60;
    var pct=Math.round(r.mins/maxMins*100);
    html+='<div class="hours-row">'
      +'<div style="display:flex;align-items:center;gap:8px;flex:1">'
      +'<div style="width:28px;height:28px;border-radius:50%;background:'+r.s.color+'22;border:2px solid '+r.s.color+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:'+r.s.color+'">'+r.s.name.charAt(0)+'</div>'
      +'<div class="hours-name">'+r.s.name+'<br><span style="font-size:10px;color:var(--txt2)">'+(STAFF_ROLES[r.s.role]||r.s.role)+'</span></div>'
      +'</div>'
      +'<div class="hours-bar-wrap"><div class="hours-bar" style="width:'+pct+'%;background:'+r.s.color+'"></div></div>'
      +'<div class="hours-val">'+(r.mins?hh+'h'+String(mm).padStart(2,'0'):'-')+'</div>'
      +'</div>';
  });
  var tot=rows.reduce(function(a,r){return a+r.mins;},0);
  var th=Math.floor(tot/60);var tm=tot%60;
  html+='<div style="padding:8px 14px;border-top:1px solid var(--bdr);font-size:11px;color:var(--txt2);text-align:right">Totale settimana: <strong>'+th+'h'+String(tm).padStart(2,'0')+'</strong></div></div>';
  w.innerHTML=html;
}

// ── PDF turni ──
function pPDFStaff(){
  var days=wdays();var wd=wdates();
  var CN=window.CINEMA_CONFIG.nome;
  var css='@page{size:A4 landscape;margin:12mm;}body{font-family:Arial,sans-serif;font-size:10px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top;}th{background:#f5f5f5;font-weight:700;}.chip{border-radius:3px;padding:2px 6px;color:#fff;font-size:9px;display:inline-block;margin:1px;}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;margin-bottom:10px;padding-bottom:6px;}';
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>';
  html+='<div class="hdr"><strong>Turni Personale — '+fd(days[0])+' / '+fd(days[6])+'</strong><span>'+CN+'</span><span>'+new Date().toLocaleDateString('it-IT')+'</span></div>';
  html+='<table><tr><th>Dipendente</th>';
  days.forEach(function(d,di){html+='<th>'+DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</th>';});
  html+='<th>Ore sett.</th></tr>';
  S.staff.forEach(function(s){
    var totalMins=0;
    html+='<tr><td><strong style="color:'+s.color+'">'+s.name+'</strong><br><span style="color:#888;font-size:9px">'+(STAFF_ROLES[s.role]||s.role)+'</span></td>';
    wd.forEach(function(ds){
      var shifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&sh.day===ds;});
      html+='<td>';
      shifts.forEach(function(sh){
        var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
        var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
        totalMins+=(em>sm?em-sm:0);
        html+='<div class="chip" style="background:'+s.color+'">'+sh.start+'-'+sh.end+'</div>';
        if(sh.note)html+='<div style="font-size:8px;color:#888">'+sh.note+'</div>';
      });
      html+='</td>';
    });
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;
    html+='<td style="font-weight:700;color:'+s.color+'">'+(totalMins?hh+'h'+String(mm).padStart(2,'0'):'-')+'</td></tr>';
  });
  html+='</table></body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=u;
  a.download='turni-'+toLocalDate(new Date())+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(u);},10000);
  toast('PDF in download — apri il file e usa Cmd+P per stampare','ok');
}
// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Clienti · Luoghi · Addetti
// ══════════════════════════════════════════════════════════
var _oaTab='clienti'; // subtab attivo

function oaInit(){
  oaGTab(_oaTab);
}
window.oaInit=oaInit;

function oaGTab(t){
  _oaTab=t;
  ['clienti','luoghi','addetti','prenot','slots','richieste','servizi','listino','prev','filmoa'].forEach(function(id){
    var btn=document.getElementById('oatab-'+id);
    if(btn)btn.classList.toggle('on',id===t);
    var sec=document.getElementById('oa-sec-'+id);
    if(sec)sec.style.display=id===t?'block':'none';
  });
  var addBtn=document.getElementById('oa-add-btn');
  if(addBtn)addBtn.style.display=(t==='prenot'||t==='slots'||t==='richieste'||t==='listino'||t==='prev'||t==='filmoa')?'none':'';
  if(t==='clienti')oaRenderClienti();
  if(t==='luoghi')oaRenderLuoghi();
  if(t==='addetti')oaRenderAddetti();
  if(t==='prenot')oaRenderPrenot();
  if(t==='slots')oaRenderSlots();
  if(t==='richieste')oaRenderRichieste();
  if(t==='servizi')oaRenderServizi();
  if(t==='listino')oaRenderListino();
  if(t==='prev')oaRenderPreventivo();
  if(t==='filmoa')oaRenderFilmOA();
}
window.oaGTab=oaGTab;

function oaRenderPrenot(){
  var w=document.getElementById('oa-prenot-list');
  if(!w)return;
  var today=toLocalDate(new Date());
  var oaBooks=S.bookings.filter(function(b){return b.type==='openair';})
    .sort(function(a,b2){
      var aMin=(a.dates||[]).map(function(d){return d.date;}).sort()[0]||'9999';
      var bMin=(b2.dates||[]).map(function(d){return d.date;}).sort()[0]||'9999';
      return aMin.localeCompare(bMin);
    });
  if(!oaBooks.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessuna prenotazione Open Air.</div>';
    return;
  }
  var html='<div style="display:flex;flex-direction:column;gap:10px">';
  oaBooks.forEach(function(b){
    var luogo=b.oaLuogoId?S.oaLuoghi.find(function(l){return l.id===b.oaLuogoId;}):null;
    var cliente=b.oaClienteId?S.oaClienti.find(function(c){return c.id===b.oaClienteId;}):null;
    var allDates=b.dates||[];
    var upDates=allDates.filter(function(d){return d.date>=today;});
    html+='<div class="oa-card" style="cursor:default">';
    // Header
    html+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">';
    html+='<div>';
    html+='<div class="oa-card-title" style="color:#0d5c8a;margin-bottom:3px">'+b.name+'</div>';
    if(cliente)html+='<div style="font-size:11px;color:var(--txt2)">🏢 '+cliente.ragione+'</div>';
    if(luogo){
      html+='<div style="font-size:11px;color:var(--txt2)">📍 '+luogo.nome+(luogo.comune?' — '+luogo.comune:'');
      if(luogo.kmAR)html+=' · <span style="color:var(--grn);font-weight:600">🚗 '+luogo.km+' km | A/R '+luogo.kmAR+' km</span>';
      html+='</div>';
    }
    if(!luogo&&b.oaKm)html+='<div style="font-size:11px;color:var(--grn)">🚗 A/R: '+b.oaKm+' km</div>';
    html+='</div>';
    html+='<button class="btn bg bs" onclick="editBook(\''+b.id+'\')" style="flex-shrink:0">✏ Modifica</button>';
    html+='<button class="btn ba bs" onclick="oaApriPreventivo(\''+b.id+'\')" style="flex-shrink:0">💰 Preventivo</button>';
    html+='</div>';
    // Date con dossier
    if(allDates.length){
      html+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
      allDates.forEach(function(d,idx){
        var ds=d.dossier||{};
        var sc=ds.status==='confermata'?'#4ae87a':ds.status==='annullata'?'#e84a4a':'#888';
        var sl=ds.status==='confermata'?'✅ Confermata':ds.status==='annullata'?'❌ Annullata':'⏳ Standby';
        var di=d.date.split('-');
        var dl=di[2]+'/'+di[1]+' '+d.start;
        var isFuture=d.date>=today;
        // Avanzamento dossier: conta check completati
        var checks=[ds.risProv,ds.risConf,ds.luogoScelto,ds.confirmaSigned,ds.filmConfermato,ds.filmInArchivio,ds.fatturaEmessa];
        var done=checks.filter(Boolean).length;
        var pct=Math.round(done/checks.length*100);
        html+='<div onclick="openOADossier(\''+b.id+'\','+idx+')" style="cursor:pointer;border:1px solid var(--bdr);border-radius:7px;padding:6px 10px;background:var(--surf2);min-width:120px;transition:border-color .15s" onmouseover="this.style.borderColor=\'#0d5c8a\'" onmouseout="this.style.borderColor=\'\'">';
        html+='<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">';
        html+='<span style="width:8px;height:8px;border-radius:50%;background:'+sc+';flex-shrink:0"></span>';
        html+='<span style="font-size:11px;font-weight:600;color:var(--txt)'+(isFuture?'':';opacity:.6')+'">' +dl+'</span>';
        html+='</div>';
        html+='<div style="font-size:9px;color:var(--txt2);margin-bottom:4px">'+sl+'</div>';
        // Progress bar avanzamento
        html+='<div style="height:3px;background:var(--bdr);border-radius:2px;overflow:hidden">';
        html+='<div style="height:100%;width:'+pct+'%;background:#0d5c8a;border-radius:2px"></div>';
        html+='</div>';
        html+='<div style="font-size:9px;color:var(--txt2);margin-top:2px;text-align:right">'+pct+'% completato</div>';
        html+='<div style="font-size:9px;color:#4ab4e8;margin-top:3px;text-align:center">📋 Apri dossier</div>';
        html+='</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  });
  html+='</div>';
  w.innerHTML=html;
}
window.oaRenderPrenot=oaRenderPrenot;

// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Calendario Date Disponibili
// ══════════════════════════════════════════════════════════

// Genera tutti i giorni da maggio a fine settembre per un anno dato
function oaGenerateStagione(anno){
  var giorni=[];
  // Maggio=4, Settembre=8 (0-based)
  for(var mese=4;mese<=8;mese++){
    var ultimoGiorno=new Date(anno,mese+1,0).getDate();
    for(var g=1;g<=ultimoGiorno;g++){
      var d=new Date(anno,mese,g);
      giorni.push(toLocalDate(d));
    }
  }
  return giorni;
}

// Conta prenotazioni OA confermate per una data
function oaCountPrenotazioni(dateStr){
  return S.bookings.filter(function(b){
    return b.type==='openair'&&(b.dates||[]).some(function(d){return d.date===dateStr;});
  }).length;
}

async function oaInitStagione(anno){
  if(!confirm('Generare tutti gli slot maggio-settembre '+anno+'? Verranno creati solo i giorni non esistenti.'))return;
  toast('Generazione slot in corso...','ok');
  var giorni=oaGenerateStagione(anno);
  var existing=new Set(S.oaSlots.map(function(s){return s.data;}));
  var batch=[];
  giorni.forEach(function(data){
    if(!existing.has(data)){
      batch.push({data,bloccata:false,note:'',anno});
    }
  });
  // Firestore batch writes (max 500 per batch)
  for(var i=0;i<batch.length;i++){
    var slot=batch[i];
    await setDoc(doc(db,'oaSlots',slot.data),slot);
  }
  toast(batch.length+' slot generati per stagione '+anno,'ok');
}
window.oaInitStagione=oaInitStagione;

async function oaToggleSlot(data){
  // Rimosso — ora usa oaOpenSlotMenu
}
window.oaToggleSlot=oaToggleSlot;

// Popup contestuale per gestire lo slot
function oaOpenSlotMenu(data){
  var slot=S.oaSlots.find(function(s){return s.data===data;});
  var prenCount=oaCountPrenotazioni(data);
  var maxPren=slot?.maxPren||2;
  var bloccata=slot?.bloccata||false;

  // Rimuovi popup precedente
  var prev=document.getElementById('slot-menu');
  if(prev)prev.remove();

  var dt=new Date(data+'T12:00:00');
  var label=dt.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});

  var menu=document.createElement('div');
  menu.id='slot-menu';
  menu.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
    +'background:var(--surf);border:1px solid var(--bdr-strong);border-radius:12px;'
    +'padding:16px;z-index:9000;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,.3)';

  var info='<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:4px">'+label+'</div>'
    +'<div style="font-size:11px;color:var(--txt2);margin-bottom:14px">'
    +prenCount+' prenotazione/i · max attuale: '+maxPren
    +(bloccata?' · <span style="color:var(--red)">bloccata</span>':'')
    +'</div>';

  // Bottoni opzioni
  var btns='<div style="display:flex;flex-direction:column;gap:8px">';

  // Max 1 prenotazione
  btns+='<button onclick="oaSetSlotMax(\''+data+'\',1)" style="'
    +'background:'+(maxPren===1&&!bloccata?'rgba(22,163,74,.15)':'var(--surf2)')
    +';border:1px solid '+(maxPren===1&&!bloccata?'#16a34a':'var(--bdr)')
    +';border-radius:8px;padding:10px 14px;cursor:pointer;text-align:left;font-size:13px;color:var(--txt)">'
    +'<strong>1 posto</strong> <span style="font-size:11px;color:var(--txt2)">— una sola prenotazione ammessa</span></button>';

  // Max 2 prenotazioni
  btns+='<button onclick="oaSetSlotMax(\''+data+'\',2)" style="'
    +'background:'+(maxPren===2&&!bloccata?'rgba(22,163,74,.15)':'var(--surf2)')
    +';border:1px solid '+(maxPren===2&&!bloccata?'#16a34a':'var(--bdr)')
    +';border-radius:8px;padding:10px 14px;cursor:pointer;text-align:left;font-size:13px;color:var(--txt)">'
    +'<strong>2 posti</strong> <span style="font-size:11px;color:var(--txt2)">— due prenotazioni ammesse (default)</span></button>';

  // Blocca/Sblocca
  btns+='<button onclick="oaSetSlotBlocca(\''+data+'\')" style="'
    +'background:'+(bloccata?'rgba(220,38,38,.1)':'var(--surf2)')
    +';border:1px solid '+(bloccata?'rgba(220,38,38,.4)':'var(--bdr)')
    +';border-radius:8px;padding:10px 14px;cursor:pointer;text-align:left;font-size:13px;color:'+(bloccata?'var(--red)':'var(--txt)')+'">'
    +(bloccata?'🔓 <strong>Sblocca</strong>':'🔒 <strong>Blocca</strong>')+' <span style="font-size:11px;opacity:.7">— non disponibile</span></button>';

  // Annulla
  btns+='<button onclick="document.getElementById(\'slot-menu\').remove()" style="'
    +'background:none;border:none;padding:6px;cursor:pointer;font-size:12px;color:var(--txt2);text-align:center;width:100%">'
    +'Annulla</button>';

  btns+='</div>';
  menu.innerHTML=info+btns;

  // Click fuori chiude
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:8999;background:rgba(0,0,0,.2)';
  overlay.onclick=function(){menu.remove();overlay.remove();};
  overlay.id='slot-overlay';
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}
window.oaOpenSlotMenu=oaOpenSlotMenu;

async function oaSetSlotMax(data,max){
  var slot=S.oaSlots.find(function(s){return s.data===data;})||{};
  await setDoc(doc(db,'oaSlots',data),{
    data,
    bloccata:false,
    note:slot.note||'',
    anno:parseInt(data.substring(0,4)),
    maxPren:max
  });
  var m=document.getElementById('slot-menu');if(m)m.remove();
  var ov=document.getElementById('slot-overlay');if(ov)ov.remove();
  toast('Slot impostato a max '+max+' prenotazione/i','ok');
}
window.oaSetSlotMax=oaSetSlotMax;

async function oaSetSlotBlocca(data){
  var slot=S.oaSlots.find(function(s){return s.data===data;});
  await setDoc(doc(db,'oaSlots',data),{
    data,
    bloccata:!(slot?.bloccata),
    note:slot?.note||'',
    anno:parseInt(data.substring(0,4)),
    maxPren:slot?.maxPren||2
  });
  var m=document.getElementById('slot-menu');if(m)m.remove();
  var ov=document.getElementById('slot-overlay');if(ov)ov.remove();
}
window.oaSetSlotBlocca=oaSetSlotBlocca;

async function oaSetSlotNote(data,note){
  var slot=S.oaSlots.find(function(s){return s.data===data;})||{};
  await setDoc(doc(db,'oaSlots',data),{...slot,data,note});
}
window.oaSetSlotNote=oaSetSlotNote;

var _oaSlotAnno=new Date().getFullYear();
var _oaSlotMese=new Date().getMonth(); // 0-based, clampato a 4-8

function oaRenderSlots(){
  var w=document.getElementById('oa-slots-list');
  if(!w)return;
  // Assicura che il mese sia nella stagione OA (mag-set)
  if(_oaSlotMese<4)_oaSlotMese=4;
  if(_oaSlotMese>8)_oaSlotMese=8;
  var oggi=toLocalDate(new Date());
  var meseNomi=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  // Controlla se esistono slot per questo anno
  var slotsAnno=S.oaSlots.filter(function(s){return s.anno===_oaSlotAnno||s.data.startsWith(String(_oaSlotAnno));});
  var html='';
  // Header navigazione
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">';
  html+='<div style="display:flex;align-items:center;gap:10px">';
  html+='<button class="btn bg bs" onclick="oaSlotNavAnno(-1)">‹ '+(_oaSlotAnno-1)+'</button>';
  html+='<span style="font-size:14px;font-weight:600;min-width:60px;text-align:center">'+_oaSlotAnno+'</span>';
  html+='<button class="btn bg bs" onclick="oaSlotNavAnno(1)">'+(_oaSlotAnno+1)+' ›</button>';
  // Bottone Oggi — porta all'anno/mese corrente se nella stagione
  var oraMese=new Date().getMonth();
  var oraAnno=new Date().getFullYear();
  var meseStagione=Math.min(Math.max(oraMese,4),8);
  html+='<button class="btn bg bs" onclick="oaSlotNavAnno('+(oraAnno-_oaSlotAnno)+');oaSlotNavMese('+meseStagione+')" title="Vai al mese corrente">📍 Oggi</button>';
  html+='</div>';
  html+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  for(var m=4;m<=8;m++){
    html+='<button class="btn '+(m===_oaSlotMese?'ba':'bg')+' bs" onclick="oaSlotNavMese('+m+')">'+meseNomi[m]+'</button>';
  }
  html+='</div>';
  html+='<button class="btn '+(slotsAnno.length?'bg':'ba')+' bs" onclick="oaInitStagione('+_oaSlotAnno+')" title="'+(slotsAnno.length?'Aggiunge giorni mancanti senza sovrascrivere':'Genera tutti i giorni maggio-settembre')+'">⚡ '+(slotsAnno.length?'Integra':'Genera')+' stagione '+_oaSlotAnno+'</button>';
  html+='</div>';
  // Legenda
  html+='<div style="display:flex;gap:14px;font-size:11px;margin-bottom:14px;flex-wrap:wrap">';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(74,232,122,.1);border:1px solid rgba(74,232,122,.5);display:inline-block"></span>Disponibile (2 posti)</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.5);display:inline-block"></span>Disponibile (1 posto)</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(232,74,74,.12);border:1px solid rgba(232,74,74,.4);display:inline-block"></span>Bloccata (admin)</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(240,128,26,.15);border:1px solid #f0801a;display:inline-block"></span>1 prenotazione</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(150,150,150,.15);border:1px solid #888;display:inline-block"></span>Piena</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:rgba(138,43,226,.12);border:1px solid rgba(138,43,226,.4);display:inline-block"></span>📨 Richiesta ricevuta</span>';
  html+='<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:var(--surf2);border:1px solid var(--bdr);opacity:.4;display:inline-block"></span>Fuori stagione</span>';
  html+='</div>';
  // Calendario mese
  var primoGiorno=new Date(_oaSlotAnno,_oaSlotMese,1);
  var ultimoGiorno=new Date(_oaSlotAnno,_oaSlotMese+1,0);
  var giorniSettimana=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  html+='<div style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--txt)">'+meseNomi[_oaSlotMese]+' '+_oaSlotAnno+'</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">';
  giorniSettimana.forEach(function(g){
    html+='<div style="text-align:center;font-size:10px;font-weight:600;color:var(--txt2);padding:4px 0">'+g+'</div>';
  });
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  // Offset primo giorno (lun=0)
  var offset=(primoGiorno.getDay()+6)%7;
  for(var i=0;i<offset;i++){html+='<div></div>';}
  // Giorni del mese
  for(var g=1;g<=ultimoGiorno.getDate();g++){
    var data=_oaSlotAnno+'-'+String(_oaSlotMese+1).padStart(2,'0')+'-'+String(g).padStart(2,'0');
    var slot2=S.oaSlots.find(function(s){return s.data===data;});
    var prenCount=oaCountPrenotazioni(data);
    var maxPren=slot2?.maxPren||2;
    // Conta richieste ricevute per questa data (non rifiutate)
    var richCount=S.oaRichieste.filter(function(r){
      return r.stato!=='rifiutata'&&(r.date||[]).includes(data);
    }).length;
    var passata=data<oggi;
    var dow=(new Date(data).getDay()+6)%7;
    var isWeekend=dow>=5;
    // Stato colore
    var bg,border,cursor='pointer',opacity='1';
    if(passata){bg='var(--surf2)';border='var(--bdr)';cursor='default';opacity='.45';}
    else if(!slot2){bg='var(--surf2)';border='var(--bdr)';cursor='default';opacity='.5';}
    else if(prenCount>=maxPren){bg='rgba(150,150,150,.15)';border='#888';}// piena
    else if(slot2.bloccata){bg='rgba(232,74,74,.12)';border='rgba(232,74,74,.4)';}// bloccata
    else if(prenCount===1&&maxPren===1){bg='rgba(150,150,150,.15)';border='#888';}// 1/1 = piena
    else if(prenCount===1){bg='rgba(240,128,26,.15)';border='#f0801a';}// 1/2 pren
    else if(maxPren===1){bg='rgba(14,165,233,.08)';border='rgba(14,165,233,.5)';}// libera ma solo 1 posto
    else{bg='rgba(74,232,122,.1)';border='rgba(74,232,122,.5)';}// libera 2 posti
    var clickable=slot2&&!passata;
    var richIds=S.oaRichieste.filter(function(r){
      return r.stato!=='rifiutata'&&(r.date||[]).includes(data);
    }).map(function(r){return r.id;});
    var richStyle=richCount>0&&!passata?'outline:2px solid rgba(138,43,226,.5);outline-offset:-1px;':'';
    var onClickFn='';
    if(richCount>0&&!passata){
      onClickFn='oaApriRichiestePerData(\''+data+'\')';
    } else if(clickable){
      onClickFn='oaOpenSlotMenu(\''+data+'\')';
    }
    html+='<div onclick="'+(onClickFn?onClickFn:'')+'" '
      +'title="'+(richCount>0&&!passata?'📨 '+richCount+' richiesta/e — clicca per aprire':(clickable?'Clicca per gestire lo slot':''))+'" '
      +'style="border-radius:7px;border:1px solid '+border+';background:'+bg+';opacity:'+opacity+';'
      +'cursor:'+(onClickFn?'pointer':cursor)+';padding:6px 4px;text-align:center;min-height:58px;'
      +'display:flex;flex-direction:column;align-items:center;gap:3px;'
      +richStyle
      +(isWeekend?'box-shadow:0 0 0 1px rgba(240,128,26,.2);':'')+'">';
    html+='<span style="font-size:12px;font-weight:'+(isWeekend?'700':'500')+';color:var(--txt)">'+g+'</span>';
    if(prenCount>0){
      var piena=prenCount>=maxPren;
      html+='<span style="font-size:9px;font-weight:700;color:'+(piena?'#888':'#f0801a')+'">'+prenCount+'/'+maxPren+' pren.</span>';
    }
    if(maxPren===1&&prenCount===0&&slot2&&!slot2.bloccata&&!passata)
      html+='<span style="font-size:8px;color:rgba(14,165,233,.8);font-weight:600">1 posto</span>';
    if(richCount>0&&!passata)html+='<span style="font-size:9px;font-weight:700;color:rgba(138,43,226,.9);background:rgba(138,43,226,.1);border-radius:4px;padding:1px 4px">📨 '+richCount+' rich.</span>';
    if(slot2?.bloccata&&!passata)html+='<span style="font-size:8px;color:var(--red)">bloccata</span>';
    if(slot2?.note&&!passata)html+='<span style="font-size:8px;color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%" title="'+slot2.note+'">📝</span>';
    html+='</div>';
  }
  html+='</div>';
  // Riepilogo mese
  var slotsM=S.oaSlots.filter(function(s){return s.data.startsWith(_oaSlotAnno+'-'+String(_oaSlotMese+1).padStart(2,'0'));});
  var libere=slotsM.filter(function(s){return !s.bloccata&&oaCountPrenotazioni(s.data)<(s.maxPren||2);}).length;
  var bloccate=slotsM.filter(function(s){return s.bloccata;}).length;
  var piene=slotsM.filter(function(s){return oaCountPrenotazioni(s.data)>=(s.maxPren||2);}).length;
  var un1posto=slotsM.filter(function(s){return !s.bloccata&&(s.maxPren||2)===1&&oaCountPrenotazioni(s.data)<1;}).length;
  // Conta date del mese con almeno una richiesta attiva
  var prefissoMese=_oaSlotAnno+'-'+String(_oaSlotMese+1).padStart(2,'0');
  var dateConRich=new Set();
  S.oaRichieste.filter(function(r){return r.stato!=='rifiutata';}).forEach(function(r){
    (r.date||[]).filter(function(d){return d.startsWith(prefissoMese);}).forEach(function(d){dateConRich.add(d);});
  });
  html+='<div style="margin-top:14px;padding:10px 14px;background:var(--surf2);border-radius:8px;font-size:11px;display:flex;gap:20px;flex-wrap:wrap">';
  html+='<span>✅ <strong>'+libere+'</strong> disponibili</span>';
  if(un1posto>0)html+='<span>🔵 <strong>'+un1posto+'</strong> con 1 solo posto</span>';
  html+='<span>🔴 <strong>'+bloccate+'</strong> bloccate</span>';
  html+='<span>🟠 <strong>'+piene+'</strong> piene</span>';
  if(dateConRich.size>0)html+='<span>📨 <strong>'+dateConRich.size+'</strong> date con richieste</span>';
  html+='<span style="margin-left:auto;color:var(--txt2)">Click su una data per gestirla</span>';
  html+='</div>';
  // Se non ci sono slot generati
  if(!slotsAnno.length){
    html+='<div style="margin-top:16px;padding:14px;background:rgba(240,128,26,.08);border:1px solid rgba(240,128,26,.3);border-radius:8px;font-size:12px">';
    html+='⚡ Nessuno slot generato per '+_oaSlotAnno+'. Clicca <strong>"Genera stagione '+_oaSlotAnno+'"</strong> in alto per creare tutti i giorni da maggio a settembre.</div>';
  }
  w.innerHTML=html;
}
window.oaRenderSlots=oaRenderSlots;

// Apre la tab Richieste filtrata sulla data cliccata nel calendario
function oaApriRichiestePerData(data){
  oaGTab('richieste');
  // Breve timeout per lasciare il tempo al render
  setTimeout(function(){
    // Imposta filtro "tutte" e scrolla alla prima richiesta che include questa data
    var sel=document.getElementById('oa-rich-filter');
    if(sel)sel.value='tutte';
    oaRenderRichieste();
    // Scrolla alla prima card che contiene questa data ed evidenziala
    setTimeout(function(){
      var dt=new Date(data+'T12:00:00');
      var label=dt.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
      var cards=document.querySelectorAll('#oa-richieste-list > div');
      var found=null;
      cards.forEach(function(card){
        if(!found&&card.textContent.includes(label)){found=card;}
      });
      if(found){
        found.scrollIntoView({behavior:'smooth',block:'center'});
        // Flash evidenziazione temporanea
        var prev=found.style.outline;
        found.style.outline='3px solid rgba(138,43,226,.7)';
        found.style.borderRadius='12px';
        setTimeout(function(){found.style.outline=prev;},2000);
      }
      // Mostra toast informativo
      var richDt=S.oaRichieste.filter(function(r){
        return r.stato!=='rifiutata'&&(r.date||[]).includes(data);
      });
      toast('📨 '+richDt.length+' richiesta/e per il '+label,'ok');
    },300);
  },150);
}
window.oaApriRichiestePerData=oaApriRichiestePerData;

// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Pannello Richieste Online
// ══════════════════════════════════════════════════════════

function oaUpdateBadgeRichieste(){
  var nuove=S.oaRichieste.filter(function(r){return r.stato==='nuova';}).length;
  // Badge nella sotto-tab
  var btn=document.getElementById('oatab-richieste');
  if(btn){
    var label='📨 Richieste';
    if(nuove>0)label+=' <span style="display:inline-flex;align-items:center;justify-content:center;background:#e84a4a;color:#fff;border-radius:10px;font-size:10px;font-weight:700;min-width:18px;height:18px;padding:0 4px;margin-left:4px">'+nuove+'</span>';
    btn.innerHTML=label;
  }
  // Badge anche sul tab principale nella navbar
  var tabBadge=document.getElementById('oa-tab-badge');
  if(tabBadge){
    if(nuove>0){tabBadge.textContent=nuove;tabBadge.style.display='inline';}
    else{tabBadge.style.display='none';}
  }
}
window.oaUpdateBadgeRichieste=oaUpdateBadgeRichieste;

function oaRenderRichieste(){
  var w=document.getElementById('oa-richieste-list');
  if(!w)return;
  if(!S.oaRichieste.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:32px 0;text-align:center">Nessuna richiesta ricevuta dalla pagina pubblica.</div>';
    return;
  }
  // Filtri
  var filtro=document.getElementById('oa-rich-filter')?.value||'tutte';
  var list=S.oaRichieste.filter(function(r){
    if(filtro==='nuove')return r.stato==='nuova';
    if(filtro==='accettate')return r.stato==='accettata';
    if(filtro==='rifiutate')return r.stato==='rifiutata';
    return true;
  });
  var STATO_LABEL={nuova:'🔵 Nuova',accettata:'✅ Accettata',rifiutata:'❌ Rifiutata',in_attesa:'⏳ In attesa'};
  var STATO_COLOR={nuova:'#0d5c8a',accettata:'#16a34a',rifiutata:'#dc2626',in_attesa:'#d97706'};
  var html='<div style="display:flex;flex-direction:column;gap:12px">';
  list.forEach(function(r){
    var dataMs=r.createdAt?.seconds?r.createdAt.seconds*1000:null;
    var dataStr=dataMs?new Date(dataMs).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
    var elapsed='';
    if(dataMs){
      var diffMs=Date.now()-dataMs;
      var diffGg=Math.floor(diffMs/86400000);
      var diffOre=Math.floor(diffMs/3600000);
      elapsed=diffGg>0?'('+diffGg+'gg fa)':diffOre>0?'('+diffOre+'h fa)':'(adesso)';
    }
    var sc=STATO_COLOR[r.stato]||'#888';
    var sl=STATO_LABEL[r.stato]||r.stato;
    // Date con indicatore disponibilità
    var today=toLocalDate(new Date());
    var dateChips=(r.date||[]).map(function(d){
      var dt=new Date(d+'T12:00:00');
      var label=dt.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
      var pren=S.bookings.filter(function(b){return b.type==='openair'&&(b.dates||[]).some(function(bd){return bd.date===d;});}).length;
      var slot=S.oaSlots.find(function(s){return s.data===d;});
      var isPast=d<today;
      var col,title;
      if(isPast){col='#888';title='Data passata';}
      else if(!slot){col='#888';title='Slot non generato';}
      else if(slot.bloccata){col='#e84a4a';title='Bloccata dall\'admin';}
      else if(pren>=2){col='#e84a4a';title='Piena ('+pren+'/2 pren.)';}
      else if(pren===1){col='#f0801a';title='1 prenotazione esistente';}
      else{col='#4ae87a';title='Disponibile';}
      return '<span title="'+title+'" style="display:inline-flex;align-items:center;gap:4px;background:var(--surf2);border:1px solid var(--bdr);border-radius:5px;padding:2px 7px;font-size:11px;margin:2px">'
        +'<span style="width:7px;height:7px;border-radius:50%;background:'+col+';flex-shrink:0"></span>'+label+'</span>';
    }).join('');
    var dateList=(r.date||[]).map(function(d){
      var dt=new Date(d+'T12:00:00');
      return dt.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
    }).join(', ');
    // Servizi — gestisce sia il vecchio formato (stringhe) che il nuovo (oggetti con qta)
    var serviziList=(r.servizi||[]).map(function(s){
      var sid=typeof s==='string'?s:s.id;
      var qta=typeof s==='object'&&s.qta?s.qta:null;
      // Cerca il nome dal catalogo oaServizi oppure usa il fallback hardcoded
      var servDef=S.oaServizi.find(function(x){return x.id===sid;});
      var label=servDef?(servDef.icona+' '+servDef.nome):({sedie:'🪑 Sedie',bibita:'🥤 Bibite',popcorn:'🍿 Popcorn',pubblicita:'📢 Pubblicità'}[sid]||sid);
      return label+(qta?' <strong>('+qta+')</strong>':'');
    }).join(' · ')||'Nessuno';
    html+='<div style="background:var(--surf);border:1px solid var(--bdr-strong);border-left:3px solid '+sc+';border-radius:10px;padding:16px 18px;">';
    // Header
    html+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap">';
    html+='<div>';
    html+='<div style="font-size:15px;font-weight:700;color:var(--txt)">'+r.ragione+'</div>';
    html+='<div style="font-size:11px;color:var(--txt2);margin-top:2px">👤 '+r.referente+' · ✉ '+r.email+' · 📞 '+r.tel+'</div>';
    html+='</div>';
    html+='<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">';
    html+='<span style="font-size:11px;font-weight:600;color:'+sc+'">'+sl+'</span>';
    html+='<span style="font-size:10px;color:var(--txt2)">'+dataStr+' '+elapsed+'</span>';
    html+='</div>';
    html+='</div>';
    // Dettagli
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px">';
    html+='<div><span style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.4px">📍 Luogo</span><div style="margin-top:2px;color:var(--txt)">'+r.luogo+(r.comune?' — '+r.comune:'')+'</div></div>';
    html+='<div><span style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.4px">👥 Spettatori previsti</span><div style="margin-top:2px;color:var(--txt)">'+(r.spettatori||'—')+'</div></div>';
    html+='<div style="grid-column:1/-1"><span style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.4px">📅 Date richieste ('+((r.date||[]).length)+')</span><div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:2px">'+dateChips+'</div></div>';
    html+='<div><span style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.4px">🎪 Servizi</span><div style="margin-top:2px;color:var(--txt)">'+serviziList+'</div></div>';
    // Film selezionato
    var filmStr=r.filmDaDefinire
      ?'<span style="color:#f0801a;font-weight:600">⏭ Da concordare</span>'
      :r.filmSelezionato?('🎬 <strong>'+r.filmSelezionato.title+'</strong>')
      :r.filmPreferenza?('💬 Preferenza: '+r.filmPreferenza)
      :'<span style="color:var(--txt2)">—</span>';
    html+='<div style="grid-column:1/-1"><span style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.4px">🎬 Film richiesto</span><div style="margin-top:2px;color:var(--txt)">'+filmStr+'</div></div>';
    // Battery pack
    if(r.requisitiConfermati?.batteryPackRichiesto){
      html+='<div style="grid-column:1/-1"><span style="font-size:12px;font-weight:600;color:#f0801a">🔋 Battery pack richiesto (presa non disponibile)</span></div>';
    }
    html+='</div>';
    if(r.note)html+='<div style="font-size:12px;color:var(--txt2);background:var(--surf2);border-radius:5px;padding:7px 10px;margin-bottom:10px">📝 '+r.note+'</div>';
    // Risposta se presente
    if(r.risposta)html+='<div style="font-size:12px;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2);border-radius:6px;padding:8px 10px;margin-bottom:10px">💬 <strong>Risposta inviata:</strong> '+r.risposta+'</div>';
    // Azioni
    if(r.stato==='nuova'||r.stato==='in_attesa'){
      html+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
      html+='<button class="btn ba bs" onclick="oaAccettaRichiesta(\''+r.id+'\')">✅ Accetta</button>';
      html+='<button class="btn bg bs" onclick="oaRispondiRichiesta(\''+r.id+'\')">💬 Rispondi</button>';
      html+='<button class="btn bg bs" onclick="oaPreventivoDaRichiesta(\''+r.id+'\')">💰 Preventivo</button>';
      html+='<button class="btn bd bs" onclick="oaRifiutaRichiesta(\''+r.id+'\')">❌ Rifiuta</button>';
      html+='<button class="btn bd bs" onclick="oaEliminaRichiesta(\''+r.id+'\')" title="Elimina richiesta" style="margin-left:auto">🗑</button>';
      html+='</div>';
    } else if(r.stato==='accettata'){
      html+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
      html+='<button class="btn bg bs" onclick="oaRispondiRichiesta(\''+r.id+'\')">💬 Nuovo messaggio</button>';
      html+='<button class="btn bg bs" onclick="oaPreventivoDaRichiesta(\''+r.id+'\')">💰 Preventivo</button>';
      html+='<button class="btn bg bs" onclick="oaCreaPrenotazioneOA(\''+r.id+'\')">📋 Crea prenotazione OA</button>';
      html+='<button class="btn bg bs" onclick="oaVerificaCliente(S.oaRichieste.find(function(x){return x.id===\''+r.id+'\';}))">👤 Cliente</button>';
      html+='<button class="btn bd bs" onclick="oaEliminaRichiesta(\''+r.id+'\')" title="Elimina richiesta" style="margin-left:auto">🗑</button>';
      html+='</div>';
    } else if(r.stato==='rifiutata'){
      html+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
      html+='<button class="btn bd bs" onclick="oaEliminaRichiesta(\''+r.id+'\')" title="Elimina richiesta">🗑 Elimina</button>';
      html+='</div>';
    }
    html+='</div>';
  });
  html+='</div>';
  w.innerHTML=html;
}
window.oaRenderRichieste=oaRenderRichieste;

// ── Elimina richiesta ─────────────────────────────────────
async function oaEliminaRichiesta(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});
  if(!r)return;
  var label=r.ragione||r.referente||'questa richiesta';
  if(!confirm('Eliminare definitivamente la richiesta di "'+label+'"?\nQuesta azione non può essere annullata.'))return;
  await deleteDoc(doc(db,'oaRichieste',id));
  toast('Richiesta eliminata','ok');
}
window.oaEliminaRichiesta=oaEliminaRichiesta;

// ── Verifica e registrazione cliente da richiesta ─────────
function oaVerificaCliente(r){
  if(!r)return;
  // Cerca cliente per email (priorità) o ragione sociale
  var trovato=null;
  if(r.email){
    trovato=S.oaClienti.find(function(c){
      return c.email&&c.email.toLowerCase().trim()===r.email.toLowerCase().trim();
    });
  }
  if(!trovato&&r.ragione){
    trovato=S.oaClienti.find(function(c){
      return c.ragione&&c.ragione.toLowerCase().trim()===r.ragione.toLowerCase().trim();
    });
  }

  if(trovato){
    // Cliente già presente — mostra info con link alla scheda
    var msg='✅ Cliente già registrato:\n\n'
      +'🏢 '+trovato.ragione+'\n'
      +(trovato.respOrg?'👤 Org: '+trovato.respOrg+'\n':'')
      +(trovato.email?'✉ '+trovato.email+'\n':'')
      +(trovato.tel?'📞 '+trovato.tel+'\n':'')
      +'\nVuoi aprire la scheda cliente?';
    if(confirm(msg)){
      oaGTab('clienti');
      setTimeout(function(){
        var card=document.querySelector('[onclick*="oaOpenCliente(\''+trovato.id+'\')"]');
        if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid var(--acc)';setTimeout(function(){card.style.outline='';},2000);}
      },300);
    }
  } else {
    // Cliente non trovato — propone registrazione con dati pre-compilati
    var msg='📋 Nuovo cliente — vuoi registrarlo?\n\n'
      +'🏢 '+( r.ragione||'—')+'\n'
      +'👤 '+( r.referente||'—')+'\n'
      +(r.email?'✉ '+r.email+'\n':'')
      +(r.tel?'📞 '+r.tel+'\n':'')
      +(r.comune?'📍 '+r.comune+'\n':'')
      +'\nI dati verranno pre-compilati nel modulo clienti.';
    if(confirm(msg)){
      // Pre-compila modal nuovo cliente
      document.getElementById('oaCId').value='';
      document.getElementById('oaCRagione').value=r.ragione||r.referente||'';
      document.getElementById('oaCRespOrg').value=r.referente||'';
      document.getElementById('oaCRespOp').value='';
      document.getElementById('oaCEmail').value=r.email||'';
      document.getElementById('oaCTel').value=r.tel||'';
      document.getElementById('oaCPiva').value='';
      document.getElementById('oaCIndirizzo').value=r.comune||'';
      document.getElementById('oaCNote').value=r.note?'Dalla richiesta web: '+r.note:'Registrato da richiesta CineTour.ch del '+new Date().toLocaleDateString('it-IT');
      document.getElementById('ovOAClienteT').textContent='Nuovo Cliente OA — da richiesta';
      document.getElementById('ovOACliente').classList.add('on');
    }
  }
}
window.oaVerificaCliente=oaVerificaCliente;

async function oaAccettaRichiesta(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});if(!r)return;
  var msg='Gentile '+r.referente+',\n\nsiamo lieti di confermare la disponibilità per la vostra richiesta di proiezione CineTour.ch.\n\nSaremo in contatto per definire i dettagli organizzativi.\n\nCordiali saluti,\nIl Cinematografo Ambulante\nFabbrica dei Sogni Sagl';
  openOARispostaModal(id,'accettata',msg);
  // Dopo il modal risposta, verifica/propone registrazione cliente
  setTimeout(function(){ oaVerificaCliente(r); }, 400);
}
window.oaAccettaRichiesta=oaAccettaRichiesta;

async function oaRifiutaRichiesta(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});if(!r)return;
  var msg='Gentile '+r.referente+',\n\nci dispiace comunicarle che per le date richieste non è possibile soddisfare la sua richiesta di proiezione CineTour Open Air.\n\nLa invitiamo a contattarci per valutare alternative.\n\nCordiali saluti,\nIl Cinematografo Ambulante\nFabbrica dei Sogni Sagl';
  openOARispostaModal(id,'rifiutata',msg);
}
window.oaRifiutaRichiesta=oaRifiutaRichiesta;

function oaRispondiRichiesta(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});if(!r)return;
  openOARispostaModal(id,r.stato,'');
}
window.oaRispondiRichiesta=oaRispondiRichiesta;

function openOARispostaModal(id,nuovoStato,msgDefault){
  document.getElementById('oaRispId').value=id;
  document.getElementById('oaRispStato').value=nuovoStato;
  document.getElementById('oaRispMsg').value=msgDefault;
  var r=S.oaRichieste.find(function(x){return x.id===id;});
  document.getElementById('oaRispTitle').textContent=(nuovoStato==='accettata'?'✅ Accetta':'nuovoStato'==='rifiutata'?'❌ Rifiuta':'💬 Rispondi a')+' — '+(r?.ragione||'');
  document.getElementById('oaRispEmail').textContent=r?.email||'';
  document.getElementById('ovOARisposta').classList.add('on');
}
window.openOARispostaModal=openOARispostaModal;

async function svOARisposta(){
  var id=document.getElementById('oaRispId').value;
  var nuovoStato=document.getElementById('oaRispStato').value;
  var msg=document.getElementById('oaRispMsg').value.trim();
  if(!msg){toast('Inserisci un messaggio di risposta','err');return;}
  await setDoc(doc(db,'oaRichieste',id),{
    ...(S.oaRichieste.find(function(x){return x.id===id;})||{}),
    stato:nuovoStato,
    risposta:msg,
    rispostoAt:new Date().toISOString(),
    rispostoDa:currentUser?.email||''
  });
  co('ovOARisposta');
  toast('Risposta salvata','ok');
  // Apri client email
  var r=S.oaRichieste.find(function(x){return x.id===id;});
  if(r?.email){
    var sogg=encodeURIComponent('CineTour.ch — Il Cinematografo Ambulante — Risposta alla vostra richiesta');
    var corpo=encodeURIComponent(msg);
    window.open('mailto:'+r.email+'?subject='+sogg+'&body='+corpo);
  }
}
window.svOARisposta=svOARisposta;

async function oaCreaPrenotazioneOA(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});if(!r)return;
  if(!confirm('Creare una prenotazione OA da questa richiesta? Verrai portato al modal prenotazioni pre-compilato.'))return;
  // Pre-compila i campi del modal prenotazione OA
  gt('book');
  setTimeout(function(){
    openBook('openair');
    setTimeout(function(){
      document.getElementById('bType').value='openair';
      onBTypeChange();
      fillOAClienteDropdown();fillOALuogoDropdown();
      setTimeout(function(){
        if(document.getElementById('bOAName'))document.getElementById('bOAName').value=r.ragione||'';
        if(document.getElementById('bOACliente'))document.getElementById('bOACliente').value=r.referente||'';
        if(document.getElementById('bOAContact'))document.getElementById('bOAContact').value=r.tel||r.email||'';
        if(document.getElementById('bLocation'))document.getElementById('bLocation').value=r.comune||'';
        if(document.getElementById('bOAVia'))document.getElementById('bOAVia').value=r.luogo||'';
        // Spettatori annunciati nel dossier — li salviamo come nota
        if(document.getElementById('bOANote'))document.getElementById('bOANote').value=(r.note||'')+(r.spettatori?'\nSpettatori previsti: '+r.spettatori:'');
        // Date
        _bDates=[];
        (r.date||[]).forEach(function(d){
          _bDates.push({date:d,start:'21:00',end:'23:00'});
        });
        renderBDates();
        setBMode('manual');
        toast('Modal pre-compilato dalla richiesta. Completa e salva.','ok');
      },300);
    },300);
  },300);
}
window.oaCreaPrenotazioneOA=oaCreaPrenotazioneOA;

// ── Preventivo da richiesta ────────────────────────────────
function oaPreventivoDaRichiesta(id){
  var r=S.oaRichieste.find(function(x){return x.id===id;});
  if(!r)return;
  // Passa i dati della richiesta al modulo preventivo
  _prevRichiestaId=id;
  oaGTab('prev');
  setTimeout(function(){
    oaRenderPreventivoFromRichiesta(r);
  },150);
}
window.oaPreventivoDaRichiesta=oaPreventivoDaRichiesta;

var _prevRichiestaId=null;

function oaRenderPreventivoFromRichiesta(r){
  // Renderizza il preventivo passando i dati della richiesta
  var l=oaListinoAttivo();
  var regionali=l?.regionali||[{nome:'Luganese',tariffa:800},{nome:'Locarnese',tariffa:900},{nome:'Bellinzonese',tariffa:850},{nome:'Mendrisiotto',tariffa:950}];
  var df=l?.dirittiFilm||{soglia:150,sotto:350,sopra:5};
  var tarKm=l?.trasferta?.tarKm||0.70;
  var serviziPrezzi=l?.servizi||{};
  var annoListino=l?.anno||new Date().getFullYear();
  var serviziDisp=S.oaServizi.length?S.oaServizi:[
    {id:'sedie',icona:'🪑',nome:'Sedie'},{id:'bibite',icona:'🥤',nome:'Bibite'},
    {id:'popcorn',icona:'🍿',nome:'Popcorn'},{id:'pubblicita',icona:'📢',nome:'Pubblicità'}
  ];

  var w=document.getElementById('oa-prev-wrap');
  if(!w)return;

  if(!l){
    w.innerHTML='<div style="padding:20px;background:rgba(240,128,26,.08);border:1px solid rgba(240,128,26,.3);border-radius:10px;font-size:13px">⚠️ Nessun listino attivo. Vai su <strong>📋 Listino</strong> per creare e attivare il listino tariffe.</div>';
    return;
  }

  function fi(label,id,val,tipo){
    return '<div style="display:flex;flex-direction:column;gap:4px">'
      +'<label style="font-size:11px;color:var(--txt2)">'+label+'</label>'
      +'<input type="'+tipo+'" id="'+id+'" value="'+val+'" '+(tipo==='number'?'min="0" step="any" ':'')
      +'oninput="oaPrevCalc()" '
      +'style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);'+(tipo==='number'?'text-align:right':'')+'"></div>';
  }

  // Km da luogo se già calcolati
  var luogoOA=r.luogo?(S.oaLuoghi.find(function(l){return l.comune===r.comune&&(l.nome===r.luogo||l.indirizzo===r.luogo);})):null;
  var kmAR=luogoOA?.kmAR||0;
  var nserate=(r.date||[]).length||1;

  var html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
    +'<div>'
    +'<div style="font-size:15px;font-weight:700;color:var(--txt)">💰 Preventivo</div>'
    +'<div style="font-size:11px;color:var(--txt2)">Da richiesta di <strong>'+(r.ragione||r.referente||'')+'</strong> · Listino '+annoListino+'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btn bg bs" onclick="oaPrevEmail()">📧 Email con preventivo</button>'
    +'<button class="btn ba bs" onclick="oaPrevPDF()">🖨 PDF preventivo</button>'
    +'</div></div>'
    +'<div style="display:flex;flex-direction:column;gap:12px">';

  // Intestazione pre-compilata dalla richiesta
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Evento</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Cliente / Ente','prev-cliente',r.ragione||r.referente||'','text')
    +fi('Nr. serate','prev-nserate',nserate,'number')
    +'</div>'
    // Luogo con calcolo km
    +'<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">Luogo proiezione</label>'
    +'<div style="display:flex;gap:6px;align-items:center">'
    +'<input type="text" id="prev-luogo" value="'+(r.luogo||'')+'" oninput="oaPrevCalc()" style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">'
    +'<input type="text" id="prev-comune" value="'+(r.comune||'')+'" placeholder="Comune" oninput="oaPrevCalc()" style="width:140px;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">'
    +'<button class="btn bg bs" onclick="oaPrevCalcolaKm()" title="Calcola km da Via Vincenzo Vela 21, Mendrisio" style="white-space:nowrap;flex-shrink:0">🚗 Calcola km</button>'
    +'</div>'
    +'<div id="prev-km-status" style="display:none;font-size:11px;padding:5px 8px;background:rgba(74,232,122,.08);border:1px solid rgba(74,232,122,.25);border-radius:6px;margin-top:4px;color:var(--grn)"></div>'
    +'</div>'
    +'<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div style="display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">Km A/R</label>'
    +'<input type="number" id="prev-km" value="'+kmAR+'" min="0" step="any" oninput="oaPrevCalc()" style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);text-align:right">'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">Spettatori previsti</label>'
    +'<input type="number" id="prev-spett-info" value="'+(r.spettatori||100)+'" disabled style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt2);text-align:right">'
    +'</div>'
    +'</div>'
    // Date richieste
    +(r.date&&r.date.length?'<div style="margin-top:10px;font-size:11px;color:var(--txt2)">📅 Date richieste: '
      +r.date.map(function(d){return new Date(d+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});}).join(' · ')
      +'</div>':'')
    +fi('Note preventivo','prev-note','IVA esclusa — validità 30 giorni dalla data di emissione','text')
    +'</div>';

  // Tariffa base
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Tariffa base regionale</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:var(--txt2)">Regione</label>'
    +'<select id="prev-regione" onchange="oaPrevCalc()" style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">';
  regionali.forEach(function(reg){html+='<option value="'+reg.tariffa+'">'+reg.nome+' — CHF '+reg.tariffa+'</option>';});
  html+='<option value="0">Personalizzato</option></select></div>'
    +fi('Tariffa personalizzata','prev-base-custom',regionali[0]?.tariffa||800,'number')
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-base-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-base">—</span>'
    +'</div></div>';

  // Diritti film — pre-compilati con spettatori dalla richiesta
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Diritti film</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Spettatori previsti (da richiesta)','prev-spett',r.spettatori||100,'number')
    +'<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:var(--txt2)">Calcolo automatico</label>'
    +'<div id="prev-film-calc" style="font-size:12px;padding:8px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;color:var(--txt2)">—</div></div>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-film-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-film">—</span>'
    +'</div></div>';

  // Servizi — pre-selezionati dai servizi della richiesta
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Servizi opzionali</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px">';
  serviziDisp.forEach(function(s){
    var prezzo=serviziPrezzi[s.id]||0;
    var attivo=(r.servizi||[]).some(function(sv){return(typeof sv==='string'?sv:sv.id)===s.id;});
    html+=oaPrevServizioRow(s,attivo,prezzo,l);
    // Nota battery pack
    if(s.id==='battery_pack'||s.nome?.toLowerCase().includes('battery')){
      if(r.requisitiConfermati?.batteryPackRichiesto){
        html+='<div style="font-size:11px;color:#f0801a;margin-left:26px">🔋 Il cliente ha richiesto il battery pack</div>';
      }
    }
  });
  // Battery pack se richiesto ma non in catalogo servizi
  if(r.requisitiConfermati?.batteryPackRichiesto){
    html+='<div style="padding:8px 10px;background:rgba(240,128,26,.08);border:1px solid rgba(240,128,26,.3);border-radius:7px;font-size:12px;color:#f0801a">🔋 Il cliente ha indicato che la presa 220V non è disponibile e ha richiesto il <strong>battery pack</strong> — includere nel preventivo se applicabile.</div>';
  }
  html+='</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)">Subtotale servizi</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-opt">—</span>'
    +'</div></div>';

  // Trasferta
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Trasferta</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Tariffa/km','prev-tar-km',tarKm,'number')+'<div></div></div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-km-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-km">—</span>'
    +'</div></div>';

  // Adeguamenti
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Adeguamenti</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Spese aggiuntive','prev-extra',0,'number')
    +fi('Sconto','prev-sconto',0,'number')
    +'</div></div>';

  // Totale
  html+='<div style="background:rgba(13,92,138,.06);border:1px solid rgba(13,92,138,.2);border-radius:12px;padding:16px 18px">'
    +'<div id="prev-riepilogo" style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;font-size:13px;color:var(--txt2)"></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(13,92,138,.2);padding-top:12px">'
    +'<span style="font-size:15px;font-weight:600;color:#0d5c8a">Totale preventivo</span>'
    +'<span style="font-size:22px;font-weight:700;color:#0d5c8a" id="prev-totale">—</span>'
    +'</div></div>';

  html+='</div>';
  w.innerHTML=html;
  _prevData={l,df,serviziDisp,bookId:null,richiestaId:id};
  // Se km già disponibili mostrali
  if(kmAR>0){
    var statusEl=document.getElementById('prev-km-status');
    if(statusEl){statusEl.textContent='🚗 A/R: '+kmAR+' km (da archivio luogo)';statusEl.style.color='var(--grn)';statusEl.style.display='block';}
  } else if(r.luogo||r.comune){
    // Calcola km automaticamente
    setTimeout(function(){oaPrevCalcolaKm();},400);
  }
  oaPrevCalc();
}
window.oaRenderPreventivoFromRichiesta=oaRenderPreventivoFromRichiesta;

function oaSlotNavAnno(n){
  _oaSlotAnno+=n;
  oaRenderSlots();
}
window.oaSlotNavAnno=oaSlotNavAnno;

function oaSlotNavMese(m){
  _oaSlotMese=m;
  oaRenderSlots();
}
window.oaSlotNavMese=oaSlotNavMese;



function oaDStatusChanged(){
  const val=document.querySelector('input[name="oaDStatus"]:checked')?.value||'standby';
  const at=document.getElementById('oaDStatusAt');
  if(at)at.textContent='Cambio status: '+new Date().toLocaleString('it-IT');
}
window.oaDStatusChanged=oaDStatusChanged;

// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Catalogo Film Open Air
// ══════════════════════════════════════════════════════════

function oaRenderFilmOA(){
  var w=document.getElementById('oa-filmoa-wrap');
  if(!w)return;

  // Data di riferimento: usa la data selezionata nel selettore oppure oggi
  var refInput=document.getElementById('filmoa-ref-date');
  var refData=refInput&&refInput.value?new Date(refInput.value+'T12:00:00'):new Date();
  var soglia2mesi=new Date(refData);
  soglia2mesi.setMonth(soglia2mesi.getMonth()-2);
  var soglia2mesiStr=soglia2mesi.toISOString().slice(0,10);
  var refLabel=refData.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});

  // Tutti i film con flag openAir=true
  var filmOA=S.films.filter(function(f){return f.openAir;})
    .sort(function(a,b){return (a.title||'').localeCompare(b.title||'','it');});

  // Film abilitati: oaFrom (data personalizzata) <= oggi, oppure release <= soglia 2 mesi
  var abilitati=filmOA.filter(function(f){
    if(f.oaFrom) return f.oaFrom<=oggi2;
    return f.release&&f.release<=soglia2mesiStr;
  });
  var inAttesa=filmOA.filter(function(f){
    if(f.oaFrom) return f.oaFrom>oggi2;
    return !f.release||f.release>soglia2mesiStr;
  });

  var oggi2=new Date().toISOString().slice(0,10);
  var html='';

  // Header con selettore data di riferimento
  html+='<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">';
  html+='<div style="flex:1">';
  html+='<div style="font-size:13px;color:var(--txt2);margin-top:4px">Disponibilità calcolata per una proiezione il <strong>'+refLabel+'</strong> — i film richiedibili sono quelli usciti almeno 2 mesi prima.</div>';
  html+='<div style="margin-top:8px;display:flex;align-items:center;gap:8px">';
  html+='<label style="font-size:11px;color:var(--txt2)">Data proiezione di riferimento:</label>';
  html+='<input type="date" id="filmoa-ref-date" value="'+oggi2+'" onchange="oaRenderFilmOA()" '
    +'style="font-size:12px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">';
  html+='</div></div>';
  html+='<div style="font-size:12px;color:var(--txt2);background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:8px 12px;text-align:right;flex-shrink:0">';
  html+='<div>✅ <strong>'+abilitati.length+'</strong> richiedibili</div>';
  html+='<div style="margin-top:2px">⏳ <strong>'+inAttesa.length+'</strong> non ancora disponibili</div>';
  html+='</div>';
  html+='</div>';

  if(!filmOA.length){
    html+='<div style="padding:32px;text-align:center;color:var(--txt2);font-size:13px;border:1px dashed var(--bdr);border-radius:10px">';
    html+='Nessun film con flag Open Air. Vai su <strong>Archivio Film</strong>, apri un film e spunta <strong>☀ Open Air</strong>.';
    html+='</div>';
    w.innerHTML=html;return;
  }

  // ── Film disponibili ──
  if(abilitati.length){
    html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--grn);margin-bottom:10px">✅ Richiedibili per il '+refLabel+'</div>';
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px">';
    abilitati.forEach(function(f){html+=oaFilmOACard(f,true,soglia2mesiStr);});
    html+='</div>';
  }

  // ── Film in attesa ──
  if(inAttesa.length){
    html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:10px">⏳ Non ancora richiedibili al '+refLabel+'</div>';
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">';
    inAttesa.forEach(function(f){html+=oaFilmOACard(f,false,soglia2mesiStr);});
    html+='</div>';
  }

  w.innerHTML=html;
}
window.oaRenderFilmOA=oaRenderFilmOA;

function oaFilmOACard(f,abilitato,soglia){
  // Data richiedibile — usa oaFrom se impostata, altrimenti release+30gg
  var disponibileDal='';
  var disponibileLabel='';
  if(f.oaFrom){
    disponibileDal=f.oaFrom;
    disponibileLabel=new Date(f.oaFrom+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  } else if(f.release){
    var dDisp=new Date(f.release+'T12:00:00');
    dDisp.setDate(dDisp.getDate()+30);
    disponibileDal=dDisp.toISOString().slice(0,10);
    disponibileLabel=dDisp.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  }
  // Data disponibile OA effettiva (oaFrom o release+2mesi)
  var attesaStr='';
  if(!abilitato){
    if(f.oaFrom){
      attesaStr='Disponibile dal '+new Date(f.oaFrom+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
    } else if(f.release){
      var dDisponibile=new Date(f.release+'T12:00:00');
      dDisponibile.setMonth(dDisponibile.getMonth()+2);
      attesaStr='Disponibile dal '+dDisponibile.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
    }
  }
  var poster=f.poster||f.backdrop||'';
  var releaseLabel=f.release?new Date(f.release+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';

  var card='<div style="background:var(--surf);border:1px solid var(--bdr-strong);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;'+(abilitato?'':'opacity:.7')+'">';

  // Poster
  if(poster){
    card+='<div style="height:120px;overflow:hidden;background:#111;position:relative">';
    card+='<img src="'+poster+'" alt="'+f.title+'" style="width:100%;height:100%;object-fit:cover;display:block">';
    if(abilitato)card+='<span style="position:absolute;top:6px;right:6px;background:#16a34a;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">✅ Disponibile</span>';
    else card+='<span style="position:absolute;top:6px;right:6px;background:#555;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">⏳</span>';
    card+='</div>';
  } else {
    card+='<div style="height:80px;background:rgba(13,92,138,.08);display:flex;align-items:center;justify-content:center;font-size:32px">🎬</div>';
  }

  // Info
  card+='<div style="padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:4px">';
  card+='<div style="font-size:13px;font-weight:700;color:var(--txt);line-height:1.3">'+f.title+'</div>';
  if(f.genre)card+='<div style="font-size:11px;color:var(--txt2)">'+f.genre+'</div>';
  card+='<div style="font-size:11px;color:var(--txt2)">📅 Uscita: '+releaseLabel+'</div>';
  if(f.duration)card+='<div style="font-size:11px;color:var(--txt2)">⏱ '+f.duration+' min</div>';
  if(f.distributor)card+='<div style="font-size:11px;color:var(--txt2)">🏢 '+f.distributor+'</div>';
  // Campo "disponibile dal" — uscita + 30 giorni
  if(disponibileLabel){
    card+='<div style="margin-top:6px;padding:5px 8px;background:'+(abilitato?'rgba(22,163,74,.08)':'rgba(255,165,0,.08)')+';border:1px solid '+(abilitato?'rgba(22,163,74,.25)':'rgba(255,165,0,.3)')+';border-radius:6px;font-size:10px;color:'+(abilitato?'var(--grn)':'#f0801a')+';font-weight:600">'
      +'🗓 Richiedibile dal: '+disponibileLabel
      +'</div>';
  }
  if(attesaStr)card+='<div style="font-size:10px;color:var(--acc);font-weight:600;margin-top:4px">'+attesaStr+'</div>';
  card+='</div>';

  // Azioni
  card+='<div style="padding:8px 12px;border-top:1px solid var(--bdr);display:flex;gap:6px">';
  card+='<button class="btn bg bs" style="flex:1;font-size:11px" onclick="editFilm(\''+f.id+'\')">✏ Scheda film</button>';
  card+='<button class="btn bd bs" style="font-size:11px" onclick="oaRimuoviFilmOA(\''+f.id+'\')" title="Rimuovi da Open Air">✕ OA</button>';
  card+='</div>';
  card+='</div>';
  return card;
}

async function oaRimuoviFilmOA(id){
  var f=S.films.find(function(x){return x.id===id;});
  if(!f)return;
  if(!confirm('Rimuovere "'+f.title+'" dal catalogo Open Air?'))return;
  await setDoc(doc(db,'films',id),{...f,openAir:false});
  toast('"'+f.title+'" rimosso dal catalogo OA','ok');
}
window.oaRimuoviFilmOA=oaRimuoviFilmOA;

// Aggiorna la vista filmOA quando cambiano i film
// (il listener films esiste già in startListeners)



function oaListinoAttivo(){
  // Restituisce il listino attivo, preferibilmente quello dell'anno corrente
  var anno=new Date().getFullYear();
  return S.oaListini.find(function(l){return l.attivo;})||
         S.oaListini.find(function(l){return l.anno===anno;})||
         S.oaListini[0]||null;
}

function oaRenderListino(){
  var w=document.getElementById('oa-listino-wrap');
  if(!w)return;
  var html='';
  // Header con selettore anno e bottone nuovo
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">';
  html+='<div style="display:flex;align-items:center;gap:8px">';
  html+='<span style="font-size:13px;font-weight:600;color:var(--txt)">Listino tariffe</span>';
  html+='<select id="listino-anno-sel" onchange="oaRenderListino()" style="font-size:12px;padding:4px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf);color:var(--txt)">';
  S.oaListini.forEach(function(l){
    var label=l.nome||('Listino '+l.anno);
    html+='<option value="'+l.anno+'" '+(l.attivo?'selected':'')+'>'+label+(l.attivo?' ★':'')+'</option>';
  });
  html+='</select>';
  html+='</div>';
  html+='<div style="display:flex;gap:8px">';
  html+='<button class="btn bg bs" onclick="oaNewListino()">＋ Nuovo anno</button>';
  if(S.oaListini.length){
    html+='<button class="btn bg bs" onclick="oaDuplicaListino()">⧉ Duplica anno</button>';
  }
  html+='</div>';
  html+='</div>';
  if(!S.oaListini.length){
    html+='<div style="color:var(--txt2);font-size:13px;padding:32px;text-align:center;border:1px dashed var(--bdr);border-radius:10px">';
    html+='Nessun listino. Clicca <strong>"＋ Nuovo anno"</strong> per creare il listino tariffe.';
    html+='</div>';
    w.innerHTML=html;return;
  }
  // Leggi anno selezionato
  var annoSel=parseInt(document.getElementById('listino-anno-sel')?.value||S.oaListini[0].anno);
  var l=S.oaListini.find(function(x){return x.anno===annoSel;})||S.oaListini[0];
  if(!l){w.innerHTML=html;return;}
  // Card editabile
  html+='<div style="display:flex;flex-direction:column;gap:12px">';

  // ── Stato + nome ──
  html+='<div class="ps">';
  // Nome listino editabile
  html+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">';
  html+='<div style="flex:1;min-width:200px">';
  html+='<label style="font-size:11px;color:var(--txt2);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Nome listino</label>';
  html+='<input type="text" id="listino-nome-'+l.anno+'" value="'+(l.nome||'Listino '+l.anno)+'" '
    +'style="width:100%;margin-top:4px;font-size:14px;font-weight:600;padding:7px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--surf2);color:var(--txt)">';
  html+='</div>';
  html+='<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;margin-top:20px">';
  if(!l.attivo)html+='<button class="btn ba bs" onclick="oaAttivaListino('+l.anno+')">✓ Imposta come attivo</button>';
  else html+='<span style="font-size:12px;color:var(--grn);font-weight:600">★ Listino attivo</span>';
  html+='<button class="btn bd bs" onclick="oaDelListino('+l.anno+')">✕ Elimina</button>';
  html+='</div></div>';
  // Meta info
  html+='<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:11px;color:var(--txt2)">';
  html+='<span>📅 Ultima modifica: <strong>'+( l.updatedAt?new Date(l.updatedAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—')+'</strong></span>';
  if(l.updatedDa)html+='<span>👤 Modificato da: <strong>'+l.updatedDa+'</strong></span>';
  var nVer=(l.storico||[]).length;
  html+='<span>📜 Versioni salvate: <strong>'+(nVer+1)+'</strong></span>';
  html+='</div>';
  html+='</div>';

  // ── Tariffe regionali ──
  html+='<div class="ps">';
  html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:12px">📍 Tariffe base regionali</div>';
  var regionali=l.regionali||[];
  html+='<div style="display:flex;flex-direction:column;gap:6px" id="listino-reg-list">';
  regionali.forEach(function(r,i){
    html+='<div style="display:flex;align-items:center;gap:8px">';
    html+='<input type="text" value="'+r.nome+'" placeholder="Nome regione" oninput="oaUpdateListinoReg('+l.anno+','+i+',\'nome\',this.value)" style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">';
    html+='<input type="number" value="'+r.tariffa+'" min="0" oninput="oaUpdateListinoReg('+l.anno+','+i+',\'tariffa\',this.value)" style="width:90px;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);text-align:right">';
    html+='<span style="font-size:12px;color:var(--txt2)">CHF</span>';
    html+='<button class="btn bd bs" onclick="oaRemoveListinoReg('+l.anno+','+i+')" style="flex-shrink:0">✕</button>';
    html+='</div>';
  });
  html+='</div>';
  html+='<button class="btn bg bs" style="margin-top:8px;font-size:12px" onclick="oaAddListinoReg('+l.anno+')">＋ Aggiungi regione</button>';
  html+='</div>';

  // ── Diritti film ──
  var df=l.dirittiFilm||{soglia:150,sotto:350,sopra:5};
  var dfOn=df.disabilitati!==true; // default: abilitati
  html+='<div class="ps">';
  html+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">';
  html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2)">🎬 Diritti film</div>';
  html+='<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:'+(dfOn?'var(--grn)':'var(--red)') +';margin-left:auto">';
  html+='<input type="checkbox" id="dirittiFilm.on_'+l.anno+'" '+(dfOn?'checked':'')+' ';
  html+='onchange="oaToggleDirittiFilm('+l.anno+',this.checked)" style="accent-color:var(--grn)">';
  html+=(dfOn?'Abilitati':'Disabilitati');
  html+='</label></div>';
  if(dfOn){
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
    html+=oaListinoField('Soglia spettatori',l.anno,'dirittiFilm.soglia',df.soglia,'spett.');
    html+=oaListinoField('Tariffa ≤ soglia',l.anno,'dirittiFilm.sotto',df.sotto,'CHF fissi');
    html+=oaListinoField('Tariffa > soglia',l.anno,'dirittiFilm.sopra',df.sopra,'CHF/spett.');
    html+='</div>';
    html+='<div style="margin-top:10px;padding:8px 10px;background:var(--surf2);border-radius:7px;font-size:11px;color:var(--txt2)">';
    html+='Esempio: fino a '+df.soglia+' spett. → CHF '+df.sotto+' · oltre '+df.soglia+' spett. → CHF '+df.sopra+' × spettatori';
    html+='</div>';
  } else {
    html+='<div style="padding:10px;background:rgba(232,74,74,.08);border-radius:7px;font-size:12px;color:var(--red);text-align:center">';
    html+='Diritti film non inclusi nel preventivo';
    html+='</div>';
  }
  html+='</div>';

  // ── Trasferta ──
  var tr=l.trasferta||{tarKm:0.70};
  html+='<div class="ps">';
  html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:12px">🚗 Trasferta</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html+=oaListinoField('Tariffa per km A/R',l.anno,'trasferta.tarKm',tr.tarKm,'CHF/km');
  html+='</div></div>';

  // ── Prezzi default servizi ──
  var serv=l.servizi||{};
  var servTipo=l.serviziTipo||{}; // 'fisso' | 'consumo' | 'km'
  var servKm=l.serviziKm||{};    // tariffa km aggiuntiva per servizi tipo 'km'
  var serviziDisp=S.oaServizi.length?S.oaServizi:[
    {id:'sedie',nome:'Sedie'},{id:'bibite',nome:'Bibite'},
    {id:'popcorn',nome:'Popcorn'},{id:'pubblicita',nome:'Pubblicità'}
  ];
  html+='<div class="ps">';
  html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:12px">🎪 Prezzi e modalità di calcolo servizi</div>';
  html+='<div style="display:flex;flex-direction:column;gap:10px">';
  serviziDisp.forEach(function(s){
    var tipo=servTipo[s.id]||'fisso';
    var prezzo=serv[s.id]||0;
    var tarKmS=servKm[s.id]||0;
    html+='<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px">';
    html+='<div style="font-size:13px;font-weight:600;margin-bottom:10px">'+(s.icona||'')+(s.icona?' ':'')+s.nome+'</div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end">';
    // Tipo calcolo
    html+='<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:var(--txt2)">Tipo calcolo</label>'
      +'<select id="ltipo_'+s.id+'_'+l.anno+'" onchange="oaListinoTipoChange(\''+s.id+'\',\''+l.anno+'\')" '
      +'style="font-size:12px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf);color:var(--txt)">'
      +'<option value="fisso"'+(tipo==='fisso'?' selected':'')+'>Costo fisso (CHF)</option>'
      +'<option value="consumo"'+(tipo==='consumo'?' selected':'')+'>A consumo (CHF × quantità)</option>'
      +'<option value="km"'+(tipo==='km'?' selected':'')+'>Fisso + tariffa km</option>'
      +'</select></div>';
    // Prezzo base
    var labelPrezzo=tipo==='consumo'?'Prezzo unitario (CHF)':tipo==='km'?'Costo fisso (CHF)':'Prezzo (CHF)';
    html+=oaListinoField(labelPrezzo,l.anno,'servizi.'+s.id,prezzo,'CHF');
    // Tariffa km (solo se tipo='km')
    html+='<div id="lkm_wrap_'+s.id+'_'+l.anno+'" style="display:'+(tipo==='km'?'flex':'none')+';flex-direction:column;gap:4px">'
      +'<label style="font-size:11px;color:var(--txt2)">Tariffa km aggiuntiva</label>'
      +'<div style="display:flex;align-items:center;gap:5px">'
      +'<input type="number" id="lkm_'+s.id+'_'+l.anno+'" value="'+tarKmS+'" min="0" step="0.01" '
      +'style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);text-align:right">'
      +'<span style="font-size:11px;color:var(--txt2)">CHF/km</span>'
      +'</div></div>';
    html+='</div>';
    if(tipo==='consumo')html+='<div style="font-size:11px;color:var(--txt2);margin-top:6px">Nel preventivo si inserisce la quantità prevista (es. nr. bibite)</div>';
    if(tipo==='km')html+='<div style="font-size:11px;color:var(--txt2);margin-top:6px">Costo = fisso + (tariffa km × km A/R). Utile per trasporto sedie.</div>';
    html+='</div>';
  });
  html+='</div></div>';

  // ── Storico versioni ──
  var storico=l.storico||[];
  if(storico.length){
    html+='<div class="ps">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="oaToggleStorico()">';
    html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2)">📜 Storico versioni ('+storico.length+')</div>';
    html+='<span id="storico-toggle-ico" style="font-size:12px;color:var(--txt2)">▼ Espandi</span>';
    html+='</div>';
    html+='<div id="storico-content" style="display:none;margin-top:12px;display:none">';
    // Versioni in ordine cronologico inverso
    var storicoOrd=[...storico].reverse();
    storicoOrd.forEach(function(v,i){
      var data=v.savedAt?new Date(v.savedAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      html+='<div style="border:1px solid var(--bdr);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--surf2)">';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
      html+='<div>';
      html+='<span style="font-size:12px;font-weight:600;color:var(--txt)">'+(v.nome||'Versione '+( storicoOrd.length-i))+'</span>';
      html+='<span style="font-size:10px;color:var(--txt2);margin-left:8px">'+data+'</span>';
      if(v.savedDa)html+='<span style="font-size:10px;color:var(--txt2);margin-left:6px">— '+v.savedDa+'</span>';
      html+='</div>';
      html+='<button class="btn bg bs" style="font-size:10px;padding:2px 8px" onclick="oaRipristinaVersione('+l.anno+','+( storicoOrd.length-1-i)+')">↩ Ripristina</button>';
      html+='</div>';
      // Mostra tariffe regionali della versione
      if(v.regionali&&v.regionali.length){
        html+='<div style="font-size:11px;color:var(--txt2);display:flex;gap:10px;flex-wrap:wrap">';
        v.regionali.forEach(function(r){
          html+='<span>'+r.nome+': <strong>CHF '+r.tariffa+'</strong></span>';
        });
        html+='</div>';
      }
      // Diff con versione corrente
      if(i===0&&v.regionali){
        var diffs=[];
        (l.regionali||[]).forEach(function(r){
          var old=v.regionali.find(function(x){return x.nome===r.nome;});
          if(old&&old.tariffa!==r.tariffa)diffs.push(r.nome+': '+old.tariffa+' → '+r.tariffa+' CHF');
        });
        if(diffs.length)html+='<div style="font-size:10px;color:var(--acc);margin-top:4px">Δ '+diffs.join(' · ')+'</div>';
      }
      html+='</div>';
    });
    html+='</div></div>';
  }

  // Bottone salva
  html+='<div style="display:flex;justify-content:flex-end">';
  html+='<button class="btn ba" onclick="oaSalvaListino('+l.anno+')">✓ Salva listino '+l.anno+'</button>';
  html+='</div>';
  html+='</div>'; // fine flex-direction column
  w.innerHTML=html;
}
window.oaRenderListino=oaRenderListino;

function oaToggleStorico(){
  var el=document.getElementById('storico-content');
  var ico=document.getElementById('storico-toggle-ico');
  if(!el)return;
  var vis=el.style.display!=='none';
  el.style.display=vis?'none':'block';
  if(ico)ico.textContent=vis?'▼ Espandi':'▲ Comprimi';
}
window.oaToggleStorico=oaToggleStorico;

async function oaRipristinaVersione(anno,idx){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l||!l.storico||!l.storico[idx])return;
  if(!confirm('Ripristinare questa versione del listino? I dati correnti verranno spostati nello storico.'))return;
  var versione=l.storico[idx];
  // Salva la versione corrente nello storico prima di sovrascrivere
  var nuovoStorico=[...( l.storico||[])];
  nuovoStorico.splice(idx,1); // rimuove la versione che stiamo ripristinando
  // Versione corrente → storico
  nuovoStorico.push({
    nome:l.nome||'Listino '+l.anno,
    savedAt:new Date().toISOString(),
    savedDa:currentUser?.email||'',
    regionali:l.regionali,
    dirittiFilm:l.dirittiFilm,
    trasferta:l.trasferta,
    servizi:l.servizi,
    serviziTipo:l.serviziTipo,
    serviziKm:l.serviziKm,
  });
  var ripristinato={
    ...l,
    nome:versione.nome,
    regionali:versione.regionali||l.regionali,
    dirittiFilm:versione.dirittiFilm||l.dirittiFilm,
    trasferta:versione.trasferta||l.trasferta,
    servizi:versione.servizi||l.servizi,
    serviziTipo:versione.serviziTipo||l.serviziTipo,
    serviziKm:versione.serviziKm||l.serviziKm,
    updatedAt:new Date().toISOString(),
    updatedDa:currentUser?.email||'',
    storico:nuovoStorico,
  };
  await setDoc(doc(db,'oaListini',String(anno)),ripristinato);
  toast('Versione ripristinata','ok');
}
window.oaRipristinaVersione=oaRipristinaVersione;

function oaListinoTipoChange(sid,anno){
  var sel=document.getElementById('ltipo_'+sid+'_'+anno);
  var kmWrap=document.getElementById('lkm_wrap_'+sid+'_'+anno);
  if(sel&&kmWrap)kmWrap.style.display=sel.value==='km'?'flex':'none';
}
async function oaToggleDirittiFilm(anno,abilitati){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l)return;
  var df=l.dirittiFilm||{soglia:150,sotto:350,sopra:5};
  df.disabilitati=!abilitati;
  l.dirittiFilm=df;
  await setDoc(doc(db,'oaListini',String(anno)),l);
  oaRenderListino();
  toast(abilitati?'Diritti film abilitati':'Diritti film disabilitati','ok');
}
window.oaToggleDirittiFilm=oaToggleDirittiFilm;

function oaListinoField(label,anno,path,val,unit){
  var eid='lf_'+path.replace(/\./g,'_')+'_'+anno;
  return '<div style="display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">'+label+'</label>'
    +'<div style="display:flex;align-items:center;gap:5px">'
    +'<input type="number" id="'+eid+'" value="'+(val||0)+'" step="0.05" min="0" '
    +'style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);text-align:right">'
    +'<span style="font-size:11px;color:var(--txt2);flex-shrink:0">'+unit+'</span>'
    +'</div></div>';
}

// Raccoglie tutti i valori dal DOM e salva in Firestore
async function oaSalvaListino(anno){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l)return;
  // Raccogli valori fields
  function fval(path){
    var eid='lf_'+path.replace(/\./g,'_')+'_'+anno;
    var el=document.getElementById(eid);
    return el?parseFloat(el.value)||0:0;
  }
  // Salva snapshot della versione corrente nello storico prima di sovrascrivere
  var storicoPrec=l.storico||[];
  var snapshotCorrente={
    nome:l.nome||('Listino '+anno),
    savedAt:new Date().toISOString(),
    savedDa:currentUser?.email||'',
    regionali:JSON.parse(JSON.stringify(l.regionali||[])),
    dirittiFilm:{...( l.dirittiFilm||{})},
    trasferta:{...( l.trasferta||{})},
    servizi:{...( l.servizi||{})},
    serviziTipo:{...( l.serviziTipo||{})},
    serviziKm:{...( l.serviziKm||{})},
  };
  // Mantieni al massimo 20 versioni nello storico
  var nuovoStorico=[...storicoPrec,snapshotCorrente].slice(-20);

  // Leggi il nome dal campo input
  var nomeEl=document.getElementById('listino-nome-'+anno);
  var nuovoNome=nomeEl?nomeEl.value.trim()||('Listino '+anno):('Listino '+anno);

  var nuovoL={
    ...l,
    nome:nuovoNome,
    updatedAt:new Date().toISOString(),
    updatedDa:currentUser?.email||'',
    storico:nuovoStorico,
    dirittiFilm:{
      soglia:fval('dirittiFilm.soglia'),
      sotto:fval('dirittiFilm.sotto'),
      sopra:fval('dirittiFilm.sopra'),
    },
    trasferta:{
      tarKm:fval('trasferta.tarKm'),
    },
    servizi:{},
    serviziTipo:{},
    serviziKm:{},
  };
  // Servizi — prezzo, tipo calcolo, tariffa km
  S.oaServizi.forEach(function(s){
    nuovoL.servizi[s.id]=fval('servizi.'+s.id);
    var tipoEl=document.getElementById('ltipo_'+s.id+'_'+anno);
    nuovoL.serviziTipo[s.id]=tipoEl?tipoEl.value:'fisso';
    var kmEl=document.getElementById('lkm_'+s.id+'_'+anno);
    nuovoL.serviziKm[s.id]=kmEl?parseFloat(kmEl.value)||0:0;
  });
  // Fallback servizi standard
  ['sedie','bibite','popcorn','pubblicita'].forEach(function(id){
    if(nuovoL.servizi[id]===undefined)nuovoL.servizi[id]=fval('servizi.'+id);
    if(nuovoL.serviziTipo[id]===undefined){
      var tipoEl=document.getElementById('ltipo_'+id+'_'+anno);
      nuovoL.serviziTipo[id]=tipoEl?tipoEl.value:'fisso';
    }
    if(nuovoL.serviziKm[id]===undefined){
      var kmEl=document.getElementById('lkm_'+id+'_'+anno);
      nuovoL.serviziKm[id]=kmEl?parseFloat(kmEl.value)||0:0;
    }
  });
  await setDoc(doc(db,'oaListini',String(anno)),nuovoL);
  toast('Listino '+anno+' salvato','ok');
}
window.oaSalvaListino=oaSalvaListino;

async function oaNewListino(){
  var anno=parseInt(prompt('Anno del nuovo listino:',new Date().getFullYear()+1));
  if(!anno||isNaN(anno))return;
  if(S.oaListini.find(function(l){return l.anno===anno;})){toast('Listino '+anno+' già esistente','err');return;}
  var nome=prompt('Nome del listino:','Listino Estate '+anno)||('Listino '+anno);
  var nuovo={
    anno,nome,attivo:false,updatedAt:new Date().toISOString(),updatedDa:currentUser?.email||'',storico:[],
    regionali:[
      {nome:'Luganese',tariffa:800},
      {nome:'Locarnese',tariffa:900},
      {nome:'Bellinzonese',tariffa:850},
      {nome:'Mendrisiotto',tariffa:950},
    ],
    dirittiFilm:{soglia:150,sotto:350,sopra:5},
    trasferta:{tarKm:0.70},
    servizi:{sedie:150,bibite:80,popcorn:60,pubblicita:200},
    serviziTipo:{sedie:'km',bibite:'consumo',popcorn:'consumo',pubblicita:'fisso'},
    serviziKm:{sedie:0.50,bibite:0,popcorn:0,pubblicita:0},
  };
  await setDoc(doc(db,'oaListini',String(anno)),nuovo);
  toast('Listino '+anno+' creato','ok');
}
window.oaNewListino=oaNewListino;

async function oaDuplicaListino(){
  var l=oaListinoAttivo()||S.oaListini[0];
  if(!l)return;
  var anno=parseInt(prompt('Copia il listino "'+( l.nome||l.anno)+'" nell\'anno:',l.anno+1));
  if(!anno||isNaN(anno))return;
  if(S.oaListini.find(function(x){return x.anno===anno;})){toast('Listino '+anno+' già esistente','err');return;}
  var nome=prompt('Nome del nuovo listino:','Listino Estate '+anno)||('Listino '+anno);
  var copia={
    ...JSON.parse(JSON.stringify(l)),
    anno,nome,attivo:false,
    updatedAt:new Date().toISOString(),
    updatedDa:currentUser?.email||'',
    storico:[], // storico reiniziato per il nuovo anno
  };
  await setDoc(doc(db,'oaListini',String(anno)),copia);
  toast('Listino duplicato come "'+nome+'"','ok');
}
window.oaDuplicaListino=oaDuplicaListino;

async function oaAttivaListino(anno){
  // Disattiva tutti, poi attiva quello selezionato
  for(var l of S.oaListini){
    if(l.attivo)await setDoc(doc(db,'oaListini',String(l.anno)),{...l,attivo:false});
  }
  var target=S.oaListini.find(function(x){return x.anno===anno;});
  if(target)await setDoc(doc(db,'oaListini',String(anno)),{...target,attivo:true});
  toast('Listino '+anno+' attivato','ok');
}
window.oaAttivaListino=oaAttivaListino;

async function oaDelListino(anno){
  if(!confirm('Eliminare il listino '+anno+'? Questa azione è irreversibile.'))return;
  await deleteDoc(doc(db,'oaListini',String(anno)));
  toast('Listino '+anno+' eliminato','ok');
}
window.oaDelListino=oaDelListino;

// Gestione righe regioni
function oaUpdateListinoReg(anno,idx,campo,val){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l||!l.regionali)return;
  l.regionali[idx][campo]=campo==='tariffa'?parseFloat(val)||0:val;
}
window.oaUpdateListinoReg=oaUpdateListinoReg;

async function oaAddListinoReg(anno){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l)return;
  l.regionali=l.regionali||[];
  l.regionali.push({nome:'Nuova regione',tariffa:800});
  await setDoc(doc(db,'oaListini',String(anno)),l);
}
window.oaAddListinoReg=oaAddListinoReg;

async function oaRemoveListinoReg(anno,idx){
  var l=S.oaListini.find(function(x){return x.anno===anno;});
  if(!l||!l.regionali)return;
  l.regionali.splice(idx,1);
  await setDoc(doc(db,'oaListini',String(anno)),l);
}
window.oaRemoveListinoReg=oaRemoveListinoReg;

function oaGTabAdd(){
  if(_oaTab==='clienti')oaOpenNewCliente();
  else if(_oaTab==='luoghi')oaOpenNewLuogo();
  else if(_oaTab==='addetti')oaOpenNewAddetto();
  else if(_oaTab==='servizi')oaOpenNewServizio();
}
window.oaGTabAdd=oaGTabAdd;

// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Preventivo
// ══════════════════════════════════════════════════════════

var _prevData={};

function oaRenderPreventivo(bookId){
  var w=document.getElementById('oa-prev-wrap');
  if(!w)return;
  var l=oaListinoAttivo();
  var b=bookId?S.bookings.find(function(x){return x.id===bookId;}):null;
  var luogo=b?.oaLuogoId?S.oaLuoghi.find(function(x){return x.id===b.oaLuogoId;}):null;
  var cliente=b?.oaClienteId?S.oaClienti.find(function(x){return x.id===b.oaClienteId;}):null;
  var kmAR=luogo?.kmAR||b?.oaKm||0;
  var nserate=b?.dates?.length||1;
  var regionali=l?.regionali||[{nome:'Luganese',tariffa:800},{nome:'Locarnese',tariffa:900},{nome:'Bellinzonese',tariffa:850},{nome:'Mendrisiotto',tariffa:950}];
  var df=l?.dirittiFilm||{soglia:150,sotto:350,sopra:5};
  var tarKm=l?.trasferta?.tarKm||0.70;
  var serviziPrezzi=l?.servizi||{};
  var annoListino=l?.anno||new Date().getFullYear();
  var serviziDisp=S.oaServizi.length?S.oaServizi:[
    {id:'sedie',icona:'🪑',nome:'Sedie'},{id:'bibite',icona:'🥤',nome:'Bibite'},
    {id:'popcorn',icona:'🍿',nome:'Popcorn'},{id:'pubblicita',icona:'📢',nome:'Pubblicità'}
  ];

  if(!l){
    document.getElementById('oa-prev-wrap').innerHTML='<div style="padding:20px;background:rgba(240,128,26,.08);border:1px solid rgba(240,128,26,.3);border-radius:10px;font-size:13px">⚠️ Nessun listino attivo. Vai su <strong>📋 Listino</strong> per creare e attivare il listino tariffe.</div>';
    return;
  }

  function fi(label,id,val,tipo){
    return '<div style="display:flex;flex-direction:column;gap:4px">'
      +'<label style="font-size:11px;color:var(--txt2)">'+label+'</label>'
      +'<input type="'+tipo+'" id="'+id+'" value="'+val+'" '+(tipo==='number'?'min="0" step="any" ':'')
      +'oninput="oaPrevCalc()" '
      +'style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);'+(tipo==='number'?'text-align:right':'')+'"></div>';
  }

  var html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
    +'<div><div style="font-size:15px;font-weight:700;color:var(--txt)">💰 Preventivo</div>'
    +'<div style="font-size:11px;color:var(--txt2)">Tariffe da listino '+annoListino+'</div></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btn bg bs" onclick="oaPrevEmail()">📧 Email</button>'
    +'<button class="btn ba bs" onclick="oaPrevPDF()">🖨 PDF</button>'
    +'</div></div>'
    +'<div style="display:flex;flex-direction:column;gap:12px">';

  // Intestazione
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Evento</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Cliente / Ente','prev-cliente',cliente?.ragione||b?.oaCliente||'','text')
    +fi('Nr. serate','prev-nserate',nserate,'number')
    +'</div>'
    // Luogo su riga intera con bottone calcola km
    +'<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">Luogo proiezione</label>'
    +'<div style="display:flex;gap:6px;align-items:center">'
    +'<input type="text" id="prev-luogo" value="'+(luogo?.nome||b?.location||'')+'" oninput="oaPrevCalc()"'
    +' style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">'
    +'<input type="text" id="prev-comune" value="'+(luogo?.comune||b?.oaVia||'')+'" placeholder="Comune"'
    +' oninput="oaPrevCalc()"'
    +' style="width:140px;font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">'
    +'<button class="btn bg bs" onclick="oaPrevCalcolaKm()" title="Calcola km da Via Vincenzo Vela 21, Mendrisio" style="white-space:nowrap;flex-shrink:0">🚗 Calcola km</button>'
    +'</div>'
    +'<div id="prev-km-status" style="display:none;font-size:11px;padding:5px 8px;background:rgba(74,232,122,.08);border:1px solid rgba(74,232,122,.25);border-radius:6px;margin-top:4px;color:var(--grn)"></div>'
    +'</div>'
    // Km A/R — campo editabile ma pre-compilato dal calcolo
    +'<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div style="display:flex;flex-direction:column;gap:4px">'
    +'<label style="font-size:11px;color:var(--txt2)">Km A/R <span style="font-weight:400;color:var(--txt2)">(calcolati o manuali)</span></label>'
    +'<input type="number" id="prev-km" value="'+kmAR+'" min="0" step="any" oninput="oaPrevCalc()"'
    +' style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt);text-align:right">'
    +'</div>'
    +'</div>'
    +fi('Note preventivo','prev-note','IVA esclusa — validità 30 giorni dalla data di emissione','text')
    +'</div>';

  // Tariffa base
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Tariffa base regionale</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:var(--txt2)">Regione</label>'
    +'<select id="prev-regione" onchange="oaPrevCalc()" style="font-size:13px;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf2);color:var(--txt)">';
  regionali.forEach(function(r){html+='<option value="'+r.tariffa+'">'+r.nome+' — CHF '+r.tariffa+'</option>';});
  html+='<option value="0">Personalizzato</option></select></div>'
    +fi('Tariffa personalizzata','prev-base-custom',regionali[0]?.tariffa||800,'number')
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-base-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-base">—</span>'
    +'</div></div>';

  // Diritti film
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Diritti film</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Spettatori previsti','prev-spett',b?.dates?.[0]?.dossier?.spettAnnunciati||100,'number')
    +'<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:var(--txt2)">Calcolo automatico</label>'
    +'<div id="prev-film-calc" style="font-size:12px;padding:8px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;color:var(--txt2)">—</div></div>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-film-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-film">—</span>'
    +'</div></div>';

  // Servizi
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Servizi opzionali</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px">';
  serviziDisp.forEach(function(s){
    var prezzo=serviziPrezzi[s.id]||0;
    var attivo=true;
    if(b?.servizi)attivo=b.servizi.some(function(sv){return(typeof sv==='string'?sv:sv.id)===s.id;});
    html+=oaPrevServizioRow(s,attivo,prezzo,l);
  });
  html+='</div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)">Subtotale servizi</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-opt">—</span>'
    +'</div></div>';

  // Trasferta
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Trasferta</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Tariffa/km','prev-tar-km',tarKm,'number')+'<div></div></div>'
    +'<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--bdr)">'
    +'<span style="font-size:12px;color:var(--txt2)" id="prev-km-note">—</span>'
    +'<span style="font-size:15px;font-weight:700;color:var(--txt)" id="prev-sub-km">—</span>'
    +'</div></div>';

  // Adeguamenti
  html+='<div class="ps"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt2);margin-bottom:10px">Adeguamenti</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +fi('Spese aggiuntive','prev-extra',0,'number')
    +fi('Sconto','prev-sconto',0,'number')
    +'</div></div>';

  // Totale
  html+='<div style="background:rgba(13,92,138,.06);border:1px solid rgba(13,92,138,.2);border-radius:12px;padding:16px 18px">'
    +'<div id="prev-riepilogo" style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;font-size:13px;color:var(--txt2)"></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(13,92,138,.2);padding-top:12px">'
    +'<span style="font-size:15px;font-weight:600;color:#0d5c8a">Totale preventivo</span>'
    +'<span style="font-size:22px;font-weight:700;color:#0d5c8a" id="prev-totale">—</span>'
    +'</div></div>';

  html+='</div>';
  w.innerHTML=html;
  _prevData={l,df,serviziDisp,bookId};
  // Se i km sono già disponibili dalla prenotazione o archivio luogo, mostra il banner
  if(kmAR>0){
    var statusEl=document.getElementById('prev-km-status');
    var fonte=luogo?.kmAR?'da archivio luogo':b?.oaKm?'da prenotazione':'';
    if(statusEl&&fonte){
      statusEl.textContent='🚗 A/R: '+kmAR+' km '+( luogo?.min?' ('+luogo.min+' min andata)':'')+(fonte?' — '+fonte:'');
      statusEl.style.color='var(--grn)';
      statusEl.style.display='block';
    }
  }
  oaPrevCalc();
}
window.oaRenderPreventivo=oaRenderPreventivo;

// Helper: renderizza una riga servizio nel preventivo con il tipo di calcolo corretto
function oaPrevServizioRow(s,attivo,prezzo,l){
  var tipo=(l?.serviziTipo||{})[s.id]||'fisso';
  var tarKmS=(l?.serviziKm||{})[s.id]||0;
  var html='<div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px">';
  // Prima riga: checkbox + nome + prezzo base
  html+='<div style="display:flex;align-items:center;gap:10px">'
    +'<input type="checkbox" id="prev-tog-'+s.id+'" '+(attivo?'checked':'')+' onchange="oaPrevCalc()" style="width:16px;height:16px;accent-color:var(--acc);flex-shrink:0">'
    +'<span style="font-size:14px">'+(s.icona||'')+'</span>'
    +'<span style="flex:1;font-size:13px;font-weight:500">'+s.nome+'</span>';
  if(tipo==='consumo'){
    // Prezzo unitario + quantità
    html+='<div style="display:flex;align-items:center;gap:4px">'
      +'<input type="number" id="prev-opt-'+s.id+'" value="'+prezzo+'" min="0" oninput="oaPrevCalc()" title="Prezzo unitario" '
      +'style="width:72px;font-size:12px;padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt);text-align:right">'
      +'<span style="font-size:10px;color:var(--txt2)">CHF/ud</span>'
      +'<span style="font-size:11px;color:var(--txt2)">×</span>'
      +'<input type="number" id="prev-qta-'+s.id+'" value="0" min="0" step="1" oninput="oaPrevCalc()" placeholder="qtà" title="Quantità" '
      +'style="width:60px;font-size:12px;padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt);text-align:right">'
      +'<span style="font-size:10px;color:var(--txt2)">pz</span>'
      +'<span style="font-size:12px;font-weight:600;color:var(--txt);min-width:60px;text-align:right" id="prev-tot-'+s.id+'">0 CHF</span>'
      +'</div>';
  } else if(tipo==='km'){
    // Fisso + km
    html+='<div style="display:flex;align-items:center;gap:4px">'
      +'<input type="number" id="prev-opt-'+s.id+'" value="'+prezzo+'" min="0" oninput="oaPrevCalc()" title="Costo fisso" '
      +'style="width:72px;font-size:12px;padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt);text-align:right">'
      +'<span style="font-size:10px;color:var(--txt2)">CHF fisso</span>'
      +'<span style="font-size:11px;color:var(--txt2)">+</span>'
      +'<input type="number" id="prev-tarKm-'+s.id+'" value="'+tarKmS+'" min="0" step="0.01" oninput="oaPrevCalc()" title="Tariffa km" '
      +'style="width:58px;font-size:12px;padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--surf);color:var(--txt);text-align:right">'
      +'<span style="font-size:10px;color:var(--txt2)">CHF/km</span>'
      +'<span style="font-size:12px;font-weight:600;color:var(--txt);min-width:60px;text-align:right" id="prev-tot-'+s.id+'">— CHF</span>'
      +'</div>';
  } else {
    // Fisso semplice
    html+='<input type="number" id="prev-opt-'+s.id+'" value="'+prezzo+'" min="0" oninput="oaPrevCalc()" '
      +'style="width:90px;font-size:13px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--surf);color:var(--txt);text-align:right">'
      +'<span style="font-size:11px;color:var(--txt2);min-width:24px">CHF</span>';
  }
  html+='</div>';
  // Etichetta tipo
  var tipoLabel=tipo==='consumo'?'🧾 A consumo — inserisci la quantità prevista':tipo==='km'?'🚗 Fisso + tariffa km A/R':'';
  if(tipoLabel)html+='<div style="font-size:10px;color:var(--txt2);margin-left:26px">'+tipoLabel+'</div>';
  html+='</div>';
  return html;
}
window.oaPrevServizioRow=oaPrevServizioRow;

function oaPrevCalc(){
  function gv(id){var e=document.getElementById(id);return e?parseFloat(e.value)||0:0;}
  function gs(id){var e=document.getElementById(id);return e?e.value:'';}
  function gc(id){var e=document.getElementById(id);return e?e.checked:false;}
  var nserate=Math.max(1,gv('prev-nserate'));
  var km=gv('prev-km'),spett=gv('prev-spett'),tarKm=gv('prev-tar-km');
  var extra=gv('prev-extra'),sconto=gv('prev-sconto');
  var regSel=document.getElementById('prev-regione');
  var baseReg=regSel?parseFloat(regSel.value)||0:0;
  var base=baseReg||gv('prev-base-custom');
  var subBase=base*nserate;
  var df=_prevData?.df||{soglia:150,sotto:350,sopra:5};
  var dfDisabilitati=df.disabilitati===true;
  var diritto=dfDisabilitati?0:(spett<=df.soglia?df.sotto:spett*df.sopra);
  var subFilm=dfDisabilitati?0:diritto*nserate;
  var fmtN=function(n){return n.toLocaleString('it-CH',{minimumFractionDigits:0,maximumFractionDigits:2});};
  var subOpt=0,optLines=[];
  if(_prevData?.serviziDisp){
    var l=_prevData.l;
    _prevData.serviziDisp.forEach(function(s){
      if(gc('prev-tog-'+s.id)){
        var tipo=(l?.serviziTipo||{})[s.id]||'fisso';
        var p=gv('prev-opt-'+s.id);
        var costo=0;
        var desc='';
        if(tipo==='consumo'){
          var qta=gv('prev-qta-'+s.id);
          costo=p*qta;
          desc=(s.icona||'')+' '+s.nome+': CHF '+p.toLocaleString('it-CH')+' × '+qta+' pz = CHF '+costo.toLocaleString('it-CH');
          // Aggiorna totale inline
          var totEl=document.getElementById('prev-tot-'+s.id);
          if(totEl)totEl.textContent=costo.toLocaleString('it-CH')+' CHF';
        } else if(tipo==='km'){
          var tarKmS=gv('prev-tarKm-'+s.id);
          var kmVal=km; // km A/R dal campo principale
          costo=p+(tarKmS*kmVal);
          desc=(s.icona||'')+' '+s.nome+': CHF '+p.toLocaleString('it-CH')+' + CHF '+tarKmS+' × '+fmtN(kmVal)+' km = CHF '+fmtN(costo);
          var totEl=document.getElementById('prev-tot-'+s.id);
          if(totEl)totEl.textContent=fmtN(costo)+' CHF';
        } else {
          costo=p;
          desc=(s.icona||'')+' '+s.nome+': CHF '+p.toLocaleString('it-CH');
        }
        subOpt+=costo;
        if(costo>0)optLines.push(desc);
      }
    });
  }
  var subKm=km*tarKm*nserate;
  var tot=subBase+subFilm+subOpt+subKm+extra-sconto;
  function set(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  set('prev-base-note','CHF '+fmtN(base)+' × '+nserate+' '+(nserate===1?'serata':'serate'));
  set('prev-sub-base','CHF '+fmtN(subBase));
  var calcEl=document.getElementById('prev-film-calc');
  if(calcEl)calcEl.textContent=dfDisabilitati?'Non inclusi':spett<=df.soglia?'Flat CHF '+df.sotto+' (≤'+df.soglia+' spett.)':'CHF '+df.sopra+' × '+spett+' = CHF '+fmtN(diritto)+'/serata';
  set('prev-film-note',dfDisabilitati?'Non inclusi nel preventivo':(spett<=df.soglia?'CHF '+df.sotto+' fissi':'CHF '+fmtN(diritto)+'/serata')+' × '+nserate+' serate');
  set('prev-sub-film',dfDisabilitati?'—':'CHF '+fmtN(subFilm));
  set('prev-sub-opt','CHF '+fmtN(subOpt));
  set('prev-km-note',fmtN(km)+' km × CHF '+tarKm+' × '+nserate+' serate');
  set('prev-sub-km','CHF '+fmtN(subKm));
  set('prev-totale','CHF '+fmtN(tot));
  var riel=document.getElementById('prev-riepilogo');
  if(riel){
    var lines=[['Tariffa base','CHF '+fmtN(subBase)],['Diritti film',dfDisabilitati?'Non inclusi':'CHF '+fmtN(subFilm)]];
    if(optLines.length)optLines.forEach(function(ol){lines.push([ol,'']);});
    lines.push(['Servizi opzionali','CHF '+fmtN(subOpt)]);
    lines.push(['Trasferta ('+fmtN(km)+' km A/R)','CHF '+fmtN(subKm)]);
    if(extra>0)lines.push(['Spese aggiuntive','CHF '+fmtN(extra)]);
    if(sconto>0)lines.push(['Sconto','− CHF '+fmtN(sconto)]);
    riel.innerHTML=lines.map(function(r){
      return '<div style="display:flex;justify-content:space-between"><span>'+r[0]+'</span><span style="font-weight:500;color:var(--txt)">'+r[1]+'</span></div>';
    }).join('');
  }
  _prevData._calc={nserate,km,spett,tarKm,extra,sconto,base,diritto,subBase,subFilm,subOpt,subKm,tot,
    cliente:gs('prev-cliente'),luogo:gs('prev-luogo'),note:gs('prev-note'),optLines,fmtN};
}
window.oaPrevCalc=oaPrevCalc;

async function oaPrevCalcolaKm(){
  var luogo=document.getElementById('prev-luogo')?.value.trim();
  var comune=document.getElementById('prev-comune')?.value.trim();
  var indirizzo=[luogo,comune].filter(Boolean).join(', ');
  if(!indirizzo){toast('Inserisci luogo e/o comune prima di calcolare i km','err');return;}
  var statusEl=document.getElementById('prev-km-status');
  if(statusEl){statusEl.textContent='⏳ Geocodifica in corso...';statusEl.style.display='block';statusEl.style.color='var(--txt2)';}
  // Geocodifica
  var geo=await oaGeocode(indirizzo);
  if(!geo){
    if(statusEl){statusEl.textContent='❌ Indirizzo non trovato — prova ad essere più preciso';statusEl.style.color='var(--red)';}
    toast('Indirizzo non trovato','err');return;
  }
  if(statusEl)statusEl.textContent='⏳ Calcolo percorso...';
  // Calcola distanza via OSRM
  var dist=await oaCalcolaDistanza(geo.lat,geo.lon);
  if(!dist){
    if(statusEl){statusEl.textContent='❌ Errore nel calcolo del percorso';statusEl.style.color='var(--red)';}
    toast('Errore calcolo percorso','err');return;
  }
  // Inserisce km A/R nel campo
  var kmInput=document.getElementById('prev-km');
  if(kmInput)kmInput.value=dist.kmAR.toFixed(1);
  if(statusEl){
    var loc=geo.label.split(',').slice(0,2).join(',').trim();
    statusEl.textContent='📍 '+loc+' · 🚗 Andata: '+dist.km.toFixed(1)+' km ('+dist.min+' min) · A/R: '+dist.kmAR.toFixed(1)+' km ('+dist.minAR+' min)';
    statusEl.style.color='var(--grn)';
    statusEl.style.display='block';
  }
  oaPrevCalc(); // aggiorna il totale
  toast('Km calcolati: '+dist.kmAR.toFixed(1)+' km A/R','ok');
}
window.oaPrevCalcolaKm=oaPrevCalcolaKm;

function oaPrevPDF(){
  var c=_prevData._calc;if(!c){toast('Compila prima il preventivo','err');return;}
  var fmtN=c.fmtN;
  var CN='Il Cinematografo Ambulante · Fabbrica dei Sogni Sagl';
  var oggi=new Date().toLocaleDateString('it-IT');
  var html='<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}'
    +'.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #0d5c8a;padding-bottom:10px;margin-bottom:16px}'
    +'.hdr-title{font-size:20px;font-weight:700;color:#0d5c8a}'
    +'.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}'
    +'.ib{background:#f5f7fa;border-radius:6px;padding:9px 12px}'
    +'.il{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:3px}'
    +'.iv{font-size:13px;font-weight:700}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:12px}'
    +'th{background:#0d5c8a;color:#fff;padding:7px 10px;text-align:left;font-size:10px}'
    +'td{padding:7px 10px;border-bottom:1px solid #eee;font-size:11px}'
    +'.tr td{font-size:14px;font-weight:700;color:#0d5c8a;border-top:2px solid #0d5c8a;border-bottom:none}'
    +'.footer{margin-top:20px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#aaa;display:flex;justify-content:space-between}'
    +'</style></head><body>'
    +'<div class="hdr"><div><div class="hdr-title">Preventivo CineTour Open Air</div>'
    +'<div style="font-size:10px;color:#555;margin-top:3px">'+CN+' · Emesso il '+oggi+'</div></div>'
    +'<div style="text-align:right;font-size:10px;color:#555">Via Vincenzo Vela 21<br>6850 Mendrisio</div></div>'
    +'<div class="info-grid">'
    +'<div class="ib"><div class="il">Cliente / Ente</div><div class="iv">'+c.cliente+'</div></div>'
    +'<div class="ib"><div class="il">Luogo proiezione</div><div class="iv">'+c.luogo+'</div></div>'
    +'<div class="ib"><div class="il">Nr. serate</div><div class="iv">'+c.nserate+' '+(c.nserate===1?'serata':'serate')+'</div></div>'
    +'<div class="ib"><div class="il">Distanza A/R</div><div class="iv">'+fmtN(c.km)+' km</div></div>'
    +'</div>'
    +'<table><thead><tr><th>Voce</th><th>Dettaglio</th><th style="text-align:right">Importo</th></tr></thead><tbody>'
    +'<tr><td>Tariffa base regionale</td><td>CHF '+fmtN(c.base)+' × '+c.nserate+' serate</td><td style="text-align:right">CHF '+fmtN(c.subBase)+'</td></tr>'
    +'<tr><td>Diritti film</td><td>'+(c.spett<=((_prevData.df)||{soglia:150}).soglia?'Flat CHF '+fmtN(c.diritto):'CHF '+fmtN(c.diritto)+'/serata')+' × '+c.nserate+' serate</td><td style="text-align:right">CHF '+fmtN(c.subFilm)+'</td></tr>';
  if(c.subOpt>0)html+='<tr><td>Servizi opzionali</td><td>'+c.optLines.join(' · ')+'</td><td style="text-align:right">CHF '+fmtN(c.subOpt)+'</td></tr>';
  html+='<tr><td>Trasferta</td><td>'+fmtN(c.km)+' km × CHF '+c.tarKm+'/km × '+c.nserate+' serate</td><td style="text-align:right">CHF '+fmtN(c.subKm)+'</td></tr>';
  if(c.extra>0)html+='<tr><td>Spese aggiuntive</td><td>—</td><td style="text-align:right">CHF '+fmtN(c.extra)+'</td></tr>';
  if(c.sconto>0)html+='<tr><td>Sconto</td><td>—</td><td style="text-align:right">− CHF '+fmtN(c.sconto)+'</td></tr>';
  html+='</tbody><tfoot><tr class="tr"><td colspan="2">TOTALE PREVENTIVO</td><td style="text-align:right">CHF '+fmtN(c.tot)+'</td></tr></tfoot></table>';
  if(c.note)html+='<p style="font-size:10px;color:#555;margin-top:8px">'+c.note+'</p>';
  html+='<div class="footer"><span>'+CN+'</span><span>Preventivo del '+oggi+' — valido 30 giorni</span></div>'
    +'</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var w2=window.open(u,'_blank');
  if(w2)setTimeout(function(){w2.print();},800);
  setTimeout(function(){URL.revokeObjectURL(u);},30000);
}
window.oaPrevPDF=oaPrevPDF;

function oaPrevEmail(){
  var c=_prevData._calc;if(!c){toast('Compila prima il preventivo','err');return;}
  var CN='Il Cinematografo Ambulante · Fabbrica dei Sogni Sagl';
  var fmtN=c.fmtN;
  // Destinatario dalla richiesta se disponibile
  var r=_prevData.richiestaId?S.oaRichieste.find(function(x){return x.id===_prevData.richiestaId;}):null;
  var destinatario=r?.email||'';
  var sogg='CineTour.ch — Preventivo proiezione'+(c.luogo?' a '+c.luogo:'');
  var corpo='Gentile '+(c.cliente||r?.referente||'Organizzatore')+',\n\n'
    +'con la presente Le inviamo il preventivo per il servizio CineTour.ch — Il Cinematografo Ambulante Open Air:\n\n'
    +'EVENTO:\n• Luogo: '+c.luogo+'\n• Nr. serate: '+c.nserate+'\n\n'
    +'RIEPILOGO COSTI:\n'
    +'• Tariffa base regionale: CHF '+fmtN(c.subBase)+'\n'
    +'• Diritti film:           CHF '+fmtN(c.subFilm)+'\n'
    +(c.subOpt>0?'• Servizi opzionali:      CHF '+fmtN(c.subOpt)+'\n':'')
    +'• Trasferta ('+fmtN(c.km)+' km A/R):  CHF '+fmtN(c.subKm)+'\n'
    +(c.extra>0?'• Spese aggiuntive:       CHF '+fmtN(c.extra)+'\n':'')
    +(c.sconto>0?'• Sconto:               − CHF '+fmtN(c.sconto)+'\n':'')
    +'\nTOTALE: CHF '+fmtN(c.tot)+'\n\n'
    +(c.note?c.note+'\n\n':'')
    +'In allegato trovate il preventivo dettagliato in formato PDF.\n\n'
    +'Restiamo a disposizione.\n\nCordiali saluti,\n'+CN;
  window.open('mailto:'+destinatario+'?subject='+encodeURIComponent(sogg)+'&body='+encodeURIComponent(corpo));
}
window.oaPrevEmail=oaPrevEmail;

function oaApriPreventivo(bookId){
  oaGTab('prev');
  setTimeout(function(){oaRenderPreventivo(bookId);},100);
}
window.oaApriPreventivo=oaApriPreventivo;

var _serviziDefault=[
  {id:'sedie',   icona:'🪑', nome:'Sedie',      descrizione:'Fornitura sedie per il pubblico',          ordine:1, attivo:true},
  {id:'bibita',  icona:'🥤', nome:'Bibite',     descrizione:'Servizio bibite per gli spettatori',        ordine:2, attivo:true},
  {id:'popcorn', icona:'🍿', nome:'Popcorn',    descrizione:'Servizio popcorn durante la proiezione',    ordine:3, attivo:true},
  {id:'pubblicita',icona:'📢',nome:'Pubblicità',descrizione:'Promozione locale dell\'evento',            ordine:4, attivo:true},
];

async function oaInitServiziDefault(){
  // Inizializza solo se la collezione è ancora vuota
  if(S.oaServizi.length)return;
  for(var s of _serviziDefault){
    await setDoc(doc(db,'oaServizi',s.id),s);
  }
}
window.oaInitServiziDefault=oaInitServiziDefault;

function oaRenderServizi(){
  var w=document.getElementById('oa-servizi-list');
  if(!w)return;
  if(!S.oaServizi.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessun servizio. Clicca + per aggiungerne uno.</div>';
    return;
  }
  var html='<div style="display:flex;flex-direction:column;gap:8px">';
  S.oaServizi.forEach(function(s,i){
    html+='<div style="display:flex;align-items:center;gap:12px;background:var(--surf);border:1px solid var(--bdr-strong);border-radius:10px;padding:12px 14px;'+(s.attivo?'':'opacity:.5')+'">';
    // Frecce ordine
    html+='<div style="display:flex;flex-direction:column;gap:2px">';
    html+='<button class="btn bg" style="padding:1px 6px;font-size:10px;line-height:1.4" onclick="oaServizioSu(\''+s.id+'\')" '+(i===0?'disabled':'')+'>▲</button>';
    html+='<button class="btn bg" style="padding:1px 6px;font-size:10px;line-height:1.4" onclick="oaServizioGiu(\''+s.id+'\')" '+(i===S.oaServizi.length-1?'disabled':'')+'>▼</button>';
    html+='</div>';
    // Icona
    html+='<span style="font-size:28px;width:36px;text-align:center">'+s.icona+'</span>';
    // Info
    html+='<div style="flex:1;min-width:0">';
    html+='<div style="font-size:14px;font-weight:600;color:var(--txt);display:flex;align-items:center;gap:6px">'+s.nome;
    if(s.conQuantita)html+='<span style="font-size:10px;background:rgba(13,92,138,.12);color:#0d5c8a;border-radius:4px;padding:1px 6px;font-weight:600">🔢 con quantità</span>';
    html+='</div>';
    html+='<div style="font-size:11px;color:var(--txt2);margin-top:2px">'+s.descrizione+'</div>';
    if(s.conQuantita&&s.labelQuantita)html+='<div style="font-size:10px;color:var(--txt2);margin-top:2px">❓ '+s.labelQuantita+(s.qtaMin||s.qtaMax?' ('+s.qtaMin+'–'+(s.qtaMax||'∞')+')':'')+'</div>';
    html+='</div>';
    // Toggle attivo
    html+='<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2);cursor:pointer;flex-shrink:0">';
    html+='<input type="checkbox" '+(s.attivo?'checked':'')+' onchange="oaToggleServizioAttivo(\''+s.id+'\',this.checked)" style="accent-color:var(--acc)"> Visibile';
    html+='</label>';
    // Azioni
    html+='<button class="btn bg bs" onclick="oaOpenEditServizio(\''+s.id+'\')" style="flex-shrink:0">✏</button>';
    html+='<button class="btn bd bs" onclick="oaDelServizio(\''+s.id+'\')" style="flex-shrink:0">✕</button>';
    html+='</div>';
  });
  html+='</div>';
  html+='<div style="margin-top:14px;padding:10px 14px;background:var(--surf2);border-radius:8px;font-size:11px;color:var(--txt2)">';
  html+='💡 I servizi visibili (spunta attiva) vengono mostrati agli organizzatori nella pagina pubblica di richiesta.';
  html+='</div>';
  w.innerHTML=html;
}
window.oaRenderServizi=oaRenderServizi;

function oaToggleQtaField(){
  var chk=document.getElementById('oaServizioConQta');
  var fields=document.getElementById('oaServizioQtaFields');
  if(fields)fields.style.display=chk?.checked?'block':'none';
}
window.oaToggleQtaField=oaToggleQtaField;

function oaOpenNewServizio(){
  document.getElementById('ovOAServizio').classList.add('on');
  document.getElementById('oaServizioId').value='';
  document.getElementById('oaServizioIcona').value='';
  document.getElementById('oaServizioNome').value='';
  document.getElementById('oaServizioDesc').value='';
  document.getElementById('oaServizioConQta').checked=false;
  document.getElementById('oaServizioLabelQta').value='';
  document.getElementById('oaServizioQtaMin').value='0';
  document.getElementById('oaServizioQtaMax').value='0';
  document.getElementById('oaServizioQtaFields').style.display='none';
  document.getElementById('oaServizioTitle').textContent='Nuovo servizio';
}
window.oaOpenNewServizio=oaOpenNewServizio;

function oaOpenEditServizio(id){
  var s=S.oaServizi.find(function(x){return x.id===id;});
  if(!s)return;
  document.getElementById('ovOAServizio').classList.add('on');
  document.getElementById('oaServizioId').value=s.id;
  document.getElementById('oaServizioIcona').value=s.icona||'';
  document.getElementById('oaServizioNome').value=s.nome||'';
  document.getElementById('oaServizioDesc').value=s.descrizione||'';
  var conQta=!!s.conQuantita;
  document.getElementById('oaServizioConQta').checked=conQta;
  document.getElementById('oaServizioLabelQta').value=s.labelQuantita||'';
  document.getElementById('oaServizioQtaMin').value=s.qtaMin||0;
  document.getElementById('oaServizioQtaMax').value=s.qtaMax||0;
  document.getElementById('oaServizioQtaFields').style.display=conQta?'block':'none';
  document.getElementById('oaServizioTitle').textContent='Modifica servizio';
}
window.oaOpenEditServizio=oaOpenEditServizio;

async function svOAServizio(){
  var id=document.getElementById('oaServizioId').value.trim();
  var icona=document.getElementById('oaServizioIcona').value.trim();
  var nome=document.getElementById('oaServizioNome').value.trim();
  var desc=document.getElementById('oaServizioDesc').value.trim();
  var conQta=document.getElementById('oaServizioConQta').checked;
  var labelQta=document.getElementById('oaServizioLabelQta').value.trim();
  var qtaMin=parseInt(document.getElementById('oaServizioQtaMin').value)||0;
  var qtaMax=parseInt(document.getElementById('oaServizioQtaMax').value)||0;
  if(!nome){toast('Inserisci il nome del servizio','err');return;}
  if(!icona){toast('Inserisci un\'icona (emoji)','err');return;}
  if(conQta&&!labelQta){toast('Inserisci la domanda per la quantità','err');return;}
  if(!id)id=nome.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,20)||('serv'+Date.now());
  var existing=S.oaServizi.find(function(x){return x.id===id;});
  var ordine=existing?.ordine||(S.oaServizi.length+1);
  var attivo=existing?.attivo!==false;
  await setDoc(doc(db,'oaServizi',id),{
    id,icona,nome,descrizione:desc,ordine,attivo,
    conQuantita:conQta,
    labelQuantita:conQta?labelQta:'',
    qtaMin:conQta?qtaMin:0,
    qtaMax:conQta?qtaMax:0,
  });
  co('ovOAServizio');
  toast('Servizio salvato','ok');
}
window.svOAServizio=svOAServizio;

async function oaDelServizio(id){
  if(!confirm('Eliminare questo servizio?'))return;
  await deleteDoc(doc(db,'oaServizi',id));
  toast('Servizio eliminato','ok');
}
window.oaDelServizio=oaDelServizio;

async function oaToggleServizioAttivo(id,val){
  var s=S.oaServizi.find(function(x){return x.id===id;});
  if(!s)return;
  await setDoc(doc(db,'oaServizi',id),{...s,attivo:val});
}
window.oaToggleServizioAttivo=oaToggleServizioAttivo;

async function oaServizioSu(id){
  var idx=S.oaServizi.findIndex(function(x){return x.id===id;});
  if(idx<=0)return;
  var a=S.oaServizi[idx],b=S.oaServizi[idx-1];
  await setDoc(doc(db,'oaServizi',a.id),{...a,ordine:b.ordine});
  await setDoc(doc(db,'oaServizi',b.id),{...b,ordine:a.ordine});
}
window.oaServizioSu=oaServizioSu;

async function oaServizioGiu(id){
  var idx=S.oaServizi.findIndex(function(x){return x.id===id;});
  if(idx<0||idx>=S.oaServizi.length-1)return;
  var a=S.oaServizi[idx],b=S.oaServizi[idx+1];
  await setDoc(doc(db,'oaServizi',a.id),{...a,ordine:b.ordine});
  await setDoc(doc(db,'oaServizi',b.id),{...b,ordine:a.ordine});
}
window.oaServizioGiu=oaServizioGiu;

// Popola i select cliente/luogo nel modal prenotazioni OA
function fillOAClienteDropdown(){
  var sel=document.getElementById('bOAClienteId');
  if(!sel)return;
  var cur=sel.value;
  sel.innerHTML='<option value="">— Seleziona cliente —</option>';
  S.oaClienti.forEach(function(c){
    var o=document.createElement('option');
    o.value=c.id;o.textContent=c.ragione;sel.appendChild(o);
  });
  if(cur)sel.value=cur;
}
window.fillOAClienteDropdown=fillOAClienteDropdown;

function fillOALuogoDropdown(){
  var sel=document.getElementById('bOALuogoId');
  if(!sel)return;
  var cur=sel.value;
  sel.innerHTML='<option value="">— Seleziona luogo —</option>';
  S.oaLuoghi.forEach(function(l){
    var o=document.createElement('option');
    o.value=l.id;o.textContent=l.nome+(l.comune?' — '+l.comune:'');sel.appendChild(o);
  });
  if(cur)sel.value=cur;
}
window.fillOALuogoDropdown=fillOALuogoDropdown;

function oaFillClienteFromSel(){
  var sel=document.getElementById('bOAClienteId');
  if(!sel)return;
  var c=S.oaClienti.find(function(x){return x.id===sel.value;});
  if(!c)return;
  // Autofill nome cliente e contatto
  var nc=document.getElementById('bOACliente');
  var cc=document.getElementById('bOAContact');
  if(nc&&!nc.value)nc.value=c.respOrg||c.ragione||'';
  if(cc&&!cc.value)cc.value=c.tel||c.email||'';
}
window.oaFillClienteFromSel=oaFillClienteFromSel;

// ══════════════════════════════════════════════════════════
// ☀  CINETOUR OA — Calcolo Km
// Partenza fissa: Via Vincenzo Vela 21, 6850 Mendrisio
// ══════════════════════════════════════════════════════════
var OA_PARTENZA_LAT = 45.8722581;
var OA_PARTENZA_LON = 8.9861456;

// Geocodifica un indirizzo → {lat, lon} tramite Nominatim (OSM, gratuito)
async function oaGeocode(indirizzo){
  if(!indirizzo)return null;
  try{
    var q=encodeURIComponent(indirizzo+', Svizzera');
    var r=await fetch('https://nominatim.openstreetmap.org/search?q='+q+'&format=json&limit=1&countrycodes=ch,it',{
      headers:{'Accept-Language':'it','User-Agent':'CineManager/1.0 (luca.morandini@mendrisiocinema.ch)'}
    });
    var data=await r.json();
    if(!data.length){
      // Secondo tentativo senza filtro paese
      r=await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(indirizzo)+'&format=json&limit=1',{
        headers:{'Accept-Language':'it','User-Agent':'CineManager/1.0'}
      });
      data=await r.json();
    }
    if(!data.length)return null;
    return {lat:parseFloat(data[0].lat),lon:parseFloat(data[0].lon),label:data[0].display_name};
  }catch(e){return null;}
}

// Calcola distanza stradale tramite OSRM (OpenStreetMap, gratuito, nessuna API key)
async function oaCalcolaDistanza(latDest,lonDest){
  try{
    var url='https://router.project-osrm.org/route/v1/driving/'
      +OA_PARTENZA_LON+','+OA_PARTENZA_LAT+';'
      +lonDest+','+latDest
      +'?overview=false';
    var r=await fetch(url);
    var data=await r.json();
    if(data.code!=='Ok'||!data.routes?.length)return null;
    var km=data.routes[0].distance/1000;
    var min=Math.round(data.routes[0].duration/60);
    return {km:km,kmAR:km*2,min:min,minAR:min*2};
  }catch(e){return null;}
}

// Calcola e mostra km dal campo indirizzo nel modal prenotazione
async function oaCalcolaKmModal(){
  var via=document.getElementById('bOAVia')?.value.trim();
  var comune=document.getElementById('bLocation')?.value.trim();
  var indirizzo=(via?via+', ':'')+(comune||'');
  if(!indirizzo){toast('Inserisci prima l\'indirizzo del luogo','err');return;}
  var kmEl=document.getElementById('bOAKmResult');
  if(kmEl){kmEl.textContent='⏳ Calcolo in corso...';kmEl.style.display='block';}
  var geo=await oaGeocode(indirizzo);
  if(!geo){
    if(kmEl){kmEl.textContent='❌ Indirizzo non trovato — prova a essere più preciso';kmEl.style.color='var(--red)';}
    toast('Indirizzo non trovato','err');return;
  }
  var dist=await oaCalcolaDistanza(geo.lat,geo.lon);
  if(!dist){
    if(kmEl){kmEl.textContent='❌ Calcolo percorso fallito';kmEl.style.color='var(--red)';}
    toast('Calcolo percorso fallito','err');return;
  }
  var testo='📍 '+geo.label.split(',').slice(0,3).join(',')
    +' · 🚗 Andata: '+dist.km.toFixed(1)+' km ('+dist.min+' min)'
    +' · 🔄 A/R: '+dist.kmAR.toFixed(1)+' km ('+dist.minAR+' min)';
  if(kmEl){
    kmEl.textContent=testo;
    kmEl.style.color='var(--grn)';
    kmEl.style.display='block';
  }
  // Salva km A/R nel campo nascosto per il salvataggio
  var kmInput=document.getElementById('bOAKm');
  if(kmInput)kmInput.value=dist.kmAR.toFixed(1);
  toast('Distanza calcolata: '+dist.kmAR.toFixed(1)+' km A/R','ok');
}
window.oaCalcolaKmModal=oaCalcolaKmModal;

function oaFillLuogoFromSel(){
  var sel=document.getElementById('bOALuogoId');
  if(!sel)return;
  var l=S.oaLuoghi.find(function(x){return x.id===sel.value;});
  var info=document.getElementById('bOALuogoInfo');
  if(!l){if(info)info.style.display='none';return;}
  // Autofill campi
  var loc=document.getElementById('bLocation');
  var via=document.getElementById('bOAVia');
  if(loc&&!loc.value)loc.value=l.comune||'';
  if(via&&!via.value)via.value=l.indirizzo||l.nome||'';
  // Mostra scheda tecnica luogo
  if(info){
    var lines=[];
    if(l.capienza)lines.push('👥 Capienza: '+l.capienza+' posti');
    lines.push('⚡ Elettrico: '+(l.elettrico==='si'?'✓ Disponibile':l.elettrico==='no'?'✗ Non disponibile':'Non definito'));
    if(l.elettricoNote)lines.push('   '+l.elettricoNote);
    if(l.luci)lines.push('💡 Luci: '+l.luci);
    if(l.vetrine)lines.push('🪟 Vetrine: '+l.vetrine);
    if(l.strade)lines.push('🚧 Strade: '+l.strade);
    if(l.accesso)lines.push('🚗 Accesso: '+l.accesso);
    if(l.mapsUrl)lines.push('<a href="'+l.mapsUrl+'" target="_blank" style="color:var(--acc)">🗺 Apri Maps</a>');
    // Km da archivio luogo (se già calcolati)
    if(l.kmAR)lines.push('🚗 Distanza: '+l.kmAR+' km A/R ('+l.minAR+' min A/R)');
    info.innerHTML=lines.join('<br>');
    info.style.display=lines.length?'block':'none';
  }
  // Mostra km se già salvati nell'archivio luogo
  var kmEl=document.getElementById('bOAKmResult');
  var kmInput=document.getElementById('bOAKm');
  if(l.kmAR){
    if(kmEl){
      kmEl.textContent='🚗 Andata: '+l.km+' km ('+l.min+' min) · 🔄 A/R: '+l.kmAR+' km ('+l.minAR+' min)';
      kmEl.style.color='var(--grn)';
      kmEl.style.display='block';
    }
    if(kmInput)kmInput.value=l.kmAR;
  } else {
    // Calcola automaticamente se il luogo ha un indirizzo
    if(l.indirizzo||l.comune){
      setTimeout(function(){oaCalcolaKmModal();},300);
    }
  }
}
window.oaFillLuogoFromSel=oaFillLuogoFromSel;

// Calcola e salva km nell'archivio luogo (chiamato dal modal luogo)
async function oaCalcolaKmLuogo(luogoId){
  var l=S.oaLuoghi.find(function(x){return x.id===luogoId;});
  if(!l)return;
  var indirizzo=(l.indirizzo?l.indirizzo+', ':'')+(l.comune||l.nome||'');
  var el=document.getElementById('luogo-km-'+luogoId);
  if(el){el.textContent='⏳ Calcolo...';el.style.color='var(--txt2)';}
  var geo=await oaGeocode(indirizzo);
  if(!geo){
    if(el){el.textContent='❌ Non trovato';el.style.color='var(--red)';}
    toast('Indirizzo non trovato per: '+indirizzo,'err');return;
  }
  var dist=await oaCalcolaDistanza(geo.lat,geo.lon);
  if(!dist){
    if(el){el.textContent='❌ Errore calcolo';el.style.color='var(--red)';}
    toast('Errore calcolo distanza','err');return;
  }
  // Salva in Firestore
  await setDoc(doc(db,'oaLuoghi',luogoId),{
    ...l,
    lat:geo.lat, lon:geo.lon,
    km:parseFloat(dist.km.toFixed(1)),
    kmAR:parseFloat(dist.kmAR.toFixed(1)),
    min:dist.min,
    minAR:dist.minAR
  });
  if(el){
    el.textContent='🚗 '+dist.km.toFixed(1)+' km → A/R: '+dist.kmAR.toFixed(1)+' km ('+dist.minAR+' min)';
    el.style.color='var(--grn)';
  }
  toast('Distanza salvata: '+dist.kmAR.toFixed(1)+' km A/R','ok');
}
window.oaCalcolaKmLuogo=oaCalcolaKmLuogo;
function oaRenderClienti(){
  var w=document.getElementById('oa-clienti-list');
  if(!w)return;
  if(!S.oaClienti.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessun cliente. Clicca + per aggiungerne uno.</div>';
    return;
  }
  w.innerHTML=S.oaClienti.map(function(c){
    return '<div class="oa-card" onclick="oaOpenCliente(\''+c.id+'\')">'+
      '<div class="oa-card-title">'+c.ragione+'</div>'+
      '<div class="oa-card-meta">'+
        (c.respOrg?'<span>👤 Org: '+c.respOrg+'</span>':'')+
        (c.respOp?'<span>👷 Op: '+c.respOp+'</span>':'')+
        (c.email?'<span>✉ '+c.email+'</span>':'')+
        (c.tel?'<span>📞 '+c.tel+'</span>':'')+
      '</div>'+
      '<div class="oa-card-actions">'+
        '<button class="btn bg bs" onclick="event.stopPropagation();oaEditCliente(\''+c.id+'\')">✏ Modifica</button>'+
        '<button class="btn bd bs" onclick="event.stopPropagation();oaDelCliente(\''+c.id+'\')">✕</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
window.oaRenderClienti=oaRenderClienti;

function oaOpenNewCliente(){
  document.getElementById('oaCId').value='';
  document.getElementById('oaCRagione').value='';
  document.getElementById('oaCRespOrg').value='';
  document.getElementById('oaCRespOp').value='';
  document.getElementById('oaCEmail').value='';
  document.getElementById('oaCTel').value='';
  document.getElementById('oaCPiva').value='';
  document.getElementById('oaCIndirizzo').value='';
  document.getElementById('oaCNote').value='';
  document.getElementById('ovOAClienteT').textContent='Nuovo Cliente OA';
  document.getElementById('ovOACliente').classList.add('on');
}
window.oaOpenNewCliente=oaOpenNewCliente;

function oaEditCliente(id){
  var c=S.oaClienti.find(function(x){return x.id===id;});if(!c)return;
  document.getElementById('oaCId').value=id;
  document.getElementById('oaCRagione').value=c.ragione||'';
  document.getElementById('oaCRespOrg').value=c.respOrg||'';
  document.getElementById('oaCRespOp').value=c.respOp||'';
  document.getElementById('oaCEmail').value=c.email||'';
  document.getElementById('oaCTel').value=c.tel||'';
  document.getElementById('oaCPiva').value=c.piva||'';
  document.getElementById('oaCIndirizzo').value=c.indirizzo||'';
  document.getElementById('oaCNote').value=c.note||'';
  document.getElementById('ovOAClienteT').textContent='Modifica Cliente OA';
  document.getElementById('ovOACliente').classList.add('on');
}
window.oaEditCliente=oaEditCliente;

async function oaSvCliente(){
  var ragione=document.getElementById('oaCRagione').value.trim();
  if(!ragione){toast('Inserisci la ragione sociale','err');return;}
  var id=document.getElementById('oaCId').value||uid();
  var data={
    id,ragione,
    respOrg:document.getElementById('oaCRespOrg').value.trim(),
    respOp:document.getElementById('oaCRespOp').value.trim(),
    email:document.getElementById('oaCEmail').value.trim(),
    tel:document.getElementById('oaCTel').value.trim(),
    piva:document.getElementById('oaCPiva').value.trim(),
    indirizzo:document.getElementById('oaCIndirizzo').value.trim(),
    note:document.getElementById('oaCNote').value.trim(),
    updatedAt:new Date().toISOString()
  };
  await setDoc(doc(db,'oaClienti',id),data);
  co('ovOACliente');
  toast('Cliente salvato','ok');
  // Aggiorna dropdown nel modal prenotazione se aperto
  if(document.getElementById('ovBook')?.classList.contains('on')){
    fillOAClienteDropdown();
    // Seleziona automaticamente il cliente appena inserito
    var sel=document.getElementById('bOAClienteId');
    if(sel){sel.value=id;oaFillClienteFromSel();}
  }
}
window.oaSvCliente=oaSvCliente;

async function oaDelCliente(id){
  if(!confirm('Eliminare questo cliente?'))return;
  await deleteDoc(doc(db,'oaClienti',id));
  toast('Eliminato','ok');
}
window.oaDelCliente=oaDelCliente;

function oaOpenCliente(id){oaEditCliente(id);}
window.oaOpenCliente=oaOpenCliente;

// ─── LUOGHI ───────────────────────────────────────────────
function oaRenderLuoghi(){
  var w=document.getElementById('oa-luoghi-list');
  if(!w)return;
  if(!S.oaLuoghi.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessun luogo. Clicca + per aggiungerne uno.</div>';
    return;
  }
  w.innerHTML=S.oaLuoghi.map(function(l){
    var tags=[];
    if(l.elettrico==='si')tags.push('<span class="oa-tag ok">⚡ Elettrico</span>');
    if(l.elettrico==='no')tags.push('<span class="oa-tag err">⚡ No elettrico</span>');
    if(l.capienza)tags.push('<span class="oa-tag">👥 '+l.capienza+' posti</span>');
    // Km badge
    var kmBadge=l.kmAR
      ?'<span class="oa-tag" style="background:rgba(74,232,122,.12);color:var(--grn);border-color:var(--grn)">🚗 '+l.km+' km | A/R: '+l.kmAR+' km</span>'
      :'';
    return '<div class="oa-card" onclick="oaEditLuogo(\''+l.id+'\')">'+
      '<div class="oa-card-title">'+l.nome+(l.comune?' <span style="font-weight:400;font-size:12px;color:var(--txt2)">— '+l.comune+'</span>':'' )+'</div>'+
      '<div class="oa-card-meta">'+
        (l.indirizzo?'<span>📍 '+l.indirizzo+'</span>':'')+
        (l.mapsUrl?'<span><a href="'+l.mapsUrl+'" target="_blank" onclick="event.stopPropagation()" style="color:var(--acc);text-decoration:none">🗺 Maps</a></span>':'')+
        tags.join('')+
        kmBadge+
        '<span id="luogo-km-'+l.id+'"></span>'+
      '</div>'+
      '<div class="oa-card-actions">'+
        '<button class="btn bg bs" onclick="event.stopPropagation();oaCalcolaKmLuogo(\''+l.id+'\')" title="Calcola km da Mendrisio">🚗 '+( l.kmAR ? 'Ricalcola km' : 'Calcola km' )+'</button>'+
        '<button class="btn bg bs" onclick="event.stopPropagation();oaEditLuogo(\''+l.id+'\')">✏ Modifica</button>'+
        '<button class="btn bd bs" onclick="event.stopPropagation();oaDelLuogo(\''+l.id+'\')">✕</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
window.oaRenderLuoghi=oaRenderLuoghi;

function oaOpenNewLuogo(){
  ['oaLId','oaLNome','oaLComune','oaLIndirizzo','oaLMaps','oaLCapienza',
   'oaLLuci','oaLVetrine','oaStrade','oaLAccesso','oaLElettricoNote','oaLNote'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  var el=document.querySelector('input[name="oaLElettrico"]');if(el)el.value='nd';
  document.querySelectorAll('input[name="oaLElettrico"]').forEach(function(r){r.checked=r.value==='nd';});
  document.getElementById('ovOALuogoT').textContent='Nuovo Luogo OA';
  document.getElementById('ovOALuogo').classList.add('on');
}
window.oaOpenNewLuogo=oaOpenNewLuogo;

function oaEditLuogo(id){
  var l=S.oaLuoghi.find(function(x){return x.id===id;});if(!l)return;
  document.getElementById('oaLId').value=id;
  document.getElementById('oaLNome').value=l.nome||'';
  document.getElementById('oaLComune').value=l.comune||'';
  document.getElementById('oaLIndirizzo').value=l.indirizzo||'';
  document.getElementById('oaLMaps').value=l.mapsUrl||'';
  document.getElementById('oaLCapienza').value=l.capienza||'';
  document.getElementById('oaLLuci').value=l.luci||'';
  document.getElementById('oaLVetrine').value=l.vetrine||'';
  document.getElementById('oaStrade').value=l.strade||'';
  document.getElementById('oaLAccesso').value=l.accesso||'';
  document.getElementById('oaLElettricoNote').value=l.elettricoNote||'';
  document.getElementById('oaLNote').value=l.note||'';
  document.querySelectorAll('input[name="oaLElettrico"]').forEach(function(r){r.checked=r.value===(l.elettrico||'nd');});
  document.getElementById('ovOALuogoT').textContent='Modifica Luogo OA';
  document.getElementById('ovOALuogo').classList.add('on');
}
window.oaEditLuogo=oaEditLuogo;

async function oaSvLuogo(){
  var nome=document.getElementById('oaLNome').value.trim();
  if(!nome){toast('Inserisci il nome del luogo','err');return;}
  var id=document.getElementById('oaLId').value||uid();
  var elettrico=document.querySelector('input[name="oaLElettrico"]:checked')?.value||'nd';
  var data={
    id,nome,
    comune:document.getElementById('oaLComune').value.trim(),
    indirizzo:document.getElementById('oaLIndirizzo').value.trim(),
    mapsUrl:document.getElementById('oaLMaps').value.trim(),
    capienza:parseInt(document.getElementById('oaLCapienza').value)||0,
    elettrico,
    elettricoNote:document.getElementById('oaLElettricoNote').value.trim(),
    luci:document.getElementById('oaLLuci').value.trim(),
    vetrine:document.getElementById('oaLVetrine').value.trim(),
    strade:document.getElementById('oaStrade').value.trim(),
    accesso:document.getElementById('oaLAccesso').value.trim(),
    note:document.getElementById('oaLNote').value.trim(),
    updatedAt:new Date().toISOString()
  };
  await setDoc(doc(db,'oaLuoghi',id),data);
  co('ovOALuogo');
  toast('Luogo salvato','ok');
  // Aggiorna dropdown nel modal prenotazione se aperto
  if(document.getElementById('ovBook')?.classList.contains('on')){
    fillOALuogoDropdown();
    // Seleziona automaticamente il luogo appena inserito
    var selL=document.getElementById('bOALuogoId');
    if(selL){selL.value=id;oaFillLuogoFromSel();}
  }
}
window.oaSvLuogo=oaSvLuogo;

async function oaDelLuogo(id){
  if(!confirm('Eliminare questo luogo?'))return;
  await deleteDoc(doc(db,'oaLuoghi',id));
  toast('Eliminato','ok');
}
window.oaDelLuogo=oaDelLuogo;

// ─── ADDETTI ──────────────────────────────────────────────
function oaRenderAddetti(){
  var w=document.getElementById('oa-addetti-list');
  if(!w)return;
  if(!S.oaAddetti.length){
    w.innerHTML='<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessun addetto. Clicca + per aggiungerne uno.</div>';
    return;
  }
  w.innerHTML=S.oaAddetti.map(function(a){
    return '<div class="oa-card">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:'+(a.color||'#0d5c8a')+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0">'+
          (a.nome||'?').charAt(0).toUpperCase()+
        '</div>'+
        '<div>'+
          '<div class="oa-card-title" style="margin:0">'+a.nome+'</div>'+
          '<div style="font-size:11px;color:var(--txt2)">'+(a.ruolo||'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="oa-card-meta" style="margin-top:8px">'+
        (a.tel?'<span>📞 '+a.tel+'</span>':'')+
        (a.email?'<span>✉ '+a.email+'</span>':'')+
        (a.note?'<span>📝 '+a.note+'</span>':'')+
      '</div>'+
      '<div class="oa-card-actions">'+
        '<button class="btn bg bs" onclick="oaEditAddetto(\''+a.id+'\')">✏ Modifica</button>'+
        '<button class="btn bd bs" onclick="oaDelAddetto(\''+a.id+'\')">✕</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
window.oaRenderAddetti=oaRenderAddetti;

function oaOpenNewAddetto(){
  ['oaAId','oaANome','oaARuolo','oaATel','oaAEmail','oaANote'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('oaAColor').value='#0d5c8a';
  document.getElementById('ovOAAddettoT').textContent='Nuovo Addetto OA';
  document.getElementById('ovOAAddetto').classList.add('on');
}
window.oaOpenNewAddetto=oaOpenNewAddetto;

function oaEditAddetto(id){
  var a=S.oaAddetti.find(function(x){return x.id===id;});if(!a)return;
  document.getElementById('oaAId').value=id;
  document.getElementById('oaANome').value=a.nome||'';
  document.getElementById('oaARuolo').value=a.ruolo||'';
  document.getElementById('oaATel').value=a.tel||'';
  document.getElementById('oaAEmail').value=a.email||'';
  document.getElementById('oaANote').value=a.note||'';
  document.getElementById('oaAColor').value=a.color||'#0d5c8a';
  document.getElementById('ovOAAddettoT').textContent='Modifica Addetto OA';
  document.getElementById('ovOAAddetto').classList.add('on');
}
window.oaEditAddetto=oaEditAddetto;

async function oaSvAddetto(){
  var nome=document.getElementById('oaANome').value.trim();
  if(!nome){toast('Inserisci il nome','err');return;}
  var id=document.getElementById('oaAId').value||uid();
  var data={
    id,nome,
    ruolo:document.getElementById('oaARuolo').value.trim(),
    tel:document.getElementById('oaATel').value.trim(),
    email:document.getElementById('oaAEmail').value.trim(),
    note:document.getElementById('oaANote').value.trim(),
    color:document.getElementById('oaAColor').value||'#0d5c8a',
    updatedAt:new Date().toISOString()
  };
  await setDoc(doc(db,'oaAddetti',id),data);
  co('ovOAAddetto');
  toast('Addetto salvato','ok');
}
window.oaSvAddetto=oaSvAddetto;

async function oaDelAddetto(id){
  if(!confirm('Eliminare questo addetto?'))return;
  await deleteDoc(doc(db,'oaAddetti',id));
  toast('Eliminato','ok');
}
window.oaDelAddetto=oaDelAddetto;



// ── Stampa Turni con selezione periodo ───────────────────────────────────
function openStaffPrint(){
  // Default: settimana corrente
  var days=wdays();
  document.getElementById('sprintFrom').value=toLocalDate(days[0]);
  document.getElementById('sprintTo').value=toLocalDate(days[6]);
  var sel=document.getElementById('sprintStaff');
  sel.innerHTML='<option value="all">Tutti i dipendenti</option>';
  S.staff.forEach(function(s){
    var o=document.createElement('option');o.value=s.id;o.textContent=s.name;sel.appendChild(o);
  });
  document.getElementById('ovStaffPrint').classList.add('on');
}
window.openStaffPrint=openStaffPrint;

function setStaffPrintPeriod(preset){
  var today=new Date();today.setHours(0,0,0,0);
  var from,to;
  if(preset==='week'){
    // Settimana corrente (gio-mer)
    var days=wdays();
    from=days[0];to=days[6];
  } else if(preset==='month'){
    // Mese corrente
    from=new Date(today.getFullYear(),today.getMonth(),1);
    to=new Date(today.getFullYear(),today.getMonth()+1,0);
  } else if(preset==='next2'){
    // Prossime 2 settimane da oggi
    from=new Date(today);
    to=new Date(today);to.setDate(today.getDate()+13);
  } else if(preset==='next4'){
    // Prossime 4 settimane da oggi
    from=new Date(today);
    to=new Date(today);to.setDate(today.getDate()+27);
  }
  document.getElementById('sprintFrom').value=toLocalDate(from);
  document.getElementById('sprintTo').value=toLocalDate(to);
}
window.setStaffPrintPeriod=setStaffPrintPeriod;

function genStaffPrint(){
  var fromStr=document.getElementById('sprintFrom').value;
  var toStr=document.getElementById('sprintTo').value;
  var staffFilter=document.getElementById('sprintStaff').value;
  var fmt=document.querySelector('input[name="sprintFmt"]:checked')?.value||'weekly';
  if(!fromStr||!toStr){toast('Seleziona le date','err');return;}
  var from=new Date(fromStr+'T00:00:00');
  var to=new Date(toStr+'T00:00:00');
  if(from>to){toast('La data fine deve essere dopo la data inizio','err');return;}
  var staffList=staffFilter==='all'?S.staff:S.staff.filter(function(s){return s.id===staffFilter;});
  var CN=window.CINEMA_CONFIG.nome;
  var fromLabel=from.toLocaleDateString('it-IT');
  var toLabel=to.toLocaleDateString('it-IT');
  var html='';
  if(fmt==='weekly'){
    // Tabella settimanale — una tabella per ogni settimana nel periodo
    var css='@page{size:A4 landscape;margin:10mm;}body{font-family:Arial,sans-serif;font-size:9px;}'
      +'table{width:100%;border-collapse:collapse;margin-bottom:12px;page-break-inside:avoid;}'
      +'th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top;}'
      +'th{background:#f0f0f0;font-weight:700;font-size:9px;}'
      +'.week-title{font-size:11px;font-weight:700;margin:10px 0 4px;color:#333;border-left:3px solid #f0801a;padding-left:6px;}'
      +'.hdr{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;margin-bottom:8px;padding-bottom:4px;}'
      +'.chip{border-radius:3px;padding:1px 5px;color:#fff;font-size:8px;display:inline-block;margin:1px;white-space:nowrap;}'
      +'.tot{font-weight:700;font-size:9px;}';
    html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>';
    html+='<div class="hdr"><strong style="font-size:13px">Turni Personale — '+fromLabel+' / '+toLabel+'</strong><span>'+CN+'</span><span>'+new Date().toLocaleDateString('it-IT')+'</span></div>';
    // Genera settimane
    var weekStart=new Date(from);
    // Allinea al giovedì precedente
    var dow=weekStart.getDay();
    var backDays=dow>=4?dow-4:dow+3;
    weekStart.setDate(weekStart.getDate()-backDays);
    while(weekStart<=to){
      var weekDays=[];
      for(var d=0;d<7;d++){var dd=new Date(weekStart);dd.setDate(weekStart.getDate()+d);weekDays.push(dd);}
      var weekEnd=weekDays[6];
      var weekDates=weekDays.map(function(d){return toLocalDate(d);});
      html+='<div class="week-title">'+fd(weekDays[0])+' — '+fd(weekEnd)+'</div>';
      html+='<table><tr><th style="min-width:90px">Dipendente</th>';
      weekDays.forEach(function(d,di){
        var DSH2=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
        html+='<th>'+DSH2[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</th>';
      });
      html+='<th style="min-width:50px">Ore</th></tr>';
      staffList.forEach(function(s){
        var totalMins=0;
        html+='<tr><td><strong style="color:'+s.color+'">'+s.name+'</strong></td>';
        weekDates.forEach(function(ds){
          var shifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&sh.day===ds;});
          html+='<td>';
          shifts.forEach(function(sh){
            var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
            var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
            totalMins+=(em>sm?em-sm:0);
            html+='<div class="chip" style="background:'+s.color+'">'+sh.start+'-'+sh.end+'</div>';
            if(sh.note)html+='<div style="font-size:7px;color:#888">'+sh.note+'</div>';
          });
          html+='</td>';
        });
        var hh=Math.floor(totalMins/60);var mm=totalMins%60;
        html+='<td class="tot" style="color:'+s.color+'">'+(totalMins?hh+'h'+String(mm).padStart(2,'0'):'-')+'</td></tr>';
      });
      html+='</table>';
      weekStart.setDate(weekStart.getDate()+7);
    }
    html+='</body></html>';
  } else {
    // Lista per dipendente — riusa genStaffReport
    co('ovStaffPrint');
    document.getElementById('repFrom').value=fromStr;
    document.getElementById('repTo').value=toStr;
    document.getElementById('repStaff').value=staffFilter;
    genStaffReport();
    return;
  }
  co('ovStaffPrint');
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=u;
  var label=fromStr.replace(/-/g,'')+'_'+toStr.replace(/-/g,'');
  a.download='turni-periodo-'+label+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(u);},10000);
  toast('File scaricato — apri e usa Cmd+P / Ctrl+P per stampare','ok');
}
window.genStaffPrint=genStaffPrint;

// ── Email turni ──
async function emailStaff(){
  var days=wdays();var wd=wdates();
  var subj=encodeURIComponent('I tuoi turni — '+fd(days[0])+' / '+fd(days[6]));
  var withEmail=S.staff.filter(function(s){return s.email;});
  if(!withEmail.length){toast('Nessun dipendente con email','err');return;}
  var sent=0;
  for(var i=0;i<withEmail.length;i++){
    var s=withEmail[i];
    var shifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&wd.includes(sh.day);});
    if(!shifts.length)continue;
    var body='Ciao '+s.name+',\n\ni tuoi turni per la settimana '+fd(days[0])+' - '+fd(days[6])+':\n\n';
    shifts.sort(function(a,b){return a.day.localeCompare(b.day);}).forEach(function(sh){
      var di=wd.indexOf(sh.day);
      body+=(DIT[di]||sh.day)+' '+fs(days[di])+': '+sh.start+' - '+sh.end+'\n';
      if(sh.note)body+='  Nota: '+sh.note+'\n';
    });
    body+='\nCinema Multisala Teatro Mendrisio';
    window.open('mailto:'+s.email+'?subject='+subj+'&body='+encodeURIComponent(body),'_blank');
    sent++;
    await new Promise(function(r){setTimeout(r,600);});
  }
  toast(sent?sent+' email preparate':'Nessun turno da inviare','ok');
}
window.emailStaff=emailStaff;
window.renderStaffGrid=renderStaffGrid;
window.renderStaffPeople=renderStaffPeople;
window.renderStaffHours=renderStaffHours;

// ── STAFF: render all 7 days stacked ─────────────────────
function buildDayGrid(ds, di, dayShows, dayShifts, isActive){
  var NAME_COL=130, CELL_W=28, ROW_H=52, PROG_ROW=28, HEADER_H=28;
  var days=wdays(); var d=days[di];
  var dayLabel=DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');

  // Coverage warnings: find PROG slots not covered by any staff
  var uncoveredSlots=[];
  for(var si=0;si<SLOT_COUNT;si++){
    var slotMin=SLOT_START+si*SLOT_STEP;
    var isCovered=dayShows.some(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return slotMin>=sm&&slotMin<em;
    });
    if(!isCovered)continue;
    var staffCovered=dayShifts.some(function(sh){
      return timeToSlot(sh.start)<=si&&timeToSlot(sh.end)>si;
    });
    if(!staffCovered)uncoveredSlots.push(si);
  }
  // Group consecutive uncovered into ranges
  var warnings=[];
  if(uncoveredSlots.length){
    var wStart=uncoveredSlots[0];var wPrev=uncoveredSlots[0];
    for(var wi=1;wi<=uncoveredSlots.length;wi++){
      if(wi===uncoveredSlots.length||uncoveredSlots[wi]>wPrev+1){
        warnings.push(slotToTime(wStart)+' - '+slotToTime(wPrev+1));
        if(wi<uncoveredSlots.length){wStart=uncoveredSlots[wi];wPrev=uncoveredSlots[wi];}
      } else {wPrev=uncoveredSlots[wi];}
    }
  }

  var html='<div style="margin-bottom:16px;border:1px solid var(--bdr);border-radius:8px;overflow:hidden">';
  // Day header
  html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--surf2);border-bottom:2px solid var(--bdr)">'
    +'<div style="font-size:14px;font-weight:700;color:var(--txt)">'+dayLabel+'</div>';
  if(warnings.length){
    html+='<div style="display:flex;gap:4px;flex-wrap:wrap">';
    warnings.forEach(function(w){
      html+='<span style="background:rgba(232,74,74,.15);color:#e84a4a;border:1px solid rgba(232,74,74,.3);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700">⚠ '+w+' scoperto</span>';
    });
    html+='</div>';
  } else if(dayShows.length){
    html+='<span style="color:#4ae87a;font-size:11px">✓ Copertura completa</span>';
  }
  html+='</div>';

  if(!S.staff.length){
    html+='<div style="padding:12px;font-size:12px;color:var(--txt2)">Aggiungi dipendenti</div></div>';
    return html;
  }

  html+='<div style="overflow-x:auto"><div style="min-width:max-content">';

  // Time header
  html+='<div style="display:flex">';
  html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+HEADER_H+'px;background:var(--surf2);border-right:2px solid var(--bdr)"></div>';
  for(var si2=0;si2<SLOT_COUNT;si2++){
    var slotMin2=SLOT_START+si2*SLOT_STEP;
    var isHour2=slotMin2%60===0;var isHalf2=slotMin2%60===30;
    var lbl2=isHour2?String(Math.floor(slotMin2/60)).padStart(2,'0')+':00':(isHalf2?':30':'');
    html+='<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+HEADER_H+'px;border-right:1px solid '+(isHour2?'var(--bdr)':'rgba(255,255,255,.04)')+';border-bottom:1px solid var(--bdr);display:flex;align-items:flex-end;padding-bottom:2px;overflow:visible">'
      +(lbl2?'<span style="font-size:'+(isHour2?'10':'8')+'px;font-weight:'+(isHour2?'700':'400')+';color:'+(isHour2?'var(--txt)':'var(--txt2)')+';white-space:nowrap;position:relative;left:-1px">'+lbl2+'</span>':'')
      +'</div>';
  }
  html+='</div>';

  // PROG row
  html+='<div style="display:flex">';
  html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+PROG_ROW+'px;background:#0a2a0a;border-right:2px solid rgba(74,232,122,.3);display:flex;align-items:center;padding:0 8px"><span style="font-size:10px;font-weight:700;color:#4ae87a">PROG</span></div>';
  for(var si3=0;si3<SLOT_COUNT;si3++){
    var slotMin3=SLOT_START+si3*SLOT_STEP;
    var isHour3=slotMin3%60===0;
    var covered3=dayShows.some(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return slotMin3>=sm&&slotMin3<em;
    });
    var isStart3=dayShows.some(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      return slotMin3===sm;
    });
    // Check if uncovered
    var isUncov=uncoveredSlots.indexOf(si3)>=0;
    html+='<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+PROG_ROW+'px;background:'+(isUncov?'rgba(232,74,74,.25)':covered3?'rgba(74,232,122,.15)':'transparent')+';border-right:1px solid '+(isHour3?'rgba(74,232,122,.2)':'rgba(74,232,122,.05)')+';border-left:'+(isStart3?'2px solid rgba(74,232,122,.7)':'none')+'"></div>';
  }
  html+='</div>';

  // Staff rows
  S.staff.forEach(function(s){
    var sShifts=dayShifts.filter(function(sh){return sh.staffId===s.id;});
    var totalMins=sShifts.reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;
    html+='<div style="display:flex;border-top:1px solid var(--bdr)" data-day="'+ds+'" data-staff="'+s.id+'">';
    html+='<div style="width:'+NAME_COL+'px;flex-shrink:0;min-width:'+NAME_COL+'px;height:'+ROW_H+'px;background:var(--surf2);border-right:2px solid '+s.color+';padding:4px 8px;display:flex;flex-direction:column;justify-content:center;position:sticky;left:0;z-index:5">'
      +'<div style="font-size:12px;font-weight:700;color:'+s.color+'">'+s.name+'</div>'
      +'<div style="font-size:9px;color:var(--txt2)">'+(STAFF_ROLES[s.role]||s.role)+'</div>'
      +(totalMins?'<div style="font-size:9px;color:var(--acc)">'+hh+'h'+String(mm).padStart(2,'0')+'</div>':'')
      +'</div>';
    for(var si4=0;si4<SLOT_COUNT;si4++){
      var slotMin4=SLOT_START+si4*SLOT_STEP;
      var isHour4=slotMin4%60===0;
      var cellShift=sShifts.find(function(sh){return timeToSlot(sh.start)<=si4&&timeToSlot(sh.end)>si4;});
      var isShiftStart=cellShift&&timeToSlot(cellShift.start)===si4;
      var cellBg=cellShift?(s.color+'30'):'transparent';
      html+='<div data-si="'+si4+'" data-sid="'+s.id+'" data-shid="'+(cellShift?cellShift.id:'')+'" data-ds="'+ds+'" style="width:'+CELL_W+'px;flex-shrink:0;height:'+ROW_H+'px;background:'+cellBg+';border-right:1px solid '+(isHour4?'rgba(255,255,255,.08)':'rgba(255,255,255,.03)')+';border-left:'+(isShiftStart?'2px solid '+s.color:'none')+';position:relative;box-sizing:border-box">';
      if(isShiftStart){
        html+='<div style="position:absolute;top:4px;left:4px;right:2px;font-size:9px;font-weight:700;color:'+s.color+';overflow:hidden;white-space:nowrap">'+(STAFF_ROLES[cellShift.role]||cellShift.role)+'</div>'
          +'<div style="position:absolute;bottom:4px;left:4px;font-size:8px;color:'+s.color+';opacity:.8">'+cellShift.start+'-'+cellShift.end+'</div>';
      }
      html+='</div>';
    }
    html+='</div>';
  });

  html+='</div></div></div>';
  return html;
}

function renderAllDays(){
  var container=document.getElementById('staff-all-days');
  if(!container)return;
  var days=wdays();var wd=wdates();
  var html='';
  days.forEach(function(d,di){
    var ds=wd[di];
    var dayShows=S.shows.filter(function(sh){return sh.day===ds;}).sort(function(a,b){return a.start.localeCompare(b.start);});
    var dayShifts=S.shifts.filter(function(sh){return sh.day===ds;});
    html+=buildDayGrid(ds,di,dayShows,dayShifts,true);
  });
  container.innerHTML=html||'<div class="empty"><div class="et">Nessuno spettacolo questa settimana</div></div>';

  // Attach pointer events to each day grid
  container.querySelectorAll('[data-si]').forEach(function(el){
    el.style.cursor='pointer';
  });

  // One delegated pointerdown on container
  container.onpointerdown=null;
  container.addEventListener('pointerdown',function(ev){
    // Find which day section was clicked
    var dayEl=ev.target.closest?ev.target.closest('[data-ds]'):null;
    if(!dayEl)return;
    var ds2=dayEl.dataset.ds;
    var si=parseInt(dayEl.dataset.si);
    var sid=dayEl.dataset.sid;
    var shid=dayEl.dataset.shid;
    if(isNaN(si)||!sid)return;
    if(shid){editShiftById(shid);return;}
    // Start selection for this day
    _shiftStart={slotIdx:si,staffId:sid,day:ds2};
    _hoverSlot=null;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='Inizio: '+slotToTime(si)+' — trascina o clicca sulla fine';
    dayEl.style.background='rgba(232,200,74,.4)';
  });

  container.addEventListener('pointermove',function(ev){
    if(!_shiftStart)return;
    var dayEl=ev.target.closest?ev.target.closest('[data-ds]'):null;
    if(!dayEl||dayEl.dataset.ds!==_shiftStart.day||dayEl.dataset.sid!==_shiftStart.staffId)return;
    var si=parseInt(dayEl.dataset.si);
    if(si<=_shiftStart.slotIdx||si===_hoverSlot)return;
    _hoverSlot=si;
    var mins=(si-_shiftStart.slotIdx+1)*SLOT_STEP;
    var hh=Math.floor(mins/60);var mm=mins%60;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='Inizio: '+slotToTime(_shiftStart.slotIdx)+' \u2192 Fine: '+slotToTime(si+1)+' ('+hh+'h'+String(mm).padStart(2,'0')+')';
    container.querySelectorAll('[data-sid="'+_shiftStart.staffId+'"][data-ds="'+_shiftStart.day+'"]').forEach(function(c2){
      var csi=parseInt(c2.dataset.si);
      if(!c2.dataset.shid){
        c2.style.background=csi>=_shiftStart.slotIdx&&csi<=si?'rgba(232,200,74,.28)':'transparent';
      }
    });
    ev.preventDefault();
  },{passive:false});

  container.addEventListener('pointerup',function(ev){
    if(!_shiftStart||_hoverSlot===null)return;
    var dayEl=ev.target.closest?ev.target.closest('[data-ds]'):null;
    if(!dayEl||dayEl.dataset.sid!==_shiftStart.staffId)return;
    var si=parseInt(dayEl.dataset.si);
    if(si<=_shiftStart.slotIdx)return;
    var startT=slotToTime(_shiftStart.slotIdx);
    var endT=slotToTime(si+1);
    // Pre-fill day in modal
    _pendingDay=_shiftStart.day;
    openShiftConfirmDay(_shiftStart.staffId,startT,endT,_shiftStart.day);
    _shiftStart=null;_hoverSlot=null;
    var h=document.getElementById('staff-hint');
    if(h)h.textContent='';
  });

  container.style.touchAction='pan-x';
}
window.renderAllDays=renderAllDays;

var _pendingDay=null;
function openShiftConfirmDay(staffId,startT,endT,ds){
  var el=function(i){return document.getElementById(i);};
  el('ovShiftT').textContent='Nuovo turno — '+slotToTime(timeToSlot(startT))+' \u2192 '+endT;
  el('shId').value='';
  el('shDelBtn').style.display='none';
  el('shStaff').innerHTML='';
  S.staff.forEach(function(s){
    var o=document.createElement('option');o.value=s.id;o.textContent=s.name;
    if(s.id===staffId)o.selected=true;el('shStaff').appendChild(o);
  });
  var days=wdays();var wd=wdates();
  el('shDay').innerHTML='';
  days.forEach(function(day,di){
    var o=document.createElement('option');o.value=wd[di];o.textContent=DIT[di]+' '+fs(day);
    if(wd[di]===ds)o.selected=true;el('shDay').appendChild(o);
  });
  el('shStart').value=startT;el('shEnd').value=endT;
  var s=S.staff.find(function(x){return x.id===staffId;});
  el('shRole').value=(s&&s.role)||'cassiere';
  el('shNote').value='';
  el('ovShift').classList.add('on');
}
window.openShiftConfirmDay=openShiftConfirmDay;

// ── STAFF: compact weekly overview ────────────────────────
function renderWeekCompact(){
  var container=document.getElementById('staff-week-grid');
  if(!container)return;
  var days=wdays();var wd=wdates();
  if(!S.staff.length){
    container.innerHTML='<div class="empty"><div class="et">Aggiungi dipendenti</div></div>';
    return;
  }

  var COL_W=110;var NAME_COL=130;
  var html='<div style="overflow-x:auto"><table style="border-collapse:collapse;min-width:'+(NAME_COL+COL_W*7)+'px;width:100%">';
  // Header
  html+='<thead><tr><th style="width:'+NAME_COL+'px;background:var(--surf2);border:1px solid var(--bdr);padding:8px 10px;font-size:11px;text-align:left;position:sticky;left:0;z-index:10">Collaboratore</th>';
  days.forEach(function(d,di){
    var ds=wd[di];
    // Check if day has uncovered prog slots
    var dayShows=S.shows.filter(function(sh){return sh.day===ds;});
    var dayShifts=S.shifts.filter(function(sh){return sh.day===ds;});
    var hasWarning=dayShows.some(function(sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      for(var si=Math.floor((sm-SLOT_START)/SLOT_STEP);si<Math.floor((em-SLOT_START)/SLOT_STEP);si++){
        var covered=dayShifts.some(function(sh2){return timeToSlot(sh2.start)<=si&&timeToSlot(sh2.end)>si;});
        if(!covered)return true;
      }
      return false;
    });
    html+='<th style="width:'+COL_W+'px;background:var(--surf2);border:1px solid var(--bdr);padding:6px 8px;font-size:11px;text-align:center">'
      +DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')
      +(hasWarning?'<br><span style="color:#e84a4a;font-size:9px">⚠ scoperto</span>':'<br><span style="color:#4ae87a;font-size:9px">✓</span>')
      +'</th>';
  });
  html+='</tr></thead><tbody>';

  // Staff rows
  S.staff.forEach(function(s){
    // Pre-calculate weekly total
    var weekMins=wd.reduce(function(acc,ds2){
      return acc+S.shifts.filter(function(sh){return sh.staffId===s.id&&sh.day===ds2;}).reduce(function(a2,sh){
        var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
        var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
        return a2+(em>sm?em-sm:0);
      },0);
    },0);
    var whh=Math.floor(weekMins/60);var wmm=weekMins%60;
    html+='<tr>';
    html+='<td style="background:var(--surf2);border:1px solid var(--bdr);padding:8px 10px;position:sticky;left:0;z-index:5;border-left:3px solid '+s.color+'">'
      +'<div style="font-size:12px;font-weight:700;color:'+s.color+'">'+s.name+'</div>'
      +'<div style="font-size:9px;color:var(--txt2)">'+(STAFF_ROLES[s.role]||s.role)+'</div>'
      +(weekMins?'<div style="font-size:10px;font-weight:700;color:var(--acc);margin-top:3px;background:rgba(232,200,74,.1);border-radius:3px;padding:1px 5px;display:inline-block">'+whh+'h'+String(wmm).padStart(2,'0')+'</div>':'')
      +'</td>';
    wd.forEach(function(ds2,di2){
      var shifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&sh.day===ds2;});
      var dayMins=shifts.reduce(function(acc,sh){
        var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
        var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
        return acc+(em>sm?em-sm:0);
      },0);
      var hh=Math.floor(dayMins/60);var mm=dayMins%60;
      html+='<td style="border:1px solid var(--bdr);padding:5px 7px;text-align:center;vertical-align:middle;background:'+(dayMins?s.color+'15':'transparent')+'">';
      if(shifts.length){
        shifts.forEach(function(sh){
          html+='<div style="font-size:10px;font-weight:700;color:'+s.color+';white-space:nowrap">'+sh.start+'-'+sh.end+'</div>';
          html+='<div style="font-size:9px;color:var(--txt2)">'+(STAFF_ROLES[sh.role]||sh.role)+'</div>';
        });
        html+='<div style="font-size:9px;color:var(--acc);font-weight:600">'+hh+'h'+String(mm).padStart(2,'0')+'</div>';
      } else {
        html+='<span style="color:var(--bdr);font-size:18px">—</span>';
      }
      html+='</td>';
    });
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  container.innerHTML=html;
}
window.renderWeekCompact=renderWeekCompact;

// ── STAFF REPORT ─────────────────────────────────────────
function openStaffReport(){
  var today=new Date();
  var monday=new Date(today);
  monday.setDate(today.getDate()-today.getDay()+1);
  var sunday=new Date(monday);
  sunday.setDate(monday.getDate()+6);
  document.getElementById('repFrom').value=toLocalDate(monday);
  document.getElementById('repTo').value=toLocalDate(sunday);
  var sel=document.getElementById('repStaff');
  sel.innerHTML='<option value="all">Tutti i dipendenti</option>';
  S.staff.forEach(function(s){
    var o=document.createElement('option');o.value=s.id;o.textContent=s.name;sel.appendChild(o);
  });
  document.getElementById('ovStaffReport').classList.add('on');
}
function genStaffReport(){
  var fromStr=document.getElementById('repFrom').value;
  var toStr=document.getElementById('repTo').value;
  var staffFilter=document.getElementById('repStaff').value;
  if(!fromStr||!toStr){toast('Seleziona le date','err');return;}
  var from=new Date(fromStr);var to=new Date(toStr);
  // Build list of days in range
  var rangeDays=[];
  var cur=new Date(from);
  while(cur<=to){rangeDays.push(toLocalDate(cur));cur.setDate(cur.getDate()+1);}
  var staffList=staffFilter==='all'?S.staff:S.staff.filter(function(s){return s.id===staffFilter;});
  var fromLabel=from.toLocaleDateString('it-IT');
  var toLabel=to.toLocaleDateString('it-IT');
  var CN=window.CINEMA_CONFIG.nome;
  var css='@page{size:A4 portrait;margin:15mm;}body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}'
    +'.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px;}'
    +'.hdr-title{font-size:16px;font-weight:700;}.hdr-sub{font-size:11px;color:#555;}'
    +'.card{border:1px solid #ddd;border-radius:6px;margin-bottom:14px;overflow:hidden;break-inside:avoid;}'
    +'.card-head{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;}'
    +'.card-name{font-size:14px;font-weight:700;}.card-role{font-size:11px;color:#777;}'
    +'.card-total{font-size:13px;font-weight:700;padding:4px 12px;border-radius:4px;}'
    +'.card-body{padding:0 14px 10px;}'
    +'.shift-row{display:flex;gap:10px;padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:11px;}'
    +'.shift-row:last-child{border-bottom:none;}'
    +'.shift-date{min-width:80px;font-weight:600;color:#333;}'
    +'.shift-time{min-width:110px;font-family:monospace;}'
    +'.shift-role{color:#777;}.shift-dur{margin-left:auto;font-weight:700;}';

  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>';
  html+='<div class="hdr"><div><div class="hdr-title">Report Turni — '+fromLabel+' / '+toLabel+'</div><div class="hdr-sub">'+CN+'</div></div><div class="hdr-sub">'+new Date().toLocaleDateString('it-IT')+'</div></div>';

  staffList.forEach(function(s){
    var shifts=S.shifts.filter(function(sh){return sh.staffId===s.id&&rangeDays.includes(sh.day);});
    shifts.sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
    var totalMins=shifts.reduce(function(acc,sh){
      var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
      var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
      return acc+(em>sm?em-sm:0);
    },0);
    var hh=Math.floor(totalMins/60);var mm=totalMins%60;
    html+='<div class="card">';
    html+='<div class="card-head" style="border-left:4px solid '+s.color+';background:'+s.color+'11">'
      +'<div><div class="card-name" style="color:'+s.color+'">'+s.name+'</div>'
      +'<div class="card-role">'+(STAFF_ROLES[s.role]||s.role)+'</div></div>'
      +'<div class="card-total" style="background:'+s.color+'22;color:'+s.color+'">'+(totalMins?hh+'h'+String(mm).padStart(2,'0'):'nessun turno')+'</div>'
      +'</div>';
    if(shifts.length){
      html+='<div class="card-body">';
      shifts.forEach(function(sh){
        var shDate=new Date(sh.day+'T12:00:00');
        var dateLabel=shDate.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
        var sm=parseInt(sh.start.split(':')[0])*60+parseInt(sh.start.split(':')[1]);
        var em=parseInt(sh.end.split(':')[0])*60+parseInt(sh.end.split(':')[1]);
        var durMins=em>sm?em-sm:0;
        var dhh=Math.floor(durMins/60);var dmm=durMins%60;
        html+='<div class="shift-row">'
          +'<span class="shift-date">'+dateLabel+'</span>'
          +'<span class="shift-time">'+sh.start+' - '+sh.end+'</span>'
          +'<span class="shift-role">'+(STAFF_ROLES[sh.role]||sh.role)+'</span>'
          +(sh.note?'<span style="color:#aaa;font-size:10px">'+sh.note+'</span>':'')
          +'<span class="shift-dur" style="color:'+s.color+'">'+dhh+'h'+String(dmm).padStart(2,'0')+'</span>'
          +'</div>';
      });
      html+='</div>';
    } else {
      html+='<div style="padding:8px 14px;font-size:11px;color:#aaa">Nessun turno nel periodo selezionato</div>';
    }
    html+='</div>';
  });

  html+='</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=u;
  a.download='report-turni-'+fromStr+'-'+toStr+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(u);},10000);
  toast('Report in download — apri il file e usa Cmd+P per stampare','ok');
  document.getElementById('ovStaffReport').classList.remove('on');
}
window.openStaffReport=openStaffReport;window.genStaffReport=genStaffReport;

// ── IMPORT DA API BIGLIETTERIA ────────────────────────────
var _importedFilms=[];
var IMP_API='https://mendrisiocinema.ch/api/v2/films/expanded.json';
var TMDB_API_KEY=window.CINEMA_CONFIG.tmdbApiKey; // da CINEMA_CONFIG
var TMDB_IMG='https://image.tmdb.org/t/p/';
var IMP_CACHE_KEY='cm_imp_cache';
var IMP_COUNT_KEY='cm_imp_count';
var IMP_MAX_DAILY=2;
var IMP_CACHE_TTL=12*60*60*1000; // 12 hours ms

function impGetCache(){
  try{var v=localStorage.getItem(IMP_CACHE_KEY);return v?JSON.parse(v):null;}catch(e){return null;}
}
function impSaveCache(data){
  try{localStorage.setItem(IMP_CACHE_KEY,JSON.stringify({ts:Date.now(),data:data}));}catch(e){}
}
function impGetDailyCount(){
  try{
    var v=localStorage.getItem(IMP_COUNT_KEY);
    if(!v)return{count:0,date:''};
    return JSON.parse(v);
  }catch(e){return{count:0,date:''};}
}
function impIncrDailyCount(){
  var today=toLocalDate(new Date());
  var rec=impGetDailyCount();
  if(rec.date!==today)rec={count:0,date:today};
  rec.count++;
  try{localStorage.setItem(IMP_COUNT_KEY,JSON.stringify(rec));}catch(e){}
  return rec.count;
}

function openImport(){
  document.getElementById('imp-step1').style.display='block';
  document.getElementById('imp-step2').style.display='none';
  document.getElementById('imp-status').textContent='';
  // Reset PDF panel too
  var ps1=document.getElementById('pdf-step1');if(ps1)ps1.style.display='block';
  var ps2=document.getElementById('pdf-step2');if(ps2)ps2.style.display='none';
  var pst=document.getElementById('pdf-status');if(pst)pst.textContent='';
  // Default to API tab
  gImpTab('api');

  var today=toLocalDate(new Date());
  var rec=impGetDailyCount();
  var todayCount=rec.date===today?rec.count:0;
  var remaining=IMP_MAX_DAILY-todayCount;

  var cacheInfo=document.getElementById('imp-cache-info');
  var cache=impGetCache();
  var cacheAge=cache?Math.floor((Date.now()-cache.ts)/60000):null;
  var cacheBtn=document.getElementById('imp-cache-btn');
  var fetchBtn=document.getElementById('imp-fetch-btn');

  if(cache&&cacheAge!==null){
    var ageLabel=cacheAge<60?cacheAge+' minuti fa':Math.floor(cacheAge/60)+'h'+String(cacheAge%60).padStart(2,'0')+' fa';
    cacheInfo.innerHTML='📋 Cache disponibile (aggiornata '+ageLabel+', '+cache.data.length+' film)';
    cacheBtn.style.display='inline-flex';
  } else {
    cacheInfo.textContent='Nessuna cache disponibile.';
    cacheBtn.style.display='none';
  }

  if(remaining<=0){
    fetchBtn.disabled=true;
    fetchBtn.textContent='Limite giornaliero raggiunto ('+IMP_MAX_DAILY+'/giorno)';
    document.getElementById('imp-status').textContent='Hai già effettuato '+IMP_MAX_DAILY+' aggiornamenti oggi. Riprova domani o usa la cache.';
  } else {
    fetchBtn.disabled=false;
    fetchBtn.textContent='🔄 Scarica da API ('+remaining+' rimaste oggi)';
  }

  document.getElementById('ovImport').classList.add('on');
}
window.openImport=openImport;

function impBack(){
  document.getElementById('imp-step1').style.display='block';
  document.getElementById('imp-step2').style.display='none';
  openImport();
}
window.impBack=impBack;

async function fetchImport(){
  var btn=document.getElementById('imp-fetch-btn');
  btn.disabled=true;btn.textContent='⏳ Download in corso...';
  document.getElementById('imp-status').textContent='Connessione all\'API biglietteria...';
  try{
    var resp;
    try{resp=await fetch(IMP_API);}
    catch(e){
      // Try CORS proxy as fallback
      resp=await fetch('https://corsproxy.io/?'+encodeURIComponent(IMP_API));
    }
    if(!resp||!resp.ok)throw new Error('HTTP '+(resp?resp.status:'network error'));
    var json=await resp.json();
    var films=json.films||[];
    // Filter out placeholder "Coming soon" entries and films without title
    films=films.filter(function(f){
      return f.title&&f.title.toLowerCase()!=='coming soon'&&f.title.trim()!=='';
    });
    impSaveCache(films);
    impIncrDailyCount();
    _importedFilms=films;
    document.getElementById('imp-status').textContent='';
    showImportStep2(films);
  }catch(err){
    var msg=err.message.includes('NetworkError')||err.message.includes('Failed to fetch')||err.message.includes('CORS')?'Errore di rete — il sito potrebbe bloccare le richieste dal browser. Usa la cache se disponibile, o riprova più tardi.':err.message;
    document.getElementById('imp-status').innerHTML='<span style="color:#e84a4a">❌ '+msg+'</span>';
    btn.disabled=false;btn.textContent='🔄 Riprova';
  }
}
window.fetchImport=fetchImport;

function loadFromCache(){
  var cache=impGetCache();
  if(!cache||!cache.data){toast('Cache non disponibile','err');return;}
  _importedFilms=cache.data;
  showImportStep2(cache.data);
}
window.loadFromCache=loadFromCache;

function showImportStep2(films){
  document.getElementById('imp-step1').style.display='none';
  document.getElementById('imp-step2').style.display='block';
  document.getElementById('imp-search').value='';
  document.getElementById('imp-only-new').checked=true;
  renderImportList(films);
}

function filterImportList(){
  var q=document.getElementById('imp-search').value.toLowerCase();
  var onlyNew=document.getElementById('imp-only-new').checked;
  var existingTitles=S.films.map(function(f){return f.title.toLowerCase().trim();});
  var filtered=_importedFilms.filter(function(f){
    var titleMatch=!q||f.title.toLowerCase().includes(q);
    var isNew=!existingTitles.some(function(t){return t===f.title.toLowerCase().trim();});
    return titleMatch&&(!onlyNew||isNew);
  });
  renderImportList(filtered,true);
}
window.filterImportList=filterImportList;

function renderImportList(films,filtered){
  var existingTitles=S.films.map(function(f){return f.title.toLowerCase().trim();});
  var list=document.getElementById('imp-film-list');
  list.innerHTML='';

  // Sort by start_date
  var sorted=films.slice().sort(function(a,b){return (a.start_date||'').localeCompare(b.start_date||'');});

  sorted.forEach(function(film,idx){
    var realIdx=_importedFilms.indexOf(film);
    var alreadyExists=existingTitles.some(function(t){return t===film.title.toLowerCase().trim();});
    var startD=film.start_date?film.start_date.split('-').reverse().join('/'):'';
    var isPast=film.start_date&&film.start_date<toLocalDate(new Date());

    var row=document.createElement('div');
    var updateMode=document.getElementById('imp-update-existing')?.checked;
    row.style.cssText='display:flex;align-items:flex-start;gap:10px;padding:7px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;'
      +(alreadyExists&&!updateMode?'opacity:.45':'')
      +(alreadyExists&&updateMode?'border-color:rgba(240,128,26,.5);':'');

    var cb=document.createElement('input');
    cb.type='checkbox';cb.dataset.idx=realIdx>=0?realIdx:idx;
    cb.checked=!alreadyExists;cb.style.cssText='margin-top:4px;flex-shrink:0';
    cb.onchange=updateImportCount;

    if(film.playbill_path){
      var img=document.createElement('img');
      img.src=film.playbill_path;
      img.style.cssText='width:32px;height:48px;object-fit:cover;border-radius:3px;flex-shrink:0';
      img.onerror=function(){this.style.display='none';};
      row.appendChild(img);
    }
    row.appendChild(cb);

    var info=document.createElement('label');
    info.style.cssText='cursor:pointer;flex:1;min-width:0';
    info.htmlFor=cb.id;
    info.innerHTML='<div style="font-weight:700;font-size:12px;color:var(--txt)">'+(isPast?'<span style="color:#888;font-size:9px">[passato] </span>':'')+film.title+'</div>'
      +'<div style="font-size:10px;color:var(--txt2);margin-top:1px">'
      +(film.length?film.length+'min ':'')
      +(film.genre||'')
      +(film.director?' · '+film.director:'')
      +(startD?' · Uscita: '+startD:'')
      +(alreadyExists?' <span style="color:#e84a4a;font-size:9px">già in archivio</span>':'')
      +'</div>';
    row.appendChild(info);
    list.appendChild(row);
  });

  if(!sorted.length){
    list.innerHTML='<div style="padding:12px;font-size:12px;color:var(--txt2);text-align:center">Nessun film trovato</div>';
  }
  updateImportCount();
}

function updateImportCount(){
  var cbs=document.querySelectorAll('#imp-film-list input[type=checkbox]');
  var selected=0;
  cbs.forEach(function(cb){if(cb.checked)selected++;});
  document.getElementById('imp-count').textContent=selected+' film selezionati';
  var btn=document.getElementById('imp-import-btn');
  if(btn)btn.disabled=selected===0;
}
window.updateImportCount=updateImportCount;

// ── Auto-aggiorna lista distributori da import ───────────────────────────
async function importAutoAddDistributor(name){
  if(!name||!name.trim())return;
  var n=name.trim();
  if(!S.distributors)S.distributors=[];
  // Controlla se esiste già (case-insensitive)
  var exists=S.distributors.find(function(d){return d.name.toLowerCase()===n.toLowerCase();});
  if(exists)return; // già presente
  // Aggiunge con lista contatti vuota
  S.distributors.push({name:n,contacts:[]});
  try{
    await fbSetDoc(db,'settings','distributors',{list:S.distributors});
    if(document.getElementById('dist-list'))renderDist();
    fillDistDropdown();
    fillFilmDistDropdown();
  }catch(e){console.warn('importAutoAddDistributor error',e);}
}
window.importAutoAddDistributor=importAutoAddDistributor;


async function doImport(){
  var btn=document.getElementById('imp-import-btn');
  btn.disabled=true;btn.textContent='⏳ Importazione...';
  var updateExisting=document.getElementById('imp-update-existing')?.checked!==false;
  var selected=[];
  document.querySelectorAll('#imp-film-list input[type=checkbox]:checked').forEach(function(cb){
    var film=_importedFilms[parseInt(cb.dataset.idx)];
    if(film)selected.push(film);
  });
  var imported=0;var updated=0;
  for(var i=0;i<selected.length;i++){
    var f=selected[i];
    var trailerRaw=f.url_trailer||'';
    var trailerId=trailerRaw.match(/[\w-]{11}/)?trailerRaw.match(/[\w-]{11}/)[0]:'';

    // ── Cerca film esistente per apiId (più affidabile) o per titolo ────────
    var apiId=f.original_id||null;
    var existing=null;
    if(apiId){
      existing=S.films.find(function(x){return x.apiId===apiId||x.apiId===String(apiId);});
    }
    if(!existing){
      var titleNorm=f.title.toLowerCase().trim();
      existing=S.films.find(function(x){return x.title.toLowerCase().trim()===titleNorm;});
    }

    if(existing&&updateExisting){
      // ── AGGIORNAMENTO: mantieni i campi manuali, aggiorna quelli dall'API ─
      var newPoster=(f.playbill_path&&!f.playbill_path.includes('noposter'))?f.playbill_path:'';
      // Distributore: ProCinema (f.distributor) ha precedenza, poi existing
      var newDist=f.distributor?f.distributor.trim():'';
      var finalDist=newDist||existing.distributor||'';
      var patched=Object.assign({},existing,{
        title:f.title||existing.title,
        duration:parseInt(f.length)||existing.duration,
        genre:f.genre||existing.genre,
        director:f.director||existing.director,
        rating:(f.age&&f.age!=='n/p')?f.age:existing.rating,
        release:f.start_date||existing.release,
        poster:newPoster||existing.poster,
        cast:existing.cast||f.cast||'',
        description:existing.description||(f.plot?f.plot.slice(0,300):''),
        distributor:finalDist,
        ticketUrl:f.film_url_for_cinema||f.film_url||existing.ticketUrl||'',
        tmdbId:f.tmdb_id||existing.tmdbId||null,
        apiId:apiId||existing.apiId||null
      });
      // Auto-aggiunge distributore alla lista email se nuovo
      if(finalDist)importAutoAddDistributor(finalDist);
      await fbSetDoc(db,'films',existing.id,patched);
      updated++;
      // Recupero backdrop TMDB se manca ancora
      if(patched.tmdbId&&TMDB_API_KEY&&!patched.backdrop){
        tmdbAutoBackdrop(existing.id,patched.tmdbId).then(function(imgs){
          if(imgs&&imgs.backdrop){
            var p2=Object.assign({},patched,{backdrop:imgs.backdrop});
            if(!patched.poster&&imgs.poster)p2.poster=imgs.poster;
            fbSetDoc(db,'films',existing.id,p2).catch(function(){});
          }
        });
      }
    } else if(!existing){
      // ── NUOVO INSERIMENTO ────────────────────────────────────────────────
      var id=uid();
      var newFilmDist=f.distributor?f.distributor.trim():'';
      var filmDoc={
        id:id,
        title:f.title||'',
        duration:parseInt(f.length)||0,
        genre:f.genre||'',
        director:f.director||'',
        rating:(f.age&&f.age!=='n/p')?f.age:'',
        release:f.start_date||'',
        endDate:'',
        poster:(f.playbill_path&&!f.playbill_path.includes('noposter'))?f.playbill_path:'',
        backdrop:'',
        description:f.plot?f.plot.slice(0,300):'',
        distributor:newFilmDist,
        ticketUrl:f.film_url_for_cinema||f.film_url||'',
        trailer:trailerId,
        cast:f.cast||'',
        language:f.language||'',
        country:f.country_name||'',
        tmdbId:f.tmdb_id||null,
        apiId:apiId
      };
      // Auto-aggiunge distributore alla lista email se nuovo
      if(newFilmDist)importAutoAddDistributor(newFilmDist);
      await fbSetDoc(db,'films',id,filmDoc);
      imported++;
      if(filmDoc.tmdbId&&TMDB_API_KEY&&!filmDoc.backdrop){
        tmdbAutoBackdrop(id,filmDoc.tmdbId).then(function(imgs){
          if(imgs&&imgs.backdrop){
            var p2=Object.assign({},filmDoc,{backdrop:imgs.backdrop});
            if(!filmDoc.poster&&imgs.poster)p2.poster=imgs.poster;
            fbSetDoc(db,'films',id,p2).catch(function(){});
          }
        });
      }
    }
    // se existing && !updateExisting → skip silenzioso
  }
  co('ovImport');
  var msg=[];
  if(imported>0)msg.push(imported+' nuovi');
  if(updated>0)msg.push(updated+' aggiornati');
  toast((msg.join(', ')||'Nessuna modifica')+' film'+(TMDB_API_KEY?' — TMDB in recupero...':''),'ok');
  rf();
}
window.doImport=doImport;


// ── IMPORT TAB SWITCHER ───────────────────────────────────
function gImpTab(t){
  document.getElementById('imp-tab-api').classList.toggle('on',t==='api');
  document.getElementById('imp-tab-pdf').classList.toggle('on',t==='pdf');
  document.getElementById('imp-api-panel').style.display=t==='api'?'block':'none';
  document.getElementById('imp-pdf-panel').style.display=t==='pdf'?'block':'none';
  // When switching to PDF tab ensure step1 is shown
  if(t==='pdf'){
    var ps1=document.getElementById('pdf-step1');if(ps1)ps1.style.display='block';
    var ps2=document.getElementById('pdf-step2');if(ps2)ps2.style.display='none';
  }
}
window.gImpTab=gImpTab;

// ── PDF PROCINEMA IMPORT ──────────────────────────────────
var _pdfFilms=[];

function pdfBack(){
  document.getElementById('pdf-step1').style.display='block';
  document.getElementById('pdf-step2').style.display='none';
}
window.pdfBack=pdfBack;

function loadPDFFile(input){
  var file=input.files&&input.files[0];
  if(!file)return;
  var status=document.getElementById('pdf-status');

  if(!file.name.toLowerCase().endsWith('.pdf')&&!file.name.toLowerCase().endsWith('.txt')){
    status.textContent='⚠ Seleziona un file PDF o TXT';
    return;
  }

  // File TXT — leggi direttamente
  if(file.name.toLowerCase().endsWith('.txt')){
    var rdr=new FileReader();
    rdr.onload=function(e){
      document.getElementById('pdf-paste').value=e.target.result;
      status.textContent='✓ File caricato ('+Math.round(e.target.result.length/1000)+'KB) — clicca Analizza PDF';
    };
    rdr.readAsText(file,'UTF-8');
    return;
  }

  // File PDF — estrai testo con pdf.js
  var pdfjsLib=window['pdfjs-dist/build/pdf']||window.pdfjsLib;
  if(!pdfjsLib){
    status.textContent='⚠ Libreria pdf.js non disponibile — incolla il testo manualmente';
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  status.textContent='⏳ Estrazione testo dal PDF...';
  var reader=new FileReader();
  reader.onload=function(e){
    var typedArray=new Uint8Array(e.target.result);
    pdfjsLib.getDocument({data:typedArray}).promise.then(function(pdf){
      var totalPages=pdf.numPages;
      var pageTexts=[];
      var pagePromises=[];
      for(var p=1;p<=totalPages;p++){
        pagePromises.push(
          pdf.getPage(p).then(function(page){
            return page.getTextContent().then(function(content){
              // Estrai testo mantenendo le newline tra item diversi
              var lines={};
              content.items.forEach(function(item){
                var y=Math.round(item.transform[5]);
                if(!lines[y])lines[y]=[];
                lines[y].push(item.str);
              });
              var sortedY=Object.keys(lines).map(Number).sort(function(a,b){return b-a;});
              return sortedY.map(function(y){return lines[y].join(' ');}).join('\n');
            });
          })
        );
      }
      Promise.all(pagePromises).then(function(texts){
        var fullText=texts.join('\n');
        document.getElementById('pdf-paste').value=fullText;
        status.textContent='✓ PDF estratto ('+totalPages+' pagine, '+Math.round(fullText.length/1000)+'KB) — clicca Analizza PDF';
        input.value='';
      });
    }).catch(function(err){
      status.textContent='❌ Errore lettura PDF: '+err.message+' — incolla il testo manualmente';
      input.value='';
    });
  };
  reader.readAsArrayBuffer(file);
}
window.loadPDFFile=loadPDFFile;
function analyzePDF(){
  // Grab elements safely
  var pasteEl=document.getElementById('pdf-paste');
  var btnEl=document.getElementById('pdf-analyze-btn');
  var statusEl=document.getElementById('pdf-status');
  var step1El=document.getElementById('pdf-step1');
  var step2El=document.getElementById('pdf-step2');

  // Make sure panel is visible (parent might be hidden)
  var panel=document.getElementById('imp-pdf-panel');
  if(panel)panel.style.display='block';

  if(!pasteEl){toast('Errore: campo testo non trovato','err');return;}
  var text=(pasteEl.value||'').split('\r\n').join('\n').split('\r').join('\n').trim();

  if(!text||text.length<50){
    if(statusEl)statusEl.textContent='⚠ Incolla il testo del PDF ProCinema';
    return;
  }

  if(btnEl){btnEl.disabled=true;btnEl.textContent='⏳ Analisi...';}
  if(statusEl)statusEl.textContent='Estrazione in corso...';

  // Run in next tick to allow UI to update
  setTimeout(function(){
    var films=[];
    try{
      films=parseProCinemaPDF(text);
    }catch(parseErr){
      if(statusEl)statusEl.innerHTML='<span style="color:#e84a4a">❌ Errore parser: '+parseErr.message+'</span>';
      if(btnEl){btnEl.disabled=false;btnEl.textContent='🔍 Analizza PDF';}
      return;
    }

    if(!films.length){
      var wks=(text.match(/Week\s+\d+/g)||[]).length;
      var msg=wks===0
        ?'Nessuna sezione "Week" trovata. Copia il testo dal PDF con Cmd+A → Cmd+C.'
        :'Trovate '+wks+' settimane ma nessun film con data italiana. Controlla che il PDF contenga la colonna Italian Part.';
      if(statusEl)statusEl.innerHTML='<span style="color:#e84a4a">❌ '+msg+'</span>';
      if(btnEl){btnEl.disabled=false;btnEl.textContent='🔍 Analizza PDF';}
      return;
    }

    // Deduplicate by suisa
    var seen=new Set();
    films=films.filter(function(f){if(seen.has(f.suisa))return false;seen.add(f.suisa);return true;});
    _pdfFilms=films;

    // Switch to step2
    try{
      if(step1El)step1El.style.display='none';
      if(step2El)step2El.style.display='block';
      var searchEl=document.getElementById('pdf-search');
      if(searchEl)searchEl.value='';
      var onlyNewEl=document.getElementById('pdf-only-new');
      if(onlyNewEl)onlyNewEl.checked=true;
      if(statusEl)statusEl.textContent='';
      renderPDFList(films);
    }catch(uiErr){
      if(statusEl)statusEl.innerHTML='<span style="color:#e84a4a">❌ Errore UI: '+uiErr.message+'</span>';
    }

    if(btnEl){btnEl.disabled=false;btnEl.textContent='🔍 Analizza PDF';}
  },30);
}

function parseProCinemaPDF(text){
  var films=[];
  var lines=text.split('\n');

  var dateRe=/\b(\d{2})\.(\d{2})\.(\d{4})\b/;
  var dateReG=/\b(\d{2})\.(\d{2})\.(\d{4})\b/g;
  var suisaRe=/\b(\d{4}\.\d{3,4})\b/;
  var ageRe=/(?:(\d+)\s*\(-?\d*-?\)|-\s*\(-?-?\))\s*$/;

  // ── Rileva larghezza colonna calibrandosi sulla prima riga con 3 date ─────
  // Nel PDF ProCinema le 3 date sono equidistanti (~11 char tra l'una e l'altra)
  // Troviamo la prima riga film con 3 date per misurare l'offset reale
  var colWidth=-1; // distanza tra colonne DE→FR→IT
  var colDE=-1;    // posizione della colonna DE nel testo

  // Prima passata: trova la prima riga con 3 date e SUISA per calibrare
  var inWeekSec=false;
  for(var pi=0;pi<lines.length;pi++){
    var pl=lines[pi];
    if(/Week\s+\d+,\s+\d{4}/.test(pl)){inWeekSec=true;continue;}
    if(!inWeekSec)continue;
    if(!suisaRe.test(pl))continue;
    var pdates=[];var pdm;dateReG.lastIndex=0;
    while((pdm=dateReG.exec(pl))!==null) pdates.push(pdm.index);
    if(pdates.length>=3){
      colDE=pdates[0];
      colWidth=pdates[1]-pdates[0]; // tipicamente ~11
      break;
    }
  }
  var colFR=colDE>=0?colDE+colWidth:-1;
  var colIT=colDE>=0?colDE+colWidth*2:-1;

  // ── Parser principale ─────────────────────────────────────────────────────
  inWeekSec=false;
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(/Week\s+\d+,\s+\d{4}/.test(line)){inWeekSec=true;continue;}
    if(/Originaltitle|Copyright|Competitive Release|Changes since|new date|changed date/.test(line))continue;
    if(!inWeekSec)continue;
    if(line.trim().length<10)continue;

    var suisaM=line.match(suisaRe);
    if(!suisaM)continue;
    var suisa=suisaM[1];

    // ── Estrai data Italian Part ─────────────────────────────────────────────
    var itDate=null;

    // Raccogli tutte le date con le loro posizioni
    var dates=[];var dm;dateReG.lastIndex=0;
    while((dm=dateReG.exec(line))!==null)
      dates.push({iso:dm[3]+'-'+dm[2]+'-'+dm[1],pos:dm.index});

    // ── Logica Italian Part ─────────────────────────────────────────────────
    // Nel PDF ProCinema l'ordine colonne è sempre: [DE] [FR] [IT]
    // → Italian Part = ULTIMA data trovata nella riga
    // Con 1 data sola: ambiguo (DE, FR o IT) → non importiamo
    // Con 2+ date: l'ultima è IT (o FR+IT → ultima=IT, o DE+IT → ultima=IT)
    // Eccezione: 2 date con gap ≈ colWidth E entrambe nel range di DE+FR
    //   → probabilmente DE+FR senza IT → skip
    //   Ma FR+IT con gap simile → ultima è IT → manteniamo
    // Scelta conservativa: con 2 date, l'ultima è sempre IT
    // (se fosse DE+FR senza IT, l'utente la vede nella lista e non la seleziona)
    var itDate=null;
    if(dates.length>=2){
      itDate=dates[dates.length-1]; // ultima data = IT
    }
    // Con 1 sola data: troppo ambiguo → skip
    if(!itDate||!itDate.iso)continue;

    // Titolo
    var suisaPos=line.indexOf(suisa);
    var title=line.slice(0,suisaPos).replace(/^\s*(NEW\s+)?/,'').replace(/\.\.\.\s*$/,'').trim();
    if(!title||title.length<2)continue;

    // Genere + distributore
    var firstDatePos=dates.length?dates[0].pos:line.length;
    var beforeDates=line.slice(suisaPos+suisa.length,firstDatePos).trim();
    var words=beforeDates.split(/\s{2,}/).filter(function(w){return w.trim();});
    var genre=words[0]||'';
    var distributor=words.slice(1).join(' ').replace(/\.\.\.\s*$/,'').trim();

    // Età
    var ageM=line.match(ageRe);
    var age=ageM&&ageM[1]?ageM[1]:'';

    films.push({title:title,suisa:suisa,genre:genre,distributor:distributor,releaseIT:itDate.iso,age:age});
  }
  return films;
}
window.parseProCinemaPDF=parseProCinemaPDF;
window.analyzePDF=analyzePDF;

function showPDFStep2(films){
  var s1=document.getElementById('pdf-step1');if(s1)s1.style.display='none';
  var s2=document.getElementById('pdf-step2');if(s2)s2.style.display='block';
  var se=document.getElementById('pdf-search');if(se)se.value='';
  var on=document.getElementById('pdf-only-new');if(on)on.checked=true;
  renderPDFList(films);
}

function filterPDFList(){
  var q=document.getElementById('pdf-search').value.toLowerCase();
  var onlyNew=document.getElementById('pdf-only-new').checked;
  var existingSuisa=S.films.map(function(f){return f.suisa||'';}).filter(Boolean);
  var existingTitles=S.films.map(function(f){return f.title.toLowerCase().trim();});
  var todayPDF=toLocalDate(new Date());
  var filtered=_pdfFilms.filter(function(f){
    if(f.releaseIT&&f.releaseIT<todayPDF)return false;
    var titleMatch=!q||f.title.toLowerCase().includes(q);
    var isNew=!existingSuisa.includes(f.suisa)&&!existingTitles.some(function(t){
      return t===f.title.toLowerCase().trim();
    });
    return titleMatch&&(!onlyNew||isNew);
  });
  renderPDFList(filtered,true);
}
window.filterPDFList=filterPDFList;

function renderPDFList(films,filtered){
  var existingSuisa=S.films.map(function(f){return f.suisa||'';}).filter(Boolean);
  var existingTitles=S.films.map(function(f){return f.title.toLowerCase().trim();});
  var list=document.getElementById('pdf-film-list');
  list.innerHTML='';
  var todayRender=toLocalDate(new Date());
  // Finestra: oggi-15gg ≤ releaseIT ≤ oggi+10mesi
  var dMinus15=new Date();dMinus15.setDate(dMinus15.getDate()-15);
  var dMinus15Str=toLocalDate(dMinus15);
  var dPlus10m=new Date();dPlus10m.setMonth(dPlus10m.getMonth()+10);
  var dPlus10mStr=toLocalDate(dPlus10m);
  var sorted=films.filter(function(f){
    if(!f.releaseIT)return true; // senza data: mostra sempre
    if(f.releaseIT<dMinus15Str)return false; // uscito da più di 15 giorni: escludi
    if(f.releaseIT>dPlus10mStr)return false; // più di 10 mesi nel futuro: escludi
    return true;
  }).sort(function(a,b){return (a.releaseIT||'').localeCompare(b.releaseIT||'');});
  sorted.forEach(function(film){
    var realIdx=_pdfFilms.indexOf(film);
    var alreadyExists=existingSuisa.includes(film.suisa)||existingTitles.some(function(t){
      return t===film.title.toLowerCase().trim();
    });
    var dateLabel=film.releaseIT?film.releaseIT.split('-').reverse().join('/'):'';
    var row=document.createElement('div');
    var updateMode=document.getElementById('imp-update-existing')?.checked;
    row.style.cssText='display:flex;align-items:flex-start;gap:10px;padding:7px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;'
      +(alreadyExists&&!updateMode?'opacity:.45':'')
      +(alreadyExists&&updateMode?'border-color:rgba(240,128,26,.5);':'');
    var cb=document.createElement('input');
    cb.type='checkbox';cb.dataset.idx=realIdx>=0?realIdx:0;
    cb.checked=!alreadyExists;cb.style.cssText='margin-top:4px;flex-shrink:0';
    cb.onchange=updatePDFCount;
    var info=document.createElement('label');
    info.style.cssText='cursor:pointer;flex:1';
    info.innerHTML='<div style="font-weight:700;font-size:12px;color:var(--txt)">'+film.title+'</div>'
      +'<div style="font-size:10px;color:var(--txt2);margin-top:2px">'
      +(film.genre||'')+(film.distributor?' · '+film.distributor:'')
      +(dateLabel?' · 🇮🇹 '+dateLabel:'')
      +(film.suisa?' · SUISA '+film.suisa:'')
      +(film.age&&film.age!=='-'?' · '+film.age+'anni':'')
      +(alreadyExists?' <span style="color:#e84a4a;font-size:9px">già in archivio</span>':'')
      +'</div>';
    row.appendChild(cb);row.appendChild(info);
    list.appendChild(row);
  });
  if(!sorted.length){
    list.innerHTML='<div style="padding:12px;font-size:12px;color:var(--txt2);text-align:center">Nessun film trovato</div>';
  }
  updatePDFCount();
}

function updatePDFCount(){
  var cbs=document.querySelectorAll('#pdf-film-list input[type=checkbox]');
  var sel=0;cbs.forEach(function(cb){if(cb.checked)sel++;});
  document.getElementById('pdf-count').textContent=sel+' film selezionati';
  var btn=document.getElementById('pdf-import-btn');
  if(btn)btn.disabled=sel===0;
}
window.updatePDFCount=updatePDFCount;

async function doPDFImport(){
  var btn=document.getElementById('pdf-import-btn');
  btn.disabled=true;btn.textContent='⏳ Analisi corrispondenze...';

  var todayImport=toLocalDate(new Date());
  var selected=[];
  document.querySelectorAll('#pdf-film-list input[type=checkbox]:checked').forEach(function(cb){
    var film=_pdfFilms[parseInt(cb.dataset.idx)];
    if(!film)return;
    if(film.releaseIT&&film.releaseIT<todayImport)return; // salta film già usciti
    selected.push(film);
  });
  if(!selected.length){toast('Nessun film selezionato','err');btn.disabled=false;btn.textContent='⬇ Importa e arricchisci';return;}

  // Fetch API mendrisio (use cache if available)
  var apiFilms=[];
  try{
    var cache=impGetCache();
    var cacheAge=cache?Date.now()-cache.ts:Infinity;
    if(cache&&cacheAge<IMP_CACHE_TTL){
      apiFilms=cache.data;
    } else {
      var today=toLocalDate(new Date());
      var rec=impGetDailyCount();
      var todayCount=rec.date===today?rec.count:0;
      if(todayCount<IMP_MAX_DAILY){
        var resp;
        try{resp=await fetch(IMP_API);}catch(e){
          try{resp=await fetch('https://corsproxy.io/?'+encodeURIComponent(IMP_API));}catch(e2){}
        }
        if(resp&&resp.ok){
          var json=await resp.json();
          apiFilms=(json.films||[]).filter(function(f){return f.title&&f.title.toLowerCase()!=='coming soon';});
          impSaveCache(apiFilms);impIncrDailyCount();
        }
      } else if(cache){apiFilms=cache.data;}
    }
  }catch(e){}

  // ── MATCHING ENGINE ──────────────────────────────────────
  function normT(t){return(t||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();}
  function wordOverlap(a,b){
    var wa=normT(a).split(' ').filter(function(w){return w.length>3;});
    var wb=normT(b).split(' ').filter(function(w){return w.length>3;});
    var matches=wa.filter(function(w){return wb.includes(w);});
    return wa.length?matches.length/Math.max(wa.length,wb.length):0;
  }

  function matchFilm(pf){
    // Level 1: exact title match (priorità massima)
    var exactMatch=apiFilms.find(function(f){return normT(f.title)===normT(pf.title);});
    if(exactMatch)return{film:exactMatch,confidence:'high',method:'titolo esatto'};

    // Level 2: fuzzy word overlap > 60%
    var best=null;var bestScore=0;
    apiFilms.forEach(function(f){
      var score=wordOverlap(f.title,pf.title);
      if(score>bestScore){bestScore=score;best=f;}
    });
    if(bestScore>=0.6)return{film:best,confidence:'medium',method:'titolo simile ('+Math.round(bestScore*100)+'%)'};

    // Level 3: stessa data E titolo con almeno 1 parola in comune (>0 score)
    // NON fa match solo per data — evita di associare film sbagliati
    if(pf.releaseIT){
      var dateMatches=apiFilms.filter(function(f){
        return f.start_date&&f.start_date===pf.releaseIT;
      });
      // Solo se c'è UN SOLO film in biglietteria per quella data
      // E ha qualche somiglianza di titolo
      if(dateMatches.length===1){
        var titleScore=wordOverlap(dateMatches[0].title,pf.title);
        if(titleScore>0.3)return{film:dateMatches[0],confidence:'medium',method:'data+titolo ('+Math.round(titleScore*100)+'%)'};
      }
      // Se ci sono più film per quella data → cerca il più simile per titolo
      if(dateMatches.length>1){
        var bestDate=null;var bestDateScore=0;
        dateMatches.forEach(function(f){
          var sc=wordOverlap(f.title,pf.title);
          if(sc>bestDateScore){bestDateScore=sc;bestDate=f;}
        });
        if(bestDateScore>0.4)return{film:bestDate,confidence:'medium',method:'data+titolo simile ('+Math.round(bestDateScore*100)+'%)'};
      }
    }

    return null;
  }

  // ── BUILD MATCHES FOR REVIEW ─────────────────────────────
  var matched=[];var unmatched=[];
  selected.forEach(function(pf){
    var m=matchFilm(pf);
    if(m)matched.push({pf:pf,api:m.film,confidence:m.confidence,method:m.method});
    else unmatched.push(pf);
  });

  // If all high confidence → import directly
  var needsReview=matched.filter(function(m){return m.confidence!=='high';});
  var highConf=matched.filter(function(m){return m.confidence==='high';});

  if(needsReview.length===0&&unmatched.length===0){
    // Tutti high confidence e nessun unmatched — import diretto
    await importMatched(matched.map(function(m){return{pf:m.pf,api:m.api};}));
    co('ovImport');
    toast(selected.length+' film importati ('+matched.length+' arricchiti)','ok');
    rf();
  } else {
    // Mostra review: ci sono match da verificare O film senza corrispondenza
    showMatchReview(matched,unmatched);
  }
  btn.disabled=false;btn.textContent='⬇ Importa e arricchisci';
}
window.doPDFImport=doPDFImport;

function showMatchReview(matched,unmatched){
  // Replace step2 content with review panel
  var step2=document.getElementById('pdf-step2');
  var confColors={high:'#4ae87a',medium:'#e89a3a',low:'#e89a3a',none:'#e84a4a'};
  var html='<div style="font-size:12px;font-weight:700;margin-bottom:10px">Verifica corrispondenze prima di importare:</div>'
    +'<div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:6px" id="match-review-list">';

  matched.forEach(function(m,i){
    var col=confColors[m.confidence];
    html+='<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;padding:8px 12px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
      +'<span style="width:8px;height:8px;border-radius:50%;background:'+col+';flex-shrink:0"></span>'
      +'<span style="font-size:10px;color:'+col+';font-weight:700;text-transform:uppercase">'+m.confidence+' · '+m.method+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;font-size:11px">'
      +'<div><div style="font-size:9px;color:var(--txt2);margin-bottom:2px">PROCINEMA (originale)</div>'
      +'<div style="font-weight:700">'+m.pf.title+'</div>'
      +(m.pf.releaseIT?'<div style="color:var(--txt2);font-size:10px">🇮🇹 '+m.pf.releaseIT.split('-').reverse().join('/')+'</div>':'')
      +(m.pf.distributor?'<div style="color:var(--txt2);font-size:10px">'+m.pf.distributor+'</div>':'')
      +'</div>'
      +'<div style="text-align:center;color:var(--txt2)">→</div>'
      +'<div><div style="font-size:9px;color:var(--txt2);margin-bottom:2px">MENDRISIO (italiano)</div>'
      +'<div style="font-weight:700;color:'+col+'">'+m.api.title+'</div>'
      +(m.api.start_date?'<div style="color:var(--txt2);font-size:10px">🇮🇹 '+m.api.start_date.split('-').reverse().join('/')+'</div>':'')
      +'</div>'
      +'</div>'
      +(m.confidence!=='high'?'<div style="margin-top:6px;display:flex;gap:5px">'
        +'<button class="btn ba bs" style="font-size:10px" data-idx="'+i+'" onclick="confirmMatch(this,true)">✓ Conferma</button>'
        +'<button class="btn bd bs" style="font-size:10px" data-idx="'+i+'" onclick="confirmMatch(this,false)">✗ Non corrisponde</button>'
        +'</div>':'')
      +'<input type="hidden" class="match-confirmed" data-idx="'+i+'" value="'+(m.confidence==='high'?'yes':'pending')+'">'
      +'</div>';
  });

  // Costruisce lista archivio per il select di associazione
  var archiveOpts=S.films.slice().sort(function(a,b){return a.title.localeCompare(b.title,'it');});
  unmatched.forEach(function(pf,i){
    var opts='<option value="__new__">✚ Crea come nuovo film</option>'
      +'<option value="__skip__">✗ Non importare</option>'
      +'<option disabled>── Associa a film in archivio ──</option>';
    archiveOpts.forEach(function(af){
      opts+='<option value="'+af.id+'">'+af.title+(af.release?' ('+af.release+')':'')+'</option>';
    });
    html+='<div style="background:var(--surf2);border:1px solid rgba(232,74,74,.3);border-radius:6px;padding:8px 12px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      +'<span style="width:8px;height:8px;border-radius:50%;background:#e84a4a;flex-shrink:0"></span>'
      +'<span style="font-size:10px;color:#e84a4a;font-weight:700">NESSUNA CORRISPONDENZA</span>'
      +'</div>'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:4px">'+pf.title+'</div>'
      +(pf.releaseIT?'<div style="font-size:10px;color:var(--txt2);margin-bottom:6px">🇮🇹 '+pf.releaseIT.split('-').reverse().join('/')+(pf.distributor?' · '+pf.distributor:'')+'</div>':'')
      +'<select class="unmatched-action" data-uidx="'+i+'" style="width:100%;font-size:11px;padding:4px 6px;border-radius:4px;border:1px solid var(--bdr);background:var(--surf);color:var(--txt)">'
      +opts
      +'</select>'
      +'</div>';
  });

  html+='</div>'
    +'<div style="font-size:11px;color:var(--acc);margin-top:8px">'
    +matched.length+' corrispondenze trovate · '+unmatched.length+' senza match'
    +'</div>'
    +'<div class="mft">'
    +'<button class="btn bg" onclick="pdfBack()">← Indietro</button>'
    +'<button class="btn ba" onclick="doConfirmedImport()">⬇ Importa tutto</button>'
    +'</div>';

  // Store globally for confirmMatch
  window._matchReview={matched:matched,unmatched:unmatched};
  step2.innerHTML=html;
}

function confirmMatch(btn,confirmed){
  var idx=parseInt(btn.dataset.idx);
  var m=window._matchReview&&window._matchReview.matched[idx];
  if(!m)return;
  var hidden=document.querySelector('.match-confirmed[data-idx="'+idx+'"]');
  if(confirmed){
    m.confidence='high';
    if(hidden)hidden.value='yes';
    btn.parentElement.innerHTML='<span style="color:#4ae87a;font-size:11px">✓ Confermato</span>';
  } else {
    m.api=null;m.confidence='none';
    if(hidden)hidden.value='no';
    btn.parentElement.innerHTML='<span style="color:#e84a4a;font-size:11px">✗ Importa senza arricchimento</span>';
  }
}
window.confirmMatch=confirmMatch;

async function doConfirmedImport(){
  var mr=window._matchReview||{matched:[],unmatched:[]};
  var allItems=mr.matched.map(function(m){return{pf:m.pf,api:m.api};});
  // Legge la scelta dal select per ogni film unmatched
  var selects=[...document.querySelectorAll('.unmatched-action')];
  mr.unmatched.forEach(function(pf,i){
    var sel=selects.find(function(s){return parseInt(s.dataset.uidx)===i;});
    var val=sel?sel.value:'__new__';
    if(val==='__skip__')return; // non importare
    if(val==='__new__'){
      allItems.push({pf:pf,api:null}); // nuovo film
    } else {
      // Associa a film esistente in archivio → aggiorna solo SUISA/dist/data
      allItems.push({pf:pf,api:null,existingId:val});
    }
  });
  await importMatched(allItems);
  co('ovImport');
  var enriched=allItems.filter(function(x){return x.api;}).length;
  toast(allItems.length+' film importati ('+enriched+' arricchiti)','ok');
  rf();
}
window.doConfirmedImport=doConfirmedImport;

async function importMatched(items){
  var newCount=0;var updCount=0;
  for(var i=0;i<items.length;i++){
    var pf=items[i].pf;var api=items[i].api;
    var trailerId='';
    if(api&&api.url_trailer){var mt=api.url_trailer.match(/[\w-]{11}/);trailerId=mt?mt[0]:'';}

    // Cerca film esistente per SUISA (più affidabile) o titolo
    var existing=null;
    if(pf.suisa){
      existing=S.films.find(function(x){return x.suisa&&x.suisa===pf.suisa;});
    }
    if(!existing){
      var tn=(api?api.title:pf.title).toLowerCase().trim();
      existing=S.films.find(function(x){return x.title.toLowerCase().trim()===tn;});
    }

    // Associazione manuale da review — usa existingId se specificato
    if(!existing&&items[i].existingId){
      existing=S.films.find(function(x){return x.id===items[i].existingId;});
    }
    if(existing){
      // ── AGGIORNAMENTO: solo SUISA, distributore, data release (Ticino) ──
      var patched=Object.assign({},existing,{
        suisa:pf.suisa||existing.suisa||'',
        distributor:pf.distributor||existing.distributor||'',
        release:pf.releaseIT||existing.release||''
      });
      await setDoc(doc(db,'films',existing.id),patched);
      if(pf.distributor)importAutoAddDistributor(pf.distributor);
      updCount++;
    } else {
      // ── NUOVO INSERIMENTO ──────────────────────────────────────────────
      // Se api=null (film ProCinema senza corrispondenza biglietteria):
      // usa titolo da ProCinema, crea film base che verrà arricchito da TMDB
      var id=uid();
      var filmDoc={
        id:id,
        title:api?api.title:pf.title,  // titolo italiano da API o titolo ProCinema
        titleOriginal:pf.title,         // titolo originale ProCinema sempre
        duration:api?parseInt(api.length)||0:0,
        genre:api?api.genre||pf.genre||'':pf.genre||'',
        director:api?api.director||'':'',
        rating:pf.age&&pf.age!=='-'?pf.age+'anni':(api&&api.age&&api.age!=='n/p'?api.age:''),
        release:pf.releaseIT||'',
        endDate:'',
        poster:(api&&api.playbill_path&&!api.playbill_path.includes('noposter'))?api.playbill_path:'',
        backdrop:(api&&api.backdrop_path&&!api.backdrop_path.includes('noposter'))?('https://image.tmdb.org/t/p/original'+api.backdrop_path):'',
        description:api?api.plot?api.plot.slice(0,300):'':'',
        distributor:pf.distributor||'',
        ticketUrl:api?api.film_url_for_cinema||'':'',
        trailer:trailerId,
        cast:api?api.cast||'':'',
        language:api?api.language||'':'',
        suisa:pf.suisa||'',
        apiId:api?api.original_id||null:null,
        tmdbId:api?api.tmdb_id||null:null  // null se no api → tmdbEnrichAll lo cercherà per titolo
      };
      await setDoc(doc(db,'films',id),filmDoc);
      if(filmDoc.distributor)importAutoAddDistributor(filmDoc.distributor);
      newCount++;
    }
  }
  var msg=[];
  if(newCount)msg.push(newCount+' nuovi');
  if(updCount)msg.push(updCount+' aggiornati (SUISA/dist/data)');
  toast((msg.join(', ')||'Nessuna modifica')+' film importati da ProCinema','ok');
}
window.importMatched=importMatched;


// ── BOX OFFICE ITALIA (Cinetel) ──────────────────────────
var _boData=[];

function openBoxOffice(){
  document.getElementById('bo-paste').value='';
  document.getElementById('bo-status').textContent='';
  document.getElementById('bo-step1').style.display='block';
  document.getElementById('bo-step2').style.display='none';
  document.getElementById('ovBO').classList.add('on');
}
window.openBoxOffice=openBoxOffice;

function parseCinetelText(text){
  // Format: pos \n title \n date \n nation \n distributor \n incasso \n presenze \n incasso totale \n presenze totale
  // Lines come in blocks. Key patterns:
  // - Position: standalone number 1-50
  // - Euro amounts: € 1.234.567 or € 234.567
  // - Dates: dd/mm/yyyy
  // - Title: UPPERCASE line after position
  var lines=text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
  var films=[];
  var i=0;
  // Find the date header
  var dateHeader='';
  for(var j=0;j<lines.length;j++){
    if(/Box Office al \d{2}\/\d{2}\/\d{4}/.test(lines[j])){
      dateHeader=lines[j];break;
    }
  }

  while(i<lines.length){
    // Look for position number (1-50 standalone)
    var posM=lines[i].match(/^(\d{1,2})$/);
    if(!posM||parseInt(posM[1])<1||parseInt(posM[1])>50){i++;continue;}
    var pos=parseInt(posM[1]);
    if(i+1>=lines.length){i++;continue;}

    // Next line = title (uppercase)
    var title=lines[i+1];
    if(!title||title.length<2){i++;continue;}

    // Scan next lines for euro amounts
    var euros=[];var dates=[];var nation='';var distrib='';
    var j2=i+2;
    while(j2<lines.length&&j2<i+12){
      var l=lines[j2];
      // Euro amount
      var euroM=l.match(/^€\s*([\d.,]+)$/);
      if(euroM)euros.push(euroM[1].replace(/\./g,'').replace(',','.'));
      // Date
      if(/^\d{2}\/\d{2}\/\d{4}$/.test(l))dates.push(l);
      // Nation code (ITA, USA, GBR, FRA, etc)
      if(/^[A-Z]{3}$/.test(l)&&l!=='BOX')nation=l;
      // Distributor (mixed case, > 3 chars, not a number)
      if(l.length>5&&!/^\d/.test(l)&&!/^€/.test(l)&&!/^\d{2}\//.test(l)&&!/^[A-Z]{3}$/.test(l)&&l!==title&&l!==String(pos))distrib=l;
      // Stop if we hit the next position number
      if(/^\d{1,2}$/.test(l)&&parseInt(l)===pos+1)break;
      j2++;
    }

    if(euros.length>=2){
      films.push({
        pos:pos,
        title:title,
        firstRelease:dates[0]||'',
        nation:nation,
        distributor:distrib,
        incassoGiorno:parseFloat(euros[0])||0,
        incassoTotale:parseFloat(euros[2]||euros[1])||0,
        presenzeGiorno:parseFloat((euros[1]||'').replace(/\./g,''))||0,
        presenzeTotale:parseFloat((euros[3]||euros[2]||'').replace(/\./g,''))||0,
        dateHeader:dateHeader
      });
      i=j2;
    } else {
      i++;
    }
  }
  return films;
}

function parseBoxOffice(){
  var text=document.getElementById('bo-paste').value.trim();
  if(!text||text.length<50){
    document.getElementById('bo-status').textContent='⚠ Incolla il testo della classifica Cinetel';
    return;
  }
  // Parse the pasted text
  var films=parseCinetelText(text);
  if(!films.length){
    document.getElementById('bo-status').textContent='❌ Nessun film trovato. Assicurati di aver copiato tutta la tabella incluse le righe con €';
    return;
  }

  // Match each film against the archive
  function normBO(t){return(t||'').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();}
  function wordScore(a,b){
    var wa=normBO(a).split(' ').filter(function(w){return w.length>2;});
    var wb=normBO(b).split(' ').filter(function(w){return w.length>2;});
    if(!wa.length||!wb.length)return 0;
    var hits=wa.filter(function(w){return wb.includes(w);}).length;
    return hits/Math.max(wa.length,wb.length);
  }

  _boData=films.map(function(f){
    var best=null;var bestScore=0;
    S.films.forEach(function(af){
      // Try title match (Italian titles in archive)
      var score=Math.max(wordScore(af.title,f.title),wordScore(af.titleOriginal||'',f.title));
      if(score>bestScore){bestScore=score;best=af;}
    });
    return{bo:f,match:bestScore>=0.5?best:null,score:bestScore};
  });

  showBOResults();
}
window.parseBoxOffice=parseBoxOffice;

function showBOResults(){
  document.getElementById('bo-step1').style.display='none';
  document.getElementById('bo-step2').style.display='block';
  var list=document.getElementById('bo-results');
  var matched=0;
  var html='';
  var dateLabel=_boData.length&&_boData[0].bo.dateHeader?_boData[0].bo.dateHeader:'';
  if(dateLabel){
    html+='<div style="font-size:11px;color:var(--txt2);margin-bottom:6px;font-weight:700">'+dateLabel+'</div>';
  }

  // Sort archive films for dropdown: active films first
  var archFilms=S.films.slice().sort(function(a,b){return a.title.localeCompare(b.title);});

  _boData.forEach(function(item,idx){
    var f=item.bo;var m=item.match;
    if(m)matched++;
    var fmtEuro=function(n){return n?'€ '+Math.round(n).toLocaleString('it-IT'):'-';};
    var borderCol=m?'#4ae87a':'#e84a4a';

    html+='<div style="display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:start;padding:7px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;border-left:3px solid '+borderCol+'">'
      +'<div style="font-size:12px;font-weight:700;color:var(--txt2);padding-top:2px">'+f.pos+'</div>'
      +'<div>'
      +'<div style="font-size:11px;font-weight:700;color:var(--txt);margin-bottom:3px">'+f.title+'</div>';

    if(m){
      // Matched — show result + option to change
      html+='<div style="display:flex;align-items:center;gap:6px">'
        +'<span style="font-size:10px;color:#4ae87a">✓</span>'
        +'<select class="bo-match-sel" data-idx="'+idx+'" style="font-size:10px;padding:2px 4px;flex:1" onchange="boPick(this)">'
        +'<option value="'+m.id+'" selected>'+m.title+'</option>';
      archFilms.forEach(function(af){
        if(af.id!==m.id)html+='<option value="'+af.id+'">'+af.title+'</option>';
      });
      html+='<option value="">— Non collegare —</option>';
      html+='</select></div>';
    } else {
      // Not matched — show dropdown to pick
      html+='<select class="bo-match-sel" data-idx="'+idx+'" style="font-size:10px;padding:2px 4px;width:100%;border:1px solid #e84a4a;border-radius:3px" onchange="boPick(this)">'
        +'<option value="">— Seleziona film in archivio —</option>';
      archFilms.forEach(function(af){
        html+='<option value="'+af.id+'">'+af.title+'</option>';
      });
      html+='</select>';
    }
    html+='</div>'
      +'<div style="text-align:right;font-size:10px;white-space:nowrap">'
      +'<div style="color:var(--txt2)">giorno<br><strong style="color:var(--txt)">'+fmtEuro(f.incassoGiorno)+'</strong></div>'
      +'<div style="color:var(--acc);margin-top:2px">totale<br><strong>'+fmtEuro(f.incassoTotale)+'</strong></div>'
      +'</div>'
      +'</div>';
  });
  list.innerHTML=html;
  document.getElementById('bo-summary').textContent=matched+' film abbinati automaticamente su '+_boData.length+' — modifica le corrispondenze se necessario';
}

function boPick(sel){
  var idx=parseInt(sel.dataset.idx);
  var filmId=sel.value;
  if(!filmId){_boData[idx].match=null;return;}
  var film=S.films.find(function(f){return f.id===filmId;});
  _boData[idx].match=film||null;
  // Update border color
  var row=sel.closest('div[style*="border-left"]');
  if(row)row.style.borderLeftColor=_boData[idx].match?'#4ae87a':'#e84a4a';
}
window.boPick=boPick;
window.showBOResults=showBOResults;


async function saveBoxOffice(){
  var saved=0;
  var dateLabel=_boData.length&&_boData[0].bo.dateHeader?_boData[0].bo.dateHeader:'';
  for(var i=0;i<_boData.length;i++){
    var item=_boData[i];
    if(!item.match)continue;
    var update={
      boITDate:dateLabel,
      boITGiorno:item.bo.incassoGiorno,
      boITTotale:item.bo.incassoTotale,
      boITPos:item.bo.pos,
      boITNazione:item.bo.nation
    };
    // Merge with existing film data
    var existing=S.films.find(function(f){return f.id===item.match.id;});
    if(existing){
      await setDoc(doc(db,'films',item.match.id),Object.assign({},existing,update));
      saved++;
    }
  }
  co('ovBO');
  toast(saved+' film aggiornati con dati box office Italia','ok');
  rf();
}
window.saveBoxOffice=saveBoxOffice;


// ── ORPHAN SHOW CLEANUP ──────────────────────────────
function countOrphanShows(){
  return S.shows.filter(function(s){return!S.films.find(function(f){return f.id===s.filmId;});}).length;
}

async function cleanOrphanShows(){
  var orphans=S.shows.filter(function(s){return!S.films.find(function(f){return f.id===s.filmId;});});
  if(!orphans.length){toast('Nessuno spettacolo orfano trovato','ok');return;}
  if(!confirm('Eliminare '+orphans.length+' spettacol'+(orphans.length===1?'o':'i')+' con film non più in archivio?'))return;
  for(var i=0;i<orphans.length;i++){
    await deleteDoc(doc(db,'shows',orphans[i].id));
  }
  toast(orphans.length+' spettacol'+(orphans.length===1?'o orfano eliminato':'i orfani eliminati'),'ok');
}
window.cleanOrphanShows=cleanOrphanShows;
window.countOrphanShows=countOrphanShows;


// ── NOPOSTER CLEANUP ─────────────────────────────────
async function cleanNoPosterUrls(){
  const bad=S.films.filter(f=>f.poster&&(f.poster.includes('noposter')||f.poster.includes('github.io/images')));
  if(!bad.length){toast('Nessun poster da pulire','ok');return;}
  let fixed=0;
  for(const f of bad){
    const updated={...f,poster:''};
    try{await setDoc(doc(db,'films',f.id),updated);fixed++;}catch(e){console.error('cleanup err',f.id,e);}
  }
  toast(fixed+' poster noposter rimossi','ok');
}
window.cleanNoPosterUrls=cleanNoPosterUrls;




// ── CANCELLA GIORNATA ─────────────────────────────────
async function clearDay(day){
  const dayShows=S.shows.filter(s=>s.day===day);
  if(!dayShows.length){toast('Nessuno spettacolo in questa giornata','ok');return;}
  const wd=wdates();
  const di=wd.indexOf(day);
  const label=di>=0?`${DIT[di]} ${fs(new Date(day+'T12:00:00'))}`:day;
  if(!confirm(`Eliminare tutti i ${dayShows.length} spettacoli di ${label}?\n\nQuesta azione non può essere annullata.`))return;
  let deleted=0;
  for(const s of dayShows){
    try{await deleteDoc(doc(db,'shows',s.id));deleted++;}catch(e){console.error('clearDay err',s.id,e);}
  }
  toast(`${deleted} spettacol${deleted===1?'o eliminato':'i eliminati'} da ${label}`,'ok');
}
window.clearDay=clearDay;

// ── THEME ───────────────────────────────────────────────

// ── ZOOM INTERFACCIA ─────────────────────────────────
function applyZoom(val){
  val=parseFloat(val);
  val=Math.max(0.7,Math.min(1.4,Math.round(val*20)/20));
  document.body.style.zoom=val;
  var sl=document.getElementById('zoom-slider');
  var lb=document.getElementById('zoom-label');
  if(sl)sl.value=val;
  if(lb)lb.textContent=Math.round(val*100)+'%';
  try{localStorage.setItem('cm_zoom',val);}catch(e){}
}
function setZoom(delta){
  var sl=document.getElementById('zoom-slider');
  var cur=sl?parseFloat(sl.value):1;
  applyZoom(Math.round((cur+delta)*20)/20);
}
window.applyZoom=applyZoom;
window.setZoom=setZoom;

// Ripristina zoom salvato all'avvio
(function(){
  try{
    var saved=localStorage.getItem('cm_zoom');
    if(saved){applyZoom(parseFloat(saved));}
  }catch(e){}
})();


// ── PERMESSI RUOLI ────────────────────────────────────
var TAB_LABELS={
  prog:'📅 Programmazione',
  lista:'📋 Listato Prog',
  arch:'🎬 Archivio Film',
  prnt:'🖨 Stampa & PDF',
  mail:'📧 Email',
  book:'📋 Prenotazioni',
  staff:'👥 Turni',
  playlist:'▶ Playlist',
  social:'📱 Social',
  news:'📰 Newsletter',
  bo:'📈 Box Office',
  monitor:'📺 Monitor',
  oa:'☀ CineTour OA'
};
// Permessi default per ruolo (admin sempre tutto)
var PERM_DEFAULT={
  operator:   {prog:true, lista:true, arch:true, prnt:true, mail:true, book:true, staff:true, playlist:true, social:true, news:true, bo:true, monitor:true, oa:true},
  segretaria: {prog:true, lista:false,arch:false,prnt:true, mail:false,book:true, staff:false,playlist:false,social:false,news:false, bo:false,monitor:false, oa:true},
  programmatore:{prog:true,lista:true, arch:true, prnt:true, mail:false,book:false,staff:false,playlist:false,social:false,news:false, bo:true, monitor:false, oa:false},
  social:     {prog:false,prop:false,lista:true, arch:true, prnt:false,mail:false,book:false,staff:false,playlist:false,social:true, news:true,  bo:false,monitor:false, oa:false}
};
var PERM_TABS=Object.keys(TAB_LABELS); // ['prog','lista','arch',...]

function getPermissions(role){
  if(role==='admin')return PERM_TABS.reduce(function(o,t){o[t]=true;return o;},{});
  var saved=S.permissions[role];
  if(!saved){return Object.assign({},PERM_DEFAULT[role]||PERM_TABS.reduce(function(o,t){o[t]=true;return o;},{}));}
  // merge con default per nuovi tab aggiunti in futuro
  var base=Object.assign({},PERM_DEFAULT[role]||{});
  return Object.assign(base,saved);
}

function applyTabVisibility(role){
  if(role==='admin'){
    // Admin vede tutto
    PERM_TABS.forEach(function(t){
      var el=document.getElementById('tab-'+t);
      if(el)el.style.display='';
    });
    document.getElementById('tab-users').style.display='block';
    // perm gestita da gt()
    return;
  }
  var perms=getPermissions(role);
  PERM_TABS.forEach(function(t){
    var el=document.getElementById('tab-'+t);
    if(!el)return;
    el.style.display=perms[t]?'':'none';
  });
  // Tab utenti sempre nascosto per non-admin
  var uel=document.getElementById('tab-users');if(uel)uel.style.display='none';
  // Sezione permessi nascosta per non-admin
  // perm gestita da gt()
  // Se la pagina corrente non è più visibile → torna a prog
  var activePage=document.querySelector('.page.on');
  if(activePage){
    var pid=activePage.id.replace('page-','');
    if(pid!=='users'&&perms[pid]===false)gt('prog');
  }
}

function renderPermGrid(){
  var w=document.getElementById('perm-grid');
  if(!w)return;
  var roles=['operator','segretaria','programmatore','social'];
  var roleLabels={
    operator:'👤 Operatore',
    segretaria:'✉️ Segretaria',
    programmatore:'📅 Programmatore',
    social:'📱 Social Mgr'
  };
  var html='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  // Header
  html+='<thead><tr>';
  html+='<th style="text-align:left;padding:8px 12px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;min-width:180px">Sezione</th>';
  roles.forEach(function(r){
    html+='<th style="text-align:center;padding:8px 12px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;min-width:110px">'+roleLabels[r]+'</th>';
  });
  html+='<th style="text-align:center;padding:8px 12px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;color:var(--acc);min-width:90px">🔑 Admin</th>';
  html+='</tr></thead><tbody>';
  // Righe tab
  PERM_TABS.forEach(function(t){
    html+='<tr>';
    html+='<td style="padding:8px 12px;border:1px solid var(--bdr);font-weight:600">'+TAB_LABELS[t]+'</td>';
    roles.forEach(function(r){
      var perms=getPermissions(r);
      var checked=perms[t]?'checked':'';
      html+='<td style="text-align:center;padding:8px;border:1px solid var(--bdr);">';
      html+='<input type="checkbox" class="perm-ck" data-role="'+r+'" data-tab="'+t+'" '+checked;
      html+=' style="width:16px;height:16px;accent-color:var(--acc);cursor:pointer">';
      html+='</td>';
    });
    // Admin: sempre spuntato, disabilitato
    html+='<td style="text-align:center;padding:8px;border:1px solid var(--bdr);">';
    html+='<input type="checkbox" checked disabled style="width:16px;height:16px;opacity:0.4;cursor:not-allowed">';
    html+='</td>';
    html+='</tr>';
  });
  html+='</tbody></table>';
  html+='<div style="font-size:11px;color:var(--txt2);margin-top:10px">Le modifiche diventano effettive al prossimo login degli utenti coinvolti.</div>';
  w.innerHTML=html;
}
window.renderPermGrid=renderPermGrid;

async function permSave(){
  var result={operator:{},segretaria:{},programmatore:{},social:{}};
  document.querySelectorAll('.perm-ck').forEach(function(ck){
    var role=ck.dataset.role;var tab=ck.dataset.tab;
    if(!result[role])result[role]={};
    result[role][tab]=ck.checked;
  });
  // Salva su Firestore
  try{
    await fbSetDoc(db,'settings','permissions',result);
    S.permissions=result;
    toast('Permessi salvati','ok');
  }catch(e){
    toast('Errore salvataggio permessi','err');
  }
}
window.permSave=permSave;


// ── NEWSLETTER ───────────────────────────────────────
var _newsSelNew=new Set();   // filmId selezionati sezione Nuove uscite
var _newsSelCurr=new Set();  // filmId selezionati sezione In programma
var _newsSelComing=new Set();// filmId selezionati sezione Anticipazioni

// Stato periodo newsletter
var _newsPeriodFrom='';
var _newsPeriodTo='';

function newsSetCurrentWeek(){
  var wd=wdates();
  _newsPeriodFrom=wd[0];_newsPeriodTo=wd[6];
  var fEl=document.getElementById('news-from');var tEl=document.getElementById('news-to');
  if(fEl)fEl.value=_newsPeriodFrom;if(tEl)tEl.value=_newsPeriodTo;
  newsLoadFilms();
}
function newsSetNextWeek(){
  var wd=wdates();
  var nxt=new Date(wd[0]+'T12:00:00');nxt.setDate(nxt.getDate()+7);
  var nxtEnd=new Date(wd[6]+'T12:00:00');nxtEnd.setDate(nxtEnd.getDate()+7);
  _newsPeriodFrom=toLocalDate(nxt);_newsPeriodTo=toLocalDate(nxtEnd);
  var fEl=document.getElementById('news-from');var tEl=document.getElementById('news-to');
  if(fEl)fEl.value=_newsPeriodFrom;if(tEl)tEl.value=_newsPeriodTo;
  newsLoadFilms();
}
function newsUpdatePeriod(){
  var fEl=document.getElementById('news-from');var tEl=document.getElementById('news-to');
  _newsPeriodFrom=fEl?fEl.value:'';_newsPeriodTo=tEl?tEl.value:'';
  newsLoadFilms();
}
window.newsSetCurrentWeek=newsSetCurrentWeek;
window.newsSetNextWeek=newsSetNextWeek;
window.newsUpdatePeriod=newsUpdatePeriod;

function newsLoadFilms(){
  if(!_newsPeriodFrom||!_newsPeriodTo)return;
  // Calcola i giorni del periodo selezionato
  var rangeDays=[];
  var cur=new Date(_newsPeriodFrom+'T12:00:00');
  var end=new Date(_newsPeriodTo+'T12:00:00');
  while(cur<=end){rangeDays.push(toLocalDate(cur));cur.setDate(cur.getDate()+1);}

  var today=toLocalDate(new Date());
  var d14=new Date(_newsPeriodFrom+'T12:00:00');d14.setDate(d14.getDate()-14);
  var d14s=toLocalDate(d14);
  var periodFilmIds=new Set(S.shows.filter(function(s){return rangeDays.includes(s.day);}).map(function(s){return s.filmId;}));

  // Nuove uscite: film nel periodo con data uscita recente (entro 14gg prima del periodo)
  var newFilms=S.films.filter(function(f){
    return periodFilmIds.has(f.id)&&f.release&&f.release>=d14s&&f.release<=_newsPeriodTo;
  }).sort(function(a,b){return (a.release||'').localeCompare(b.release||'');});

  var newIds=new Set(newFilms.map(function(f){return f.id;}));

  // Ancora in programma: film nel periodo non nuovi
  var currFilms=S.films.filter(function(f){
    return periodFilmIds.has(f.id)&&!newIds.has(f.id);
  }).sort(function(a,b){return a.title.localeCompare(b.title,'it');});

  // Anticipazioni: film con release dopo la fine del periodo, entro 30gg
  var d30=new Date(_newsPeriodTo+'T12:00:00');d30.setDate(d30.getDate()+30);
  var d30s=toLocalDate(d30);
  var comingFilms=S.films.filter(function(f){
    return f.release&&f.release>_newsPeriodTo&&f.release<=d30s&&!periodFilmIds.has(f.id);
  }).sort(function(a,b){return (a.release||'').localeCompare(b.release||'');});

  // Reset selezioni e auto-seleziona tutti
  var ordNew=foApply(newFilms,'new',rangeDays);
  var ordCurr=foApply(currFilms,'curr',rangeDays);
  var ordComing=foApply(comingFilms,'coming',rangeDays);
  _newsSelNew=new Set(ordNew.map(function(f){return f.id;}));
  _newsSelCurr=new Set(ordCurr.map(function(f){return f.id;}));
  _newsSelComing=new Set(ordComing.map(function(f){return f.id;}));
  newsRenderSection('news-new-films','news-new-count',ordNew,_newsSelNew,'new');
  newsRenderSection('news-curr-films','news-curr-count',ordCurr,_newsSelCurr,'curr');
  newsRenderSection('news-coming-films','news-coming-count',ordComing,_newsSelComing,'coming');

  // Aggiorna label periodo
  var fmtFrom=_newsPeriodFrom.split('-').reverse().join('/');
  var fmtTo=_newsPeriodTo.split('-').reverse().join('/');
  var title=document.querySelector('#page-news .st');
  if(title)title.textContent='📰 Newsletter · '+fmtFrom+' — '+fmtTo;
}
window.newsLoadFilms=newsLoadFilms;

function newsInit(){
  foLoad().then(function(){newsSetNextWeek();}).catch(function(){newsSetNextWeek();});
}
window.newsInit=newsInit;

function newsSelectAll(section,val){
  var films,selSet,listId,countId;
  if(section==='new'){selSet=_newsSelNew;listId='news-new-films';countId='news-new-count';}
  else if(section==='curr'){selSet=_newsSelCurr;listId='news-curr-films';countId='news-curr-count';}
  else{selSet=_newsSelComing;listId='news-coming-films';countId='news-coming-count';}
  // Trova tutti i film nella sezione
  document.querySelectorAll('#'+listId+' .nws-card').forEach(function(card){
    var fid=card.dataset.fid;
    if(val)selSet.add(fid);else selSet.delete(fid);
    card.classList.toggle('selected',val);
    var chk=card.querySelector('.nws-card-check');
    if(chk)chk.style.color=val?'#f0801a':'var(--bdr)';
  });
}
window.newsSelectAll=newsSelectAll;

function newsRenderSection(listId,countId,films,selSet,section){
  var el=document.getElementById(listId);
  if(!el)return;
  if(countId){var cnt=document.getElementById(countId);if(cnt)cnt.textContent='('+films.length+' film)';}
  if(!films.length){
    el.innerHTML='<div style="font-size:12px;color:var(--txt2);padding:8px;grid-column:1/-1">Nessun film in questa categoria per il periodo selezionato</div>';
    return;
  }
  el.innerHTML='';
  films.forEach(function(film){
    var sel=selSet.has(film.id);
    var dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
    var meta=[dur,film.rating,film.genre].filter(Boolean).join(' · ');
    var isNew=section==='new'&&film.release;
    var relLabel=film.release?'<div class="nws-card-release">'+film.release.split('-').reverse().join('/')+'</div>':'';
    var orderArr=(_filmOrder[section]||[]);
    var isManual=orderArr.indexOf(film.id)>=0;
    var posDisplay=films.indexOf(film)+1;
    var card=document.createElement('div');
    card.className='nws-card'+(sel?' selected':'');
    card.dataset.fid=film.id;
    card.dataset.section=section;
    card.innerHTML=
      // Poster
      (film.poster
        ?'<img class="nws-card-poster" src="'+film.poster+'" alt="">'
        :'<div class="nws-card-poster-ph">🎬</div>')
      // Body
      +'<div class="nws-card-body">'
        +(isNew?'<span class="nws-card-badge">NOVITÀ</span>':'')
        +'<div class="nws-card-title">'+film.title+'</div>'
        +(film.distributor?'<div class="nws-card-meta" style="color:var(--acc);font-weight:600">'+film.distributor+'</div>':'')
        +(meta?'<div class="nws-card-meta">'+meta+'</div>':'')
        +relLabel
      +'</div>'
      // Colonna ctrl: numero priorità, frecce, spunta
      +'<div class="nws-card-ctrl">'
        +(isManual?'<div class="nws-priority-badge">'+posDisplay+'</div>':'<div style="height:18px"></div>')
        +'<button class="nws-arrow-btn" data-section="'+section+'" data-fid="'+film.id+'" data-dir="up" title="Sposta su">▲</button>'
        +'<button class="nws-arrow-btn" data-section="'+section+'" data-fid="'+film.id+'" data-dir="down" title="Sposta giù">▼</button>'
        +'<span class="nws-card-check" style="color:'+(sel?'#f0801a':'var(--bdr)')+'">✓</span>'
      +'</div>';
    card.addEventListener('click',function(e){
      if(e.target.classList.contains('nws-arrow-btn')){
        e.stopPropagation();
        foMove(e.target.dataset.section,e.target.dataset.fid,e.target.dataset.dir);
        return;
      }
      if(selSet.has(film.id)){selSet.delete(film.id);}else{selSet.add(film.id);}
      var isSel=selSet.has(film.id);
      card.classList.toggle('selected',isSel);
      var chk=card.querySelector('.nws-card-check');
      if(chk)chk.style.color=isSel?'#f0801a':'var(--bdr)';
    });
    el.appendChild(card);
  });
}

function newsGetOrder(selSet,filmId,films){
  var ordered=[...selSet].filter(function(id){return films.find(function(f){return f.id===id;});});
  var idx=ordered.indexOf(filmId);
  return idx>=0?idx+1:'';
}

function newsBuildHTML(){
  var today=toLocalDate(new Date());
  // Usa il periodo newsletter selezionato, altrimenti settimana corrente
  var wd=[];var days=[];
  if(_newsPeriodFrom&&_newsPeriodTo){
    var cur2=new Date(_newsPeriodFrom+'T12:00:00');
    var end2=new Date(_newsPeriodTo+'T12:00:00');
    while(cur2<=end2){wd.push(toLocalDate(cur2));days.push(new Date(cur2));cur2.setDate(cur2.getDate()+1);}
  } else {
    wd=wdates();days=wdays();
  }
  var intro=document.getElementById('news-intro')?.value.trim()||'';
  var promo=document.getElementById('news-promo')?.value.trim()||'';
  var hours=document.getElementById('news-hours')?.value.trim()||'';
  var wRange=_newsPeriodFrom&&_newsPeriodTo?(_newsPeriodFrom.split('-').reverse().join('/')+' — '+_newsPeriodTo.split('-').reverse().join('/')):days.length?fd(days[0])+' — '+fd(days[6]):'';

  function getSelectedFilms(selSet){
    return [...selSet].map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean);
  }
  var newFilms=getSelectedFilms(_newsSelNew);
  var currFilms=getSelectedFilms(_newsSelCurr);
  var comingFilms=getSelectedFilms(_newsSelComing);

  var ORA='#f0801a';

  function filmCard(film,isNew){
    var dur=film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'';
    var meta=[dur,film.rating,film.genre].filter(Boolean).join(' &nbsp;·&nbsp; ');
    var releaseLabel=film.release?'<span style="background:'+ORA+';color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;vertical-align:middle;margin-left:6px">NOVITÀ · '+film.release.split('-').reverse().join('/')+'</span>':'';
    var poster=film.poster
      ?'<img src="'+film.poster+'" alt="'+film.title+'" style="width:90px;height:130px;object-fit:cover;border-radius:4px;display:block;">'
      :'<div style="width:90px;height:130px;background:#1a1a2a;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:28px;">🎬</div>';
    var ticketBtn=film.ticketUrl
      ?'<a href="'+film.ticketUrl+'" style="display:inline-block;background:'+ORA+';color:#fff;text-decoration:none;padding:8px 18px;border-radius:4px;font-size:12px;font-weight:700;margin-top:10px;">🎟 Prenota ora</a>'
      :'';
    var trailerBtn=film.trailer
      ?'<a href="https://www.youtube.com/watch?v='+film.trailer+'" style="display:inline-block;background:rgba(240,128,26,.12);color:'+ORA+';text-decoration:none;padding:8px 14px;border-radius:4px;font-size:12px;font-weight:700;margin-top:10px;margin-left:8px;border:1px solid rgba(240,128,26,.4);">▶ Trailer</a>'
      :'';
    // Orari in settimana
    var fShows=S.shows.filter(function(s){return s.filmId===film.id&&wd.includes(s.day);})
      .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
    var byDay={};var dayOrd=[];
    fShows.forEach(function(s){
      var di=wd.indexOf(s.day);
      if(!byDay[di]){byDay[di]=[];dayOrd.push(di);}
      byDay[di].push(s.start);
    });
    var DIT3=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
    var schedHtml='';
    if(dayOrd.length){
      schedHtml='<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">';
      dayOrd.forEach(function(di){
        var dp=wd[di]?wd[di].split('-'):'';
        var dateLabel=dp?DIT3[di]+' '+dp[2]+'/'+dp[1]:'';
        var timesStr=byDay[di].join(' — ');
        schedHtml+='<div style="background:rgba(240,128,26,.1);border:1px solid rgba(240,128,26,.3);border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;color:#f0801a;white-space:nowrap">'
          +'<span style="color:#555;font-weight:400">'+dateLabel+'</span> '+timesStr
          +'</div>';
      });
      schedHtml+='</div>';
    }
    return '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;border-bottom:1px solid #eee;padding-bottom:20px"><tr valign="top">'
      +'<td style="width:100px;padding-right:16px">'+poster+'</td>'
      +'<td>'
        +'<div style="font-size:18px;font-weight:700;color:#111;margin-bottom:4px">'+film.title+releaseLabel+'</div>'
        +(meta?'<div style="font-size:12px;color:#888;margin-bottom:6px">'+meta+'</div>':'')
        +(film.distributor?'<div style="font-size:11px;color:#aaa">'+film.distributor+'</div>':'')
        +schedHtml
        +'<div>'+ticketBtn+trailerBtn+'</div>'
      +'</td>'
      +'</tr></table>';
  }

  function sectionBlock(emoji,title,films,bgColor){
    if(!films.length)return'';
    var cards=films.map(function(f){return filmCard(f,true);}).join('');
    return '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px"><tr><td style="background:'+bgColor+';border-radius:8px;padding:20px">'
      +'<h2 style="font-size:16px;font-weight:700;color:#111;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid '+ORA+'">'+emoji+' '+title+'</h2>'
      +cards
      +'</td></tr></table>';
  }

  // Promozioni block
  var promoBlock='';
  if(promo){
    var lines=promo.split('\n').filter(function(l){return l.trim();});
    promoBlock='<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px"><tr><td style="background:#fff8f0;border:1px solid rgba(240,128,26,.25);border-radius:8px;padding:20px">'
      +'<h2 style="font-size:16px;font-weight:700;color:'+ORA+';margin:0 0 12px;">🎁 Promozioni & info</h2>'
      +'<ul style="margin:0;padding-left:20px;font-size:13px;color:#333;line-height:1.8">'
      +lines.map(function(l){return '<li>'+l+'</li>';}).join('')
      +'</ul>'
      +'</td></tr></table>';
  }

  // Coming soon (anticipazioni): formato compatto
  var comingBlock='';
  if(comingFilms.length){
    var comingRows=comingFilms.map(function(film){
      var poster=film.poster
        ?'<img src="'+film.poster+'" style="width:48px;height:68px;object-fit:cover;border-radius:3px;">'
        :'<div style="width:48px;height:68px;background:#1a1a2a;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:18px">🎬</div>';
      var rel=film.release?film.release.split('-').reverse().join('/'):'';
      return '<tr><td style="padding:8px;width:60px">'+poster+'</td>'
        +'<td style="padding:8px;vertical-align:middle">'
          +'<div style="font-weight:700;font-size:13px;color:#111">'+film.title+'</div>'
          +(film.genre?'<div style="font-size:11px;color:#888">'+film.genre+'</div>':'')
          +(rel?'<div style="font-size:11px;color:'+ORA+';font-weight:700;margin-top:2px">📅 Uscita: '+rel+'</div>':'')
        +'</td></tr>';
    }).join('<tr><td colspan="2" style="padding:0;border-bottom:1px solid #f0f0f0"></td></tr>');
    comingBlock='<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px"><tr><td style="background:#f8f8ff;border-radius:8px;padding:20px">'
      +'<h2 style="font-size:16px;font-weight:700;color:#333;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #333">📅 In arrivo prossimamente</h2>'
      +'<table cellpadding="0" cellspacing="0" style="width:100%">'+comingRows+'</table>'
      +'</td></tr></table>';
  }

  var hoursBlock=hours?'<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px"><tr><td style="background:#f5f5f5;border-radius:8px;padding:16px 20px">'
    +'<div style="font-size:12px;color:#666;line-height:1.7">🕐 '+hours.split('\n').join(' &nbsp;·&nbsp; ')+'</div>'
    +'</td></tr></table>':'';

  var NEWS_LOGO='data:image/png;base64,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';
// Precarica il logo per uso nel canvas
var _logoImg=null;
(function(){
  if(typeof NEWS_LOGO!=='undefined'&&NEWS_LOGO){
    var li=new Image();
    li.onload=function(){_logoImg=li;};
    li.src=NEWS_LOGO;
  }
})();

  var html='<!DOCTYPE html><html lang="it"><head>'
    +'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Newsletter · Cinema Multisala Teatro Mendrisio · '+wRange+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#111;}'
    +'a{color:#f0801a;}'
    +'@media(max-width:600px){.news-inner{padding:16px!important;}.news-header-inner{padding:20px 16px!important;}}'
    +'</style>'
    +'</head><body>'
    // ── HEADER con logo ──
    +'<div style="background:#0d1117;padding:0">'
      +'<div class="news-header-inner" style="max-width:600px;margin:0 auto;padding:24px 24px 20px">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">'
          +'<img src="'+NEWS_LOGO+'" alt="Cinema Multisala Teatro" style="height:52px;width:auto;display:block;">'
          +'<div style="text-align:right">'
            +'<div style="color:rgba(255,255,255,0.45);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px">Programmazione</div>'
            +'<div style="color:#fff;font-size:15px;font-weight:700">'+wRange+'</div>'
            +'<div style="color:rgba(255,255,255,0.35);font-size:10px;margin-top:2px">mendrisiocinema.ch</div>'
          +'</div>'
        +'</div>'
        +(intro?'<div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.78);font-size:13px;line-height:1.7">'+intro+'</div>':'')
      +'</div>'
    +'</div>'
    // ── CONTENUTO ──
    +'<div style="max-width:600px;margin:0 auto;padding:0">'
      +'<div class="news-inner" style="background:#fff;padding:24px">'
        +sectionBlock('🆕','Nuove uscite questa settimana',newFilms,'#fffdf9')
        +sectionBlock('🎬','Ancora in programma',currFilms,'#fafafa')
        +comingBlock
        +promoBlock
        +hoursBlock
      +'</div>'
    +'</div>'
    // ── FOOTER ──
    +'<div style="background:#0d1117;padding:0">'
      +'<div style="max-width:600px;margin:0 auto;padding:20px 24px;text-align:center">'
        +'<a href="https://mendrisiocinema.ch" style="color:#f0801a;font-weight:700;text-decoration:none;font-size:13px">mendrisiocinema.ch</a>'
        +'<div style="color:rgba(255,255,255,0.35);font-size:10px;margin-top:6px">Via Vincenzo Vela 2, 6850 Mendrisio · Cinema Multisala Teatro</div>'
        +'<div style="color:rgba(255,255,255,0.2);font-size:9px;margin-top:8px">Per non ricevere più questa newsletter, contatta la biglietteria</div>'
      +'</div>'
    +'</div>'
    +'</body></html>';
  return html;
}
window.newsBuildHTML=newsBuildHTML;

function newsSaveOrder(){
  // Legge l'ordine corrente dalle card visibili e lo salva
  var sections=['new','curr','coming'];
  sections.forEach(function(sec){
    var listId='news-'+sec+'-films';
    var cards=document.querySelectorAll('#'+listId+' .nws-card');
    if(!cards.length)return;
    var order=[].slice.call(cards).map(function(c){return c.dataset.fid;}).filter(Boolean);
    _filmOrder[sec]=order;
  });
  _filmOrderWeek=foCurrentWeek();
  foSave().then(function(){
    toast('Ordine salvato — aggiorno anteprima...','ok');
    // Aggiorna automaticamente l'anteprima se aperta
    var ifrm=document.getElementById('news-iframe');
    if(ifrm&&document.getElementById('news-preview-wrap').style.display!=='none'){
      newsPreview();
    }
  }).catch(function(){toast('Errore salvataggio','err');});
}
window.newsSaveOrder=newsSaveOrder;

function newsPreview(){
  var html=newsBuildHTML();
  var ifrm=document.getElementById('news-iframe');
  var wrap=document.getElementById('news-preview-wrap');
  if(!ifrm||!wrap)return;
  wrap.style.display='block';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  ifrm.src=url;
  setTimeout(function(){URL.revokeObjectURL(url);},10000);
  ifrm.scrollIntoView({behavior:'smooth',block:'start'});
}
window.newsPreview=newsPreview;

function newsGenerate(){
  var html=newsBuildHTML();
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='newsletter.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},10000);
  toast('newsletter.html scaricata — caricala su GitHub come /cinemanager/newsletter.html','ok');
}
window.newsGenerate=newsGenerate;

function newsCopyLink(){
  var link='https://lucamora1970.github.io/cinemanager/newsletter.html';
  navigator.clipboard.writeText(link)
    .then(function(){toast('Link copiato: '+link,'ok');})
    .catch(function(){toast('Errore copia','err');});
}
window.newsCopyLink=newsCopyLink;

// ── MODALITÀ PIANIFICAZIONE ──────────────────────────────────────────────────
var _planMode=false;
function togglePlanMode(){
  _planMode=!_planMode;
  var dot=document.getElementById('plan-mode-dot');
  var lbl=document.getElementById('plan-mode-label');
  var wrap=document.getElementById('plan-mode-wrap');
  var icon=document.getElementById('plan-mode-icon');
  if(dot)dot.style.background=_planMode?'#f0801a':'var(--bdr)';
  if(lbl)lbl.style.color=_planMode?'#f0801a':'var(--txt2)';
  if(wrap)wrap.style.borderColor=_planMode?'rgba(240,128,26,.4)':'var(--bdr)';
  if(icon)icon.textContent=_planMode?'🗓':'📋';
  // Sync drawer
  var ddot=document.getElementById('drawerPlanDot');
  var dlbl=document.getElementById('drawerPlanLabel');
  var dico=document.getElementById('drawerPlanIcon');
  if(ddot)ddot.style.background=_planMode?'#f0801a':'var(--bdr)';
  if(dlbl)dlbl.style.color=_planMode?'#f0801a':'var(--txt)';
  if(dico)dico.textContent=_planMode?'🗓':'📋';
  toast(_planMode?'Seleziona Film Futuri On — film futuri visibili':'Film Futuri Off','ok');
}
window.togglePlanMode=togglePlanMode;

// ── Drawer mobile ────────────────────────────────────────────────────────
function toggleDrawer(){
  var d=document.getElementById('mobileDrawer');
  var o=document.getElementById('drawerOverlay');
  var open=d&&d.style.display!=='flex';
  if(d)d.style.display=open?'flex':'none';
  if(o)o.style.display=open?'block':'none';
  if(open)syncDrawer();
}
function closeDrawer(){
  var d=document.getElementById('mobileDrawer');
  var o=document.getElementById('drawerOverlay');
  if(d)d.style.display='none';
  if(o)o.style.display='none';
}
function syncDrawer(){
  // Utente
  var name=document.getElementById('userName')?.textContent||'';
  var avatarSrc=document.getElementById('userAvatar')?.src||'';
  var dn=document.getElementById('drawerName');
  var da=document.getElementById('drawerAvatar');
  var di=document.getElementById('drawerInitials');
  if(dn)dn.textContent=name||'—';
  if(name&&avatarSrc&&avatarSrc!==window.location.href){
    if(da){da.src=avatarSrc;da.style.display='block';}
    if(di)di.style.display='none';
  } else {
    var initials=(name||'?').split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
    if(di){di.textContent=initials||'?';di.style.display='flex';}
    if(da)da.style.display='none';
  }
  // Piano mode
  var ddot=document.getElementById('drawerPlanDot');
  var dlbl=document.getElementById('drawerPlanLabel');
  var dico=document.getElementById('drawerPlanIcon');
  if(ddot)ddot.style.background=_planMode?'#f0801a':'var(--bdr)';
  if(dlbl)dlbl.style.color=_planMode?'#f0801a':'var(--txt)';
  if(dico)dico.textContent=_planMode?'🗓':'📋';
  // Sync stato connessione nel drawer
  var srcDot=document.querySelector('#syncInd .sync-dot');
  var srcTxt=document.getElementById('syncTxt');
  var dSync=document.getElementById('drawerSync');
  var dSyncTxt=document.getElementById('drawerSyncTxt');
  var srcInd=document.getElementById('syncInd');
  if(dSync&&srcInd){
    dSync.className=srcInd.className; // copia classe ok/err/busy
  }
  if(dSyncTxt&&srcTxt)dSyncTxt.textContent=srcTxt.textContent||'Sincronizzato';
}
window.toggleDrawer=toggleDrawer;
window.closeDrawer=closeDrawer;
window.syncDrawer=syncDrawer;

// ── SISTEMA PRIORITÀ FILM ────────────────────────────────────────────────────
var _filmOrder={new:[],curr:[],coming:[]};
var _filmOrderWeek='';

function foCurrentWeek(){
  try{var wd=wdates();return wd.length?wd[0]:'';}catch(e){return '';}
}
window.foCurrentWeek=foCurrentWeek;

async function foLoad(){
  try{
    var snap=await new Promise(function(res,rej){
      var u=onSnapshot(doc(db,'settings','filmOrder'),function(s){u();res(s);},function(e){u();rej(e);});
    });
    if(snap.exists()){
      var d=snap.data();
      if(d.week===foCurrentWeek()){
        _filmOrder=d.order||{new:[],curr:[],coming:[]};
        _filmOrderWeek=d.week;
        return;
      }
    }
  }catch(e){}
  _filmOrder={new:[],curr:[],coming:[]};
  _filmOrderWeek=foCurrentWeek();
}
window.foLoad=foLoad;

async function foSave(){
  try{await fbSetDoc(db,'settings','filmOrder',{week:foCurrentWeek(),order:_filmOrder});}
  catch(e){console.warn('foSave',e);}
}
window.foSave=foSave;

function foApply(films,section,wd){
  var ordered=(_filmOrder[section]||[]).slice();
  var result=[];
  ordered.forEach(function(id){
    var f=films.find(function(x){return x.id===id;});
    if(f)result.push(f);
  });
  var remaining=films.filter(function(f){return !ordered.includes(f.id);});
  remaining.sort(function(a,b){
    var aS=(S.shows||[]).filter(function(s){return s.filmId===a.id&&(wd||[]).includes(s.day);}).length;
    var bS=(S.shows||[]).filter(function(s){return s.filmId===b.id&&(wd||[]).includes(s.day);}).length;
    if(a.release&&b.release){var rc=b.release.localeCompare(a.release);if(rc!==0)return rc;}
    if(a.release&&!b.release)return -1;
    if(!a.release&&b.release)return 1;
    if(bS!==aS)return bS-aS;
    return a.title.localeCompare(b.title,'it');
  });
  return result.concat(remaining);
}
window.foApply=foApply;

function foMove(section,filmId,direction){
  var listId='news-'+section+'-films';
  var cards=document.querySelectorAll('#'+listId+' .nws-card');
  var allIds=[].slice.call(cards).map(function(ca){return ca.dataset.fid;}).filter(Boolean);
  if(!allIds.length)return;
  var arr=allIds.slice();
  var idx=arr.indexOf(filmId);
  if(idx<0)return;
  if(direction==='up'&&idx>0){var t=arr[idx-1];arr[idx-1]=arr[idx];arr[idx]=t;}
  else if(direction==='down'&&idx<arr.length-1){var t=arr[idx+1];arr[idx+1]=arr[idx];arr[idx]=t;}
  _filmOrder[section]=arr;
  foSave();
  var countId=section==='new'?'news-new-count':section==='curr'?'news-curr-count':'news-coming-count';
  var selSet=section==='new'?_newsSelNew:section==='curr'?_newsSelCurr:_newsSelComing;
  var films=arr.map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean);
  newsRenderSection(listId,countId,films,selSet,section);
}
window.foMove=foMove;


// ── TMDB IMMAGINI ─────────────────────────────────────────────────────────────
var TMDB_IMG='https://image.tmdb.org/t/p/';

function tmdbUpdateBackdropPreview(){
  var url=document.getElementById('fBackdrop')?.value.trim()||'';
  var prev=document.getElementById('fBackdropPreview');
  if(!prev)return;
  if(url){
    prev.innerHTML='<img src="'+url+'" style="width:100%;height:100%;object-fit:cover">';
  } else {
    prev.innerHTML='<span style="font-size:10px;color:var(--txt2)">anteprima</span>';
  }
}
window.tmdbUpdateBackdropPreview=tmdbUpdateBackdropPreview;

async function tmdbFetchImages(){
  var fid=document.getElementById('fId')?.value.trim()||'';
  var film=fid?S.films.find(function(f){return f.id===fid;}):null;
  var tid=(document.getElementById('fTmdbId')?.value.trim()&&parseInt(document.getElementById('fTmdbId').value))||film?.tmdbId||film?.tmdbid||null;
  if(!tid){
    // Prova a cercare per titolo su TMDB
    var titolo=document.getElementById('fTit')?.value.trim()||'';
    if(!titolo){toast('Apri prima un film dall\'archivio','err');return;}
    toast('tmdbId non trovato — cerca per titolo "'+titolo+'" su TMDB e inserisci l\'ID manualmente nel campo','err');
    return;
  }
  var gallery=document.getElementById('fBackdropGallery');
  if(gallery)gallery.innerHTML='<span style="font-size:11px;color:var(--txt2)">⏳ Caricamento immagini...</span>';
  try{
    if(!TMDB_API_KEY){toast('TMDB API key non configurata','err');return;}
    var url='https://api.themoviedb.org/3/movie/'+tid+'/images?include_image_language=it,de,fr,en,null&api_key='+TMDB_API_KEY;
    var res=await fetch(url);
    if(!res.ok)throw new Error('TMDB '+res.status);
    var data=await res.json();
    var backdrops=(data.backdrops||[])
      .sort(function(a,b){return b.vote_average-a.vote_average;})
      .slice(0,8);
    var posters=(data.posters||[])
      .sort(function(a,b){return b.vote_average-a.vote_average;})
      .slice(0,4);
    if(gallery){
      gallery.innerHTML='';
      if(backdrops.length){
        var lbl=document.createElement('div');
        lbl.style='width:100%;font-size:10px;color:var(--txt2);margin-bottom:2px;font-weight:600';
        lbl.textContent='Foto di scena (backdrop)';
        gallery.appendChild(lbl);
      }
      backdrops.forEach(function(bd){
        var imgUrl=TMDB_IMG+'original'+bd.file_path;
        var img=document.createElement('img');
        img.src=TMDB_IMG+'w300'+bd.file_path;
        img.style='width:120px;height:68px;object-fit:cover;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:border-color .15s';
        img.title='Clicca per selezionare · '+Math.round(bd.vote_average*10)/10+' ⭐';
        img.addEventListener('click',function(){
          var el=document.getElementById('fBackdrop');
          if(el){el.value=imgUrl;el.dispatchEvent(new Event('input'));}
          gallery.querySelectorAll('img').forEach(function(i){i.style.borderColor='transparent';});
          img.style.borderColor='#f0801a';
          tmdbUpdateBackdropPreview();
        });
        gallery.appendChild(img);
      });
      if(posters.length){
        var lbl2=document.createElement('div');
        lbl2.style='width:100%;font-size:10px;color:var(--txt2);margin:6px 0 2px;font-weight:600';
        lbl2.textContent='Locandine disponibili';
        gallery.appendChild(lbl2);
      }
      posters.forEach(function(p){
        var imgUrl=TMDB_IMG+'w500'+p.file_path;
        var img=document.createElement('img');
        img.src=TMDB_IMG+'w92'+p.file_path;
        img.style='width:48px;height:72px;object-fit:cover;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:border-color .15s';
        img.title='Clicca per usare come locandina · '+(p.iso_639_1||'universale');
        img.addEventListener('click',function(){
          document.getElementById('fPoster').value=imgUrl;
          posters_gallery: gallery.querySelectorAll('img').forEach(function(i){i.style.borderColor='transparent';});
          img.style.borderColor='#f0801a';
        });
        gallery.appendChild(img);
      });
      if(!backdrops.length&&!posters.length){
        gallery.innerHTML='<span style="font-size:11px;color:var(--txt2)">Nessuna immagine trovata su TMDB</span>';
      }
    }
    // Seleziona automaticamente il primo backdrop se il campo è vuoto
    if(backdrops.length&&!document.getElementById('fBackdrop')?.value){
      document.getElementById('fBackdrop').value=TMDB_IMG+'w780'+backdrops[0].file_path;
      tmdbUpdateBackdropPreview();
    }
    toast('Trovati '+backdrops.length+' backdrop e '+posters.length+' locandine','ok');
  }catch(e){
    if(gallery)gallery.innerHTML='<span style="font-size:11px;color:var(--txt2)">Errore: '+e.message+'</span>';
    toast('Errore TMDB: '+e.message,'err');
  }
}
window.tmdbFetchImages=tmdbFetchImages;


// ── TMDB AUTO BACKDROP ──────────────────────────────────────────────────────
// Recupera backdrop TMDB per un film già salvato che non ce l'ha
async function tmdbAutoBackdrop(filmId,tmdbId){
  if(!TMDB_API_KEY||!tmdbId)return null;
  try{
    var res=await fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'/images?include_image_language=it,de,fr,en,null&api_key='+TMDB_API_KEY);
    if(!res.ok)return null;
    var data=await res.json();
    var backdrops=(data.backdrops||[]).filter(function(b){return b.vote_average>0;})
      .sort(function(a,b){return b.vote_average-a.vote_average;});
    var posters=(data.posters||[]).filter(function(p){return p.vote_average>0;})
      .sort(function(a,b){return b.vote_average-a.vote_average;});
    var backdrop=backdrops.length?TMDB_IMG+'original'+backdrops[0].file_path:'';
    // Aggiorna anche la locandina se quella attuale è vuota o di bassa qualità
    var poster=posters.length?TMDB_IMG+'w500'+posters[0].file_path:'';
    return {backdrop:backdrop,poster:poster};
  }catch(e){return null;}
}
window.tmdbAutoBackdrop=tmdbAutoBackdrop;

// Arricchisce tutti i film in archivio che hanno tmdbId ma non backdrop
async function tmdbFetchDetails(tmdbId){
  // Fetch completo: dettagli + credits + images
  if(!TMDB_API_KEY||!tmdbId)return null;
  try{
    var [detRes,imgRes,credRes]=await Promise.all([
      fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'?language=it-IT&api_key='+TMDB_API_KEY),
      fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'/images?include_image_language=it,de,fr,en,null&api_key='+TMDB_API_KEY),
      fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'/credits?api_key='+TMDB_API_KEY)
    ]);
    var det=detRes.ok?await detRes.json():null;
    var img=imgRes.ok?await imgRes.json():null;
    var cred=credRes.ok?await credRes.json():null;
    var backdrops=((img&&img.backdrops)||[]).filter(function(b){return b.vote_average>0;})
      .sort(function(a,b){return b.vote_average-a.vote_average;});
    var posters=((img&&img.posters)||[]).filter(function(p){return p.vote_average>0;})
      .sort(function(a,b){return b.vote_average-a.vote_average;});
    var directors=(cred&&cred.crew||[]).filter(function(p){return p.job==='Director';});
    var cast=(cred&&cred.cast||[]).slice(0,6).map(function(p){return p.name;}).join(', ');
    var director=directors.length?directors.map(function(d){return d.name;}).join(', '):'';
    // Trailer da videos
    var trailerKey='';
    try{
      var vidRes=await fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'/videos?language=it-IT&api_key='+TMDB_API_KEY);
      var vidData=vidRes.ok?await vidRes.json():null;
      var trailers=((vidData&&vidData.results)||[]).filter(function(v){return v.type==='Trailer'&&v.site==='YouTube';});
      if(!trailers.length){
        var vidRes2=await fetch('https://api.themoviedb.org/3/movie/'+tmdbId+'/videos?language=en-US&api_key='+TMDB_API_KEY);
        var vidData2=vidRes2.ok?await vidRes2.json():null;
        trailers=((vidData2&&vidData2.results)||[]).filter(function(v){return v.type==='Trailer'&&v.site==='YouTube';});
      }
      if(trailers.length)trailerKey=trailers[0].key;
    }catch(e){}
    return {
      tmdbId:tmdbId,
      backdrop:backdrops.length?TMDB_IMG+'original'+backdrops[0].file_path:'',
      poster:posters.length?TMDB_IMG+'w500'+posters[0].file_path:'',
      director:director,
      cast:cast,
      description:det&&det.overview?det.overview.slice(0,400):'',
      genre:det&&det.genres&&det.genres.length?det.genres[0].name:'',
      duration:det&&det.runtime?det.runtime:0,
      rating:'',
      trailerKey:trailerKey,
      originalTitle:det&&det.original_title?det.original_title:''
    };
  }catch(e){return null;}
}
window.tmdbFetchDetails=tmdbFetchDetails;

async function tmdbSearchByTitle(title){
  // Cerca film su TMDB per titolo, ritorna tmdbId o null
  if(!TMDB_API_KEY||!title)return null;
  try{
    var q=encodeURIComponent(title);
    var res=await fetch('https://api.themoviedb.org/3/search/movie?query='+q+'&language=it-IT&api_key='+TMDB_API_KEY);
    if(!res.ok)return null;
    var data=await res.json();
    var results=data.results||[];
    if(!results.length)return null;
    // Prende il primo risultato (più rilevante)
    return results[0].id;
  }catch(e){return null;}
}
window.tmdbSearchByTitle=tmdbSearchByTitle;

function tmdbEnrichAll(){
  if(!TMDB_API_KEY){
    toast('Configura prima TMDB_API_KEY nel file','err');return;
  }
  // Arricchisce TUTTI i film con campi mancanti (non solo quelli senza backdrop)
  var toEnrich=S.films.filter(function(f){
    return !f.backdrop||!f.cast||!f.director||!f.description||!f.trailer;
  });
  if(!toEnrich.length){toast('Tutti i film sono già completi','ok');return;}
  toast('Arricchimento TMDB per '+toEnrich.length+' film...','ok');
  var updated=0;var notFound=0;
  (async function(){
    for(var i=0;i<toEnrich.length;i++){
      var film=toEnrich[i];
      var tmdbId=film.tmdbId||null;
      // Se non ha tmdbId, cerca per titolo
      if(!tmdbId){
        tmdbId=await tmdbSearchByTitle(film.title);
        await new Promise(function(r){setTimeout(r,200);});
      }
      if(!tmdbId){notFound++;continue;}
      var det=await tmdbFetchDetails(tmdbId);
      await new Promise(function(r){setTimeout(r,300);});
      if(!det){notFound++;continue;}
      // Aggiorna solo i campi mancanti (non sovrascrive dati manuali)
      var patch=Object.assign({},film,{
        tmdbId:det.tmdbId||film.tmdbId,
        // Immagini: aggiorna sempre se mancanti
        backdrop:film.backdrop||det.backdrop||'',
        poster:film.poster||det.poster||'',
        // Metadati: aggiorna solo se vuoti
        director:film.director||det.director||'',
        cast:film.cast||det.cast||'',
        description:film.description||det.description||'',
        genre:film.genre||det.genre||'',
        duration:film.duration||det.duration||0,
        trailer:film.trailer||det.trailerKey||''
      });
      try{
        await fbSetDoc(db,'films',film.id,patch);
        updated++;
      }catch(e){console.error('tmdbEnrichAll save err',film.id,e);}
    }
    toast('Completato: '+updated+' film aggiornati'+(notFound?' · '+notFound+' non trovati':''),'ok');
    rf();
  })();
}
window.tmdbEnrichAll=tmdbEnrichAll;
// ── Aggiorna URL backdrop esistenti da w780 a original ─────────────────────
async function tmdbFixBackdropUrls(){
  var toFix=S.films.filter(function(f){
    return f.backdrop&&f.backdrop.includes('/t/p/w780/');
  });
  if(!toFix.length){toast('Nessun backdrop da aggiornare','ok');return;}
  toast('Aggiorno '+toFix.length+' backdrop URLs...','ok');
  var fixed=0;
  for(var i=0;i<toFix.length;i++){
    var film=toFix[i];
    var patch=Object.assign({},film,{
      backdrop:film.backdrop.replace('/t/p/w780/','/t/p/original/')
    });
    try{await fbSetDoc(db,'films',film.id,patch);fixed++;}catch(e){}
  }
  toast(fixed+' backdrop aggiornati a original','ok');
  rf();
}
window.tmdbFixBackdropUrls=tmdbFixBackdropUrls;




function toggleTheme(){
  const isLight=document.body.classList.toggle('light');
  document.getElementById('btnTheme').textContent=isLight?'☽':'☀';
  localStorage.setItem('cm_theme',isLight?'light':'dark');
}
// restore saved theme
(function(){if(localStorage.getItem('cm_theme')==='light'){document.body.classList.add('light');const b=document.getElementById('btnTheme');if(b)b.textContent='☽';}})();
window.toggleTheme=toggleTheme;

// ── INIT ──────────────────────────────────────────────────
uwl();
syncSet('busy','Connessione…');
// Auth handles startup — onAuthStateChanged calls startListeners after login


// ── LOADING DIAGNOSTICS ──────────────────────────────
(function(){
  var t1=setTimeout(function(){
    var el=document.getElementById('load-txt');
    if(el&&document.getElementById('loading').style.display!=='none'){
      el.textContent='Verifica connessione internet…';
    }
  },5000);
  var t2=setTimeout(function(){
    var loading=document.getElementById('loading');
    if(!loading||loading.style.display==='none')return;
    var errEl=document.getElementById('load-err');
    var retryBtn=document.getElementById('load-retry-btn');
    var msg='Impossibile connettersi. Possibili cause:\n'
      +'• Connessione internet assente\n'
      +'• Dominio non autorizzato in Firebase Auth\n'
      +'• Firebase SDK bloccato da firewall/proxy';
    if(errEl){errEl.style.display='block';errEl.textContent=msg;errEl.style.whiteSpace='pre-line';}
    if(retryBtn)retryBtn.style.display='block';
  },10000);
})();
// ══════════════════════════════════════════════════════════════════════════
// MODULO PROPOSTA PROGRAMMAZIONE
// ══════════════════════════════════════════════════════════════════════════
var _propWeek=null;        // Date() primo giorno (giovedì) della settimana proposta
var _propSlots={};         // {dayIdx: [{filmId,sala,time}]} — proposta utente
var _propPrevData={};      // {filmTitleLower: {dayIdx: [{sala,time,inc,spett}]}} — dati sett. prec.
var _propPrevWeekLabel=''; // label settimana precedente

// ── Persistenza localStorage dati settimana precedente ────────────────────
var _LS_KEY='cm_propPrevData';
var _LS_LABEL='cm_propPrevLabel';
var _propSyncTimeout=null; // debounce per il salvataggio

// ── Chiave Firestore per la settimana proposta corrente ───────────────────
function propWeekKey(){
  if(!_propWeek)return null;
  return _propWeek.getFullYear()+'-'+String(_propWeek.getMonth()+1).padStart(2,'0')+'-'+String(_propWeek.getDate()).padStart(2,'0');
}

// ── Salva _propSlots su Firestore (debounced 800ms) ──────────────────────
function propSaveFirestore(){
  if(_propSyncTimeout)clearTimeout(_propSyncTimeout);
  _propSyncTimeout=setTimeout(async function(){
    var key=propWeekKey();
    if(!key||!currentUser)return;
    try{
      await setDoc(doc(db,'proposta',key),{
        week:key,
        slots:JSON.parse(JSON.stringify(_propSlots)),
        updatedAt:new Date().toISOString(),
        updatedDa:currentUser.displayName||currentUser.email||'—'
      });
    }catch(e){console.warn('propSaveFirestore:',e);}
  },800);
}
window.propSaveFirestore=propSaveFirestore;

// ── Listener Firestore per aggiornamenti in tempo reale ───────────────────
var _propFSUnsub=null; // unsubscribe del listener corrente

function propStartSync(){
  var key=propWeekKey();
  if(!key)return;
  // Cancella listener precedente se settimana cambiata
  if(_propFSUnsub){_propFSUnsub();_propFSUnsub=null;}
  _propFSUnsub=onSnapshot(doc(db,'proposta',key),function(snap){
    if(!snap.exists()){
      // Nessuna proposta per questa settimana — reset slots
      // Ma solo se non stiamo noi stessi modificando
      return;
    }
    var data=snap.data();
    // Aggiorna solo se la modifica viene da un altro utente
    var mioEmail=currentUser?.email||'';
    var mioNome=currentUser?.displayName||'';
    var autore=data.updatedDa||'';
    var daAltro=autore&&autore!==mioEmail&&autore!==mioNome;
    if(daAltro){
      _propSlots=data.slots||{};
      propRender();
      // Badge autore nella header
      var badge=document.getElementById('prop-sync-badge');
      if(badge){
        var t=new Date(data.updatedAt);
        var ora=t.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
        badge.textContent='✏ '+autore+' — '+ora;
        badge.style.display='inline-block';
        setTimeout(function(){if(badge)badge.style.opacity='.6';},3000);
      }
      toast('✏ Aggiornato da '+autore,'ok');
    }
  });
}
function propSaveLS(){
  try{
    localStorage.setItem(_LS_KEY,JSON.stringify(_propPrevData));
    localStorage.setItem(_LS_LABEL,_propPrevWeekLabel);
  }catch(e){console.warn('propSaveLS:',e);}
}
function propClearLS(){
  try{localStorage.removeItem(_LS_KEY);localStorage.removeItem(_LS_LABEL);}catch(e){}
}
function propLoadLS(){
  try{
    var raw=localStorage.getItem(_LS_KEY);
    var lbl=localStorage.getItem(_LS_LABEL)||'';
    if(raw){
      var parsed=JSON.parse(raw);
      if(parsed&&Object.keys(parsed).length){
        _propPrevData=parsed;
        _propPrevWeekLabel=lbl;
        var el=document.getElementById('prop-prev-label');
        if(el)el.textContent=lbl+' ('+Object.keys(parsed).length+' film) — da sessione precedente';
      }
    }
  }catch(e){console.warn('propLoadLS:',e);}
}
var _propEditDay=null;     // giorno in editing nel modal

var DIT_PROP=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

function propInit(){
  // Inizializza la settimana proposta = settimana successiva a quella corrente
  if(!_propWeek){
    var ws=new Date(S.ws);
    ws.setDate(ws.getDate()+7);
    _propWeek=ws;
  }
  // Ripristina dati settimana precedente da localStorage se presenti
  if(!Object.keys(_propPrevData).length)propLoadLS();
  // Ripristina dati Maccsbox da localStorage
  propLoadMboxLS();
  // Avvia sincronizzazione Firestore
  propStartSync();
  // Carica slots da Firestore per la settimana corrente
  propLoadFromFirestore();
  propRender();
}
window.propInit=propInit;

// Carica _propSlots da Firestore per la settimana corrente
async function propLoadFromFirestore(){
  var key=propWeekKey();
  if(!key)return;
  try{
    var snap=await getDoc(doc(db,'proposta',key));
    if(snap.exists()){
      var data=snap.data();
      if(data.slots&&Object.keys(data.slots).length){
        _propSlots=data.slots;
        propRender();
        var badge=document.getElementById('prop-sync-badge');
        if(badge){
          var t=new Date(data.updatedAt);
          var ora=t.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
          badge.textContent='☁ '+data.updatedDa+' — '+ora;
          badge.style.display='inline-block';
        }
      }
    }
  }catch(e){console.warn('propLoadFromFirestore:',e);}
}
window.propLoadFromFirestore=propLoadFromFirestore;

function propShiftWeek(n){
  if(!_propWeek)_propWeek=new Date(S.ws);
  _propWeek=new Date(_propWeek);
  _propWeek.setDate(_propWeek.getDate()+n*7);
  // Reset slots per la nuova settimana e ricarica da Firestore
  _propSlots={};
  propStartSync();
  propLoadFromFirestore();
  propRender();
}
window.propShiftWeek=propShiftWeek;

function propDates(){
  return Array.from({length:7},(_,i)=>{
    const d=new Date(_propWeek);
    d.setDate(d.getDate()+i);
    return d;
  });
}

function propDateStr(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function propFd(d){
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

var _salaRank={}; // calcolato da propCalcRank(), usato da entrambe le viste

function propCalcRank(days){
  var rank={};
  FASCE.forEach(function(fascia){
    rank[fascia]={};
    days.forEach(function(d,di){
      var totBySala={};
      Object.keys(SALE).forEach(function(sid){
        var pd=propGetPrevData('',di,sid,fascia).filter(function(x){
          var pm=parseInt(x.time.split(':')[0])*60+parseInt(x.time.split(':')[1]);
          var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);
          return Math.abs(pm-fm)<=30;
        });
        totBySala[sid]=pd.reduce(function(s,x){return s+(x.spett||0);},0);
      });
      var sorted=Object.keys(totBySala)
        .filter(function(sid){return totBySala[sid]>0;})
        .sort(function(a,b){return totBySala[b]-totBySala[a];});
      rank[fascia][di]={};
      sorted.forEach(function(sid,ri){rank[fascia][di][sid]=ri+1;});
    });
  });
  return rank;
}
window.propRender=propRender;

// ── Strip classifica film per incasso settimana precedente ────────────────
function propRenderRankStrip(){
  var strip=document.getElementById('prop-rank-strip');
  var cards=document.getElementById('prop-rank-cards');
  var lbl=document.getElementById('prop-rank-label');
  if(!strip||!cards)return;

  var keys=Object.keys(_propPrevData||{});
  if(!keys.length){strip.style.display='none';return;}

  // Aggrega per film: somma spett e inc su tutti giorni e sale
  var agg=keys.map(function(fk){
    var dayData=_propPrevData[fk];
    var totSpett=0,totInc=0,occSum=0,occN=0,shows=0;
    Object.values(dayData).forEach(function(arr){
      arr.forEach(function(e){
        totSpett+=e.spett||0;
        totInc+=e.inc||0;
        if(e.occ!=null){occSum+=e.occ;occN++;}
        shows++;
      });
    });
    var occAvg=occN?Math.round(occSum/occN):0;
    // Cerca il film in S.films per recuperare settimana
    var match=S.films.find(function(f){
      return f.title.toLowerCase().replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim()===fk;
    });
    var wn=match?filmWeekNum(match):null;
    return{key:fk,title:match?match.title:fk,spett:totSpett,inc:totInc,occ:occAvg,shows:shows,weekNum:wn};
  }).sort(function(a,b){return b.spett-a.spett;});

  // Colori rank
  var topBorderCol=['#BA7517','#888780','#997A3D'];
  var badgeBg=['#FAEEDA','#D3D1C7','#F5C4B3'];
  var badgeTxt=['#633806','#444441','#4A1B0C'];
  var rankLabel=['#1 oro','#2 argento','#3 bronzo'];

  function occColor(o){return o>=50?'#3B6D11':o>=25?'#BA7517':'#888';}

  cards.innerHTML=agg.map(function(f,i){
    var r=i+1;
    var isTop=r<=3;
    var topBorder=isTop?'border-top:2px solid '+topBorderCol[i]+';':'border-top:0.5px solid var(--bdr);';
    var badgeHtml=isTop
      ?'<div style="position:absolute;top:-1px;left:10px;font-size:10px;font-weight:500;padding:1px 8px;'
        +'border-radius:0 0 6px 6px;background:'+badgeBg[i]+';color:'+badgeTxt[i]+'">'+rankLabel[i]+'</div>'
      :'<div style="position:absolute;top:5px;left:10px;font-size:10px;color:var(--txt2)">#'+r+'</div>';
    var weekTag=f.weekNum&&f.weekNum>=1
      ?'<span style="font-size:9px;color:var(--acc);font-weight:500;white-space:nowrap">('+f.weekNum+'a sett.)</span>'
      :'';
    var occ=f.occ;
    var occW=Math.min(occ,100)+'%';
    return '<div style="width:155px;flex-shrink:0;background:var(--surf);border:0.5px solid var(--bdr);'
      +topBorder+'border-radius:10px;padding:10px 11px;position:relative">'
      +badgeHtml
      +'<div style="font-size:11px;font-weight:600;color:var(--txt);margin-top:'+(isTop?'16':'20')+'px;'
        +'margin-bottom:4px;line-height:1.3;height:30px;overflow:hidden;display:-webkit-box;'
        +'-webkit-line-clamp:2;-webkit-box-orient:vertical">'+f.title+'</div>'
      +weekTag
      +'<div style="font-size:9px;color:var(--txt2);margin-top:6px">spettatori settimana</div>'
      +'<div style="font-size:17px;font-weight:600;color:var(--txt)">'+f.spett+'</div>'
      +'<div style="display:flex;gap:5px;margin-top:7px">'
        +'<div style="flex:1;background:var(--surf2);border-radius:5px;padding:3px 5px;text-align:center">'
          +'<div style="font-size:12px;font-weight:500;color:var(--txt)">'+Math.round(f.inc).toLocaleString('it')+'.-</div>'
          +'<div style="font-size:9px;color:var(--txt2)">incasso</div>'
        +'</div>'
        +'<div style="flex:1;background:var(--surf2);border-radius:5px;padding:3px 5px;text-align:center">'
          +'<div style="font-size:12px;font-weight:500;color:var(--txt)">'+f.shows+'</div>'
          +'<div style="font-size:9px;color:var(--txt2)">spett.li</div>'
        +'</div>'
      +'</div>'
      +'<div style="margin-top:8px">'
        +'<div style="height:3px;background:var(--bdr);border-radius:2px">'
          +'<div style="height:3px;width:'+occW+';background:'+occColor(occ)+';border-radius:2px"></div>'
        +'</div>'
        +'<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--txt2);margin-top:2px">'
          +'<span>occupazione</span>'
          +'<span style="color:'+occColor(occ)+';font-weight:500">'+occ+'%</span>'
        +'</div>'
      +'</div>'
      +'</div>';
  }).join('');

  // Totali cumulati
  var totSpettAll=agg.reduce(function(s,f){return s+f.spett;},0);
  var totIncAll=agg.reduce(function(s,f){return s+f.inc;},0);

  if(lbl)lbl.textContent=_propPrevWeekLabel;
  // Aggiunge totali accanto alla label periodo
  var totEl=document.getElementById('prop-rank-total');
  if(totEl){
    totEl.textContent='Totale: '+totSpettAll.toLocaleString('it')+' spett. · CHF '+Math.round(totIncAll).toLocaleString('it');
  }
  strip.style.display='block';
}
window.propRenderRankStrip=propRenderRankStrip;

// ── Render della griglia proposta ─────────────────────────────────────────
function propRender(){
  propRenderRankStrip();
  if(_propView==='day'){propRenderDay();return;}
  propRenderTable();
}

function propRenderTable(){
  var days=propDates();
  var wl=document.getElementById('prop-week-label');
  if(wl)wl.textContent=propFd(days[0])+' — '+propFd(days[6])+' '+days[6].getFullYear();
  var grid=document.getElementById('prop-grid');
  if(!grid)return;

  var allFilms=S.films.slice().sort(function(a,b){return a.title.localeCompare(b.title,'it');});

  // Griglia: SALE in righe, GIORNI in colonne, FASCE come sotto-righe
  // Struttura: per ogni sala × per ogni fascia → 7 celle giorno
  var html='<table style="border-collapse:collapse;width:100%;min-width:900px;font-size:11px">';

  // Header giorni
  html+='<thead><tr>';
  html+='<th style="width:80px;padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);font-size:10px;color:var(--txt2)">Sala</th>';
  html+='<th style="width:52px;padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);font-size:10px;color:var(--txt2)">Orario</th>';
  days.forEach(function(d,i){
    html+='<th style="padding:5px 6px;background:var(--surf2);border:1px solid var(--bdr);text-align:center;min-width:100px">';
    html+='<div style="font-weight:700;color:var(--txt);font-size:11px">'+DIT_PROP[i]+' '+propFd(d)+'</div>';
    html+='</th>';
  });
  html+='</tr></thead><tbody>';

  // Calcola classifica spettatori per fascia/giorno
  var salaRank=propCalcRank(days);

  // Per ogni sala
  Object.keys(SALE).forEach(function(salaId){
    var sala=SALE[salaId];

    // Prima riga della sala: intestazione con bordo colorato
    FASCE.forEach(function(fascia,fi){
      html+='<tr>';

      // Colonna sala (solo prima fascia, rowspan)
      if(fi===0){
        html+='<td rowspan="'+FASCE.length+'" style="padding:6px;border:1px solid var(--bdr);background:var(--surf2);'
          +'border-left:3px solid '+sala.col+';font-weight:700;color:'+sala.col+';vertical-align:middle;text-align:center;font-size:11px">'
          +sala.n+'</td>';
      }

      // Colonna fascia oraria
      html+='<td style="padding:3px 5px;border:1px solid var(--bdr);background:var(--surf2);color:var(--txt2);'
        +'font-size:10px;font-weight:600;white-space:nowrap;text-align:center">'+fascia+'</td>';

      // 7 celle giorno per questa fascia
      days.forEach(function(d,di){
        // Slot proposta in questa fascia (±30 min)
        var slotInFascia=(_propSlots[di]||[]).filter(function(s){
          if(s.sala!==salaId)return false;
          if(!s.time)return false;
          var sm=parseInt(s.time.split(':')[0])*60+parseInt(s.time.split(':')[1]);
          var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);
          return Math.abs(sm-fm)<=30;
        });

        // Dati box office settimana precedente per questa fascia/sala/giorno
        var boForCell=[];
        if(_boData&&_boData.length){
          // Mappa dayIdx → data settimana precedente
          var prevWeekStart=new Date(days[0]);prevWeekStart.setDate(prevWeekStart.getDate()-7);
          var prevDate=new Date(prevWeekStart);prevDate.setDate(prevDate.getDate()+di);
          var prevDateStr=prevDate.getFullYear()+'-'
            +String(prevDate.getMonth()+1).padStart(2,'0')+'-'
            +String(prevDate.getDate()).padStart(2,'0');
          boForCell=_boData.filter(function(r){
            if(r.date!==prevDateStr)return false;
            if(r.sala!==salaId)return false;
            var rm=parseInt(r.orario.split(':')[0])*60+parseInt(r.orario.split(':')[1]);
            var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);
            return Math.abs(rm-fm)<=30;
          });
        }

        // Anche _propPrevData
        var prevData=[];
        if(!_boData||!_boData.length){
          prevData=propGetPrevData('',di,salaId,fascia);
          prevData=prevData.filter(function(pd){
            var pm=parseInt(pd.time.split(':')[0])*60+parseInt(pd.time.split(':')[1]);
            var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);
            return Math.abs(pm-fm)<=30;
          });
        }

        var hasProp=slotInFascia.length>0;
        var hasBO=boForCell.length>0;
        var hasPrev=prevData.length>0;

        html+='<td style="padding:3px;border:1px solid var(--bdr);vertical-align:top;min-height:54px">';

        // Slot proposta
        slotInFascia.forEach(function(slot){
          var film=allFilms.find(function(f){return f.id===slot.filmId;});
          if(!film)return;
          var slotIdx=(_propSlots[di]||[]).indexOf(slot);
          var wn=filmWeekNum(film);
          var weekTag=wn&&wn>=1?' <span style="font-size:8px;color:'+sala.col+';font-weight:400">('+wn+'a sett)</span>':'';
          html+='<div style="background:'+sala.col+'22;border:1px solid '+sala.col+'66;border-radius:4px;'
            +'padding:3px 5px;margin-bottom:2px;position:relative">';
          html+='<div style="font-weight:700;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:95px;color:var(--txt)">'+film.title+weekTag+'</div>';
          html+='<div style="color:var(--txt2);font-size:9px">'+slot.time+'</div>';
          html+='<button onclick="event.stopPropagation();propRemoveSlot('+di+','+salaId+','+slotIdx+')" style="position:absolute;top:1px;right:2px;background:none;border:none;cursor:pointer;color:var(--txt2);font-size:9px;padding:0 2px">✕</button>';
          html+='</div>';
        });

        // Dati box office settimana precedente (da Excel importato)
        boForCell.forEach(function(r){
          var occ=r.posti?Math.round(r.biglietti/r.posti*100):0;
          var occCol=occ>=65?'#3B6D11':occ>=30?'#BA7517':'#888';
          html+='<div style="background:rgba(240,128,26,.07);border:1px solid rgba(240,128,26,.2);'
            +'border-radius:3px;padding:2px 4px;margin-bottom:2px;font-size:9px">';
          html+='<div style="font-size:8px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:95px">'+r.film.slice(0,22)+'</div>';
          html+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:1px">';
          html+='<span style="color:#185FA5;font-weight:500">👥'+r.biglietti+'</span>';
          html+='<span style="color:#3B6D11;font-weight:500">'+Math.round(r.lordo)+'.-</span>';
          html+='<span style="color:'+occCol+';font-weight:600">'+occ+'%</span>';
          html+='</div></div>';
        });

        // Dati _propPrevData (da incolla testo / Excel)
        prevData.forEach(function(pd){
          var rank=salaRank[fascia]&&salaRank[fascia][di]?salaRank[fascia][di][salaId]:null;
          var rankBadge='';
          if(rank){
            var rankColors=['#f0801a','#555','#777','#999'];
            var rankCol=rankColors[(rank-1)]||'#999';
            rankBadge='<span style="display:inline-flex;align-items:center;justify-content:center;'
              +'width:14px;height:14px;border-radius:50%;background:'+rankCol+';'
              +'color:#fff;font-size:8px;font-weight:800;line-height:1;flex-shrink:0">'
              +rank+'</span> ';
          }
          html+='<div style="background:var(--surf2);border:1px solid var(--bdr);'
            +'border-radius:3px;padding:2px 4px;margin-bottom:2px;font-size:10px">';
          if(pd.filmTitle)html+='<div style="font-size:10px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px">'+String(pd.filmTitle).slice(0,22)+'</div>';
          html+='<div style="display:flex;align-items:center;gap:4px;margin-top:1px;white-space:nowrap">';
          html+=rankBadge;
          if(pd.spett>0)html+='<span style="color:#185FA5;font-weight:500;font-size:10px">👥 '+pd.spett+'</span>';
          if(pd.inc>0)html+='<span style="color:#3B6D11;font-weight:500;margin-left:3px;font-size:10px">'+Math.round(pd.inc)+'.-</span>';
          else html+='<span style="color:#e84a4a;font-size:10px">vuoto</span>';
          html+='</div></div>';
        });

        // Pulsante aggiungi
        html+='<button onclick="propOpenSlotModal('+di+','+salaId+',\''+fascia+'\')" style="width:100%;padding:2px 0;background:transparent;border:1px dashed var(--bdr);border-radius:3px;cursor:pointer;color:var(--txt2);font-size:9px;margin-top:1px">＋</button>';
          +'style="width:100%;padding:2px 0;background:transparent;border:1px dashed var(--bdr);'
          +'border-radius:3px;cursor:pointer;color:var(--txt2);font-size:9px;margin-top:1px">＋</button>';

        html+='</td>';
      });
      html+='</tr>';
    });

    // Riga separatore tra sale
    html+='<tr><td colspan="'+(2+days.length)+'" style="height:4px;background:var(--surf2);border:none"></td></tr>';
  });

  html+='</tbody></table>';
  grid.innerHTML=html;
}

// ── Vista Per Giorno — identica alla griglia programmazione ───────────────
function propRenderDay(){
  var days=propDates();
  var wl=document.getElementById('prop-week-label');
  if(wl)wl.textContent=propFd(days[0])+' — '+propFd(days[6])+' '+days[6].getFullYear();
  var grid=document.getElementById('prop-grid');
  if(!grid)return;

  var allFilms=S.films;
  var saleIds=Object.keys(SALE);
  var salaRank=propCalcRank(days);
  var html=[];

  days.forEach(function(d,di){
    html.push('<div class="day-block">');
    html.push('<div class="day-head">'
      +'<span class="day-name">'+DIT_PROP[di]+'</span>'
      +'<span class="day-date">'+propFd(d)+'</span>'
      +'</div>');

    // Griglia: stessa struttura di rs()
    var cols='32px repeat('+saleIds.length+',1fr)';
    html.push('<div class="slot-grid" style="grid-template-columns:'+cols+'">');

    // Header sale
    html.push('<div class="sg-corner" style="min-height:40px"></div>');
    saleIds.forEach(function(sid){
      var sl=SALE[sid];
      html.push('<div class="sg-sala-head '+sl.hc+'">'
        +'<span class="sdot" style="background:'+sl.col+'"></span>'
        +'<span>'+sl.n+'</span>'
        +'</div>');
    });

    // Righe fasce
    FASCE.forEach(function(fascia){
      var fm=parseInt(fascia.split(':')[0])*60+parseInt(fascia.split(':')[1]);
      html.push('<div class="sg-row-lbl">'+fascia+'</div>');

      saleIds.forEach(function(sid){
        // Spettacoli reali già in programmazione per questa settimana proposta
        var propDs=propDateStr(d);
        var realShows=(S.shows||[]).filter(function(s){
          if(s.day!==propDs||String(s.sala)!==String(sid))return false;
          var sm=parseInt(s.start.split(':')[0])*60+parseInt(s.start.split(':')[1]);
          return Math.abs(sm-fm)<=30;
        });

        // Slot proposta per questa fascia/sala/giorno
        var slotsHere=(_propSlots[di]||[]).filter(function(s){
          if(s.sala!==sid)return false;
          var sm=parseInt(s.time.split(':')[0])*60+parseInt(s.time.split(':')[1]);
          return Math.abs(sm-fm)<=30;
        });

        // Dati storici
        var prevItems=propGetPrevData('',di,sid,fascia).filter(function(pd){
          var pm=parseInt(pd.time.split(':')[0])*60+parseInt(pd.time.split(':')[1]);
          return Math.abs(pm-fm)<=30;
        });

        // Rank per badge
        var rank=salaRank&&salaRank[fascia]&&salaRank[fascia][di]?salaRank[fascia][di][sid]:null;

        html.push('<div class="sg-cell" onclick="propOpenSlotModal('+di+',\''+sid+'\',\''+fascia+'\')">');

        // Spettacoli reali già in programmazione (solo lettura, stile tratteggiato)
        realShows.forEach(function(s){
          var film=allFilms.find(function(f){return f.id===s.filmId;});
          var sl=SALE[sid];
          var wn=filmWeekNum(film);
          var weekTag=wn&&wn>=1?' <span style="font-size:8px;opacity:.6">('+wn+'a sett)</span>':'';
          var isConf=s.propConfirmed;
          var pillStyle=isConf
            ?'border-style:solid;border-color:rgba(59,109,17,.5);background:rgba(59,109,17,.08)'
            :'opacity:.75;border-style:dashed';
          html.push('<div class="show-pill '+sl.sc+'" style="cursor:pointer;position:relative;'+pillStyle+'" '
            +'onclick="event.stopPropagation();propShowAction(\''+s.id+'\',event)" '
            +'title="'+(isConf?'Confermato — clicca per opzioni':'Già in programmazione — clicca per opzioni')+'">'
            +(isConf?'<span style="position:absolute;top:2px;right:3px;font-size:9px;color:#3B6D11">✓</span>':'')
            +'<div class="sp-title">'+(film?film.title:'?')+weekTag+'</div>'
            +'<div class="sp-time">'+s.start+'</div>'
            +'</div>');
        });

        // Slot proposta
        slotsHere.forEach(function(slot){
          var film=allFilms.find(function(f){return f.id===slot.filmId;});
          var slotIdx=(_propSlots[di]||[]).indexOf(slot);
          var wn=filmWeekNum(film);
          var weekTag=wn&&wn>=1?' <span style="font-size:8px;opacity:.7">('+wn+'a sett)</span>':'';
          var sl=SALE[sid];
          html.push('<div class="show-pill '+sl.sc+'" style="position:relative" onclick="event.stopPropagation()">'
            +'<button class="sp-del" onclick="event.stopPropagation();propRemoveSlot('+di+',\''+sid+'\','+slotIdx+')">×</button>'
            +'<div class="sp-title">'+( film?film.title:'?')+weekTag+'</div>'
            +'<div class="sp-time">'+slot.time+'</div>'
            +'</div>');
        });

        // Dati storici settimana precedente
        prevItems.forEach(function(pd){
          var rankBadge='';
          if(rank){
            var rankColors=['#f0801a','#555','#777','#999'];
            rankBadge='<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:'+rankColors[rank-1]+';color:#fff;font-size:8px;font-weight:800;margin-right:2px">'+rank+'</span>';
          }
          html.push('<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:4px;padding:2px 5px;margin-bottom:2px;font-size:10px">'
            +'<div style="font-size:10px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+String(pd.filmTitle||'').slice(0,20)+'</div>'
            +'<div style="display:flex;align-items:center;white-space:nowrap;margin-top:1px">'+rankBadge
            +(pd.spett>0?'<span style="color:#185FA5;font-weight:500;font-size:10px">👥 '+pd.spett+'</span>':'')
            +(pd.inc>0?'<span style="color:#3B6D11;font-weight:500;margin-left:3px;font-size:10px">'+Math.round(pd.inc)+'.-</span>':'')
            +'</div></div>');
        });

        if(!slotsHere.length&&!realShows.length){
          html.push('<div class="add-slot">＋</div>');
        } else if(!slotsHere.length){
          html.push('<div class="add-slot" style="font-size:9px">＋ aggiungi</div>');
        }

        html.push('</div>'); // sg-cell
      });
    });

    html.push('</div>'); // slot-grid
    html.push('</div>'); // day-block
  });

  grid.innerHTML=html.join('');
}
window.propRenderDay=propRenderDay;

// ── Vista corrente proposta ('table' o 'day') ─────────────────────────────
var _propView='day';
function setPropView(v){
  _propView=v;
  var bt=document.getElementById('prop-view-table');
  var bd=document.getElementById('prop-view-day');
  if(bt){bt.className=v==='table'?'btn bs':'btn bg bs';bt.style=v==='table'?'background:var(--acc);color:#000;border-color:var(--acc)':'';}
  if(bd){bd.className=v==='day'?'btn bs':'btn bg bs';bd.style=v==='day'?'background:var(--acc);color:#000;border-color:var(--acc)':'';}
  propRender();
}
window.setPropView=setPropView;

// ── Overlay dati storici in programmazione ────────────────────────────────
// Costruisce un chip piccolo con i dati prevData per uno spettacolo in programmazione
function buildPropOverlayChip(filmId, dayIdx, salaId, time){
  if(!_propPrevData||!Object.keys(_propPrevData).length)return '';
  // Controllo settimana valida (≤7 giorni dopo fine dati)
  if(_propPrevWeekLabel){
    try{
      var MESI_C={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12};
      var dts=_propPrevWeekLabel.match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/g)||[];
      if(dts.length){
        var dm=dts[dts.length-1].match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/);
        if(dm){var m=MESI_C[(dm[2]||'').toLowerCase()];if(m){
          var de=new Date(parseInt(dm[3]),m-1,parseInt(dm[1]));de.setHours(0,0,0,0);
          var wsDate=new Date(S.ws);wsDate.setHours(0,0,0,0);
          var diff=(wsDate-de)/(24*60*60*1000);
          if(diff<0||diff>7)return '';
        }}
      }
    }catch(e){}
  }

  // Film corrente (per confronto titolo)
  var currFilm=S.films.find(function(f){return f.id===filmId;});
  var currKey=currFilm?(currFilm.title.toLowerCase().replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim()):'';

  // Cerca in TUTTI i film dei prevData per dayIdx + sala + orario (±45 min)
  var salaN=((SALE[salaId]||{}).n||'').toLowerCase();
  var tm=parseInt((time||'0:0').split(':')[0])*60+parseInt((time||'0:0').split(':')[1]||0);
  var bestMatch=null;
  var bestMatchKey='';
  var bestDiff=999;

  Object.keys(_propPrevData).forEach(function(fk){
    var fd=_propPrevData[fk];
    if(!fd||!fd[dayIdx])return;
    fd[dayIdx].forEach(function(pd){
      var pSala=(pd.sala||'').toLowerCase();
      var salaOk=!salaN||pSala===salaN||pSala.includes(salaN)||salaN.includes(pSala);
      if(!salaOk)return;
      var pm=parseInt((pd.time||'0:0').split(':')[0])*60+parseInt((pd.time||'0:0').split(':')[1]||0);
      var tdiff=Math.abs(pm-tm);
      if(tdiff<=45&&tdiff<bestDiff){
        bestDiff=tdiff;
        bestMatch=pd;
        bestMatchKey=fk;
      }
    });
  });

  if(!bestMatch)return '';

  var spett=bestMatch.spett||0;
  var inc=bestMatch.inc||0;

  // Titolo film precedente — mostra solo se diverso dal film corrente
  var isSameFilm=currKey&&bestMatchKey&&currKey===bestMatchKey;
  var prevTitle='';
  if(!isSameFilm&&bestMatchKey){
    // Trova titolo originale (non normalizzato) dal primo record
    var fd2=_propPrevData[bestMatchKey];
    prevTitle=fd2&&fd2[dayIdx]&&fd2[dayIdx][0]?fd2[dayIdx][0].filmTitle||bestMatchKey:bestMatchKey;
    // Capitalizza prima lettera
    prevTitle=prevTitle.charAt(0).toUpperCase()+prevTitle.slice(1);
  }

  // Rank tra tutte le sale per questo dayIdx/orario
  var rankColors=['#f0801a','#888780','#997A3D','#999'];
  var rankBadge='';
  try{
    var allVals=Object.keys(SALE).map(function(sid2){
      var sn=((SALE[sid2]||{}).n||'').toLowerCase();
      var best2=null;var bd2=999;
      Object.keys(_propPrevData).forEach(function(fk2){
        var fd3=_propPrevData[fk2];
        if(!fd3||!fd3[dayIdx])return;
        fd3[dayIdx].forEach(function(pd2){
          var pS=(pd2.sala||'').toLowerCase();
          var sok=!sn||pS===sn||pS.includes(sn)||sn.includes(pS);
          if(!sok)return;
          var pm2=parseInt((pd2.time||'0:0').split(':')[0])*60+parseInt((pd2.time||'0:0').split(':')[1]||0);
          var td2=Math.abs(pm2-tm);
          if(td2<=45&&td2<bd2){bd2=td2;best2=pd2;}
        });
      });
      return best2?best2.spett||0:0;
    });
    var rank=allVals.filter(function(v){return v>spett;}).length+1;
    var validSale=allVals.filter(function(v){return v>0;}).length;
    if(validSale>1&&rank<=4){
      rankBadge='<span style="display:inline-flex;align-items:center;justify-content:center;min-width:13px;height:13px;border-radius:50%;background:'+rankColors[rank-1]+';color:#fff;font-size:8px;font-weight:800;margin-right:2px;padding:0 2px">'+rank+'</span>';
    }
  }catch(e){}

  return '<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:3px;padding:2px 5px;margin-top:3px;display:flex;flex-direction:column;gap:1px;font-size:10px">'
    +(prevTitle?'<div style="color:var(--txt2);font-style:italic;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px" title="'+prevTitle+'">← '+prevTitle+'</div>':'')
    +'<div style="display:flex;align-items:center;gap:3px">'
      +rankBadge
      +(spett>0?'<span style="color:#185FA5;font-weight:500">👥 '+spett+'</span>':'<span style="color:var(--txt2)">👥 0</span>')
      +(inc>0?'<span style="color:#3B6D11;font-weight:500;margin-left:2px">'+Math.round(inc)+'.-</span>':'')
    +'</div>'
    +'</div>';
}
window.buildPropOverlayChip=buildPropOverlayChip;

// Toggle overlay proposta su un giorno in programmazione (futuro: toggle CSS class)
function togglePropOverlay(btn, ds){
  var block=btn.closest('.day-block');
  if(!block)return;
  var active=block.classList.toggle('prop-overlay-on');
  btn.style.background=active?'var(--acc)':'';
  btn.style.color=active?'#000':'';
  // Ri-renderizza solo se non già presente il chip (già inserito al render)
  // Il CSS .day-block:not(.prop-overlay-on) .prop-overlay-chip { display:none }
  // è già sufficiente per mostrare/nascondere
}
window.togglePropOverlay=togglePropOverlay;

// ── Dati settimana precedente per una cella ───────────────────────────────
function propGetPrevData(filmTitle,dayIdx,salaId,time){
  if(!Object.keys(_propPrevData).length)return[];

  // Verifica che la settimana proposta sia quella immediatamente successiva ai dati Excel
  // _propPrevWeekLabel contiene la data di inizio dati, es "01 Aprile 2026"
  // La settimana proposta deve iniziare entro 14 giorni dalla fine dei dati
  if(_propPrevWeekLabel){
    try{
      var days=propDates();
      var propStart=days[0]; // giovedì settimana proposta
      // Estrai la prima data dal label (formato "01 Aprile 2026 — 08 Aprile 2026")
      var MESI={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12};
      // Cerca l'ultima data nel label (fine settimana dati)
      var dates=_propPrevWeekLabel.match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/g)||[];
      if(dates.length){
        var lastDateStr=dates[dates.length-1];
        var dm=lastDateStr.match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/);
        if(dm){
          var month=MESI[(dm[2]||'').toLowerCase()];
          if(month){
            var dataEnd=new Date(parseInt(dm[3]),month-1,parseInt(dm[1]));
            dataEnd.setHours(0,0,0,0);
            var diffDays=(propStart-dataEnd)/(24*60*60*1000);
            // Mostra solo se la settimana proposta inizia entro 9 giorni dalla fine dei dati
            // (es. dati finiscono mer 08/04, proposta inizia gio 09/04 → diff = 1 giorno → OK)
            // Se diff > 9 significa che siamo 2+ settimane avanti → non mostrare
            if(diffDays<0||diffDays>7)return[];
          }
        }
      }
    }catch(e){}
  }

  var salaN=SALE[salaId]?SALE[salaId].n:'';
  var results=[];

  // Cerca per titolo film se specificato
  if(filmTitle){
    var fk=filmTitle.toLowerCase().trim();
    var fd=_propPrevData[fk];
    if(fd&&fd[dayIdx]){
      fd[dayIdx].forEach(pd=>{
        if(!salaN||pd.sala.toLowerCase().includes(salaN.toLowerCase())||salaN.toLowerCase().includes(pd.sala.toLowerCase())){
          results.push({...pd,filmTitle:filmTitle});
        }
      });
    }
  }

  // Se nessun film specifico, mostra tutti i dati di quella sala/giorno
  if(!filmTitle){
    Object.keys(_propPrevData).forEach(fk=>{
      var fd=_propPrevData[fk];
      if(fd&&fd[dayIdx]){
        fd[dayIdx].forEach(pd=>{
          if(!salaN||pd.sala.toLowerCase().includes(salaN.toLowerCase())||salaN.toLowerCase().includes(pd.sala.toLowerCase())){
            results.push({...pd,filmTitle:fk});
          }
        });
      }
    });
  }

  return results;
}

// ── Helper: numero settimana in programmazione per un film ────────────────
function filmWeekNum(film){
  if(!film.release)return null;
  var releaseDate=new Date(film.release+'T12:00:00');
  var dow=releaseDate.getDay(); // 0=Dom,1=Lun,2=Mar,3=Mer,4=Gio,5=Ven,6=Sab
  // Lun(1),Mar(2),Mer(3) = anteprima → 1a sett inizia il giovedì successivo
  // Gio(4),Ven(5),Sab(6),Dom(0) = già 1a sett → giovedì precedente o uguale
  var daysAdj;
  if(dow>=1&&dow<=3){
    daysAdj=4-dow; // avanza al giovedì successivo
  } else {
    daysAdj=dow===4?0:-(dow===0?3:dow-4); // torna al giovedì precedente
  }
  var firstThursday=new Date(releaseDate);
  firstThursday.setDate(firstThursday.getDate()+daysAdj);
  firstThursday.setHours(0,0,0,0);
  // Giovedì della settimana proposta
  var days=propDates();
  var propThursday=new Date(days[0]);
  propThursday.setHours(0,0,0,0);
  var diffWeeks=Math.round((propThursday-firstThursday)/(7*24*60*60*1000));
  return diffWeeks+1;
}
window.filmWeekNum=filmWeekNum;

// ── Modal aggiunta slot ───────────────────────────────────────────────────
function propOpenSlotModal(dayIdx,salaId,fasciaPreset){
  _propEditDay={dayIdx,salaId};
  var days=propDates();
  var dd=document.getElementById('prop-slot-day');
  if(dd)dd.textContent=DIT_PROP[dayIdx]+' '+propFd(days[dayIdx]);
  // Popola select film — solo film in programmazione questa settimana, ordinati come in programmazione
  var sel=document.getElementById('prop-slot-film');
  if(sel){
    var propWd=propDates().map(function(d){
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    });
    var today=propWd[0]; // giovedì settimana proposta
    // Film con spettacoli nella settimana proposta
    var filmIdsInWeek=new Set(S.shows.filter(function(s){return propWd.includes(s.day);}).map(function(s){return s.filmId;}));
    // Tutti i film (inclusi quelli senza spettacoli ma non scaduti)
    var allActive=S.films.filter(function(f){
      var st=filmStatus(f);
      return st!=='exp'; // escludi scaduti
    });
    // Separa: novità (release in questa settimana), in programmazione, prossimamente
    var novita=allActive.filter(function(f){return f.release&&f.release>=propWd[0]&&f.release<=propWd[6];})
      .sort(function(a,b){return(a.release||'').localeCompare(b.release||'');});
    var inProg=allActive.filter(function(f){
      return filmIdsInWeek.has(f.id)&&!(f.release&&f.release>=propWd[0]&&f.release<=propWd[6]);
    }).sort(function(a,b){return a.title.localeCompare(b.title,'it');});
    var altri=allActive.filter(function(f){
      return !filmIdsInWeek.has(f.id)&&!(f.release&&f.release>=propWd[0]&&f.release<=propWd[6]);
    }).sort(function(a,b){return a.title.localeCompare(b.title,'it');});

    sel.innerHTML='<option value="">— Seleziona film —</option>';

    function addGroup(label,films){
      if(!films.length)return;
      sel.innerHTML+='<optgroup label="'+label+'">';
      films.forEach(function(f){
        var wn=filmWeekNum(f);
        var weekLabel=wn&&wn>=1?' ('+wn+'a sett)':'';
        sel.innerHTML+='<option value="'+f.id+'">'+f.title+weekLabel+'</option>';
      });
      sel.innerHTML+='</optgroup>';
    }
    addGroup('✨ Novità',novita);
    addGroup('🎬 In programmazione',inProg);
    addGroup('📅 Altri film',altri);
  }
  // Sala pre-selezionata
  var ss=document.getElementById('prop-slot-sala');
  if(ss)ss.value=salaId;
  // Orario default
  var st=document.getElementById('prop-slot-time');
  if(st)st.value=fasciaPreset||'20:30';
  syncPropFasce();
  document.getElementById('ovPropSlot').classList.add('on');
}
window.propOpenSlotModal=propOpenSlotModal;

// ── Fascia oraria nel modal proposta ──────────────────────────────────────
function setPropFascia(t){
  var el=document.getElementById('prop-slot-time');
  if(el)el.value=t;
  syncPropFasce();
}
window.setPropFascia=setPropFascia;

function syncPropFasce(){
  var t=(document.getElementById('prop-slot-time')||{}).value||'';
  var tm=t?parseInt(t.split(':')[0])*60+parseInt(t.split(':')[1]):null;
  document.querySelectorAll('#ovPropSlot .fascia-btn').forEach(function(btn){
    var ft=btn.textContent.trim();
    var fm=parseInt(ft.split(':')[0])*60+parseInt(ft.split(':')[1]);
    btn.classList.toggle('active',tm!==null&&Math.abs(tm-fm)<=30);
  });
}
window.syncPropFasce=syncPropFasce;

function propAddSlot(){
  if(!_propEditDay)return;
  var filmId=document.getElementById('prop-slot-film').value;
  var sala=document.getElementById('prop-slot-sala').value;
  var time=document.getElementById('prop-slot-time').value;
  if(!filmId||!time){toast('Seleziona film e orario','err');return;}
  var di=_propEditDay.dayIdx;
  if(!_propSlots[di])_propSlots[di]=[];
  _propSlots[di].push({filmId,sala,time});
  co('ovPropSlot');
  propSaveFirestore();
  propRender();
}
window.propAddSlot=propAddSlot;

function propRemoveSlot(dayIdx,salaId,idx){
  if(!_propSlots[dayIdx])return;
  // idx è l'indice nell'array completo _propSlots[dayIdx]
  var slot=_propSlots[dayIdx][idx];
  if(!slot)return;
  _propSlots[dayIdx].splice(idx,1);
  propSaveLS();
  propSaveFirestore();
  propSaveFirestore();
  propRender();
}
window.propRemoveSlot=propRemoveSlot;

// ── Parse tabella settimana precedente ───────────────────────────────────
function propOpenPaste(){
  document.getElementById('prop-paste-area').value='';
  document.getElementById('prop-parse-status').textContent='';
  document.getElementById('ovPropPaste').classList.add('on');
}
window.propOpenPaste=propOpenPaste;

function propParsePaste(){
  var text=document.getElementById('prop-paste-area').value.trim();
  if(!text||text.length<50){
    document.getElementById('prop-parse-status').textContent='⚠ Testo troppo breve o vuoto';
    return;
  }

  var data={};
  var lines=text.split('\n').map(l=>l.trim()).filter(l=>l.length>0);

  // Rileva intestazione con date (es. "26/03/2026")
  var dateLineIdx=-1;
  var weekDates=[];
  for(var i=0;i<lines.length;i++){
    var dates=lines[i].match(/\d{2}\/\d{2}\/\d{4}/g);
    if(dates&&dates.length>=5){
      dateLineIdx=i;
      weekDates=dates.slice(0,7); // max 7 giorni
      break;
    }
  }

  if(!weekDates.length){
    document.getElementById('prop-parse-status').textContent='⚠ Non riesco a trovare la riga con le date (es. 26/03/2026)';
    return;
  }

  // Mappa giorno → indice colonna (0=gio, 1=ven, ... 6=mer)
  // Le date nel report sono già in ordine Gio→Mer
  var dayMap={}; // dateStr → colIdx
  weekDates.forEach((ds,i)=>{
    var parts=ds.split('/');
    var iso=`${parts[2]}-${parts[1]}-${parts[0]}`;
    dayMap[iso]=i;
  });

  // Parso blocco per blocco: ogni film ha una sezione con nome e poi righe con orari
  var currentFilm=null;
  var filmDataBuffer=[];

  function flushFilm(){
    if(!currentFilm||!filmDataBuffer.length)return;
    var key=currentFilm.toLowerCase().trim();
    if(!data[key])data[key]={};
    filmDataBuffer.forEach(entry=>{
      if(!data[key][entry.dayIdx])data[key][entry.dayIdx]=[];
      // Evita duplicati
      var exists=data[key][entry.dayIdx].find(e=>e.time===entry.time&&e.sala===entry.sala);
      if(!exists)data[key][entry.dayIdx].push(entry);
    });
    filmDataBuffer=[];
  }

  // Pattern orario: es. "20:30" o "18:00"
  var timeRe=/\b(\d{1,2}:\d{2})\b/;
  // Pattern sala: es. "(CIAK)" o "(TEATRO" o "(1908)" o "(MIGNON)"
  var salaRe=/\((TEATRO|CIAK|1908|MIGNON)[^)]*\)/i;
  // Pattern incasso: numero decimale es. "152.0" o "22.8"
  var incRe=/^(\d+\.\d+|\d+)$/;

  for(var li=dateLineIdx+2;li<lines.length;li++){
    var line=lines[li];

    // Rileva nuova sezione film: riga con solo il titolo (o "Spett.: N Inc.: N")
    if(line.match(/Spett\.\s*:\s*\d+/)&&line.match(/Inc\.\s*:\s*[\d.]+/)){
      // Riga totali film — ignora
      continue;
    }

    // Riga con orari: contiene almeno un orario e una sala
    if(timeRe.test(line)&&salaRe.test(line)){
      // Questa riga appartiene al film corrente
      // Divide in token
      var tokens=line.split(/\s+/);
      var dayEntries=[];

      // Cerca sequenze: orario + (SALA) + incasso + spettatori
      var ti=0;
      while(ti<tokens.length){
        var tmatch=tokens[ti]&&tokens[ti].match(/^(\d{1,2}:\d{2})$/);
        if(tmatch){
          var time=tmatch[1];
          var sala='';var inc=0;var spett=0;
          // Cerca sala nei prossimi token
          for(var tj=ti+1;tj<Math.min(ti+4,tokens.length);tj++){
            var sm=tokens[tj].match(/^\((TEATRO|CIAK|1908|MIGNON)/i);
            if(sm){sala=sm[1].toUpperCase();break;}
          }
          // Cerca incasso e spettatori
          var numCount=0;
          for(var tj=ti+1;tj<Math.min(ti+8,tokens.length);tj++){
            if(tokens[tj].match(/^\d+\.?\d*$/)&&!tokens[tj].match(/^\d{4}$/)){
              if(numCount===0)inc=parseFloat(tokens[tj]);
              else if(numCount===1)spett=parseInt(tokens[tj]);
              numCount++;
              if(numCount>=2)break;
            }
          }
          if(sala){dayEntries.push({time,sala,inc,spett});}
          ti++;
        } else {
          ti++;
        }
      }

      // Associa ogni entry al giorno corretto
      // La riga ha gli orari in ordine Gio→Mer, una colonna per giorno
      // Ogni colonna ha: orario (sala) incasso spett — ma alcune colonne possono essere vuote
      if(currentFilm&&dayEntries.length){
        // Strategia: distribuisce le entry sulle date della settimana
        // cercando la data nel contesto della riga precedente o usando l'ordine
        dayEntries.forEach((entry,ei)=>{
          // Per semplicità: usa l'indice day dalla posizione nella riga
          // (funziona perché le colonne sono sempre Gio→Mer)
          var dayIdx=ei; // approssimazione — verrà raffinata
          filmDataBuffer.push({...entry,dayIdx});
        });
      }
      continue;
    }

    // Rileva titolo film: riga senza orari che non è una riga totali
    if(!timeRe.test(line)&&!line.match(/^[-\s]+$/)&&line.length>3){
      // Controlla se è un titolo (non una riga di numeri o intestazioni)
      if(!line.match(/^[\d\s.,-]+$/)&&!line.match(/^(Orario|Inc\.|Spett\.|Totale|Copyright|Riepilogo|Week|Film)/i)){
        // Nuova sezione film
        if(currentFilm)flushFilm();
        // Rimuove "(TEATRO new)" e altri artefatti
        currentFilm=line.replace(/\([^)]+\)/g,'').replace(/new$/i,'').trim();
        filmDataBuffer=[];
      }
    }
  }
  flushFilm();

  // Secondo parsing più robusto: cerca pattern "FILMNAME\nOrario1 (SALA) inc spett Orario2..."
  // Riparse il testo cercando blocchi film
  _propPrevData=propParseTable(text);

  var filmCount=Object.keys(_propPrevData).length;
  var entryCount=Object.values(_propPrevData).reduce(function(sum,days){
    return sum+Object.values(days).reduce(function(s,arr){return s+arr.length;},0);
  },0);

  _propPrevWeekLabel=weekDates.length?(weekDates[0]+' — '+(weekDates[6]||weekDates[weekDates.length-1])):'';
  var prevLabel=document.getElementById('prop-prev-label');
  if(prevLabel)prevLabel.textContent=filmCount+' film · '+entryCount+' spettacoli · '+_propPrevWeekLabel;

  // ── Avanza _propWeek alla settimana successiva ai dati importati ──────────
  // Estrae l'ultima data del label (fine settimana importata) e imposta
  // _propWeek al giovedì della settimana successiva
  if(filmCount>0&&_propPrevWeekLabel){
    try{
      var MESI_P={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,
        luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12};
      var allDates=_propPrevWeekLabel.match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/g)||[];
      if(allDates.length){
        // Prende l'ultima data del label = fine settimana importata
        var lastDm=(allDates[allDates.length-1]).match(/(\d{1,2})\s+([A-Za-zàèìòù]+)\s+(\d{4})/);
        if(lastDm){
          var m=MESI_P[(lastDm[2]||'').toLowerCase()];
          if(m){
            var lastDay=new Date(parseInt(lastDm[3]),m-1,parseInt(lastDm[1]));
            // Giovedì della settimana successiva = lastDay + (4 - getDay() + 7) % 7 + 1 ... più semplice:
            var nextThursday=new Date(lastDay);
            nextThursday.setDate(lastDay.getDate()+1); // giorno dopo la fine settimana (es. mercoledì+1=giovedì)
            // Assicura che sia un giovedì
            while(nextThursday.getDay()!==4) nextThursday.setDate(nextThursday.getDate()+1);
            _propWeek=nextThursday;
          }
        }
      }
    }catch(e){}
  }

  var statusEl=document.getElementById('prop-parse-status');
  if(filmCount>0){
    statusEl.textContent='✓ Trovati '+filmCount+' film con '+entryCount+' spettacoli';
    statusEl.style.color='var(--acc)';
  } else {
    statusEl.textContent='⚠ Nessun dato estratto — verifica il formato del testo';
    statusEl.style.color='#e84a4a';
  }

  co('ovPropPaste');
  propSaveLS();
  propSaveFirestore();
  propRender();
}
window.propParsePaste=propParsePaste;

// ── Parser robusto della tabella ─────────────────────────────────────────
function propParseTable(text){
  var result={};
  var lines=text.split('\n').map(function(l){return l.trim();}).filter(Boolean);
  if(!lines.length)return result;

  // ── Rileva formato Excel TSV ProCinema ──────────────────────────────────
  // Header atteso: Data\tArea\tCinema\tSala\tTitolo Film\tDistributore\tOrario\t...
  var firstLine=lines[0];
  var isExcel=firstLine.includes('\t')&&(
    firstLine.toLowerCase().includes('titolo') ||
    firstLine.toLowerCase().includes('sala') ||
    firstLine.toLowerCase().includes('orario')
  );

  if(isExcel){
    // Parser formato Excel TSV
    var headers=firstLine.split('\t').map(function(h){return h.trim().toLowerCase();});
    var iData=headers.indexOf('data');
    var iSala=headers.findIndex(function(h){return h.includes('sala');});
    var iTitolo=headers.findIndex(function(h){return h.includes('titolo');});
    var iOrario=headers.findIndex(function(h){return h.includes('orario');});
    var iSpett=headers.findIndex(function(h){return h.includes('biglietti')&&!h.includes('media');});
    var iOcc=headers.findIndex(function(h){return h.includes('occupazione')||h.includes('%');});
    var iLordo=headers.findIndex(function(h){return h.includes('lordo')&&!h.includes('media');});

    // Mappa nome mese italiano → numero
    var MESI={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,
      luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12};

    // CineManager: settimana inizia giovedì (0=Gio,1=Ven,2=Sab,3=Dom,4=Lun,5=Mar,6=Mer)
    // getDay(): 0=Dom,1=Lun,2=Mar,3=Mer,4=Gio,5=Ven,6=Sab
    var DOW_TO_IDX={4:0,5:1,6:2,0:3,1:4,2:5,3:6};

    function parseDateToIdx(rawDate){
      var dm=rawDate.match(/(\d{1,2})\s+([A-Za-zèàò]+)\s+(\d{4})/);
      if(!dm)return null;
      var month=MESI[(dm[2]||'').toLowerCase()];
      if(!month)return null;
      var d=new Date(parseInt(dm[3]),month-1,parseInt(dm[1]));
      return DOW_TO_IDX[d.getDay()];
    }
    function normSala(s){
      s=(s||'').toUpperCase().replace(/\s*NEW\s*/i,'').trim();
      if(s.includes('TEATRO'))return 'TEATRO';
      if(s.includes('CIAK'))return 'CIAK';
      if(s.includes('1908'))return '1908';
      if(s.includes('MIGNON'))return 'MIGNON';
      return s;
    }

    for(var li=1;li<lines.length;li++){
      var cols=lines[li].split('\t');
      if(cols.length<6)continue;
      var rawDate=(cols[iData]||'').trim();
      var dayIdx=parseDateToIdx(rawDate);
      if(dayIdx===null||dayIdx===undefined)continue;

      var titolo=(cols[iTitolo]||'').trim();
      var sala=normSala(cols[iSala]||'');
      var orario=(cols[iOrario]||'').trim();
      var spett=parseInt(cols[iSpett]||'0')||0;
      var occ=parseFloat(cols[iOcc]||'0')||0;
      // Lordo: rimuove "CHF" e spazi
      var lordo=parseFloat((cols[iLordo]||'0').replace(/CHF|chf|\s/g,'').replace(',','.'))||0;

      if(!titolo||!orario)continue;

      var key=titolo.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
      if(!result[key])result[key]={};
      if(!result[key][dayIdx])result[key][dayIdx]=[];
      result[key][dayIdx].push({
        time:orario,sala:sala,
        spett:spett,occ:occ,lordo:lordo,
        inc:lordo, // usa lordo come incasso per compatibilità
        filmTitle:titolo  // titolo originale per visualizzazione nel chip
      });
    }

    return result;
  }

  // ── Parser originale formato PDF ProCinema ───────────────────────────────
  var result2={};
  // Step 1: trova riga con 7 date gio-mer
  var weekDates=[];
  var dateLineIdx=-1;
  for(var i=0;i<lines.length;i++){
    var dm2=lines[i].match(/\d{2}\/\d{2}\/\d{4}/g);
    if(dm2&&dm2.length>=5){weekDates=dm2.slice(0,7);dateLineIdx=i;break;}
  }
  if(!weekDates.length)return result2;

  var currentFilm='';
  var i=dateLineIdx+1;

  while(i<lines.length){
    var line=lines[i];
    if(!line||line.length<2){i++;continue;}
    if(line.match(/^(Orario|Inc\.|Spett\.|Film\s|Totale|Copyright|Riepilogo|Week|New\s)/i)){i++;continue;}
    if(line.match(/^\d{2}\/\d{2}\/\d{4}/)){i++;continue;}
    var headerMatch=line.match(/^(.+?)\s+Spett\.\s*:\s*\d+\s+Inc\.\s*:\s*[\d.]+\s*$/);
    if(headerMatch){currentFilm=headerMatch[1].trim();i++;continue;}
    if(line.match(/^\s*Spett\.\s*:/)){
      if(i>0&&lines[i-1]&&!lines[i-1].match(/\d{1,2}:\d{2}/)&&lines[i-1].length>2){
        currentFilm=lines[i-1].replace(/\([^)]*\)/g,'').trim();
      }
      i++;continue;
    }
    if(line.match(/\d{1,2}:\d{2}/)&&line.match(/\((TEATRO|CIAK|1908|MIGNON)/i)){
      if(!currentFilm){i++;continue;}
      var key=currentFilm.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
      if(!result2[key])result2[key]={};
      var cellsOnLine=[];
      var m;
      var singleRe=/(\d{1,2}:\d{2})\s*\(([^)]+)\)\s*([\d.]+)\s+(\d+)/gi;
      while((m=singleRe.exec(line))!==null){
        cellsOnLine.push({pos:m.index,time:m[1],sala:m[2].replace(/\s*new\s*/i,'').toUpperCase().trim(),inc:parseFloat(m[3]),spett:parseInt(m[4])});
      }
      if(cellsOnLine.length>0){
        var lineLen=Math.max(line.length,1);
        cellsOnLine.forEach(function(cell){
          var dayIdx=Math.min(6,Math.floor((cell.pos/lineLen)*7));
          if(!result2[key][dayIdx])result2[key][dayIdx]=[];
          result2[key][dayIdx].push({time:cell.time,sala:cell.sala,inc:cell.inc,spett:cell.spett});
        });
      } else {
        var multiLine=line;
        var j=i+1;
        while(j<lines.length&&j<i+4){
          var nl=lines[j];
          if(!nl||nl.match(/Spett\.|Totale|Copyright/i))break;
          if(!nl.match(/\d{1,2}:\d{2}/)&&!nl.match(/\(\s*(TEATRO|CIAK|1908|MIGNON)/i)&&nl.match(/^[\d.]+\s+\d+/)){
            multiLine+=' '+nl;j++;
          } else if(nl.match(/\d{1,2}:\d{2}/)){break;}
          else break;
        }
        var mRe=/(\d{1,2}:\d{2})\s*\(([^)]+)\)\s*([\d.]+)\s+(\d+)/gi;
        while((m=mRe.exec(multiLine))!==null){
          var sala=m[2].replace(/\s*new\s*/i,'').toUpperCase().trim();
          var posRatio=m.index/Math.max(multiLine.length,1);
          var dayIdx=Math.min(6,Math.floor(posRatio*7));
          if(!result2[key][dayIdx])result2[key][dayIdx]=[];
          result2[key][dayIdx].push({time:m[1],sala:sala,inc:parseFloat(m[3]),spett:parseInt(m[4])});
        }
      }
      i++;continue;
    }
    if(line.length>3&&!line.match(/^[\d\s.,:/-]+$/)&&!line.match(/\d{1,2}:\d{2}/)&&!line.match(/^(Totale|Riepilogo|Total)/i)){
      var next1=lines[i+1]||'';
      var next2=lines[i+2]||'';
      if(next1.match(/Spett\./)||next2.match(/Spett\./)||next1.match(/\d{1,2}:\d{2}/)||next2.match(/\d{1,2}:\d{2}/)){
        currentFilm=line.replace(/\([^)]*\)/g,'').replace(/Spett\..*$/,'').trim();
      }
    }
    i++;
  }
  return result2;
}
window.propParseTable=propParseTable;

// ── Carica dati settimana precedente da file Excel (.xlsx) ──────────────
function propLoadExcel(input){
  var file=input.files&&input.files[0];
  if(!file){return;}
  var XLSX=window.XLSX;
  if(!XLSX){toast('Libreria XLSX non disponibile — ricarica la pagina','err');input.value='';return;}
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var buf=new Uint8Array(e.target.result);
      var wb=XLSX.read(buf,{type:'array'});
      // Usa il primo foglio (RiepilogoOccupancy)
      var wsName=wb.SheetNames[0];
      var ws=wb.Sheets[wsName];
      // Converti in array di array con raw:false per avere stringhe formattate
      var rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
      if(!rows.length){toast('File Excel vuoto o non leggibile','err');input.value='';return;}
      // Converti in TSV (stesso formato del parser TSV già esistente)
      var tsv=rows.map(function(row){
        return row.map(function(cell){
          return cell===null||cell===undefined?'':String(cell);
        }).join('\t');
      }).join('\n');
      // Applica il parser
      var parsed=propParseTable(tsv);
      var filmCount=Object.keys(parsed).length;
      if(!filmCount){
        toast('Nessun dato trovato nel file — verifica che sia il report Riepilogo Occupancy','err');
        input.value='';return;
      }
      _propPrevData=parsed;
      // Calcola label settimana dal file
      var firstDataRow=rows[1]||[];
      var lastDataRow=rows[rows.length-1]||[];
      var d1=String(firstDataRow[0]||'').trim();
      var d2=String(lastDataRow[0]||'').trim();
      _propPrevWeekLabel=d1+(d2&&d2!==d1?' — '+d2:'');
      var lbl=document.getElementById('prop-prev-label');
      if(lbl)lbl.textContent=_propPrevWeekLabel+' ('+filmCount+' film)';
      propSaveLS();
  propSaveFirestore();
      propRender&&propRender();
      toast('Excel caricato: '+filmCount+' film, '+rows.length+' righe','ok');
    }catch(err){
      toast('Errore lettura Excel: '+err.message,'err');
    }
    input.value=''; // reset per permettere ricaricamento stesso file
  };
  reader.readAsArrayBuffer(file);
}
window.propLoadExcel=propLoadExcel;

function propShowExcelInfo(){
  document.getElementById('ovPropExcelInfo').classList.add('on');
}
window.propShowExcelInfo=propShowExcelInfo;

// ── Maccsbox CSV — tutti i cinema Ticino ──────────────────────────────────
var _mboxData={}; // {titleLower: {adm, shows, cinemas:Set}}
var _mboxLabel='';

function propLoadMaccsbox(input){
  var file=input&&input.files&&input.files[0];
  if(!file){return;}
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var text=e.target.result;
      // Parse CSV
      var lines=text.split('\n').map(function(l){return l.trim();}).filter(Boolean);
      if(!lines.length){toast('CSV vuoto','err');input.value='';return;}
      // Header row — rimuovi BOM
      var hdr=lines[0].replace(/^\uFEFF/,'').split(',').map(function(h){return h.trim().replace(/^"|"$/g,'');});
      var idx={
        title:hdr.indexOf('Title'),
        cinema:hdr.indexOf('Cinema'),
        city:hdr.indexOf('City'),
        distr:hdr.indexOf('Distr.'),
        admWeek:hdr.indexOf('Adm. Week'),
        admThu:hdr.indexOf('Amd. Thu'),  // nota: typo nel CSV originale
        admFri:hdr.indexOf('Adm. Fri'),
        admSat:hdr.indexOf('Adm. Sat'),
        admSun:hdr.indexOf('Adm. Sun'),
        admMon:hdr.indexOf('Adm. Mon'),
        admTue:hdr.indexOf('Adm. Tue'),
        admWed:hdr.indexOf('Adm. Wedn'),
        showsWeek:hdr.indexOf('#Shows Thu'), // spettacoli totali approssimati
        startDate:hdr.indexOf('Start Date')
      };
      if(idx.title<0||idx.admWeek<0){toast('Formato CSV non riconosciuto — verifica che sia il file Maccsbox FiguresByDay','err');input.value='';return;}

      var agg={};
      var startDate='';
      for(var i=1;i<lines.length;i++){
        var row=parseCsvRow(lines[i]);
        if(row.length<=idx.admWeek)continue;
        var title=(row[idx.title]||'').trim();
        if(!title)continue;
        var key=title.toLowerCase();
        var adm=parseFloat(row[idx.admWeek]||0)||0;
        var cinema=(row[idx.cinema]||'').trim();
        if(!startDate&&idx.startDate>=0)startDate=(row[idx.startDate]||'').substring(0,10);
        // Dati per giorno (dayIdx: Gio=0,Ven=1,Sab=2,Dom=3,Lun=4,Mar=5,Mer=6)
        var byDay=[
          parseFloat(row[idx.admThu]||0)||0,
          parseFloat(row[idx.admFri]||0)||0,
          parseFloat(row[idx.admSat]||0)||0,
          parseFloat(row[idx.admSun]||0)||0,
          parseFloat(row[idx.admMon]||0)||0,
          parseFloat(row[idx.admTue]||0)||0,
          parseFloat(row[idx.admWed]||0)||0
        ];
        if(!agg[key]){agg[key]={title:title,adm:0,admByCinema:{},byDay:[0,0,0,0,0,0,0],cinemas:[],distr:(row[idx.distr]||'').trim()};}
        agg[key].adm+=adm;
        // Salva anche per cinema
        if(cinema){
          agg[key].admByCinema[cinema]=(agg[key].admByCinema[cinema]||0)+adm;
        }
        byDay.forEach(function(v,di){agg[key].byDay[di]+=v;});
        if(cinema&&agg[key].cinemas.indexOf(cinema)<0)agg[key].cinemas.push(cinema);
      }

      var filmCount=Object.keys(agg).length;
      if(!filmCount){toast('Nessun film trovato nel CSV','err');input.value='';return;}
      _mboxData=agg;
      _mboxLabel=startDate?'settimana dal '+startDate.split('-').reverse().join('/'):'';
      // Salva in localStorage
      try{localStorage.setItem('cm_mboxData',JSON.stringify(agg));localStorage.setItem('cm_mboxLabel',_mboxLabel);}catch(e){}
      propRenderMboxStrip();
      toast('Maccsbox caricato: '+filmCount+' film da '+Object.values(agg).reduce(function(s,f){return s+f.cinemas.length;},0)+' voci','ok');
    }catch(err){
      toast('Errore lettura CSV: '+err.message,'err');
    }
    input.value='';
  };
  reader.readAsText(file,'utf-8');
}
window.propLoadMaccsbox=propLoadMaccsbox;

// Parser CSV semplice che gestisce campi tra virgolette
function parseCsvRow(line){
  var result=[];var cur='';var inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(c==='"'){inQ=!inQ;}
    else if(c===','&&!inQ){result.push(cur.trim());cur='';}
    else{cur+=c;}
  }
  result.push(cur.trim());
  return result;
}

function propRenderMboxStrip(){
  var strip=document.getElementById('prop-mbox-strip');
  var cards=document.getElementById('prop-mbox-cards');
  var lbl=document.getElementById('prop-mbox-label');
  var filterBar=document.getElementById('prop-mbox-filters');
  if(!strip||!cards)return;
  var keys=Object.keys(_mboxData||{});
  if(!keys.length){strip.style.display='none';return;}

  var allFilms=keys.map(function(k){return _mboxData[k];});

  // Raccogli tutti i cinema presenti
  var cinemasAll=[];
  allFilms.forEach(function(f){
    (f.cinemas||[]).forEach(function(c){if(cinemasAll.indexOf(c)<0)cinemasAll.push(c);});
  });
  cinemasAll.sort();

  var cinemaColors={'Cinestar':'#185FA5','Lumen':'#0F6E56','Cinema Forum':'#993556','Multisala Teatro':'#f0801a'};
  function cCol(c){return cinemaColors[c]||'#888';}
  function cLabel(c){return c.replace('Multisala Teatro','Mendrisio').replace('Cinema Forum','Forum');}

  // Calcola totali per cinema
  var totalByCinema={all:0};
  allFilms.forEach(function(f){
    totalByCinema.all+=f.adm;
    Object.keys(f.admByCinema||{}).forEach(function(c){
      totalByCinema[c]=(totalByCinema[c]||0)+(f.admByCinema[c]||0);
    });
  });

  // Costruisce filter bar
  if(filterBar){
    var activeCinema=filterBar.dataset.active||'all';
    filterBar.innerHTML='<span style="font-size:10px;color:var(--txt2)">Filtra:</span>'
      +['all'].concat(cinemasAll).map(function(c){
        var col=c==='all'?'#888':cCol(c);
        var isActive=c===activeCinema;
        var tot=Math.round(totalByCinema[c]||0);
        return '<button onclick="propMboxFilter(\''+c+'\')" data-cinema="'+c+'" class="mbox-filter-btn" style="'
          +'font-size:10px;font-weight:500;padding:3px 10px;border-radius:20px;cursor:pointer;border:1.5px solid '+col+';'
          +(isActive?'background:'+col+';color:#fff;':'background:none;color:'+col+';')
          +'transition:all .15s">'+(c==='all'?'Tutti':cLabel(c))
          +' <span style="font-size:9px;opacity:'+(isActive?'0.85':'0.7')+'">'+tot.toLocaleString('it')+'</span>'
          +'</button>';
      }).join('');
  }

  // Filtro attivo
  var active=(filterBar&&filterBar.dataset.active)||'all';
  var ranked=allFilms
    .filter(function(f){
      if(active==='all')return true;
      return (f.cinemas||[]).indexOf(active)>=0 && (f.admByCinema&&f.admByCinema[active]>0);
    })
    .map(function(f){
      var val=active==='all'?f.adm:(f.admByCinema&&f.admByCinema[active])||0;
      return{title:f.title,distr:f.distr,cinemas:f.cinemas||[],val:val,admTotal:f.adm,admByCinema:f.admByCinema||{}};
    })
    .sort(function(a,b){return b.val-a.val;})
    .filter(function(f){return f.val>0;});

  // Sublabel
  var sublbl=document.getElementById('prop-mbox-sublabel');
  if(sublbl){
    sublbl.textContent=active==='all'
      ?ranked.length+' film in programmazione in tutti i cinema'
      :'Classifica per '+cLabel(active)+': '+ranked.length+' film';
    sublbl.style.color=active==='all'?'var(--txt2)':cCol(active);
  }

  var topBorderCol=['#BA7517','#888780','#997A3D'];
  var badgeBg=['#FAEEDA','#D3D1C7','#F5C4B3'];
  var badgeTxt=['#633806','#444441','#4A1B0C'];

  cards.innerHTML=ranked.map(function(f,i){
    var r=i+1;
    var isTop=r<=3;
    var topBorder=isTop?'border-top:2px solid '+topBorderCol[i]+';':'border-top:0.5px solid var(--bdr);';
    var badge=isTop
      ?'<div style="position:absolute;top:-1px;left:10px;font-size:10px;font-weight:500;padding:1px 8px;border-radius:0 0 6px 6px;background:'+badgeBg[i]+';color:'+badgeTxt[i]+'">#'+r+'</div>'
      :'<div style="position:absolute;top:5px;left:10px;font-size:10px;color:var(--txt2)">#'+r+'</div>';
    var cinemaBadges=(f.cinemas||[]).map(function(c){
      var col=cCol(c);
      var isActive=active===c;
      return '<span onclick="propMboxFilter(\''+c+'\')" style="display:inline-block;background:'+col+(isActive?'':'22')+';'
        +'border:1px solid '+col+(isActive?'':'55')+';color:'+(isActive?'#fff':col)+';'
        +'font-size:8px;font-weight:600;padding:1px 5px;border-radius:3px;margin-right:2px;cursor:pointer">'
        +cLabel(c)+'</span>';
    }).join('');
    return '<div style="width:155px;flex-shrink:0;background:var(--surf);border:0.5px solid var(--bdr);'+topBorder+'border-radius:10px;padding:10px 11px;position:relative">'
      +badge
      +'<div style="font-size:11px;font-weight:600;color:var(--txt);margin-top:'+(isTop?'16':'20')+'px;margin-bottom:2px;line-height:1.3;height:30px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+f.title+'</div>'
      +(f.distr?'<div style="font-size:9px;color:var(--txt2);margin-bottom:3px">'+f.distr+'</div>':'')
      +'<div style="font-size:9px;color:var(--txt2)">'+(active==='all'?'spettatori totali':'spettatori '+cLabel(active))+'</div>'
      +'<div style="font-size:17px;font-weight:600;color:var(--txt)">'+Math.round(f.val).toLocaleString('it')+'</div>'
      +(active!=='all'&&f.admTotal>0?'<div style="font-size:9px;color:var(--txt2);margin-bottom:3px">'+Math.round(f.val/f.admTotal*100)+'% del totale Ticino ('+Math.round(f.admTotal)+')</div>':'<div style="margin-bottom:3px"></div>')
      +'<div style="line-height:1.8">'+cinemaBadges+'</div>'
      +'</div>';
  }).join('');

  if(lbl)lbl.textContent=_mboxLabel;
  strip.style.display='block';
}
window.propRenderMboxStrip=propRenderMboxStrip;

function propMboxFilter(cinema){
  var filterBar=document.getElementById('prop-mbox-filters');
  if(filterBar)filterBar.dataset.active=cinema;
  propRenderMboxStrip();
}
window.propMboxFilter=propMboxFilter;

function propClearMaccsbox(){
  _mboxData={};_mboxLabel='';
  try{localStorage.removeItem('cm_mboxData');localStorage.removeItem('cm_mboxLabel');}catch(e){}
  var strip=document.getElementById('prop-mbox-strip');
  if(strip)strip.style.display='none';
}
window.propClearMaccsbox=propClearMaccsbox;

// Carica Maccsbox da localStorage all'avvio
function propLoadMboxLS(){
  try{
    var raw=localStorage.getItem('cm_mboxData');
    var lbl=localStorage.getItem('cm_mboxLabel')||'';
    if(raw){_mboxData=JSON.parse(raw);_mboxLabel=lbl;propRenderMboxStrip();}
  }catch(e){}
}

function propClearData(){
  _propPrevData={};
  _propPrevWeekLabel='';
  propClearLS();
  var el=document.getElementById('prop-prev-label');
  if(el)el.textContent='nessun dato incollato';
  propRender();
}
window.propClearData=propClearData;

// ── Applica proposta alla griglia programmazione ─────────────────────────
async function propApplyToGrid(){
  // Controlla slot proposta
  var totalSlots=Object.values(_propSlots).reduce(function(s,arr){return s+(arr||[]).length;},0);
  if(!totalSlots){toast('Nessuno slot da applicare — aggiungi prima gli spettacoli nella proposta','err');return;}

  // Controlla spettacoli già presenti nella settimana proposta
  var days=propDates();
  var propWd=days.map(function(d){return propDateStr(d);});
  var existing=(S.shows||[]).filter(function(s){return propWd.includes(s.day);});

  if(existing.length){
    // Mostra dialog smart
    var msg=document.getElementById('propApplyMsg');
    var btnReplace=document.getElementById('propApplyBtnReplace');
    if(msg)msg.innerHTML='Nella settimana <strong>'+propFd(days[0])+' — '+propFd(days[6])+'</strong> sono già presenti <strong>'+existing.length+' spettacoli</strong>. Come vuoi procedere?';
    if(btnReplace)btnReplace.style.display='flex';
    document.getElementById('ovPropApply').classList.add('on');
  } else {
    // Nessun esistente — applica direttamente
    await propApplyExec('add');
  }
}
window.propApplyToGrid=propApplyToGrid;

async function propApplyExec(mode){
  co('ovPropApply');
  var days=propDates();
  var propWd=days.map(function(d){return propDateStr(d);});

  // Se sostituisci: cancella prima tutti gli spettacoli esistenti della settimana
  if(mode==='replace'){
    var existing=(S.shows||[]).filter(function(s){return propWd.includes(s.day);});
    toast('Cancellazione '+existing.length+' spettacoli esistenti…','ok');
    for(var k=0;k<existing.length;k++){
      try{await fbDS(existing[k].id);}catch(e){}
    }
  }

  // Aggiunge gli slot proposta
  var count=0;
  for(var di=0;di<7;di++){
    var slots=_propSlots[di]||[];
    var dateStr=propDateStr(days[di]);
    for(var j=0;j<slots.length;j++){
      var s=slots[j];
      var show={id:uid(),filmId:s.filmId,day:dateStr,start:s.time,end:'',sala:s.sala,notes:''};
      try{await fbSetDoc(db,'shows',show.id,show);count++;}catch(e){}
    }
  }

  if(count){
    toast((mode==='replace'?'Sostituiti: ':'Aggiunti: ')+count+' spettacoli in programmazione','ok');
    propClearLS();
    S.ws=new Date(_propWeek);
    uwl();
    // Svuota proposta dopo applicazione
    _propSlots={};
    propRender();
  } else {
    toast('Nessuno slot da applicare','err');
  }
}
window.propApplyExec=propApplyExec;

// ── Popover azioni spettacolo reale in Prog-proposta ─────────────────────
var _propActionShowId=null;

function propShowAction(showId,event){
  event.stopPropagation();
  _propActionShowId=showId;
  var show=S.shows.find(function(s){return s.id===showId;});
  if(!show)return;
  var film=S.films.find(function(f){return f.id===show.filmId;});
  var title=document.getElementById('propActionTitle');
  if(title)title.textContent=(film?film.title.slice(0,28):'?')+' · '+show.start;
  // Aggiorna testo bottone conferma
  var btn=document.querySelector('#propActionPop button');
  if(btn)btn.textContent=show.propConfirmed?'↩ Rimuovi conferma':'✓ Conferma come definitivo';
  // Posiziona popover vicino al click
  var pop=document.getElementById('propActionPop');
  var ov=document.getElementById('propActionOverlay');
  if(!pop)return;
  pop.style.display='block';
  // Delay overlay per evitare che catturi il mouseup del click che ha aperto il pop
  setTimeout(function(){if(ov)ov.style.display='block';},50);
  var x=event.clientX,y=event.clientY;
  var pw=190,ph=140;
  pop.style.left=Math.min(x,window.innerWidth-pw-8)+'px';
  pop.style.top=Math.min(y+4,window.innerHeight-ph-8)+'px';
}
window.propShowAction=propShowAction;

function propClosePop(){
  var pop=document.getElementById('propActionPop');
  var ov=document.getElementById('propActionOverlay');
  if(pop)pop.style.display='none';
  if(ov)ov.style.display='none';
  _propActionShowId=null;
}
window.propClosePop=propClosePop;

async function propActionConfirm(){
  propClosePop();
  if(!_propActionShowId)return;
  var show=S.shows.find(function(s){return s.id===_propActionShowId;});
  if(!show)return;
  var updated=Object.assign({},show,{propConfirmed:!show.propConfirmed});
  try{
    await fbSetDoc(db,'shows',show.id,updated);
    toast(updated.propConfirmed?'Spettacolo confermato':'Conferma rimossa','ok');
  }catch(e){toast('Errore salvataggio','err');}
}
window.propActionConfirm=propActionConfirm;

function propActionEdit(){
  propClosePop();
  if(!_propActionShowId)return;
  editShow(_propActionShowId);
}
window.propActionEdit=propActionEdit;

async function propActionDelete(){
  propClosePop();
  if(!_propActionShowId)return;
  var show=S.shows.find(function(s){return s.id===_propActionShowId;});
  var film=show?S.films.find(function(f){return f.id===show.filmId;}):null;
  var name=film?film.title.slice(0,30):'spettacolo';
  if(!confirm('Cancellare "'+name+'" ('+( show?show.start:'')+')?\nL\'operazione non è reversibile.'))return;
  try{
    await fbDS(_propActionShowId);
    toast('Spettacolo cancellato','ok');
  }catch(e){toast('Errore cancellazione','err');}
}
window.propActionDelete=propActionDelete;


// ══════════════════════════════════════════════════════════════════════════
// COPERTINE FILM — A4 Landscape 3508×2480
// Backdrop dx · dissolvenza bianca sx · testi sx · giorni nero · orari per fascia
// ══════════════════════════════════════════════════════════════════════════
async function pPDFCopertine(){
  toast('Generazione copertine...','ok');

  var wd=wdates();
  var allDates=[];
  for(var d=2;d>=1;d--){
    var prev=new Date(wd[0]+'T12:00:00');
    prev.setDate(prev.getDate()-d);
    allDates.push(toLocalDate(prev));
  }
  allDates=allDates.concat(wd);

  var allShows=S.shows.filter(function(s){return allDates.includes(s.day);});
  var filmIds=[...new Set(allShows.map(function(s){return s.filmId;}))];
  var weekFilms=filmIds.map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean);

  weekFilms.sort(function(a,b){
    var aNew=a.release&&a.release>=wd[0]&&a.release<=wd[6];
    var bNew=b.release&&b.release>=wd[0]&&b.release<=wd[6];
    if(aNew&&!bNew)return -1;if(!aNew&&bNew)return 1;
    var aS=allShows.filter(function(s){return s.filmId===a.id;}).length;
    var bS=allShows.filter(function(s){return s.filmId===b.id;}).length;
    return bS-aS||a.title.localeCompare(b.title,'it');
  });

  if(!weekFilms.length){toast('Nessun film in programmazione','err');return;}

  var PW=3508,PH=2480;
  var scale=PW/1080;
  function S2(n){return Math.round(n*scale);}
  var ORA='#f0801a';
  var PL=S2(52);

  var canvases=[];

  for(var fi=0;fi<weekFilms.length;fi++){
    var film=weekFilms[fi];
    var fShows=allShows.filter(function(s){return s.filmId===film.id;})
      .sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});

    var dayNames2={};
    var dayNamesAbb=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    allDates.forEach(function(d){
      var dt=new Date(d+'T12:00:00');
      dayNames2[d]=dayNamesAbb[dt.getDay()];
    });

    var byDay={};
    fShows.forEach(function(s){
      if(!byDay[s.day])byDay[s.day]=[];
      if(byDay[s.day].indexOf(s.start)<0)byDay[s.day].push(s.start);
    });
    var showDays=Object.keys(byDay).sort();
    if(!showDays.length)continue;

    var cv=document.createElement('canvas');
    cv.width=PW;cv.height=PH;
    var ctx=cv.getContext('2d');

    // Sfondo bianco
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PW,PH);

    // Backdrop a destra
    if(film.backdrop){
      await new Promise(async function(resolve){
        try{
          // fetch con cache:'no-store' bypassa la cache del browser che potrebbe
          // avere /original/ senza CORS headers — usiamo /w1280/ che ha CORS=*
          var url=film.backdrop.replace('/original/','/w1280/');
          var resp=await fetch(url,{mode:'cors',cache:'no-store',signal:AbortSignal.timeout(10000)});
          if(!resp.ok)throw new Error('HTTP '+resp.status);
          var blob=await resp.blob();
          var blobUrl=URL.createObjectURL(blob);
          var img=new Image();
          img.onload=function(){
            try{
              var iw=img.naturalWidth,ih=img.naturalHeight;
              var sc2=Math.max(PW/iw,PH/ih);
              var sw=iw*sc2,sh=ih*sc2;
              var sx=(PW-sw)/2+Math.round(PW*0.12),sy=0;
              ctx.drawImage(img,sx,sy,sw,sh);
            }catch(e){console.warn('drawImage err',e);}
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
          img.onerror=function(){URL.revokeObjectURL(blobUrl);resolve();};
          img.src=blobUrl;
        }catch(e){
          console.warn('Backdrop skip:',e.message);
          resolve();
        }
      });
    }

    // Dissolvenza bianca sx
    var gLR=ctx.createLinearGradient(0,0,PW,0);
    gLR.addColorStop(0,   'rgba(255,255,255,1)');
    gLR.addColorStop(0.38,'rgba(255,255,255,0.97)');
    gLR.addColorStop(0.55,'rgba(255,255,255,0.70)');
    gLR.addColorStop(0.70,'rgba(255,255,255,0.25)');
    gLR.addColorStop(0.82,'rgba(255,255,255,0)');
    gLR.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle=gLR;ctx.fillRect(0,0,PW,PH);
    var gT=ctx.createLinearGradient(0,0,0,PH);
    gT.addColorStop(0,'rgba(255,255,255,0.55)');
    gT.addColorStop(0.12,'rgba(255,255,255,0)');
    ctx.fillStyle=gT;ctx.fillRect(0,0,PW,PH);
    var gB=ctx.createLinearGradient(0,0,0,PH);
    gB.addColorStop(0.85,'rgba(255,255,255,0)');
    gB.addColorStop(1,'rgba(255,255,255,0.65)');
    ctx.fillStyle=gB;ctx.fillRect(0,0,PW,PH);

    // Header: CINEMA MULTISALA TEATRO MENDRISIO su una riga
    ctx.font='700 '+S2(13)+'px Arial';
    ctx.fillStyle=ORA;ctx.letterSpacing=S2(2)+'px';
    ctx.textAlign='left';
    ctx.fillText('CINEMA MULTISALA TEATRO MENDRISIO',PL,S2(42));
    ctx.letterSpacing='0px';

    // ── LAYOUT: titolo fisso sotto header, badge+regia+orari centrati ───────
    var headerBot=S2(80);
    var footerTop=PH-S2(50);

    // Date programma e badge
    var firstDay=showDays[0]||'';var lastDay=showDays[showDays.length-1]||firstDay;
    function fmtShort(d){if(!d)return '';var p=d.split('-');return p[2]+'/'+p[1];}
    var isNew=film.release&&film.release>=wd[0]&&film.release<=wd[6];
    var badgeText=isNew?'— NOVITÀ IN SALA'
      :('— Programma dal '+fmtShort(firstDay)+' al '+fmtShort(lastDay));

    // Adatta titolo: max 193px min 91px, controlla larghezza E altezza
    var maxTW=PW*0.50-PL-S2(20); // titolo max 50% larghezza foglio
    var tUP=film.title.toUpperCase();
    var tWords=tUP.split(' ');

    // Altezza disponibile per il titolo (da cyTitle fino a inizio zona orari)
    // restH = badge+regia+meta+riga+orari (senza titolo)
    var metaParts=[film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):null,film.rating,film.genre].filter(Boolean);
    var restH=S2(32)+(film.director?S2(38):0)
      +(metaParts.length?S2(32):0)
      +S2(8)+S2(3)+S2(30)
      +showDays.length*S2(40);
    var cyTitle=S2(80)+S2(24); // headerBot + margine
    var maxTitleH=footerTop-cyTitle-restH-S2(40); // spazio verticale max per il titolo

    var tSize=193;var l1=tUP,l2='',l3='',lH,titleH;
    for(var tpx=193;tpx>=91;tpx-=4){
      tSize=tpx;ctx.font='900 '+tpx+'px Arial';lH=tpx*1.05;
      // Prova 1 riga
      if(ctx.measureText(tUP).width<=maxTW){
        l1=tUP;l2='';l3='';titleH=lH;
        if(titleH<=maxTitleH)break;
        continue; // titolo largo ok ma troppo alto? impossibile su 1 riga, riduci
      }
      // Prova 2 righe
      var found2=false;
      for(var sp=1;sp<tWords.length;sp++){
        var la=tWords.slice(0,sp).join(' '),lb=tWords.slice(sp).join(' ');
        if(ctx.measureText(la).width<=maxTW&&ctx.measureText(lb).width<=maxTW){
          l1=la;l2=lb;l3='';titleH=lH*2;found2=true;break;
        }
      }
      if(found2&&titleH<=maxTitleH)break;
      // Prova 3 righe
      if(tWords.length>=3){
        var t3=Math.ceil(tWords.length/3);
        var la3=tWords.slice(0,t3).join(' ');
        var lb3=tWords.slice(t3,t3*2).join(' ');
        var lc3=tWords.slice(t3*2).join(' ');
        if(ctx.measureText(la3).width<=maxTW){
          l1=la3;l2=lb3;l3=lc3;titleH=lH*3;
          if(titleH<=maxTitleH)break;
        }
      }
    }
    lH=tSize*1.05;
    titleH=l3?lH*3:l2?lH*2:lH;

        // ── TITOLO subito sotto header (posizione fissa) ──────────────────────
    var cyTitle=headerBot+S2(24);
    ctx.font='900 '+tSize+'px Arial';ctx.fillStyle='#111827';
    ctx.fillText(l1,PL,cyTitle+lH);
    if(l2)ctx.fillText(l2,PL,cyTitle+lH*2);
    if(l3)ctx.fillText(l3,PL,cyTitle+lH*3);
    var afterTitle=cyTitle+titleH+S2(36);

    // ── BADGE + REGIA + META + ORARI centrati tra afterTitle e footerTop ─
    // metaParts e restH già calcolati nel blocco titolo
    var restAvail=footerTop-afterTitle;
    var cy=afterTitle+Math.max(0,(restAvail-restH)*0.3);

    // ── BADGE ────────────────────────────────────────────────────────────────
    ctx.font='700 '+S2(20)+'px Arial';ctx.fillStyle=ORA;
    ctx.fillText(badgeText,PL,cy);cy+=S2(32);

    // ── REGISTA ───────────────────────────────────────────────────────────────
    if(film.director){
      ctx.font='700 '+S2(21)+'px Arial';
      ctx.fillStyle='rgba(20,30,60,0.55)';ctx.letterSpacing=S2(2)+'px';
      ctx.fillText(film.director.toUpperCase(),PL,cy);
      ctx.letterSpacing='0px';cy+=S2(38);
    }

    // ── META ─────────────────────────────────────────────────────────────────
    if(metaParts.length){
      ctx.font=S2(16)+'px Arial';ctx.fillStyle='rgba(20,30,60,0.45)';
      ctx.letterSpacing=S2(1.5)+'px';
      ctx.fillText(metaParts.join(' · ').toUpperCase(),PL,cy);
      ctx.letterSpacing='0px';cy+=S2(32);
    }

    cy+=S2(8);

    // ── RIGA ARANCIO ─────────────────────────────────────────────────────────
    ctx.fillStyle=ORA;ctx.fillRect(PL,cy,S2(60),S2(3));cy+=S2(30);

    // ── ORARI: colonne per fascia oraria, font adattivo alla larghezza ───────
    var orariMaxX=Math.round(PW*0.95);

    // ── Raggruppa orari in fasce da 45 min ────────────────────────────────
    // Converte "HH:MM" in minuti
    function toMin(t){var p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]);}
    // Raccoglie tutti gli orari distinti presenti
    var rawTimes=[];
    showDays.forEach(function(d){
      (byDay[d]||[]).forEach(function(t){if(rawTimes.indexOf(t)<0)rawTimes.push(t);});
    });
    rawTimes.sort();

    // Raggruppa in fasce da 45 min: ogni orario viene assegnato
    // alla fascia del primo orario entro 45 min da lui
    var fasceRep=[]; // rappresentante di ogni fascia (primo orario della fascia)
    var timeToFascia={}; // orario → rappresentante fascia
    rawTimes.forEach(function(t){
      var m=toMin(t);
      var found=false;
      for(var fi=0;fi<fasceRep.length;fi++){
        if(Math.abs(toMin(fasceRep[fi])-m)<=45){
          timeToFascia[t]=fasceRep[fi];found=true;break;
        }
      }
      if(!found){fasceRep.push(t);timeToFascia[t]=t;}
    });
    // usedTimes = rappresentanti delle fasce usate (colonne reali)
    var usedTimes=fasceRep.filter(function(r){
      return showDays.some(function(d){
        return (byDay[d]||[]).some(function(t){return timeToFascia[t]===r;});
      });
    });
    var nCols=usedTimes.length||1;

    // ── Colonne header fisse ────────────────────────────────────────────────
    var colDay=S2(155),colDate=S2(100),colArr=0;
    var xDay=PL,xDate=xDay+colDay,xTime=xDate+colDate;
    var slotAreaW=orariMaxX-xTime;

    // ── Font orari adattivo ────────────────────────────────────────────────
    var fontO,slotW,oneTimeW;
    for(var fos=52;fos>=22;fos-=4){
      fontO='700 '+S2(fos)+'px "Courier New",monospace';
      ctx.font=fontO;
      oneTimeW=ctx.measureText('20:30').width+S2(14);
      slotW=oneTimeW;
      if(nCols*slotW<=slotAreaW)break;
    }

    // ── X di ogni fascia (colonna) ─────────────────────────────────────────
    var colX={};
    usedTimes.forEach(function(r,ri){colX[r]=xTime+ri*slotW;});

    var fontG='700 '+S2(50)+'px Arial';
    var fontD='500 '+S2(36)+'px Arial';

    showDays.forEach(function(day){
      var times=(byDay[day]||[]).slice().sort();
      var dName=dayNames2[day]||'';
      var dp=day.split('-');
      var dateLabel=dp[2].padStart(2,'0')+'/'+dp[1].padStart(2,'0');
      var baseY=cy+S2(52);

      ctx.save();
      ctx.shadowColor='rgba(255,255,255,0.88)';ctx.shadowBlur=S2(20);

      // Giorno — NERO
      ctx.font=fontG;ctx.letterSpacing=S2(1)+'px';
      ctx.fillStyle='#111827';ctx.textAlign='left';
      ctx.fillText(dName.toUpperCase(),xDay,baseY);
      ctx.letterSpacing='0px';

      // Data — arancio formato 00/00
      ctx.font=fontD;ctx.fillStyle=ORA;
      ctx.fillText(dateLabel,xDate,baseY-S2(3));

      // Orari — NERI, allineati alla colonna della propria fascia
      ctx.font=fontO;ctx.fillStyle='#111827';
      times.forEach(function(t){
        var fascia=timeToFascia[t];
        var x=colX[fascia];
        if(x!==undefined)ctx.fillText(t,x,baseY);
      });

      ctx.restore();
      cy+=S2(40);
    });

    // ── FOOTER ───────────────────────────────────────────────────────────────
    ctx.font=S2(13)+'px Arial';ctx.fillStyle='rgba(60,70,100,0.35)';
    ctx.textAlign='center';
    ctx.fillText('mendrisiocinema.ch  ·  Via Vincenzo Vela 2, Mendrisio',PW/2,PH-S2(22));
    ctx.textAlign='left';

    canvases.push({canvas:cv,title:film.title});
  }

  if(!canvases.length){toast('Nessuna copertina generata','err');return;}

  try{
    var {jsPDF}=window.jspdf;
    var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    var mmW=297,mmH=210;
    canvases.forEach(function(item,i){
      if(i>0)doc.addPage();
      var dataUrl=item.canvas.toDataURL('image/jpeg',0.92);
      doc.addImage(dataUrl,'JPEG',0,0,mmW,mmH);
    });
    doc.save('copertine_film_'+new Date().toISOString().slice(0,10)+'.pdf');
    toast(canvases.length+' copertine generate','ok');
  }catch(e){
    canvases.forEach(function(item){
      var a=document.createElement('a');
      a.href=item.canvas.toDataURL('image/jpeg',0.92);
      a.download=item.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.jpg';
      a.click();
    });
    toast(canvases.length+' immagini scaricate','ok');
  }
}
window.pPDFCopertine=pPDFCopertine;


// ══════════════════════════════════════════════════════════════════════════
// IMPORT CSV CINETOURDATE → Prenotazioni (tipo openair)
// ══════════════════════════════════════════════════════════════════════════
async function importCinetourCSV(input){
  const file=input.files[0];if(!file)return;
  input.value='';
  const text=await file.text();
  // Parse CSV robusto (gestisce virgolette e campi con virgole interne)
  function parseCSV(txt){
    const rows=[];
    const lines=txt.split(/\r?\n/).filter(function(l){return l.trim();});
    lines.forEach(function(line){
      const fields=[];let cur='';let inQ=false;
      for(var i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){
          if(inQ&&line[i+1]==='"'){cur+='"';i++;}
          else inQ=!inQ;
        } else if(ch===','&&!inQ){
          fields.push(cur.replace(/^\["|"\]$/g,'').replace(/^"|"$/g,'').trim());cur='';
        } else cur+=ch;
      }
      fields.push(cur.replace(/^\["|"\]$/g,'').replace(/^"|"$/g,'').trim());
      rows.push(fields);
    });
    return rows;
  }

  const rows=parseCSV(text);
  if(rows.length<2){toast('CSV vuoto o non valido','err');return;}

  // Header → indice colonne
  const hdr=rows[0].map(function(h){return h.replace(/^\uFEFF/,'').trim();});
  function col(name){return hdr.indexOf(name);}
  const iData=col('Data'),iOra=col('Ora'),iTitolo=col('Titolo'),
        iLoc=col('Località'),iReg=col('Regione'),iOrg=col('Organizzatore'),
        iStatus=col('Status Meteo'),iPren=col('Prenotazione posti'),
        iCod=col('Codice'),iId=col('ID'),iVia=col('Via'),iGrat=col('Gratuita o Pagamento');

  // Existing IDs per evitare duplicati
  const existIds=new Set((S.bookings||[]).map(function(b){return b.cinetourId||'';}));

  let imported=0,skipped=0;
  for(var ri=1;ri<rows.length;ri++){
    const r=rows[ri];
    if(!r||r.length<5||!r[iData])continue;

    // Data: "2026-08-07T19:00:00Z" → "2026-08-07"
    const rawDate=r[iData]||'';
    const dateStr=rawDate.slice(0,10);
    if(!dateStr||dateStr==='undefined')continue;

    const cinetourId=r[iId]||'';
    if(cinetourId&&existIds.has(cinetourId)){skipped++;continue;}

    // Orario dal campo Ora oppure dall'orario nella Data
    let startTime=r[iOra]||'';
    if(!startTime&&rawDate.length>=16){
      // Estrae dall'ISO: "2026-08-07T19:00:00Z" → "19:00" (ora UTC, ticino = +2)
      const hh=parseInt(rawDate.slice(11,13))+2;
      const mm=rawDate.slice(14,16);
      startTime=String(hh).padStart(2,'0')+':'+mm;
    }
    startTime=startTime.slice(0,5);

    const filmTitle=r[iTitolo]||'';
    const location=(r[iLoc]||'').replace(/\s+$/,'');
    const regione=r[iReg]||'';
    const org=r[iOrg]||'';
    const via=r[iVia]||'';
    const status=r[iStatus]||'';
    const pren=r[iPren]||'';
    const grat=r[iGrat]||'';
    const codice=r[iCod]||'';

    // Costruisce nota
    var noteParts=[];
    if(regione)noteParts.push('Regione: '+regione);
    if(grat)noteParts.push(grat);
    if(status)noteParts.push('Meteo: '+status);
    if(pren)noteParts.push(pren);
    if(codice)noteParts.push('Cod. '+codice);

    const book={
      id:uid(),
      cinetourId:cinetourId,
      name:filmTitle||(location||'Open Air '+dateStr),
      type:'openair',
      sala:'OA1',
      filmId:'',
      oaFilmTitle:filmTitle,
      oaDistributor:'',
      location:location+(via?' — '+via:''),
      postazione:'CineTour Open Air',
      linkedShowId:'',
      contact:org,
      seats:0,
      note:noteParts.join(' · '),
      dates:[{date:dateStr,start:startTime,end:''}],
      createdBy:currentUser?currentUser.email:'import-csv',
      createdAt:new Date().toISOString(),
      cinetourCodice:codice,
      cinetourRegione:regione
    };
    await setDoc(doc(db,'bookings',book.id),book);
    existIds.add(cinetourId);
    imported++;
  }
  toast('Importate '+imported+' date'+( skipped?' · '+skipped+' già presenti':''),'ok');
}
window.importCinetourCSV=importCinetourCSV;

// ══════════════════════════════════════════════════════════════════════════
// EXPORT CSV prenotazioni → download
// ══════════════════════════════════════════════════════════════════════════
function exportBookingsCSV(){
  const books=S.bookings||[];
  if(!books.length){toast('Nessuna prenotazione da esportare','err');return;}

  // Intestazione CSV
  const hdrs=['Data','Orario','Titolo Film','Location','Regione','Organizzatore',
              'Tipo','Posti','Note','Sala','Codice Cinetour','ID','Creato il'];

  function esc(v){
    v=String(v||'');
    if(v.includes(',')||v.includes('"')||v.includes('\n'))return '"'+v.replace(/"/g,'""')+'"';
    return v;
  }

  const rows=[hdrs.map(esc).join(',')];
  books.forEach(function(b){
    (b.dates||[{date:'',start:'',end:''}]).forEach(function(d){
      rows.push([
        d.date||'', d.start||'',
        b.oaFilmTitle||b.name||'',
        b.location||'',
        b.cinetourRegione||'',
        b.contact||'',
        b.type||'', b.seats||0,
        b.note||'', b.sala||'',
        b.cinetourCodice||b.cinetourId||'',
        b.id||'',
        (b.createdAt||'').slice(0,10)
      ].map(esc).join(','));
    });
  });

  const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='prenotazioni_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();URL.revokeObjectURL(url);
  toast('CSV esportato ('+rows.length-1+' righe)','ok');
}
window.exportBookingsCSV=exportBookingsCSV;


// ══ BOX OFFICE — Import Excel Riepilogo Occupancy (ProCinema) ══
var _SALA_MAP={
  'TEATRO':'1','TEATRO NEW':'1','TEATRO new':'1',
  'CIAK':'2','1908':'3',
  'MIGNON':'4','MIGNON NEW':'4'
};
var _boData=[];

async function importBoxOfficeXLSX(input){
  const file=input.files[0];if(!file)return;
  input.value='';
  toast('Caricamento Excel...','ok');
  const XLSX=window.XLSX;
  if(!XLSX){toast('Libreria XLSX non disponibile — ricarica la pagina','err');return;}
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false});
  if(rows.length<2){toast('File vuoto','err');return;}
  var MESI={'gennaio':'01','febbraio':'02','marzo':'03','aprile':'04',
    'maggio':'05','giugno':'06','luglio':'07','agosto':'08',
    'settembre':'09','ottobre':'10','novembre':'11','dicembre':'12'};
  function pDate(s){
    if(!s)return'';
    var p=String(s).trim().split(/\s+/);
    if(p.length===3)return p[2]+'-'+(MESI[p[1].toLowerCase()]||'01')+'-'+p[0].padStart(2,'0');
    return s;
  }
  function pLordo(s){return parseFloat(String(s||0).replace(/[^\d.,]/g,'').replace(',','.'))||0;}
  _boData=[];
  for(var ri=1;ri<rows.length;ri++){
    var r=rows[ri];if(!r||!r[0])continue;
    var sn=String(r[3]||'').trim().toUpperCase();
    var sid=_SALA_MAP[sn]||Object.keys(_SALA_MAP).reduce(function(found,k){return(!found&&sn.includes(k))?_SALA_MAP[k]:found;},'');
    _boData.push({
      date:pDate(r[0]),sala:sid||sn,salaNome:String(r[3]||'').trim(),
      film:String(r[4]||'').trim(),distributore:String(r[5]||'').trim(),
      orario:String(r[6]||'').trim(),biglietti:parseInt(r[7])||0,
      posti:parseInt(r[8])||0,lordo:pLordo(r[12])
    });
  }
  toast(_boData.length+' spettacoli importati','ok');
  renderBoxOffice();gt('bo');
}
window.importBoxOfficeXLSX=importBoxOfficeXLSX;

function renderBoxOffice(){
  var sumEl=document.getElementById('bo-summary');
  var gridEl=document.getElementById('bo-grid');
  if(!sumEl||!gridEl)return;
  if(!_boData.length){
    gridEl.innerHTML='<div class="empty"><div class="ei2">📈</div><div class="et">Importa un file Excel dalla biglietteria per visualizzare il box office</div></div>';
    sumEl.innerHTML='';return;
  }
  var totB=_boData.reduce(function(a,r){return a+r.biglietti;},0);
  var totL=_boData.reduce(function(a,r){return a+r.lordo;},0);
  var totS=_boData.length;
  var avgS=totS?Math.round(totL/totS*100)/100:0;
  var fmt=function(n,d){return n.toLocaleString('de-CH',{minimumFractionDigits:d||2,maximumFractionDigits:d||2});};
  sumEl.innerHTML=[
    ['Spettatori totali',fmt(totB,0),'#185FA5'],
    ['Incasso totale','CHF '+fmt(totL),'#3B6D11'],
    ['Spettacoli',totS,'var(--txt)'],
    ['Media/spettacolo','CHF '+fmt(avgS),'var(--acc)']
  ].map(function(m){return'<div style="background:var(--surf2);border-radius:8px;padding:12px 14px"><div style="font-size:11px;color:var(--txt2);margin-bottom:4px">'+m[0]+'</div><div style="font-size:20px;font-weight:600;color:'+m[2]+'">'+m[1]+'</div></div>';}).join('');
  var dates=[...new Set(_boData.map(function(r){return r.date;}))].sort();
  var SALE=[{id:'1',n:'Teatro',c:'#4A90E2'},{id:'2',n:'Ciak',c:'#E2844A'},{id:'3',n:'1908',c:'#50C878'},{id:'4',n:'Mignon',c:'#9B59B6'}];
  var DY=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  function dLabel(d){var dt=new Date(d+'T12:00:00');return DY[dt.getDay()]+' '+parseInt(d.split('-')[2])+'/'+parseInt(d.split('-')[1]);}
  var colW=Math.max(130,Math.floor((window.innerWidth-240)/(dates.length||1)));
  var h='<div style="display:grid;grid-template-columns:90px repeat('+dates.length+',minmax(120px,'+colW+'px));gap:2px;min-width:400px">';
  h+='<div></div>';
  dates.forEach(function(d){h+='<div style="background:var(--surf2);border-radius:4px;padding:5px 7px;font-size:11px;font-weight:600;color:var(--txt);text-align:center">'+dLabel(d)+'</div>';});
  SALE.forEach(function(sala){
    var sd=_boData.filter(function(r){return r.sala===sala.id;});
    if(!sd.length)return;
    h+='<div style="background:var(--surf);border-left:3px solid '+sala.c+';border-radius:4px;padding:6px 8px;font-size:11px;font-weight:600;color:var(--txt);display:flex;align-items:center">'+sala.n+'</div>';
    dates.forEach(function(d){
      var dd=sd.filter(function(r){return r.date===d;});
      if(!dd.length){h+='<div style="background:var(--surf2);border-radius:4px;min-height:52px;opacity:.3"></div>';return;}
      var fg={};dd.forEach(function(r){if(!fg[r.film])fg[r.film]=[];fg[r.film].push(r);});
      h+='<div style="background:var(--surf);border:0.5px solid var(--bdr);border-radius:4px;padding:4px 5px">';
      Object.keys(fg).forEach(function(film){
        var ss=fg[film].sort(function(a,b){return a.orario.localeCompare(b.orario);});
        h+='<div style="font-size:9px;font-weight:600;color:var(--txt);margin-bottom:2px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+film.slice(0,30)+'</div>';
        ss.forEach(function(s){
          var occ=s.posti?Math.round(s.biglietti/s.posti*100):0;
          var oc=occ>=70?'#3B6D11':occ>=40?'#BA7517':'#888';
          h+='<div style="margin-bottom:3px;padding:2px 4px;background:var(--surf2);border-radius:3px">'
           +'<div style="font-size:9px;font-weight:600;color:var(--txt2)">'+s.orario+'</div>'
           +'<div style="display:flex;gap:4px;margin-top:1px;flex-wrap:wrap">'
           +'<span style="font-size:9px;color:#185FA5;font-weight:500">👥 '+s.biglietti+'</span>'
           +'<span style="font-size:9px;color:#3B6D11;font-weight:500">CHF '+Math.round(s.lordo)+'</span>'
           +'<span style="font-size:9px;color:'+oc+';font-weight:500">'+occ+'%</span>'
           +'</div></div>';
        });
      });
      h+='</div>';
    });
  });
  h+='<div style="background:var(--surf2);border-radius:4px;padding:6px 8px;font-size:10px;font-weight:600;color:var(--txt2);display:flex;align-items:center">Totale</div>';
  dates.forEach(function(d){
    var da=_boData.filter(function(r){return r.date===d;});
    var db=da.reduce(function(a,r){return a+r.biglietti;},0);
    var dl=da.reduce(function(a,r){return a+r.lordo;},0);
    h+='<div style="background:var(--surf2);border-radius:4px;padding:5px 7px;text-align:center"><div style="font-size:10px;font-weight:600;color:#185FA5">'+db+' spett.</div><div style="font-size:9px;color:#3B6D11;margin-top:1px">CHF '+Math.round(dl)+'</div></div>';
  });
  h+='</div>';
  gridEl.innerHTML=h;
}
window.renderBoxOffice=renderBoxOffice;


