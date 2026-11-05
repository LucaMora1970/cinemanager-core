// Impostazioni sensibili riservate all'AMMINISTRATORE: utenti e ruoli, permessi dei
// ruoli, dati per il versamento (IBAN). Il ruolo è verificato QUI (token Firebase +
// settings/users), non solo nella pagina. Quando le regole Firestore vietano al browser
// di scrivere questi documenti, questa funzione è l'unica via per modificarli.
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const ROLES = ['admin', 'operator', 'segretaria', 'programmatore', 'social', 'cassa'];
const PERM_ROLES = ['operator', 'segretaria', 'programmatore', 'social', 'cassa'];

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

const norm = (e) => String(e || '').trim().toLowerCase();

async function authorizeAdmin(event) {
  const h = event.headers || {};
  const m = /^Bearer\s+(.+)$/i.exec(h.authorization || h.Authorization || '');
  if (!m) throw fail(401, 'Accesso richiesto');
  initAdmin();
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1]); } catch (e) { throw fail(401, 'Sessione non valida'); }
  const email = norm(decoded.email);
  const snap = await admin.firestore().doc('settings/users').get();
  const list = snap.exists ? (snap.data().list || []) : [];
  const found = list.find((u) => norm(u.email) === email);
  if (!found || found.role !== 'admin') throw fail(403, 'Solo l\'amministratore può farlo');
  return { email };
}

function ibanValido(v) {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!/^CH\d{2}[A-Z0-9]{17}$/.test(s)) return false;
  const n = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of n) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

// Modifica la lista utenti in transazione (due admin che salvano insieme non si sovrascrivono)
async function editUsers(db, fn) {
  const ref = db.doc('settings/users');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list = snap.exists ? (snap.data().list || []).slice() : [];
    const out = fn(list);
    if (!out.some((u) => u.role === 'admin')) throw fail(400, 'Deve restare almeno un amministratore');
    tx.set(ref, { list: out });
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  try {
    const who = await authorizeAdmin(event);
    const db = admin.firestore();
    let d;
    try { d = JSON.parse(event.body || '{}'); } catch (e) { throw fail(400, 'Richiesta non valida'); }

    switch (d.action) {
      case 'userAdd': {
        const email = norm(d.email);
        const name = String(d.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
        const role = String(d.role || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Email non valida');
        if (!ROLES.includes(role)) throw fail(400, 'Ruolo non valido');
        await editUsers(db, (list) => {
          if (list.some((u) => norm(u.email) === email)) throw fail(409, 'Utente già presente');
          list.push({ email, name: name || email, role, uid: '' });
          return list;
        });
        return reply(200, { ok: true });
      }
      case 'userRemove': {
        const email = norm(d.email);
        if (email === who.email) throw fail(400, 'Non puoi rimuovere te stesso');
        await editUsers(db, (list) => list.filter((u) => norm(u.email) !== email));
        return reply(200, { ok: true });
      }
      case 'userSetRole': {
        const email = norm(d.email);
        const role = String(d.role || '');
        if (!ROLES.includes(role)) throw fail(400, 'Ruolo non valido');
        await editUsers(db, (list) => {
          const u = list.find((x) => norm(x.email) === email);
          if (!u) throw fail(404, 'Utente non trovato');
          u.role = role;
          return list;
        });
        return reply(200, { ok: true });
      }
      case 'permissionsSave': {
        const p = d.permissions;
        if (!p || typeof p !== 'object' || Array.isArray(p)) throw fail(400, 'Permessi non validi');
        const out = {};
        for (const role of Object.keys(p)) {
          if (!PERM_ROLES.includes(role)) throw fail(400, 'Ruolo non valido nei permessi');
          const tabs = p[role];
          if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) throw fail(400, 'Permessi non validi');
          out[role] = {};
          for (const tab of Object.keys(tabs)) {
            if (!/^[a-zA-Z0-9_-]{1,40}$/.test(tab) || typeof tabs[tab] !== 'boolean') throw fail(400, 'Permessi non validi');
            out[role][tab] = tabs[tab];
          }
        }
        await db.doc('settings/permissions').set(out);
        return reply(200, { ok: true });
      }
      case 'pagamentoSave': {
        const iban = String(d.iban || '').replace(/\s+/g, '').toUpperCase();
        if (!ibanValido(iban)) throw fail(400, 'IBAN non valido');
        const clean = (v, n) => String(v || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
        await db.doc('settings/pagamento').set({
          intestatario: clean(d.intestatario, 120),
          iban: iban.replace(/(.{4})/g, '$1 ').trim(),
          banca: clean(d.banca, 300),
        });
        return reply(200, { ok: true });
      }
      default:
        throw fail(400, 'Azione sconosciuta');
    }
  } catch (e) {
    if (!e.status) console.error('admin-settings', e);
    return reply(e.status || 500, { error: e.status ? e.message : 'Errore del servizio' });
  }
};
