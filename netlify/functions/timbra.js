// Timbratura entrata/uscita per i collaboratori (anche esterni, senza account):
// pagina pubblica timbra.html, aperta scansionando il QR stampato in sede.
//
// Sicurezza (la pagina è pubblica, quindi i controlli sono TUTTI qui):
//  - la chiave "k" nel QR (timbratureConfig/main.key, ruotabile dal gestionale) deve coincidere:
//    chi non ha scansionato il QR non può nemmeno provare un PIN;
//  - il PIN personale (4-6 cifre) è salvato solo come hash salato in timbraturePin, collezione
//    senza accesso dal browser (solo Admin SDK);
//  - tentativi sbagliati limitati per indirizzo IP (MAX_FAILS in LOCK_MIN minuti);
//  - l'orario è sempre quello del SERVER, mai quello del telefono.
// Le timbrature stanno in `timbrature` (scrivibile solo da qui e da timbra-admin).
const admin = require('firebase-admin');
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const DEDUPE_SEC = 45; // doppio tocco: non registra due timbrature quasi identiche
const STALE_HOURS = 16; // entrata più vecchia di così = uscita dimenticata

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

function reply(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function sameStr(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Data locale (Svizzera) in formato YYYY-MM-DD
function localDay(d) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(d);
}

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Richiesta non valida' }); }
  const action = d.action === 'punch' ? 'punch' : 'check';
  const pin = String(d.pin || '').trim();
  const sede = String(d.sede || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  if (!/^\d{4,6}$/.test(pin)) return reply(400, { error: 'Inserisci il tuo PIN (4-6 cifre)' });

  try {
    initAdmin();
    const db = admin.firestore();

    const cfgSnap = await db.doc('timbratureConfig/main').get();
    const key = cfgSnap.exists ? cfgSnap.data().key : '';
    if (!key) return reply(503, { error: 'Timbratura non ancora attivata' });
    if (!sameStr(d.k || '', key)) return reply(403, { error: 'QR non valido o scaduto: scansiona quello esposto in sede' });

    // Blocco temporaneo dopo troppi PIN sbagliati dallo stesso IP
    const ipId = crypto.createHash('sha256').update(clientIp(event)).digest('hex').slice(0, 32);
    const lockRef = db.doc('timbratureLock/' + ipId);
    const lock = (await lockRef.get()).data() || {};
    const now = Date.now();
    if (lock.fails >= MAX_FAILS && now - (lock.last || 0) < LOCK_MIN * 60000) {
      return reply(429, { error: 'Troppi tentativi: riprova tra qualche minuto' });
    }

    // Cerca il collaboratore dal PIN
    const pins = await db.collection('timbraturePin').get();
    let staffId = null;
    pins.forEach((p) => {
      const v = p.data();
      if (!staffId && v.hash && sameStr(hashPin(pin, v.salt), v.hash)) staffId = p.id;
    });
    if (!staffId) {
      const fails = (now - (lock.last || 0) < LOCK_MIN * 60000 ? lock.fails || 0 : 0) + 1;
      await lockRef.set({ fails, last: now });
      return reply(401, { error: 'PIN non riconosciuto' });
    }
    if (lock.fails) await lockRef.delete();

    const staffSnap = await db.doc('staff/' + staffId).get();
    if (!staffSnap.exists) return reply(401, { error: 'PIN non riconosciuto' });
    const name = staffSnap.data().name || 'Collaboratore';

    const statoRef = db.doc('timbratureStato/' + staffId);
    const stato = (await statoRef.get()).data() || {};
    const sinceMs = stato.since ? Date.parse(stato.since) : 0;
    const stale = stato.inServizio && now - sinceMs > STALE_HOURS * 3600000;
    const next = stato.inServizio && !stale ? 'uscita' : 'entrata';

    if (action === 'check') {
      return reply(200, { name, next, since: stato.inServizio && !stale ? stato.since : null, stale: !!stale });
    }

    // Doppio tocco: restituisce l'ultima timbratura senza duplicarla
    if (stato.lastTs && now - Date.parse(stato.lastTs) < DEDUPE_SEC * 1000) {
      return reply(200, { name, tipo: stato.lastTipo, ts: stato.lastTs, duplicate: true });
    }

    const ts = new Date(now).toISOString();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const rec = {
      id, staffId, staffName: name, tipo: next, ts, day: localDay(new Date(now)),
      sede, source: 'qr',
    };
    if (stale && stato.entrataId) {
      rec.note = 'Uscita precedente non registrata';
      await db.doc('timbrature/' + stato.entrataId).set({ uscitaMancante: true }, { merge: true });
    }
    const batch = db.batch();
    batch.set(db.doc('timbrature/' + id), rec);
    batch.set(statoRef, {
      staffId, staffName: name, inServizio: next === 'entrata', since: next === 'entrata' ? ts : null,
      entrataId: next === 'entrata' ? id : null, sede, lastTs: ts, lastTipo: next,
    });
    await batch.commit();
    return reply(200, { name, tipo: next, ts });
  } catch (e) {
    console.error('timbra', e);
    return reply(500, { error: 'Errore del servizio, riprova' });
  }
};
