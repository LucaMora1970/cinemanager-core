// =================================================================
// CineManager — Modulo: social
// Post social, carosello Instagram, canvas 2B Foto
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

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
  if(hact){hact.style.cssText='display:flex !important;align-items:center;gap:8px;';}
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
  // Hide prog edit buttons per segretaria e operatore senza permessi
  const isSecy=role==='segretaria';
  document.getElementById('btnAddShow').style.display=isSecy?'none':'';
  document.getElementById('btnGlobalOpt').style.display=isSecy?'none':'';
  // Operatore cannot manage users (already hidden), but can do bookings
  // canManageBook = admin OR operatore OR segretaria
  window._userRole=role;
  // Current user info in users page
  const cui=document.getElementById('current-user-info');
  if(cui)cui.innerHTML='<strong>'+(user.displayName||'')+'</strong><br><span style="color:var(--txt2);font-size:12px">'+user.email+'</span><br><span style="font-size:11px;color:var(--acc)">Ruolo: '+role+'</span>';
}

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
    return;
  }
  const found=users.find(u=>u.email.toLowerCase()===user.email.toLowerCase());
  if(!found){showDeniedScreen(user.email);return;}
  currentUser=found;
  if(typeof _authTimeout!=='undefined')clearTimeout(_authTimeout);
  startListeners();
  showApp(user,found.role);
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
      +'<select data-email="'+emailB64+'" onchange="handleRoleChange(this)" style="font-size:11px;padding:2px 6px;width:90px">'
        +'<option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option>'
        +'<option value="operator"'+(u.role==='operator'?' selected':'')+'>Operatore</option>'
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

