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
  function staff() { return (window._cmStaff ? window._cmStaff() : []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); }); }
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

  // Abbina entrata → uscita successiva per ogni collaboratore
  function summarize(list) {
    var by = {};
    list.slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }).forEach(function (r) {
      (by[r.staffId] = by[r.staffId] || { name: r.staffName, ms: 0, turni: 0, open: null, anomalie: 0 });
      var o = by[r.staffId];
      if (r.tipo === 'entrata') {
        if (o.open) o.anomalie++; // entrata senza uscita prima della successiva
        o.open = r;
      } else if (o.open) {
        o.ms += Date.parse(r.ts) - Date.parse(o.open.ts);
        o.turni++;
        o.open = null;
      } else {
        o.anomalie++; // uscita senza entrata
      }
    });
    return by;
  }

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

  function renderSummary(list) {
    var w = $('timb-summary');
    var by = summarize(list);
    var ids = Object.keys(by);
    if (!ids.length) { w.innerHTML = ''; return; }
    var inServizio = {};
    (window._timbStato || []).forEach(function (s) { if (s.inServizio) inServizio[s.staffId] = true; });
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    ids.sort(function (a, b) { return by[a].name.localeCompare(by[b].name); }).forEach(function (id) {
      var o = by[id];
      var warn = o.anomalie + (o.open && !inServizio[id] ? 1 : 0);
      h += '<div style="background:var(--surf2);border-radius:8px;padding:8px 12px;font-size:12px;min-width:150px">'
        + '<b>' + esc(o.name) + '</b><br>' + fmtDur(o.ms) + ' · ' + o.turni + ' turn' + (o.turni === 1 ? 'o' : 'i')
        + (warn ? '<br><span style="color:#e8884a">⚠ ' + warn + ' timbratur' + (warn === 1 ? 'a' : 'e') + ' da controllare</span>' : '')
        + '</div>';
    });
    w.innerHTML = h + '</div>';
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
      h += '<tr><td style="padding:5px 8px;border:1px solid var(--bdr)">' + fmtDay(r.day) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + fmtTime(r.ts) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + esc(r.staffName) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr);font-weight:700;color:' + col + '">' + (r.tipo === 'entrata' ? 'Entrata' : 'Uscita') + (r.uscitaMancante ? ' ⚠' : '') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)">' + esc(r.sede || '') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr);color:var(--txt2)">' + orig + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--bdr)"><button class="btn bd bs" data-id="' + esc(r.id) + '" onclick="timbDelete(this.dataset.id)">✕</button></td></tr>';
    });
    w.innerHTML = h + '</tbody></table>';
  }

  function renderPins() {
    var w = $('timb-pins');
    if (!w) return;
    var has = {};
    ((cfg && cfg.pins) || []).forEach(function (id) { has[id] = true; });
    var sts = staff();
    if (!sts.length) { w.innerHTML = '<span style="color:var(--txt2);font-size:12px">Nessun collaboratore: aggiungili prima nella scheda Turni.</span>'; return; }
    w.innerHTML = sts.map(function (s) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">'
        + '<span style="flex:1">' + esc(s.name) + '</span>'
        + '<span style="color:' + (has[s.id] ? '#3ac47a' : 'var(--txt2)') + '">' + (has[s.id] ? 'PIN impostato' : 'senza PIN') + '</span>'
        + '<button class="btn bg bs" data-id="' + esc(s.id) + '" onclick="timbSetPin(this.dataset.id)">' + (has[s.id] ? 'Cambia' : 'Imposta') + '</button>'
        + (has[s.id] ? '<button class="btn bd bs" data-id="' + esc(s.id) + '" onclick="timbClearPin(this.dataset.id)">✕</button>' : '')
        + '</div>';
    }).join('');
  }

  function fillWho() {
    var sel = $('timb-who'), cur = sel.value;
    var opts = staff().map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
    sel.innerHTML = '<option value="">Tutti</option>' + opts;
    sel.value = cur;
    var tc = $('tc-who');
    if (tc) { var c2 = tc.value; tc.innerHTML = opts; if (c2) tc.value = c2; }
  }

  window.timbRender = function () {
    if (!$('timb-list')) return;
    var list = filtered();
    renderNow();
    renderSummary(list);
    renderList(list);
  };
  // Chiamata da app.js a ogni aggiornamento in tempo reale
  window.timbratureRender = function () {
    var p = $('page-timbrature');
    if (p && p.classList.contains('on')) { fillWho(); window.timbRender(); renderPins(); }
  };

  window.timbratureInit = async function () {
    if (!$('timb-from').value) {
      var now = new Date();
      $('timb-from').value = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
      $('timb-to').value = localDay(now);
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
    if (!cfg) return;
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
    var s = staff().find(function (x) { return x.id === id; });
    var pin = prompt('Nuovo PIN per ' + (s ? s.name : '') + ' (4-6 cifre):');
    if (pin == null) return;
    try { await call({ action: 'setPin', staffId: id, pin: pin.trim() }); if (cfg.pins.indexOf(id) < 0) cfg.pins.push(id); renderPins(); toast('PIN salvato'); } catch (e) { toast(e.message, 'err'); }
  };
  window.timbClearPin = async function (id) {
    if (!confirm('Rimuovere il PIN? Non potrà più timbrare finché non ne ha uno nuovo.')) return;
    try { await call({ action: 'clearPin', staffId: id }); cfg.pins = cfg.pins.filter(function (x) { return x !== id; }); renderPins(); toast('PIN rimosso'); } catch (e) { toast(e.message, 'err'); }
  };

  // ── Correzioni ──────────────────────────────────────────
  window.timbOpenCorr = function () {
    fillWho();
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    $('tc-ts').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    $('tc-note').value = '';
    $('tc-msg').textContent = '';
    $('timb-corr').style.display = 'block';
    $('timb-corr').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.timbSaveCorr = async function () {
    var ts = $('tc-ts').value;
    if (!$('tc-who').value || !ts) { $('tc-msg').textContent = 'Scegli collaboratore, data e ora.'; return; }
    if (!$('tc-note').value.trim()) { $('tc-msg').textContent = 'Indica il motivo.'; return; }
    try {
      // il campo datetime-local è nell'ora del browser: lo convertiamo in ISO (UTC)
      await call({ action: 'addPunch', staffId: $('tc-who').value, tipo: $('tc-tipo').value, ts: new Date(ts).toISOString(), note: $('tc-note').value.trim(), sede: ($('timb-sede').value || '').trim() });
      $('timb-corr').style.display = 'none';
      toast('Correzione registrata');
    } catch (e) { $('tc-msg').textContent = e.message; }
  };
  window.timbDelete = async function (id) {
    if (!confirm('Eliminare questa timbratura? Ne resta traccia nell\'archivio interno.')) return;
    try { await call({ action: 'deletePunch', id: id }); toast('Timbratura eliminata'); } catch (e) { toast(e.message, 'err'); }
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
