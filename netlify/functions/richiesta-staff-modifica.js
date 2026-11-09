// Correzione della proposta da parte di chi deve approvare (richiesta-staff.html).
// La pagina non ha login: chi corregge scrive il proprio nome, registrato in
// conversazione e storico come traccia (non come prova d'identità). La richiesta
// deve essere ancora "in attesa di approvazione": dopo l'approvazione/rifiuto o
// una correzione già fatta il link non può più modificare nulla.
//
// Effetto: la proposta corretta diventa un messaggio della conversazione, la
// richiesta torna a "proposta_inviata" (il cliente deve RICONFERMARE) e al
// cliente arriva un'email con il link.
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPO = { compleanno: 'Compleanno', 'sala-privata': 'Sala privata', aziendale: 'Evento aziendale' };

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
function reply(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
function fail(status, msg) { return Object.assign(new Error(msg), { status }); }
const clean = (v, n) => String(v || '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Richiesta non valida' }); }
  const id = String(d.id || '').trim();
  const chi = clean(d.chi, 60);
  const proposta = clean(d.proposta, 6000);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return reply(400, { error: 'Link non valido' });
  if (!chi) return reply(400, { error: 'Scrivi il tuo nome' });
  if (!proposta) return reply(400, { error: 'Il testo della proposta non può essere vuoto' });
  const foyer = {};
  for (const k of ['foyerOraArrivo', 'foyerOraFineFilm', 'foyerOraDisponibileFino']) {
    if (d[k] == null || d[k] === '') continue;
    const v = String(d[k]).trim();
    if (!ORA.test(v)) return reply(400, { error: 'Orario non valido (usa il formato 15:30)' });
    foyer[k] = v;
  }

  try {
    initAdmin();
    const db = admin.firestore();
    const ref = db.collection('richiesteEventi').doc(id);
    const now = new Date().toISOString();
    let r;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail(404, 'Richiesta non trovata');
      r = snap.data();
      if (r.staffApprovazione !== 'in_attesa') throw fail(409, 'Questa richiesta è già stata gestita da un collega');
      const storico = Array.isArray(r.storico) ? r.storico.slice() : [];
      storico.push({ azione: 'Proposta corretta (dalla pagina di approvazione)', chi, quando: now });
      tx.update(ref, {
        proposta,
        ...foyer,
        stato: 'proposta_inviata',
        staffApprovazione: admin.firestore.FieldValue.delete(),
        storico,
        updatedAt: now,
      });
    });

    const msgs = ref.collection('messaggi');
    await msgs.add({ da: 'staff', tipo: 'proposta', chi, testo: proposta, createdAt: now });
    await msgs.add({ da: 'sistema', chi: '', testo: `Proposta corretta da ${chi}: il cliente deve riconfermare`, createdAt: new Date(Date.now() + 1).toISOString() });

    if (r.email) {
      await fetch('https://cinema-import-proxy.netlify.app/.netlify/functions/send-request-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'proposta-corretta', to: r.email, nome: r.nome || '', tipoLabel: TIPO[r.tipo] || '',
          link: 'https://www.cinemamultisalateatro.ch/richiesta.html?id=' + id,
        }),
      }).catch((e) => console.error('email cliente', e));
    }
    return reply(200, { ok: true });
  } catch (e) {
    if (!e.status) console.error('richiesta-staff-modifica', e);
    return reply(e.status || 500, { error: e.status ? e.message : 'Errore del servizio, riprova' });
  }
};
