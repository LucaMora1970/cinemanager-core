// Operazioni sui dipendenti riservate all'AMMINISTRATORE: disattivare/riattivare ed eliminare.
// Il ruolo è verificato QUI (token Firebase + settings/users), non solo nella pagina; le regole
// Firestore vietano al browser di cancellare un dipendente o di cambiare il suo campo "active",
// quindi l'unica via per farlo è questa funzione.
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

async function authorizeAdmin(event) {
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
  if (!found || found.role !== 'admin') throw fail(403, 'Solo l\'amministratore può farlo');
  return { email };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  try {
    const who = await authorizeAdmin(event);
    const db = admin.firestore();
    let d;
    try { d = JSON.parse(event.body || '{}'); } catch (e) { throw fail(400, 'Richiesta non valida'); }
    const staffId = String(d.staffId || '');
    if (!staffId) throw fail(400, 'Dipendente mancante');
    const ref = db.doc('staff/' + staffId);
    const snap = await ref.get();
    if (!snap.exists) throw fail(404, 'Dipendente non trovato');

    if (d.action === 'setActive') {
      const active = d.active !== false;
      await ref.set({ active, deactivatedAt: active ? null : new Date().toISOString(), deactivatedBy: active ? null : who.email }, { merge: true });
      return reply(200, { ok: true });
    }
    if (d.action === 'delete') {
      // PIN e stato "in servizio" non hanno senso senza il dipendente; lo storico delle
      // timbrature resta (ogni riga conserva già il nome)
      await Promise.all([
        ref.delete(),
        db.doc('timbraturePin/' + staffId).delete(),
        db.doc('timbratureStato/' + staffId).delete(),
      ]);
      return reply(200, { ok: true });
    }
    throw fail(400, 'Azione sconosciuta');
  } catch (e) {
    if (!e.status) console.error('staff-admin', e);
    return reply(e.status || 500, { error: e.status ? e.message : 'Errore del servizio' });
  }
};
