// Scheda Timbrature del gestionale: registro entrate/uscite dei collaboratori, chi è in servizio,
// QR da stampare, PIN personali e correzioni manuali.
// Legge le timbrature in tempo reale da due ponti di app.js (window._timbList / _timbStato /
// _cmStaff); tutte le scritture passano dalla funzione Netlify timbra-admin (token Firebase).
(function () {
  'use strict';

  var ADMIN_FN = 'https://cinema-import-proxy.netlify.app/.netlify/functions/timbra-admin';
  var PROD_ORIGIN = 'https://www.cinemamultisalateatro.ch';
  var TZ = 'Europe/Zurich';
  var cfg = null; // { key, pins:[staffId] }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Persone che possono timbrare: dipendenti dei Turni + account di Utenti non già presenti
  // come dipendenti (stessa email). Gli utenti hanno id "u_<email>", come sul server.
  function userId(email) { return 'u_' + String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
  function people(all) {
    var base = staff(all);
    var emails = {};
    (window._cmStaff ? window._cmStaff(true) : []).forEach(function (s) { if (s.email) emails[String(s.email).trim().toLowerCase()] = true; });
    var users = (window._usersList || []).filter(function (u) { return u.email && !emails[String(u.email).trim().toLowerCase()]; })
      .map(function (u) { return { id: userId(u.email), name: u.name || u.email, active: true, isUser: true }; });
    return base.concat(users).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  }
  // Attivi: per PIN e correzioni. Tutti (anche disattivati): per filtrare lo storico
  function staff(all) { return (window._cmStaff ? window._cmStaff(all) : []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); }); }
  function toast(m, t) { if (window.toast) window.toast(m, t || 'ok'); }

  function localDay(d) { return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d); }
  function fmtTime(iso) { return new Date(iso).toLocaleTimeString('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); }
  function fmtDay(day) {
    var p = day.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDur(ms) {
    var m = Math.round(ms / 60000);
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  }

  async function call(payload) {
    var token = window._cmIdToken ? await window._cmIdToken() : null;
    if (!token) throw new Error('Sessione scaduta: ricarica la pagina e accedi di nuovo.');
    var resp;
    try {
      resp = await fetch(ADMIN_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
    } catch (e) { throw new Error('Connessione non riuscita. Riprova.'); }
    var data = {};
    try { data = await resp.json(); } catch (e) { /* non JSON */ }
    if (!resp.ok) {
      if (resp.status === 403) throw new Error('Il tuo ruolo non può gestire le timbrature.');
      throw new Error(data.error || ('Errore ' + resp.status));
    }
    return data;
  }

  // ── Dati filtrati ───────────────────────────────────────
  function filtered() {
    var from = $('timb-from').value, to = $('timb-to').value, who = $('timb-who').value;
    return (window._timbList || []).filter(function (r) {
      return (!from || r.day >= from) && (!to || r.day <= to) && (!who || r.staffId === who);
    }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }

  // Abbina ogni entrata alla sua uscita successiva (per collaboratore) usando TUTTE le timbrature,
  // così un turno a cavallo di due mesi o di due giorni resta intero. Un turno appartiene al
  // giorno della sua entrata. Sessione: { staffId, name, in, out, ms, day }.
  function sessionsOf(all) {
    var by = {}, out = [];
    all.slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }).forEach(function (r) {
      (by[r.staffId] = by[r.staffId] || []).push(r);
    });
    Object.keys(by).forEach(function (id) {
      var open = null;
      function push(i, o) {
        out.push({ staffId: id, name: (i || o).staffName, in: i, out: o, day: (i || o).day, ms: i && o ? Date.parse(o.ts) - Date.parse(i.ts) : 0 });
      }
      by[id].forEach(function (r) {
        if (r.tipo === 'entrata') { if (open) push(open, null); open = r; }
        else if (open) { push(open, r); open = null; }
        else push(null, r);
      });
      if (open) push(open, null);
    });
    return out;
  }

  // Report del periodo scelto (filtri Dal / Al / Collaboratore): per persona turni, ore e anomalie
  function buildReport() {
    var from = $('timb-from').value, to = $('timb-to').value, who = $('timb-who').value;
    var inServizio = {};
    (window._timbStato || []).forEach(function (st) { if (st.inServizio) inServizio[st.staffId] = true; });
    var by = {};
    sessionsOf(window._timbList || []).forEach(function (se) {
      if ((from && se.day < from) || (to && se.day > to) || (who && se.staffId !== who)) return;
      var o = (by[se.staffId] = by[se.staffId] || { id: se.staffId, name: se.name, ms: 0, turni: 0, anomalie: 0, sessioni: [] });
      var incompleta = !(se.in && se.out);
      se.inCorso = incompleta && se.in && !se.out && inServizio[se.staffId];
      if (!incompleta) { o.ms += se.ms; o.turni++; }
      else if (!se.inCorso) o.anomalie++;
      o.sessioni.push(se);
    });
    var persone = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); });
    persone.forEach(function (o) { o.sessioni.sort(function (a, b) { return (a.in || a.out).ts < (b.in || b.out).ts ? -1 : 1; }); });
    return { from: from, to: to, persone: persone, totMs: persone.reduce(function (a, o) { return a + o.ms; }, 0) };
  }
  function fmtDec(ms) { return (ms / 3600000).toFixed(2).replace('.', ','); }

  // ── Render ──────────────────────────────────────────────
  function renderNow() {
    var w = $('timb-now');
    var inn = (window._timbStato || []).filter(function (s) { return s.inServizio; })
      .sort(function (a, b) { return (a.since || '') < (b.since || '') ? -1 : 1; });
    if (!inn.length) { w.innerHTML = '<span style="color:var(--txt2);font-size:12px">Nessuno in servizio.</span>'; return; }
    w.innerHTML = inn.map(function (s) {
      var long = Date.now() - Date.parse(s.since) > 16 * 3600000;
      return '<div style="background:var(--surf2);border:1px solid ' + (long ? '#e8884a' : 'var(--bdr)') + ';border-left:3px solid #3ac47a;border-radius:8px;padding:8px 12px;font-size:12px">'
        + '<b>' + esc(s.staffName) + '</b><br><span style="color:var(--txt2)">dalle ' + fmtTime(s.since) + (s.sede ? ' · ' + esc(s.sede) : '') + (long ? ' · ⚠ da più di 16 ore' : '') + '</span></div>';
    }).join('');
  }

  function renderSummary() {
    var w = $('timb-summary');
    var rep = buildReport();
    if (!rep.persone.length) { w.innerHTML = ''; return; }
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    rep.persone.forEach(function (o) {
      h += '<div style="background:var(--surf2);border-radius:8px;padding:8px 12px;font-size:12px;min-width:150px">'
        + '<b>' + esc(o.name) + '</b><br>' + fmtDur(o.ms) + ' · ' + o.turni + ' turn' + (o.turni === 1 ? 'o' : 'i')
        + (o.anomalie ? '<br><span style="color:#e8884a">⚠ ' + o.anomalie + ' timbratur' + (o.anomalie === 1 ? 'a' : 'e') + ' da controllare</span>' : '')
        + '</div>';
    });
    w.innerHTML = h + '<div style="background:var(--surf2);border-radius:8px;padding:8px 12px;font-size:12px;min-width:150px;border:1px solid var(--bdr)"><b>Totale</b><br>' + fmtDur(rep.totMs) + '</div></div>';
  }

  function renderList(list) {
    var w = $('timb-list');
    if (!list.length) { w.innerHTML = '<div style="color:var(--txt2);font-size:13px;padding:24px 0;text-align:center">Nessuna timbratura nel periodo.</div>'; return; }
    var h = '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
      + ['Data', 'Ora', 'Collaboratore', 'Tipo', 'Sede', 'Origine', ''].map(function (t) {
        return '<th style="text-align:left;padding:6px 8px;background:var(--surf2);border:1px solid var(--bdr)">' + t + '</th>';
      }).join('') + '</tr></thead><tbody>';
    list.forEach(function (r) {
      var col = r.tipo === 'entrata' ? '#3ac47a' : '#e8884a';
      var orig = r.source === 'manuale' ? '✏ manuale' + (r.note ? ' — ' + esc(r.note) : '') + (r.by ? ' (' + esc(r.by) + ')' : '') : 'QR' + (r.note ? ' — ' + esc(r.note) : '');
      if (r.modifica) orig += '<br><span style="color:#e8884a" title="Prima: ' + esc(r.modifica.prev.tipo) + ' ' + esc(fmtTime(r.modifica.prev.ts)) + ' del ' + esc(localDay(new Date(r.modifica.prev.ts))) + '">✎ modificata — ' + esc(r.modifica.motivo) + ' (' + esc(r.modifica.by) + ')</span>';
      h += '<tr><td style="padding:5px 8px;border:1px solid var(--bdr)">' + fmtDay(r.day) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + fmtTime(r.ts) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + esc(r.staffName) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr);font-weight:700;color:' + col + '">' + (r.tipo === 'entrata' ? 'Entrata' : 'Uscita') + (r.uscitaMancante ? ' ⚠' : '') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + esc(r.sede || '') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr);color:var(--txt2)">' + orig + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr);white-space:nowrap"><button class="btn bg bs" data-id="' + esc(r.id) + '" onclick="timbOpenEdit(this.dataset.id)" title="Modifica">✏</button> '
        + '<button class="btn bd bs" data-id="' + esc(r.id) + '" onclick="timbDelete(this.dataset.id)" title="Elimina">✕</button></td></tr>';
    });
    w.innerHTML = h + '</tbody></table>';
  }

  function renderPins() {
    var w = $('timb-pins');
    if (!w) return;
    var has = {};
    ((cfg && cfg.pins) || []).forEach(function (id) { has[id] = true; });
    var sts = people();
    if (!sts.length) { w.innerHTML = '<span style="color:var(--txt2);font-size:12px">Nessun collaboratore: aggiungili prima nella scheda Turni.</span>'; return; }
    var off = people(true).length - sts.length;
    var nota = '<div style="font-size:11px;color:var(--txt2);margin-top:8px">Elenco = dipendenti <b>attivi</b> dei Turni più gli account di <b>Utenti</b> (' + sts.length + ' persone)'
      + (off ? ' · ' + off + ' disattivat' + (off === 1 ? 'o' : 'i') + ' non compa' + (off === 1 ? 're' : 'iono') : '')
      + '. Chi non compare va aggiunto in Utenti o in Turni → Dipendenti (o riattivato).</div>';
    w.innerHTML = sts.map(function (s) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">'
        + '<span style="flex:1">' + esc(s.name) + (s.isUser ? ' <span style="color:var(--txt2);font-size:10px">(utente)</span>' : '') + '</span>'
        + '<span style="color:' + (has[s.id] ? '#3ac47a' : 'var(--txt2)') + '">' + (has[s.id] ? 'PIN impostato' : 'senza PIN') + '</span>'
        + '<button class="btn bg bs" data-id="' + esc(s.id) + '" onclick="timbSetPin(this.dataset.id)">' + (has[s.id] ? 'Cambia' : 'Imposta') + '</button>'
        + (has[s.id] ? '<button class="btn bd bs" data-id="' + esc(s.id) + '" onclick="timbClearPin(this.dataset.id)">✕</button>' : '')
        + '</div>';
    }).join('') + nota;
  }

  function fillWho() {
    var sel = $('timb-who'), cur = sel.value;
    var optsAll = people(true).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + (s.active === false ? ' (disattivato)' : '') + '</option>'; }).join('');
    var opts = people().map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
    sel.innerHTML = '<option value="">Tutti</option>' + optsAll;
    sel.value = cur;
    var tc = $('tc-who');
    if (tc) { var c2 = tc.value; tc.innerHTML = opts; if (c2) tc.value = c2; }
  }

  window.timbRender = function () {
    if (!$('timb-list')) return;
    var list = filtered();
    renderNow();
    renderSummary();
    renderMonths();
    renderList(list);
  };
  // Chiamata da app.js a ogni aggiornamento in tempo reale
  window.timbratureRender = function () {
    var p = $('page-timbrature');
    if (p && p.classList.contains('on')) { fillWho(); window.timbRender(); renderPins(); }
  };

  window.timbratureInit = async function () {
    if (!$('timb-from').value) {
      // di partenza: il mese in corso, dal primo all'ultimo giorno
      var now = new Date(), r0 = monthRange(now.getFullYear(), now.getMonth());
      year = now.getFullYear();
      $('timb-from').value = r0[0];
      $('timb-to').value = r0[1];
    }
    fillWho();
    window.timbRender();
    try {
      cfg = await call({ action: 'config' });
      renderPins();
      window.timbQr();
    } catch (e) {
      $('timb-qr').textContent = e.message;
    }
  };

  // ── QR ──────────────────────────────────────────────────
  function baseOrigin() {
    var h = location.hostname;
    return (h === 'localhost' || h === '127.0.0.1' || !h) ? PROD_ORIGIN : location.origin;
  }
  function qrUrl() {
    var sede = ($('timb-sede').value || '').trim();
    return baseOrigin() + '/timbra.html?k=' + encodeURIComponent(cfg.key) + (sede ? '&s=' + encodeURIComponent(sede) : '');
  }
  function loadQrLib() {
    return new Promise(function (res, rej) {
      if (window.QRCode) return res();
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('Libreria QR non caricata')); };
      document.head.appendChild(s);
    });
  }
  window.timbQr = async function () {
    if (!cfg || !cfg.key) return;
    try { if (!$('timb-sede').value) $('timb-sede').value = localStorage.getItem('cm_timb_sede') || ''; } catch (e) { /* storage non disponibile */ }
    try { localStorage.setItem('cm_timb_sede', $('timb-sede').value); } catch (e) { /* idem */ }
    try {
      await loadQrLib();
      var box = $('timb-qr');
      box.innerHTML = '';
      new window.QRCode(box, { text: qrUrl(), width: 160, height: 160, correctLevel: window.QRCode.CorrectLevel.M });
      $('timb-url').textContent = qrUrl();
    } catch (e) { $('timb-qr').textContent = e.message; }
  };
  window.timbPrintQr = function () {
    if (!cfg) { toast('Il QR non è ancora pronto: la funzione di timbratura non risponde, riprova tra poco.', 'err'); return; }
    var sede = ($('timb-sede').value || '').trim();
    var img = $('timb-qr').querySelector('canvas');
    var src = img ? img.toDataURL('image/png') : ($('timb-qr').querySelector('img') || {}).src;
    if (!src) { toast('QR non pronto', 'err'); return; }
    var w = window.open('', '_blank');
    if (!w) { toast('Consenti i popup per stampare', 'err'); return; }
    w.document.write('<!doctype html><title>QR timbratura</title><style>@page{size:A4}body{font-family:sans-serif;text-align:center;padding:40px}'
      + 'img{width:420px;height:420px}h1{font-size:44px;margin:0 0 6px}p{font-size:22px;color:#444}</style>'
      + '<h1>Timbratura</h1>' + (sede ? '<p>' + esc(sede) + '</p>' : '')
      + '<img src="' + src + '"><p>1. Inquadra il codice con la fotocamera<br>2. Inserisci il tuo PIN personale<br>3. Conferma entrata o uscita</p>'
      + '<script>window.onload=function(){window.print();}<\/script>');
    w.document.close();
  };
  window.timbRotate = async function () {
    if (!confirm('Cambiare la chiave? I QR già stampati non funzioneranno più e andranno ristampati.')) return;
    try { var r = await call({ action: 'rotateKey' }); cfg.key = r.key; window.timbQr(); toast('Chiave cambiata: stampa il nuovo QR'); } catch (e) { toast(e.message, 'err'); }
  };

  // ── PIN ─────────────────────────────────────────────────
  window.timbSetPin = async function (id) {
    var s = people(true).find(function (x) { return x.id === id; });
    var pin = prompt('Nuovo PIN per ' + (s ? s.name : '') + ' (4-6 cifre):');
    if (pin == null) return;
    try { await call({ action: 'setPin', staffId: id, pin: pin.trim() }); if (cfg.pins.indexOf(id) < 0) cfg.pins.push(id); renderPins(); toast('PIN salvato'); } catch (e) { toast(e.message, 'err'); }
  };
  window.timbClearPin = async function (id) {
    if (!confirm('Rimuovere il PIN? Non potrà più timbrare finché non ne ha uno nuovo.')) return;
    try { await call({ action: 'clearPin', staffId: id }); cfg.pins = cfg.pins.filter(function (x) { return x !== id; }); renderPins(); toast('PIN rimosso'); } catch (e) { toast(e.message, 'err'); }
  };

  // ── Correzioni e modifiche ──────────────────────────────
  function toLocalInput(iso) {
    var d = new Date(iso), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function openForm(editing) {
    $('tc-title').textContent = editing ? 'Modifica timbratura' : 'Correzione manuale';
    $('tc-note-lbl').textContent = editing ? 'Motivo della modifica (obbligatorio)' : 'Motivo (obbligatorio)';
    $('tc-who').disabled = !!editing;
    $('tc-msg').textContent = '';
    $('timb-corr').style.display = 'block';
    $('timb-corr').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  window.timbOpenCorr = function () {
    fillWho();
    $('tc-id').value = '';
    $('tc-ts').value = toLocalInput(new Date().toISOString());
    $('tc-note').value = '';
    openForm(false);
  };
  // Pennina in tabella: modifica tipo e orario di una timbratura esistente
  window.timbOpenEdit = function (id) {
    var r = (window._timbList || []).find(function (x) { return x.id === id; });
    if (!r) return;
    fillWho();
    var who = $('tc-who');
    if (!Array.prototype.some.call(who.options, function (o) { return o.value === r.staffId; })) {
      who.insertAdjacentHTML('beforeend', '<option value="' + esc(r.staffId) + '">' + esc(r.staffName) + '</option>');
    }
    who.value = r.staffId;
    $('tc-id').value = id;
    $('tc-tipo').value = r.tipo;
    $('tc-ts').value = toLocalInput(r.ts);
    $('tc-note').value = '';
    openForm(true);
  };
  window.timbSaveCorr = async function () {
    var ts = $('tc-ts').value, id = $('tc-id').value;
    if (!$('tc-who').value || !ts) { $('tc-msg').textContent = 'Scegli collaboratore, data e ora.'; return; }
    if (!$('tc-note').value.trim()) { $('tc-msg').textContent = 'Indica il motivo.'; return; }
    try {
      // il campo datetime-local è nell'ora del browser: lo convertiamo in ISO (UTC)
      var iso = new Date(ts).toISOString();
      if (id) await call({ action: 'editPunch', id: id, tipo: $('tc-tipo').value, ts: iso, motivo: $('tc-note').value.trim() });
      else await call({ action: 'addPunch', staffId: $('tc-who').value, tipo: $('tc-tipo').value, ts: iso, note: $('tc-note').value.trim(), sede: ($('timb-sede').value || '').trim() });
      $('timb-corr').style.display = 'none';
      toast(id ? 'Timbratura modificata' : 'Correzione registrata');
    } catch (e) { $('tc-msg').textContent = e.message; }
  };
  window.timbDelete = async function (id) {
    if (!confirm('Eliminare questa timbratura? Ne resta traccia nell\'archivio interno.')) return;
    try { await call({ action: 'deletePunch', id: id }); toast('Timbratura eliminata'); } catch (e) { toast(e.message, 'err'); }
  };

  // ── Mesi ────────────────────────────────────────────────
  var MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  var MESI_LUNGHI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var year = new Date().getFullYear();
  function pad(n) { return String(n).padStart(2, '0'); }
  function monthRange(y, m) {
    var last = new Date(y, m + 1, 0).getDate();
    return [y + '-' + pad(m + 1) + '-01', y + '-' + pad(m + 1) + '-' + pad(last)];
  }
  function renderMonths() {
    var w = $('timb-months');
    if (!w) return;
    var f = $('timb-from').value, t = $('timb-to').value;
    var h = '<button class="btn bg bs" onclick="timbYear(-1)" title="Anno precedente">◀</button><b style="font-size:13px;min-width:42px;text-align:center">' + year + '</b><button class="btn bg bs" onclick="timbYear(1)" title="Anno successivo">▶</button>';
    MESI.forEach(function (n, m) {
      var r = monthRange(year, m), on = f === r[0] && t === r[1];
      h += '<button class="btn bs ' + (on ? 'ba' : 'bg') + '" onclick="timbMonth(' + m + ')" title="Dal primo all\'ultimo giorno di ' + MESI_LUNGHI[m] + '">' + n + '</button>';
    });
    w.innerHTML = h;
  }
  window.timbYear = function (d) { year += d; renderMonths(); };
  window.timbMonth = function (m) {
    var r = monthRange(year, m);
    $('timb-from').value = r[0];
    $('timb-to').value = r[1];
    window.timbRender();
  };

  // ── Stampa PDF (finestra A4 pulita → "Salva come PDF" dal browser) ──
  function periodLabel(rep) {
    var f = rep.from, t = rep.to;
    var fmtDay = function (d) { var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }; // senza giorno della settimana
    var m = f && t && /-01$/.test(f) && t === monthRange(+f.slice(0, 4), +f.slice(5, 7) - 1)[1] && f.slice(0, 7) === t.slice(0, 7);
    if (m) return MESI_LUNGHI[+f.slice(5, 7) - 1] + ' ' + f.slice(0, 4) + ' (dal ' + fmtDay(f) + ' al ' + fmtDay(t) + ')';
    return (f ? 'dal ' + fmtDay(f) : 'dall\'inizio') + (t ? ' al ' + fmtDay(t) : '');
  }
  window.timbPrint = function (mode) {
    var rep = buildReport();
    if (!rep.persone.length) { toast('Nessuna timbratura nel periodo scelto', 'err'); return; }
    var cn = (window.CINEMA_CONFIG && window.CINEMA_CONFIG.nome) || 'Cinema';
    var per = periodLabel(rep);
    // indirizzo assoluto: la finestra di stampa è about:blank e non risolve percorsi relativi in modo affidabile
    var logo = new URL('img/logo-cinema.svg', location.href).href;
    var nameFilter = $('timb-who').value ? rep.persone[0].name : 'Tutti i collaboratori';
    var head = function (titolo) {
      return '<div class="hd"><div><img class="lg" src="' + logo + '" alt="' + esc(cn) + '"><h1>' + titolo + '</h1></div>'
        + '<div class="meta">Periodo: <b>' + esc(per) + '</b><br>' + esc(nameFilter) + '<br>Stampato il ' + new Date().toLocaleDateString('it-IT') + '</div></div>';
    };
    var totTable = '<table><thead><tr><th>Collaboratore</th><th class="n">Turni</th><th class="n">Ore (h:mm)</th><th class="n">Ore decimali</th><th>Note</th></tr></thead><tbody>'
      + rep.persone.map(function (o) {
        return '<tr><td>' + esc(o.name) + '</td><td class="n">' + o.turni + '</td><td class="n">' + fmtDur(o.ms) + '</td><td class="n">' + fmtDec(o.ms) + '</td><td>'
          + (o.anomalie ? '⚠ ' + o.anomalie + ' timbratur' + (o.anomalie === 1 ? 'a' : 'e') + ' incomplet' + (o.anomalie === 1 ? 'a' : 'e') + ' (ore non conteggiate)' : '') + '</td></tr>';
      }).join('')
      + '<tr class="tot"><td>Totale</td><td class="n">' + rep.persone.reduce(function (a, o) { return a + o.turni; }, 0) + '</td><td class="n">' + fmtDur(rep.totMs) + '</td><td class="n">' + fmtDec(rep.totMs) + '</td><td></td></tr></tbody></table>';
    var body = head(mode === 'totali' ? 'Totale ore dipendenti' : 'Ore dipendenti — totali e dettaglio') + totTable;
    if (mode === 'dettaglio') {
      rep.persone.forEach(function (o) {
        body += '<div class="pg">' + head('Dettaglio — ' + esc(o.name))
          + '<table><thead><tr><th>Data</th><th>Entrata</th><th>Uscita</th><th class="n">Ore</th><th>Note</th></tr></thead><tbody>'
          + o.sessioni.map(function (se) {
            var note = [];
            if (!se.in) note.push('⚠ uscita senza entrata');
            else if (!se.out) note.push(se.inCorso ? 'in corso' : '⚠ uscita non registrata');
            [se.in, se.out].forEach(function (r) {
              if (!r) return;
              if (r.source === 'manuale') note.push((r.tipo === 'entrata' ? 'entrata' : 'uscita') + ' inserita a mano' + (r.note ? ': ' + r.note : ''));
              if (r.modifica) note.push((r.tipo === 'entrata' ? 'entrata' : 'uscita') + ' modificata: ' + r.modifica.motivo);
            });
            var giornoDopo = se.in && se.out && se.out.day !== se.in.day ? ' <span class="s">(+1 g)</span>' : '';
            return '<tr><td>' + fmtDay(se.day) + '</td><td>' + (se.in ? fmtTime(se.in.ts) : '—') + '</td><td>' + (se.out ? fmtTime(se.out.ts) + giornoDopo : '—') + '</td><td class="n">'
              + (se.in && se.out ? fmtDur(se.ms) : '—') + '</td><td class="s">' + esc(note.join(' · ')) + '</td></tr>';
          }).join('')
          + '<tr class="tot"><td colspan="3">Totale ' + esc(o.name) + ' (' + o.turni + ' turn' + (o.turni === 1 ? 'o' : 'i') + ')</td><td class="n">' + fmtDur(o.ms) + '</td><td class="s">' + fmtDec(o.ms) + ' ore decimali</td></tr></tbody></table></div>';
      });
    }
    var w = window.open('', '_blank');
    if (!w) { toast('Consenti i popup per stampare', 'err'); return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>Ore dipendenti — ' + esc(per) + '</title><style>'
      + '@page{size:A4;margin:14mm}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:12px;color:#111}'
      + '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #ef7815;padding-bottom:8px;margin-bottom:14px}'
      + '.lg{display:block;height:46px;width:auto;margin-bottom:8px}h1{font-size:20px;margin:2px 0 0}.meta{text-align:right;font-size:11px;color:#444}'
      + 'table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f3f3;font-size:11px}'
      + '.n{text-align:right;white-space:nowrap}.s{font-size:10.5px;color:#555}tr.tot td{font-weight:700;border-top:2px solid #111;background:#faf6f1}'
      + '.pg{page-break-before:always}tr{page-break-inside:avoid}</style>' + body
      + '<script>window.onload=function(){window.print();}<\/script>');
    w.document.close();
  };

  // ── CSV ─────────────────────────────────────────────────
  window.timbCsv = function () {
    var list = filtered().slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    if (!list.length) { toast('Nessuna timbratura da esportare', 'err'); return; }
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Data', 'Ora', 'Collaboratore', 'Tipo', 'Sede', 'Origine', 'Nota'].map(q).join(';')];
    list.forEach(function (r) {
      rows.push([r.day, fmtTime(r.ts), r.staffName, r.tipo, r.sede || '', r.source, r.note || ''].map(q).join(';'));
    });
    var blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timbrature_' + ($('timb-from').value || 'dal') + '_' + ($('timb-to').value || 'al') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
})();
