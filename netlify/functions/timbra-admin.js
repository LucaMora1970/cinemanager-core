// Gestione timbrature dal gestionale: chiave del QR, PIN dei collaboratori, correzioni manuali.
// Chiamabile solo da utenti loggati con ruolo admin o segretaria (token Firebase verificato qui,
// ruolo letto da settings/users). Le scritture sulle collezioni delle timbrature passano
// tutte da Admin SDK: dal browser le regole Firestore le vietano.
const admin = require('firebase-admin');
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const ALLOWED_ROLES = ['admin', 'segretaria'];

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

function reply(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function fail(status, msg) {
  return Object.assign(new Error(msg), { status });
}

async function authorize(event) {
  const h = event.headers || {};
  const m = /^Bearer\s+(.+)$/i.exec(h.authorization || h.Authorization || '');
  if (!m) throw fail(401, 'Accesso richiesto');
  initAdmin();
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1]); } catch (e) { throw fail(401, 'Sessione non valida'); }
  const email = String(decoded.email || '').trim().toLowerCase();
  const snap = await admin.firestore().doc('settings/users').get();
  const list = snap.exists ? (snap.data().list || []) : [];
  const found = list.find((u) => String(u.email || '').trim().toLowerCase() === email);
  if (!found || !ALLOWED_ROLES.includes(found.role)) throw fail(403, 'Non autorizzato');
  return { email, role: found.role };
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function localDay(d) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(d);
}

// Ricalcola lo stato "in servizio" di un collaboratore dall'ultima timbratura registrata
async function recomputeStato(db, staffId) {
  const snap = await db.collection('timbrature').where('staffId', '==', staffId).get();
  let last = null;
  snap.forEach((s) => { const v = s.data(); if (!last || v.ts > last.ts) last = v; });
  const ref = db.doc('timbratureStato/' + staffId);
  if (!last) { await ref.delete(); return; }
  await ref.set({
    staffId, staffName: last.staffName, inServizio: last.tipo === 'entrata',
    since: last.tipo === 'entrata' ? last.ts : null, entrataId: last.tipo === 'entrata' ? last.id : null,
    sede: last.sede || '', lastTs: last.ts, lastTipo: last.tipo,
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  try {
    const who = await authorize(event);
    const db = admin.firestore();
    let d;
    try { d = JSON.parse(event.body || '{}'); } catch (e) { throw fail(400, 'Richiesta non valida'); }

    switch (d.action) {
      case 'config': {
        const ref = db.doc('timbratureConfig/main');
        let key = ((await ref.get()).data() || {}).key;
        if (!key) { key = crypto.randomBytes(12).toString('hex'); await ref.set({ key }); }
        const pins = await db.collection('timbraturePin').get();
        return reply(200, { key, pins: pins.docs.map((p) => p.id) });
      }
      case 'rotateKey': {
        const key = crypto.randomBytes(12).toString('hex');
        await db.doc('timbratureConfig/main').set({ key });
        return reply(200, { key });
      }
      case 'setPin': {
        const staffId = String(d.staffId || '');
        const pin = String(d.pin || '').trim();
        if (!/^\d{4,6}$/.test(pin)) throw fail(400, 'Il PIN deve avere da 4 a 6 cifre');
        if (!(await db.doc('staff/' + staffId).get()).exists) throw fail(404, 'Collaboratore non trovato');
        const pins = await db.collection('timbraturePin').get();
        let clash = false;
        pins.forEach((p) => {
          const v = p.data();
          if (p.id !== staffId && hashPin(pin, v.salt) === v.hash) clash = true;
        });
        if (clash) throw fail(409, 'Questo PIN è già usato da un altro collaboratore: sceglierne un altro');
        const salt = crypto.randomBytes(8).toString('hex');
        await db.doc('timbraturePin/' + staffId).set({ salt, hash: hashPin(pin, salt), by: who.email, at: new Date().toISOString() });
        return reply(200, { ok: true });
      }
      case 'clearPin': {
        await db.doc('timbraturePin/' + String(d.staffId || '')).delete();
        return reply(200, { ok: true });
      }
      case 'addPunch': {
        const staffId = String(d.staffId || '');
        const tipo = d.tipo === 'uscita' ? 'uscita' : d.tipo === 'entrata' ? 'entrata' : '';
        const when = new Date(d.ts);
        const note = String(d.note || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
        if (!tipo || isNaN(when.getTime())) throw fail(400, 'Dati non validi');
        if (!note) throw fail(400, 'Indica il motivo della correzione');
        if (when.getTime() > Date.now() + 5 * 60000) throw fail(400, 'L\'orario è nel futuro');
        const st = await db.doc('staff/' + staffId).get();
        if (!st.exists) throw fail(404, 'Collaboratore non trovato');
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await db.doc('timbrature/' + id).set({
          id, staffId, staffName: st.data().name || '', tipo, ts: when.toISOString(), day: localDay(when),
          sede: String(d.sede || '').slice(0, 60), source: 'manuale', note, by: who.email,
        });
        await recomputeStato(db, staffId);
        return reply(200, { ok: true, id });
      }
      case 'deletePunch': {
        const ref = db.doc('timbrature/' + String(d.id || ''));
        const snap = await ref.get();
        if (!snap.exists) throw fail(404, 'Timbratura non trovata');
        // Resta una traccia in timbratureEliminate (non nel Cestino generale, che
        // ripristina solo prenotazioni e richieste; qui nessun accesso dal browser)
        const v = snap.data();
        await db.doc('timbratureEliminate/' + v.id).set({
          ...v, deletedBy: who.email, deletedAt: new Date().toISOString(),
        });
        await ref.delete();
        await recomputeStato(db, v.staffId);
        return reply(200, { ok: true });
      }
      default:
        throw fail(400, 'Azione sconosciuta');
    }
  } catch (e) {
    if (!e.status) console.error('timbra-admin', e);
    return reply(e.status || 500, { error: e.status ? e.message : 'Errore del servizio' });
  }
};
