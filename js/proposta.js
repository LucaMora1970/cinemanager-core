// =================================================================
// CineManager — Modulo: proposta
// Proposta programmazione, box office, import Excel
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

function propInit(){
  // Inizializza la settimana proposta = settimana successiva a quella corrente
  if(!_propWeek){
    var ws=new Date(S.ws);
    ws.setDate(ws.getDate()+7);
    _propWeek=ws;
  }
  propRender();
}
window.propInit=propInit;

function propShiftWeek(n){
  if(!_propWeek)_propWeek=new Date(S.ws);
  _propWeek=new Date(_propWeek);
  _propWeek.setDate(_propWeek.getDate()+n*7);
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

// ── Render della griglia proposta ─────────────────────────────────────────
function propRender(){
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
          html+='<div style="background:'+sala.col+'22;border:1px solid '+sala.col+'66;border-radius:4px;'
            +'padding:3px 5px;margin-bottom:2px;position:relative">';
          html+='<div style="font-weight:700;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:95px;color:var(--txt)">'+film.title+'</div>';
          html+='<div style="color:var(--txt2);font-size:9px">'+slot.time+'</div>';
          html+='<button onclick="propRemoveSlot('+di+','+salaId+','+slotIdx+')" style="position:absolute;top:1px;right:2px;background:none;border:none;cursor:pointer;color:var(--txt2);font-size:9px;padding:0 2px">✕</button>';


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

        // Dati _propPrevData (da incolla testo)
        prevData.forEach(function(pd){
          var occ=0;
          html+='<div style="background:rgba(240,128,26,.07);border:1px solid rgba(240,128,26,.2);'
            +'border-radius:3px;padding:2px 4px;margin-bottom:2px;font-size:9px">';
          if(pd.filmTitle)html+='<div style="font-size:8px;color:var(--txt2)">'+String(pd.filmTitle).slice(0,22)+'</div>';
          html+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:1px">';
          if(pd.spett>0)html+='<span style="color:#185FA5;font-weight:500">👥'+pd.spett+'</span>';
          if(pd.inc>0)html+='<span style="color:#3B6D11;font-weight:500">'+Math.round(pd.inc)+'.-</span>';
          else html+='<span style="color:#e84a4a;font-size:8px">vuoto</span>';
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

window.propRender=propRender;

// ── Dati settimana precedente per una cella ───────────────────────────────
function propGetPrevData(filmTitle,dayIdx,salaId,time){
  if(!Object.keys(_propPrevData).length)return[];
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

// ── Modal aggiunta slot ───────────────────────────────────────────────────
function propOpenSlotModal(dayIdx,salaId,fasciaPreset){
  _propEditDay={dayIdx,salaId};
  var days=propDates();
  var dd=document.getElementById('prop-slot-day');
  if(dd)dd.textContent=DIT_PROP[dayIdx]+' '+propFd(days[dayIdx]);
  // Popola select film
  var sel=document.getElementById('prop-slot-film');
  if(sel){
    var films=S.films.slice().sort((a,b)=>a.title.localeCompare(b.title,'it'));
    sel.innerHTML='<option value="">— Seleziona film —</option>';
    films.forEach(f=>{
      sel.innerHTML+=`<option value="${f.id}">${f.title}</option>`;
    });
  }
  // Sala pre-selezionata
  var ss=document.getElementById('prop-slot-sala');
  if(ss)ss.value=salaId;
  // Orario default 20:30
  var st=document.getElementById('prop-slot-time');
  if(st)st.value=fasciaPreset||'20:30';
  document.getElementById('ovPropSlot').classList.add('on');
}
window.propOpenSlotModal=propOpenSlotModal;

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
  propRender();
}
window.propAddSlot=propAddSlot;

function propRemoveSlot(dayIdx,salaId,idx){
  if(!_propSlots[dayIdx])return;
  var salaSlots=_propSlots[dayIdx].filter(s=>s.sala===salaId);
  var slot=salaSlots[idx];
  if(!slot)return;
  _propSlots[dayIdx]=_propSlots[dayIdx].filter(s=>s!==slot);
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

  var statusEl=document.getElementById('prop-parse-status');
  if(filmCount>0){
    statusEl.textContent='✓ Trovati '+filmCount+' film con '+entryCount+' spettacoli';
    statusEl.style.color='var(--acc)';
  } else {
    statusEl.textContent='⚠ Nessun dato estratto — verifica il formato del testo';
    statusEl.style.color='#e84a4a';
  }

  co('ovPropPaste');
  propRender();
}
window.propParsePaste=propParsePaste;

// ── Parser robusto della tabella ─────────────────────────────────────────
function propParseTable(text){
  var result={};
  var lines=text.split('\n').map(function(l){return l.trim();});

  // Step 1: trova riga con 7 date gio-mer
  var weekDates=[];
  var dateLineIdx=-1;
  for(var i=0;i<lines.length;i++){
    var dm=lines[i].match(/\d{2}\/\d{2}\/\d{4}/g);
    if(dm&&dm.length>=5){weekDates=dm.slice(0,7);dateLineIdx=i;break;}
  }
  if(!weekDates.length)return result;

  // Step 2: scansiona blocchi film
  // Ogni blocco inizia con il titolo film, poi riga "Spett.: N Inc.: N"
  // poi righe con orari
  var currentFilm='';
  var i=dateLineIdx+1;

  while(i<lines.length){
    var line=lines[i];

    // Salta righe vuote e intestazioni
    if(!line||line.length<2){i++;continue;}
    if(line.match(/^(Orario|Inc\.|Spett\.|Film\s|Totale|Copyright|Riepilogo|Week|New\s)/i)){i++;continue;}
    if(line.match(/^\d{2}\/\d{2}\/\d{4}/)){i++;continue;}

    // Riga "NomeFilm\nSpett.: N Inc.: N" — intestazione con totali
    var headerMatch=line.match(/^(.+?)\s+Spett\.\s*:\s*\d+\s+Inc\.\s*:\s*[\d.]+\s*$/);
    if(headerMatch){
      currentFilm=headerMatch[1].trim();
      i++;continue;
    }

    // Riga solo "Spett.: N Inc.: N" senza titolo
    if(line.match(/^\s*Spett\.\s*:/)){
      // Il titolo era la riga precedente
      if(i>0&&lines[i-1]&&!lines[i-1].match(/\d{1,2}:\d{2}/)&&lines[i-1].length>2){
        currentFilm=lines[i-1].replace(/\([^)]*\)/g,'').trim();
      }
      i++;continue;
    }

    // Riga con orari e sale
    if(line.match(/\d{1,2}:\d{2}/)&&line.match(/\((TEATRO|CIAK|1908|MIGNON)/i)){
      if(!currentFilm){i++;continue;}
      var key=currentFilm.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
      if(!result[key])result[key]={};

      // Strategia: divide la riga in segmenti per giorno usando le posizioni
      // Ogni "colonna" ha larghezza ~uniforme nella riga originale
      // Alternativa: estrae tutti i match e li mappa per posizione relativa
      var cellRe=/(\d{1,2}:\d{2})\s*\n?\s*\(\s*(TEATRO(?:\s*new)?|CIAK|1908|MIGNON)[^)]*\)\s*\n?\s*([\d.]+)\s+(\d+)/gi;

      // Prova prima su riga singola
      var cellsOnLine=[];
      var m;
      var singleRe=/(\d{1,2}:\d{2})\s*\(([^)]+)\)\s*([\d.]+)\s+(\d+)/gi;
      while((m=singleRe.exec(line))!==null){
        cellsOnLine.push({
          pos:m.index,
          time:m[1],
          sala:m[2].replace(/\s*new\s*/i,'').toUpperCase().trim(),
          inc:parseFloat(m[3]),
          spett:parseInt(m[4])
        });
      }

      if(cellsOnLine.length>0){
        // Mappa posizione nella riga → indice giorno
        var lineLen=Math.max(line.length,1);
        cellsOnLine.forEach(function(cell){
          var dayIdx=Math.min(6,Math.floor((cell.pos/lineLen)*7));
          if(!result[key][dayIdx])result[key][dayIdx]=[];
          result[key][dayIdx].push({
            time:cell.time,sala:cell.sala,
            inc:cell.inc,spett:cell.spett
          });
        });
      } else {
        // Prova a concatenare con le righe successive che potrebbero contenere altri orari
        // (il report può spezzare su più righe)
        var multiLine=line;
        var j=i+1;
        while(j<lines.length&&j<i+4){
          var nl=lines[j];
          if(!nl||nl.match(/Spett\.|Totale|Copyright/i))break;
          if(!nl.match(/\d{1,2}:\d{2}/)&&!nl.match(/\(\s*(TEATRO|CIAK|1908|MIGNON)/i)&&nl.match(/^[\d.]+\s+\d+/)){
            multiLine+=' '+nl; j++;
          } else if(nl.match(/\d{1,2}:\d{2}/)){
            break;
          } else break;
        }
        var mRe=/(\d{1,2}:\d{2})\s*\(([^)]+)\)\s*([\d.]+)\s+(\d+)/gi;
        while((m=mRe.exec(multiLine))!==null){
          var sala=m[2].replace(/\s*new\s*/i,'').toUpperCase().trim();
          var posRatio=m.index/Math.max(multiLine.length,1);
          var dayIdx=Math.min(6,Math.floor(posRatio*7));
          if(!result[key][dayIdx])result[key][dayIdx]=[];
          result[key][dayIdx].push({
            time:m[1],sala:sala,
            inc:parseFloat(m[3]),spett:parseInt(m[4])
          });
        }
      }
      i++;continue;
    }

    // Riga senza orari — potrebbe essere titolo film
    if(line.length>3&&!line.match(/^[\d\s.,:/-]+$/)
      &&!line.match(/\d{1,2}:\d{2}/)
      &&!line.match(/^(Totale|Riepilogo|Total)/i)){
      // Controlla righe successive per capire se è un titolo
      var next1=lines[i+1]||'';
      var next2=lines[i+2]||'';
      if(next1.match(/Spett\./)||next2.match(/Spett\./)||
         next1.match(/\d{1,2}:\d{2}/)||next2.match(/\d{1,2}:\d{2}/)){
        currentFilm=line.replace(/\([^)]*\)/g,'').replace(/Spett\..*$/,'').trim();
      }
    }
    i++;
  }

  return result;
}
window.propParseTable=propParseTable;

function propClearData(){
  _propPrevData={};
  _propPrevWeekLabel='';
  var el=document.getElementById('prop-prev-label');
  if(el)el.textContent='nessun dato incollato';
  propRender();
}
window.propClearData=propClearData;

// ── Applica proposta alla griglia programmazione ─────────────────────────
async function propApplyToGrid(){
  var days=propDates();
  var count=0;
  for(var di=0;di<7;di++){
    var slots=_propSlots[di]||[];
    var dateStr=propDateStr(days[di]);
    for(var j=0;j<slots.length;j++){
      var s=slots[j];
      var show={
        id:uid(),
        filmId:s.filmId,
        day:dateStr,
        start:s.time,
        end:'',
        sala:s.sala,
        notes:''
      };
      try{
        await fbSetDoc(db,'shows',show.id,show);
        count++;
      }catch(e){}
    }
  }
  if(count){
    toast(count+' spettacoli aggiunti alla programmazione','ok');
    // Aggiorna la settimana corrente alla settimana proposta
    S.ws=new Date(_propWeek);
    uwl();
  }else{
    toast('Nessuno spettacolo da applicare — aggiungi prima gli slot','err');
  }
}
window.propApplyToGrid=propApplyToGrid;


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
      await new Promise(function(resolve){
        var img=new Image();img.crossOrigin='anonymous';
        img.onload=function(){
          var iw=img.naturalWidth,ih=img.naturalHeight;
          var sc2=Math.max(PW/iw,PH/ih);
          var sw=iw*sc2,sh=ih*sc2;
          // Sposta il backdrop verso dx del 12% per liberare zona sx
          var sx=(PW-sw)/2+Math.round(PW*0.12),sy=0;
          ctx.drawImage(img,sx,sy,sw,sh);
          resolve();
        };
        img.onerror=resolve;
        img.src=film.backdrop;
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
      ctx.font=S2(21)+'px Arial';ctx.fillStyle='rgba(20,30,60,0.45)';
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
    var colDay=S2(155),colDate=S2(100),colArr=S2(70);
    var xDay=PL,xDate=xDay+colDay,xArr=xDate+colDate,xTime=xArr+colArr;
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
    var fontAr='700 '+S2(48)+'px Arial';

    showDays.forEach(function(day){
      var times=(byDay[day]||[]).slice().sort();
      var dName=dayNames2[day]||'';
      var dp=day.split('-');
      var dateLabel=parseInt(dp[2])+'/'+parseInt(dp[1]);
      var baseY=cy+S2(52);

      ctx.save();
      ctx.shadowColor='rgba(255,255,255,0.88)';ctx.shadowBlur=S2(20);

      // Giorno — NERO
      ctx.font=fontG;ctx.letterSpacing=S2(1)+'px';
      ctx.fillStyle='#111827';ctx.textAlign='left';
      ctx.fillText(dName.toUpperCase(),xDay,baseY);
      ctx.letterSpacing='0px';

      // Data — grigio
      ctx.font=fontD;ctx.fillStyle='rgba(20,30,60,0.5)';
      ctx.fillText(dateLabel,xDate,baseY-S2(3));

      // Freccia — arancio centrata
      ctx.font=fontAr;ctx.fillStyle=ORA;
      ctx.textAlign='center';
      ctx.fillText('→',xArr+Math.round(colArr/2),baseY);
      ctx.textAlign='left';

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


