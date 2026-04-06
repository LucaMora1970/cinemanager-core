// =================================================================
// CineManager — Modulo: prenotazioni
// CRUD prenotazioni, import/export CSV Cinetourdate
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

function openBook(){
  document.getElementById('ovBookT').textContent='Nuova Prenotazione';
  ['bId','bLinkedShowId'].forEach(function(id){document.getElementById(id).value='';});
  ['bName','bContact','bNote'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('bSeats').value='';
  document.getElementById('bType').value='compleanno';
  document.getElementById('bSala').value='1';
  _bDates=[];
  renderBDates();
  setBMode('exist');
  fillBShows();
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
    if(document.getElementById('bOAPost')&&b.sala)document.getElementById('bOAPost').value=b.sala;
    if(document.getElementById('bLocation'))document.getElementById('bLocation').value=b.location||'';
    if(document.getElementById('bOACliente'))document.getElementById('bOACliente').value=b.oaCliente||'';
    if(document.getElementById('bOAFilm')&&b.filmId)document.getElementById('bOAFilm').value=b.filmId;
    if(document.getElementById('bOAFilmFree'))document.getElementById('bOAFilmFree').value=b.oaFilmTitle||'';
    if(document.getElementById('bOAName'))document.getElementById('bOAName').value=b.name||'';
    if(document.getElementById('bOAContact'))document.getElementById('bOAContact').value=b.contact||'';
    if(document.getElementById('bOANote'))document.getElementById('bOANote').value=b.note||'';
    // Radios
    const pVal=b.oaPrenotato||'no';
    const pEl=document.querySelector('input[name="bOAPrenotato"][value="'+pVal+'"]');
    if(pEl)pEl.checked=true;
    const sVal=b.oaScaricato||'no';
    const sEl=document.querySelector('input[name="bOAScaricato"][value="'+sVal+'"]');
    if(sEl)sEl.checked=true;
    if(document.getElementById('bNote'))document.getElementById('bNote').value=b.note||'';
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
  // Legge il primo campo date visibile nel modal — funziona per OA e non-OA
  let el=null;
  document.querySelectorAll('#ovBook input[type="date"]').forEach(function(inp){
    if(inp.offsetParent!==null&&!el)el=inp;
  });
  if(!el){
    // Fallback: qualsiasi campo date con valore
    document.querySelectorAll('input[type="date"]').forEach(function(inp){
      if(inp.value&&!el)el=inp;
    });
  }
  if(!el){toast('Campo data non trovato','err');return;}
  let d=el.value||'';
  if(!d&&el.valueAsDate){
    const vd=el.valueAsDate;
    const local=new Date(vd.getTime()+vd.getTimezoneOffset()*60000);
    d=local.getFullYear()+'-'+String(local.getMonth()+1).padStart(2,'0')+'-'+String(local.getDate()).padStart(2,'0');
  }
  if(!d){d=el.getAttribute('value')||'';}
  const s=document.getElementById('bStart').value;
  const e=document.getElementById('bEnd').value;
  if(!d){toast('Seleziona una data','err');return;}
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
  const w=document.getElementById('bDates');
  if(!_bDates.length){w.innerHTML='<span style="font-size:11px;color:var(--txt2);padding:4px">Nessuna data aggiunta</span>';return;}
  w.innerHTML='';
  _bDates.forEach(function(x){
    const di=x.date.split('-');
    const label=di[2]+'/'+di[1]+' '+x.start+'-'+x.end;
    const chip=document.createElement('span');
    chip.className='date-chip';
    chip.dataset.date=x.date;
    chip.textContent=label+' ';
    const btn=document.createElement('button');
    btn.textContent='×';
    btn.onclick=function(){removeBookDate(x.date);};
    chip.appendChild(btn);
    w.appendChild(chip);
  });
}
function removeBD(el){removeBookDate(el.dataset.date);}
window.removeBD=removeBD;
async function svBook(){
  const bType0=document.getElementById('bType').value;
  const isOA0=bType0==='openair';
  const name=(isOA0?document.getElementById('bOAName'):document.getElementById('bName'))?.value.trim()||'';
  if(!name){toast('Inserisci il nome evento','err');return;}
  const mode=document.getElementById('bMode').value;
  const linkedShowId=document.getElementById('bLinkedShowId').value;
  if(mode==='exist'&&!linkedShowId){toast('Seleziona uno spettacolo','err');return;}
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
  } else {
    filmId=document.getElementById('bFilmManual').value||'';
  }
  const book={
    id:eid||uid(),
    name,
    type:bType,
    sala,
    filmId,
    location:isOA?(document.getElementById('bLocation')?.value||''):'',
    postazione:isOA?(OA_SALES[sala]?.n||sala):'',
    oaFilmTitle:oaFilmTitle,
    oaDistributor:oaDistributor,
    linkedShowId:linkedShowId||'',
    contact:(isOA?document.getElementById('bOAContact'):document.getElementById('bContact'))?.value||'',
    seats:parseInt(document.getElementById('bSeats').value)||0,
    note:(isOA?document.getElementById('bOANote'):document.getElementById('bNote'))?.value||'',
    dates,
    createdBy:currentUser?currentUser.email:'',
    createdAt:new Date().toISOString()
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
  const today=toLocalDate(new Date());
  let books=S.bookings||[];
  if(filter==='upcoming') books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date>=today;});});
  else if(filter!=='all') books=books.filter(function(b){return b.type===filter;});
  books.sort(function(a,b2){
    const aMin=(a.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    const bMin=(b2.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    return aMin>bMin?1:-1;
  });
  if(!books.length){
    w.innerHTML='<div class="empty"><div class="ei2">📋</div><div class="et">Nessuna prenotazione</div></div>';
    return;
  }
  const canEdit=currentUser&&(currentUser.role==='admin'||currentUser.role==='segretaria'||currentUser.role==='operator');
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
    const meta=[typeLabel,salaNome?'🎭 '+salaNome:'',b.contact?'📞 '+b.contact:'',isOA&&b.location?'📍 '+b.location:'',isOA&&b.oaCliente?'👤 '+b.oaCliente:'',b.seats?'💺 '+b.seats+' posti':''].filter(Boolean).join(' · ');
    const showDates=(upDates.length?upDates:allDates).slice(0,8);
    const byDay={};
    showDates.forEach(function(d){if(!byDay[d.date])byDay[d.date]=[];byDay[d.date].push(d);});
    h+='<div class="lfc" style="border-top-color:'+accent+'">';
    h+='<div class="lfc-head">';
    h+='<div class="lfc-title" style="color:'+accent+'">'+title+'</div>';
    h+='<div class="lfc-meta">'+meta+'</div>';
    h+='<div class="lfc-count" style="background:'+accent+'22;color:'+accent+'">'+allDates.length+' data'+(allDates.length===1?'':'te')+' totali'+(upDates.length?' · '+upDates.length+' future':'')+'</div>';
    h+='</div><div class="lfc-days">';
    Object.keys(byDay).sort().forEach(function(ds){
      const d=new Date(ds+'T12:00:00');
      const dayLabel=d.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
      h+='<div><div class="lfc-day-name">'+dayLabel+'</div><div class="lfc-slots">';
      byDay[ds].forEach(function(slot){
        h+='<span class="lfc-slot"><span class="lfc-slot-time">'+slot.start+(slot.end?' → '+slot.end:'')+'</span></span>';
      });
      h+='</div></div>';
    });
    if(allDates.length>showDates.length)h+='<div style="font-size:10px;color:var(--txt2);padding:4px 14px">+ altre '+(allDates.length-showDates.length)+' date</div>';
    h+='</div>';
    if(b.note)h+='<div style="font-size:11px;color:var(--txt2);padding:6px 14px;border-top:1px solid var(--bdr)">📝 '+b.note+'</div>';
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

