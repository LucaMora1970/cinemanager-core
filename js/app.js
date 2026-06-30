function sendCircolare(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori prima','err');return;}
  var emails=[];S.distributors.forEach(function(d){(d.contacts||[]).forEach(function(ct){if(ct.email&&emails.indexOf(ct.email)<0)emails.push(ct.email);});});
  if(!emails.length){toast('Nessun contatto email','err');return;}
  var subjBase=(document.getElementById('circ-subj')||{value:'Programmazione Settimanale'}).value||'Programmazione Settimanale';
  var note=((document.getElementById('circ-note')||{value:''}).value).trim();
  var fromDate=(document.getElementById('circ-from-date')||{value:wdates()[0]}).value||wdates()[0];
  var toDate=(document.getElementById('circ-to-date')||{value:wdates()[6]}).value||wdates()[6];
  var dalStr=fromDate.split('-').reverse().join('/');
  var alStr=toDate.split('-').reverse().join('/');
  var subj=subjBase+' — dal '+dalStr+' al '+alStr;
  var range=[];var cur=new Date(fromDate+'T12:00:00');var endD=new Date(toDate+'T12:00:00');
  while(cur<=endD){range.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
  var shows=S.shows.filter(function(s){return range.indexOf(s.day)>=0;});
  var oaBookings=S.bookings.filter(function(b){return b.type==='openair'&&(b.dates||[]).some(function(d){return range.indexOf(d.date)>=0;});});
  var SEP='─'.repeat(44);
  var lines=['CINEMA MULTISALA TEATRO MENDRISIO',''];
  lines.push('Gentili Distributori,');lines.push('');
  if(note){lines.push(note);lines.push('');}
  lines.push('di seguito la programmazione settimanale dei vostri film');
  lines.push('dal '+dalStr+' al '+alStr);
  lines.push('');lines.push(SEP);
  var fids=[];shows.forEach(function(s){if(fids.indexOf(s.filmId)<0)fids.push(s.filmId);});
  fids.map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean)
    .sort(function(a,b){return a.title.localeCompare(b.title,'it');})
    .forEach(function(film){
      var fs2=shows.filter(function(s){return s.filmId===film.id;}).sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
      if(!fs2.length)return;
      var dur=film.duration?(Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0')):'';
      lines.push('');lines.push(film.title+(dur?' ('+dur+')':''));
      lines.push('');
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
  var oaByFilm={};
  oaBookings.forEach(function(b){
    var film=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
    var ft=b.oaFilmTitle||(film?film.title:'')||b.name||'Film Cinetour';
    if(!oaByFilm[ft])oaByFilm[ft]={dur:film?film.duration:0,dates:[]};
    (b.dates||[]).filter(function(d){return range.indexOf(d.date)>=0;}).forEach(function(d){
      oaByFilm[ft].dates.push({date:d.date,start:d.start||b.start||'',loc:b.location||b.oaLocation||''});
    });
  });
  Object.keys(oaByFilm).sort(function(a,b){return a.localeCompare(b,'it');}).forEach(function(ft){
    var info=oaByFilm[ft];if(!info.dates.length)return;
    var dur=info.dur?(Math.floor(info.dur/60)+'h'+String(info.dur%60).padStart(2,'0')):'';
    lines.push('');lines.push(ft+(dur?' ('+dur+')':'')+'  🎥 Cinetour');
    lines.push('');
    info.dates.sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(d){
      var dt=new Date(d.date+'T12:00:00');var dl=dt.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
      dl=dl.charAt(0).toUpperCase()+dl.slice(1);
      lines.push('  '+dl+' → '+(d.start||'')+'  ('+(d.loc||'Localit\u00e0 da definire')+')');
    });
    lines.push('');lines.push(SEP);
  });
  lines.push('');lines.push(window.CINEMA_CONFIG.nome);
  var body=lines.join('\n');
  var toFixed='luca@mfd.ch,lorenzo@mfd.ch';
  var mailto='mailto:'+toFixed;
  mailto+='?bcc='+encodeURIComponent(emails.join(','));
  mailto+='&subject='+encodeURIComponent(subj);
  mailto+='&body='+encodeURIComponent(body);
  window.location.href=mailto;toast(emails.length+' distributori in CCN','ok');
}
window.sendCircolare=sendCircolare;