// =================================================================
// CineManager — Modulo: playlist
// Playlist sale, trailer, ottimizzazione
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

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

window.openBook=openBook;window.editBook=editBook;window.svBook=svBook;
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

