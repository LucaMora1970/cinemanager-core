// =================================================================
// CineManager — Modulo: extra
// Moduli aggiuntivi: CSV import/export
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

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


