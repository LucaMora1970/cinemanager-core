// Messaggio del CLIENTE sulla conversazione di una richiesta (richiesta.html).
// Scrive in richiesteEventi/{id}/messaggi con l'Admin SDK: le regole Firestore
// non lasciano scrivere il pubblico, così lunghezza, frequenza e destinatario
// dell'avviso sono decisi qui. L'id della richiesta (non indovinabile) è la
// "chiave" di accesso, come per la pagina di stato.
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const MAX_LEN = 2000;
const MAX_MESSAGGI = 200;
const MIN_INTERVALLO_MS = 8000;

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

function reply(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

const TIPO = { compleanno: 'Compleanno', 'sala-privata': 'Sala privata', aziendale: 'Evento aziendale' };

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Richiesta non valida' }); }
  const id = String(d.id || '').trim();
  const testo = String(d.testo || '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return reply(400, { error: 'Link non valido' });
  if (!testo) return reply(400, { error: 'Scrivi un messaggio' });
  if (testo.length > MAX_LEN) return reply(400, { error: `Messaggio troppo lungo (max ${MAX_LEN} caratteri)` });

  try {
    initAdmin();
    const db = admin.firestore();
    const ref = db.collection('richiesteEventi').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return reply(404, { error: 'Richiesta non trovata' });
    const r = snap.data();

    const msgs = ref.collection('messaggi');
    const ultimo = await msgs.orderBy('createdAt', 'desc').limit(1).get();
    if (!ultimo.empty) {
      const u = ultimo.docs[0].data();
      if (u.da === 'cliente' && Date.now() - new Date(u.createdAt).getTime() < MIN_INTERVALLO_MS) {
        return reply(429, { error: 'Attendi qualche secondo prima di inviare un altro messaggio' });
      }
    }
    const count = (await msgs.count().get()).data().count;
    if (count >= MAX_MESSAGGI) return reply(429, { error: 'Troppi messaggi su questa richiesta, scrivici per email' });

    const now = new Date().toISOString();
    await msgs.add({ da: 'cliente', chi: String(r.nome || 'Cliente').slice(0, 80), testo, createdAt: now });
    await ref.set({ nuovoMsgCliente: true, ultimoMsgAt: now }, { merge: true });

    // Avviso agli indirizzi dello staff — senza il testo; non blocca il cliente se fallisce
    try {
      const st = await db.doc('settings/richiesteStaff').get();
      const emails = ((st.exists && st.data().emails) || []).filter(Boolean);
      await Promise.all(emails.map((to) => fetch('https://cinema-import-proxy.netlify.app/.netlify/functions/send-request-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'nuovo-messaggio-cliente', to, nome: r.nome || '', tipoLabel: TIPO[r.tipo] || '',
          link: 'https://www.cinemamultisalateatro.ch/gestione.html',
        }),
      }).catch((e) => console.error('avviso staff', e))));
    } catch (e) { console.error('avviso staff', e); }

    return reply(200, { ok: true });
  } catch (e) {
    console.error('richiesta-messaggio', e);
    return reply(500, { error: 'Errore del servizio, riprova' });
  }
};
