// =================================================================
// CineManager — Modulo: staff_email
// Turni personale, email distributori, newsletter
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

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
  var CN='Cinema Multisala Teatro Mendrisio';
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
window.pPDFStaff=pPDFStaff;

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
  var CN='Cinema Multisala Teatro Mendrisio';
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
var TMDB_API_KEY='311ff7247664eb7804d555d57be08219'; // TMDB API Key v3
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

