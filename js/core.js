// =================================================================
// CineManager — Modulo: core
// Firebase, autenticazione, stato S, navigazione, utility
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================


import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import{getFirestore,doc,collection,setDoc,deleteDoc,onSnapshot}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const FB={apiKey:"AIzaSyCYM1tZsUI-pz3D0J6EWEMqyDxrk9hep1o",authDomain:"cinemanager-4c67c.firebaseapp.com",
  projectId:"cinemanager-4c67c",storageBucket:"cinemanager-4c67c.firebasestorage.app",
  messagingSenderId:"730874662111",appId:"1:730874662111:web:8a4a501dd81644bc96ed6a"};
const app=initializeApp(FB);
const db=getFirestore(app);

// ── CONSTANTS ─────────────────────────────────────────────
const DIT=['Giovedì','Venerdì','Sabato','Domenica','Lunedì','Martedì','Mercoledì'];
const DSH=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
const FASCE=['14:00','16:00','18:00','20:30','22:00'];
const MAIN_SLOT='20:30';
const SALE={
  '1':{n:'Teatro',hc:'sgh1',sc:'sp1',bc:'sb1',col:'#4a9ee8'},
  '2':{n:'Ciak',  hc:'sgh2',sc:'sp2',bc:'sb2',col:'#e89a3a'},
  '3':{n:'1908',  hc:'sgh3',sc:'sp3',bc:'sb3',col:'#3ae8aa'},
  '4':{n:'Mignon',hc:'sgh4',sc:'sp4',bc:'sb4',col:'#c84ae8'},
};
const OA_SALES={'OA1':{n:'CineTour A',col:'#0d5c8a'},'OA2':{n:'CineTour B',col:'#1a7a5c'}};
const sn=id=>SALE[id]?.n||(OA_SALES[id]?.n)||'Sala '+id;

// ── STATE ─────────────────────────────────────────────────
let S={films:[],shows:[],bookings:[],staff:[],shifts:[],emails:[],ws:thurDay(new Date()),permissions:{},distributors:[],media:[]};

// ── DATE ──────────────────────────────────────────────────
function thurDay(d){const dt=new Date(d),dy=dt.getDay(),diff=dy>=4?dy-4:dy+3;dt.setDate(dt.getDate()-diff);dt.setHours(0,0,0,0);return dt;}
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
function uwl(){const ds=wdays();document.getElementById('wlbl').textContent=`${fd(ds[0])} — ${fd(ds[6])}`;}
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
  },()=>syncSet('err','Errore sync'));
  onSnapshot(collection(db,'shows'),snap=>{
    S.shows=snap.docs.map(d=>({id:d.id,...d.data()}));
    rs();rl();syncSet('ok','Sincronizzato');
    if(typeof checkOrphanBadge==='function')checkOrphanBadge();
    var sp=document.getElementById('page-staff');
    if(sp&&sp.classList.contains('on')){var at=document.getElementById('stab-days');if(at&&at.classList.contains('on'))renderAllDays();else if(document.getElementById('stab-week')&&document.getElementById('stab-week').classList.contains('on'))renderWeekCompact();}
  },()=>syncSet('err','Errore sync'));
  onSnapshot(doc(db,'settings','emails'),snap=>{S.emails=snap.exists()?snap.data().list||[]:[];rem();});
  onSnapshot(collection(db,'bookings'),snap=>{S.bookings=snap.docs.map(d=>({id:d.id,...d.data()}));rs();renderBookings();});
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
}
async function fbSF(film){syncSet('busy','Salvataggio…');await setDoc(doc(db,'films',film.id),film);}
async function fbDF(id){syncSet('busy','Salvataggio…');await deleteDoc(doc(db,'films',id));}
async function fbSS(show){syncSet('busy','Salvataggio…');await setDoc(doc(db,'shows',show.id),show);}
async function fbDS(id){syncSet('busy','Salvataggio…');await deleteDoc(doc(db,'shows',id));}
async function fbSE(list){await setDoc(doc(db,'settings','emails'),{list});}
async function fbSetDoc(db2,col,docId,data){await setDoc(doc(db2,col,docId),data);}

// ── TABS ──────────────────────────────────────────────────
const TABS=['prog','lista','arch','prnt','mail','book','staff','users','playlist','social','news','prop','bo'];
function gt(id){
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('on',TABS[i]===id));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  var _ps=document.getElementById('perm-section');
  if(_ps)_ps.style.display=(id==='users'&&window._userRole==='admin')?'block':'none';
  if(id==='lista')rl();if(id==='arch')rf();if(id==='mail')rem();if(id==='staff'){renderAllDays();}if(id==='playlist')renderPlaylist();if(id==='social'&&typeof socialGenerate==='function')socialGenerate();if(id==='users')renderPermGrid();if(id==='news')newsInit();
  if(id==='prop')propInit();
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
            html.push(`<div class="show-pill ${SALE[s.sala].sc}" onclick="event.stopPropagation();editShow('${s.id}')">
              <button class="sp-del" onclick="event.stopPropagation();delShow('${s.id}')">×</button>
              <div class="sp-title" style="${film?'':'color:#e84a4a'}">${film?film.title:'⚠ Film eliminato'}</div>
              <div class="sp-time">${s.start} → ${s.end}</div>
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
}
window.rs=rs;

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

  // ── SECTION: Prossimamente (uscita tra 8-10 gg, non ancora in programma) ──
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

  renderSection('arch-coming','📅 Prossimamente — prossimi 10 giorni',
    coming.length+' film','background:rgba(74,162,232,.15);color:#4ab4e8',coming);

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
  const film=S.films.find(f=>f.id===fid),end=am(st,film.duration);
  const show={id:eid||uid(),filmId:fid,sala,day,start:st,end,interval:intv,note};
  await fbSS(show);co('ovS');toast(eid?'Aggiornato':'Aggiunto','ok');
}
async function delShow(id){if(!confirm('Eliminare?'))return;await fbDS(id);toast('Eliminato','ok');}
window.openShow=openShow;window.openShowSlot=openShowSlot;window.editShow=editShow;
window.ce=ce;window.svShow=svShow;window.delShow=delShow;

// ── COPY DAY ──────────────────────────────────────────────
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
