// =================================================================
// CineManager — Modulo: import_pc
// Import ProCinema PDF, distributori
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

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
  if(file.name.toLowerCase().endsWith('.pdf')){
    status.textContent='⚠ Per i PDF: apri il file, seleziona tutto (Cmd+A) e incolla nel campo testo. Oppure usa un file .txt esportato.';
    return;
  }
  var reader=new FileReader();
  reader.onload=function(e){
    document.getElementById('pdf-paste').value=e.target.result;
    status.textContent='✓ File caricato ('+Math.round(e.target.result.length/1000)+'KB) — clicca Analizza PDF';
  };
  reader.readAsText(file,'UTF-8');
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
        :'Trovate '+wks+' settimane ma nessun film con data italiana. Controlla che la colonna Italian Part sia presente.';
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
  var inWeekSection=false;
  // Date regex: dd.mm.yyyy optionally followed by C or N and spaces
  var dateRe=/\b(\d{2})\.(\d{2})\.(\d{4})\s*(?:[CN]\s*)?/g;
  // SUISA code: 4 digits dot 3-4 digits
  var suisaRe=/\b(\d{4}\.\d{3,4})\b/;
  // Age at end of line: number in parens or standalone like "16 (18)" or "- (-)"
  var ageRe=/(?:(\d+)\s*\(-?\d*-?\)|-\s*\(-?-?\))\s*$/;

  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    // Detect week sections
    if(/Week\s+\d+,\s+\d{4}/.test(line)){inWeekSection=true;continue;}
    // Skip header/footer lines
    if(/Originaltitle|Copyright|Competitive Release|Changes since|new date|changed date/.test(line))continue;
    if(!inWeekSection)continue;
    if(line.trim().length<10)continue;

    // Extract SUISA
    var suisaM=line.match(suisaRe);
    if(!suisaM)continue;
    var suisa=suisaM[1];

    // Skip NO REL lines
    if(line.indexOf('NO REL')>=0)continue;

    // Find ALL dates in the line
    var dates=[];
    var dm;dateRe.lastIndex=0;
    while((dm=dateRe.exec(line))!==null){
      var dd=dm[1],mm=dm[2],yyyy=dm[3];
      dates.push({str:dd+'.'+mm+'.'+yyyy,iso:yyyy+'-'+mm+'-'+dd,pos:dm.index});
    }
    if(!dates.length)continue;

    // Italian date = last date in line (column order: German, French, Italian)
    // But: if only 1 date without Italian column filled, skip
    // Heuristic: Italian date is after position of French date
    // Simplification: take the rightmost date
    var itDate=dates[dates.length-1];

    // Title = text before SUISA code
    var suisaPos=line.indexOf(suisa);
    var title=line.slice(0,suisaPos).replace(/^\s+/,'').replace(/\.\.\.\s*$/,'').trim();
    if(!title||title.length<2)continue;

    // Genre + distributor: text between SUISA and first date
    var afterSuisa=line.slice(suisaPos+suisa.length).trim();
    var firstDatePos=dates[0].pos;
    var beforeDates=line.slice(suisaPos+suisa.length,firstDatePos).trim();
    var words=beforeDates.split(/\s{2,}/).filter(function(w){return w.trim();});
    var genre=words[0]||'';var distributor=words.slice(1).join(' ')||'';
    // Clean distributor trailing dots
    distributor=distributor.replace(/\.\.\.\s*$/,'').trim();

    // Age
    var ageM=line.match(ageRe);
    var age=ageM&&ageM[1]?ageM[1]:'';

    // Esclude film senza data di uscita in Ticino (Italian Part)
    if(!itDate.iso)return; // senza data Ticino → non importare
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
  prog:'📅 Programmazione',lista:'📋 Lista',arch:'🎬 Archivio Film',
  prnt:'🖨 Stampa & PDF',mail:'📧 Email',book:'📋 Prenotazioni',
  staff:'👥 Turni',playlist:'▶ Playlist',social:'📱 Social',news:'📰 Newsletter'
};
// Permessi default per ruolo (admin sempre tutto)
var PERM_DEFAULT={
  operator:{prog:true,lista:true,arch:true,prnt:true,mail:true,book:true,staff:true,playlist:true,social:true,news:true},
  segretaria:{prog:true,lista:false,arch:false,prnt:true,mail:false,book:true,staff:false,playlist:false,social:false,news:false}
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
  var roles=['operator','segretaria'];
  var roleLabels={operator:'👤 Operatore',segretaria:'✉️ Segretaria'};
  var html='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  // Header
  html+='<thead><tr>';
  html+='<th style="text-align:left;padding:8px 12px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;min-width:180px">Sezione</th>';
  roles.forEach(function(r){
    html+='<th style="text-align:center;padding:8px 16px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;min-width:120px">'+roleLabels[r]+'</th>';
  });
  html+='<th style="text-align:center;padding:8px 16px;background:var(--surf2);border:1px solid var(--bdr);font-weight:700;color:var(--acc);min-width:100px">🔑 Admin</th>';
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
  // Leggi tutti i checkbox
  var result={operator:{},segretaria:{}};
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
    if(chk)chk.textContent=val?'✓':'';
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
    card.innerHTML='<div class="nws-card-arrows">'
        +'<button class="nws-arrow-btn" data-section="'+section+'" data-fid="'+film.id+'" data-dir="up" title="Sposta su">▲</button>'
        +'<button class="nws-arrow-btn" data-section="'+section+'" data-fid="'+film.id+'" data-dir="down" title="Sposta giù">▼</button>'
      +'</div>'
      +(film.poster
        ?'<img class="nws-card-poster" src="'+film.poster+'" alt="" style="background:var(--surf2)">'
        :'<div class="nws-card-poster-ph">🎬</div>')
      +(isNew?'<div class="nws-card-badge">NOVITÀ</div>':'')
      +(isManual?'<div class="nws-priority-badge">'+posDisplay+'</div>':'')
      +'<div class="nws-card-body">'
        +'<div class="nws-card-title">'+film.title+'</div>'
        +(film.distributor?'<div class="nws-card-meta" style="color:var(--acc);font-weight:600;font-size:9px">'+film.distributor+'</div>':'')
        +'<div class="nws-card-meta">'+meta+'</div>'
        +relLabel
      +'</div>'
      +'<div class="nws-card-check">'+(sel?'✓':'')+'</div>';
    card.addEventListener('click',function(e){
      if(e.target.classList.contains('nws-arrow-btn')){
        e.stopPropagation();
        foMove(e.target.dataset.section,e.target.dataset.fid,e.target.dataset.dir);
        return;
      }
      if(selSet.has(film.id)){selSet.delete(film.id);}else{selSet.add(film.id);}
      card.classList.toggle('selected',selSet.has(film.id));
      var chk=card.querySelector('.nws-card-check');
      if(chk)chk.textContent=selSet.has(film.id)?'✓':'';
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
  toast(_planMode?'Pianificazione attiva — film futuri visibili':'Pianificazione disattivata','ok');
}
window.togglePlanMode=togglePlanMode;

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
var _propEditDay=null;     // giorno in editing nel modal

var DIT_PROP=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

