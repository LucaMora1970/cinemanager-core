// ═══════════════════════════════════════════════════════════════════
// richiesta-shared.js
// Utility condivise dai tre moduli di richiesta su pagina dedicata
// (prenota-sala-privata.html / prenota-evento-aziendale.html /
// prenota-compleanno.html) — estratte da index.html, che tiene la
// propria copia indipendente (i tre pannelli inline restano lì finché
// non vengono rimossi, vedi il piano di migrazione). Se una di queste
// funzioni cambia va aggiornata in entrambi i posti fino a quel momento.
// ═══════════════════════════════════════════════════════════════════

import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getFirestore,collection,getDocs,doc,getDoc,addDoc}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FB={apiKey:"AIzaSyCYM1tZsUI-pz3D0J6EWEMqyDxrk9hep1o",authDomain:"cinemanager-4c67c.firebaseapp.com",projectId:"cinemanager-4c67c",storageBucket:"cinemanager-4c67c.firebasestorage.app",messagingSenderId:"730874662111",appId:"1:730874662111:web:8a4a501dd81644bc96ed6a"};
const app=initializeApp(FB);
export const db=getFirestore(app);
export{collection,getDocs,doc,getDoc,addDoc};

export function esc(s){return(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function toLocalDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

export function setupDragScroll(el){
  let isDown=false,startX=0,startScroll=0,moved=false;
  el.addEventListener('mousedown',e=>{
    isDown=true;moved=false;
    el.classList.add('dragging');
    startX=e.pageX;
    startScroll=el.scrollLeft;
    e.preventDefault(); // impedisce la selezione testo/drag nativo del browser, che altrimenti "cattura" il gesto
  });
  window.addEventListener('mouseup',()=>{isDown=false;el.classList.remove('dragging');});
  window.addEventListener('mousemove',e=>{
    if(!isDown)return;
    const dx=e.pageX-startX;
    if(Math.abs(dx)>3)moved=true;
    el.scrollLeft=startScroll-dx;
  });
  // Se abbiamo trascinato, sopprimiamo il click del tab che seguirebbe (altrimenti selezionerebbe il giorno per sbaglio)
  el.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
}

export function updateDateScrollThumb(scrollEl,thumbEl){
  const sw=scrollEl.scrollWidth,cw=scrollEl.clientWidth;
  if(sw<=cw+1){thumbEl.style.width='100%';thumbEl.style.left='0';return;}
  const ratio=cw/sw;
  const pos=scrollEl.scrollLeft/(sw-cw);
  thumbEl.style.width=(ratio*100)+'%';
  thumbEl.style.left=(pos*(100-ratio*100))+'%';
}

export const CAL_MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const CAL_GIORNI_SHORT=['DOM','LUN','MAR','MER','GIO','VEN','SAB'];

export const RF_REQUIRED_LABELS={nome:'Nome e cognome',email:'Email',dataRichiesta:'Data desiderata',salaTagliaId:'Taglia sala',azTagliaId:'Sala',fasciaId:'Fascia oraria',azFasciaId:'Fascia oraria'};

export function updateRfStatus(form){
  const statusEl=form.querySelector('.rf-status');
  if(!statusEl)return;
  const missing=[];
  // I gruppi di radio hanno più elementi [required] con lo stesso "name": il
  // valore del singolo <input> non basta (un radio non selezionato ha comunque
  // un value valorizzato) — va verificato se ALMENO uno del gruppo è checked
  const seenRadioNames=new Set();
  form.querySelectorAll('[required]').forEach(el=>{
    if(el.type==='radio'){
      if(seenRadioNames.has(el.name))return;
      seenRadioNames.add(el.name);
      if(!form.querySelector('input[name="'+el.name+'"]:checked'))missing.push(RF_REQUIRED_LABELS[el.name]||el.name);
      return;
    }
    if(!el.value||!el.value.trim())missing.push(RF_REQUIRED_LABELS[el.name]||el.name);
  });
  if(missing.length){
    statusEl.textContent='Inserisci: '+missing.join(', ')+'.';
    statusEl.classList.remove('rf-status-ok');
  }else{
    statusEl.textContent='✓ Tutto pronto per l\'invio.';
    statusEl.classList.add('rf-status-ok');
  }
}
window.updateRfStatus=updateRfStatus;


// Nello script originale (index.html) questo girava una sola volta al
// caricamento, su TUTTI i .richiesta-form della pagina (erano tre). Qui
// ce n'è uno solo per pagina — la pagina lo chiama dopo aver popolato il
// form, stesso comportamento (classe "filled" sui campi + riga di stato)
export function initRfFieldSync(){
  document.querySelectorAll('.richiesta-form').forEach(form=>{
    form.querySelectorAll('input, select, textarea').forEach(el=>{
      const sync=()=>{
        el.classList.toggle('filled',!!(el.value&&el.value.trim()));
        updateRfStatus(form);
      };
      el.addEventListener('input',sync);
      el.addEventListener('change',sync);
      sync();
    });
  });
}

window.submitRichiesta=async function(ev,tipo){
  ev.preventDefault();
  const form=ev.target;
  const btn=form.querySelector('.rf-submit');
  const msg=form.querySelector('.rf-msg');
  const fd=new FormData(form);
  const data={tipo,stato:'nuova',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  // Più campi con lo stesso "name" (checkbox multiple, es. fasciaOraria o
  // filmPreferenza) vengono uniti in una sola stringa invece di sovrascriversi
  const grouped={};
  fd.forEach((v,k)=>{
    const val=String(v).trim();
    if(!val)return;
    (grouped[k]=grouped[k]||[]).push(val);
  });
  Object.keys(grouped).forEach(k=>{data[k]=grouped[k].join(', ');});
  if(!data.nome||!data.email){
    msg.textContent='Nome ed email sono obbligatori.';
    msg.className='rf-msg err';
    return false;
  }
  // Locandina del film scelto, per mostrarla nella pagina di stato — dal
  // radio spettacoloScelto se presente, altrimenti dal primo film selezionato
  // nella checklist "film proposti" (più film possibili lì, ne basta uno)
  const spettacoloInput=form.querySelector('input[name="spettacoloScelto"]:checked');
  const chosenFilmInput=spettacoloInput||form.querySelector('input[name="filmPreferenza"]:checked');
  if(chosenFilmInput){
    if(chosenFilmInput.dataset.poster)data.posterUrl=chosenFilmInput.dataset.poster;
    if(chosenFilmInput.dataset.filmId)data.filmId=chosenFilmInput.dataset.filmId;
  }
  // Orari reali del foyer (solo quando è stato scelto uno spettacolo con
  // orario confermato, non per le preferenze della checklist di fallback):
  // arrivo = inizio spettacolo − minuti foyer; disponibile fino a = fine
  // film + minuti di sosta (più lunga se richiesta la Sala Bar)
  if(tipo==='compleanno'&&spettacoloInput&&spettacoloInput.dataset.start){
    const cs=G.compleannoSettings||{};
    const startMin=timeToMin(spettacoloInput.dataset.start);
    const durata=parseInt(spettacoloInput.dataset.duration)||0;
    const foyerMax=cs.foyerMaxMinutes!=null?cs.foyerMaxMinutes:30;
    const dopoFilm=data.salaBarRichiesta
      ?(cs.afterFilmMinutesSalaBar!=null?cs.afterFilmMinutesSalaBar:45)
      :(cs.afterFilmMinutes!=null?cs.afterFilmMinutes:15);
    // L'orario del film (inizio/fine) resta quello esatto, è un fatto — si
    // arrotondano per eccesso solo i due orari "di servizio" (arrivo e fine
    // disponibilità foyer), al quarto d'ora successivo, per non promettere
    // mai meno di quanto indicato
    const roundUp15=m=>Math.ceil(m/15)*15;
    data.foyerOraArrivo=minToTime(roundUp15(startMin-foyerMax));
    data.foyerOraFineFilm=minToTime(startMin+durata);
    data.foyerOraDisponibileFino=minToTime(roundUp15(startMin+durata+dopoFilm));
    // Orario reale e sala dello spettacolo scelto — servono in gestione per
    // ricollegare automaticamente la richiesta allo spettacolo effettivo
    // ("Integra in programmazione"), non mostrati al cliente
    data.showStart=spettacoloInput.dataset.start;
    if(spettacoloInput.dataset.sala)data.sala=spettacoloInput.dataset.sala;
  }
  btn.disabled=true;
  msg.textContent='Invio in corso…';
  msg.className='rf-msg';
  // Loader a schermo intero mentre si scrive su Firestore e si aspetta
  // l'email di conferma, così l'attesa prima del rimando a richiesta.html
  // non sembra un blocco/errore — più professionale di un semplice testo
  const loaderEl=document.getElementById('rfLoaderOverlay');
  if(loaderEl)loaderEl.classList.add('on');
  try{
    const ref=await addDoc(collection(db,'richiesteEventi'),data);
    const link=location.origin+location.pathname.replace(/[^/]*$/,'')+'richiesta.html?id='+ref.id;
    // L'email di conferma è un valore aggiunto, non un requisito: se fallisce
    // (rete, funzione non raggiungibile) si passa comunque alla pagina di
    // stato — ma la aspettiamo (con un limite) prima di lasciare la pagina,
    // altrimenti il redirect potrebbe interromperla a metà
    const RICHIESTA_TIPO_LABEL={compleanno:'Compleanno al cinema','sala-privata':'Sala privata',aziendale:'Evento aziendale'};
    const emailReq=fetch('https://cinema-import-proxy.netlify.app/.netlify/functions/send-request-email',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({to:data.email,nome:data.nome,tipoLabel:RICHIESTA_TIPO_LABEL[tipo]||'',link})
    }).catch(()=>{});
    await Promise.race([emailReq,new Promise(r=>setTimeout(r,2500))]);
    location.href=link;
  }catch(e){
    console.error('submitRichiesta',e);
    msg.textContent='Errore durante l\'invio. Riprova, o scrivici a info@fabbricadeisogni.ch.';
    msg.className='rf-msg err';
    btn.disabled=false;
    if(loaderEl)loaderEl.classList.remove('on');
  }
  return false;
};
export const submitRichiesta=window.submitRichiesta;
