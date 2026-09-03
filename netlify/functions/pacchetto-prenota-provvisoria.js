// TEMPORANEO — finché il pagamento online (PostFinance Checkout) non è
// collaudato (vedi PACCHETTO_PAGAMENTO_ATTIVO in js/richiesta-shared.js):
// il pacchetto fisso resta "istantaneo" anche senza pagamento online,
// riservando subito lo slot in Programmazione e chiedendo un bonifico
// bancario entro 24 ore. Quando riattiviamo il pagamento online, questa
// funzione smette di essere chiamata (pf-webhook.js prende il suo posto,
// stessa identica logica di creazione prenotazione) — può restare nel
// repo inutilizzata, non fa danno.
//
// Idempotente e con controllo di conflitto: se un'altra prenotazione (o
// un'altra richiesta pacchetto) occupa già la stessa sala/data, non si
// crea una doppia prenotazione — la richiesta viene segnata 'conflitto'
// e lo staff la vede per contattare il cliente a mano.
const admin = require('firebase-admin');

const CORS = { 'Access-Control-Allow-Origin': '*' };
const ORE_VALIDITA = 24;

// Stessa mappa di salaId() in js/app.js e di pf-webhook.js
const SALA_ID = { teatro: '1', ciak: '2', '1908': '3', mignon: '4' };

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  const serviceAccount = JSON.parse(json);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function timeToMin(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return h * 60 + m;
}
function minToTime(min) {
  min = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON non valido' }) };
  }
  const richiestaId = String(data.richiestaId || '').trim();
  if (!richiestaId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'richiestaId mancante' }) };
  }

  try {
    initAdmin();
    const db = admin.firestore();
    const richiestaRef = db.collection('richiesteEventi').doc(richiestaId);
    const richiestaSnap = await richiestaRef.get();
    if (!richiestaSnap.exists) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Richiesta non trovata' }) };
    }
    const r = richiestaSnap.data();

    // Idempotenza: se è già stata processata (retry del client), non si
    // rifà nulla
    if (r.bookingId || r.pagamentoStato) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, already: true }) };
    }

    const salaId = SALA_ID[String(r.salaTagliaId || '').toLowerCase()] || null;
    if (!salaId || !r.dataRichiesta || !r.fasciaOra) {
      // Sala non risolvibile o dati mancanti: non blocchiamo la richiesta,
      // resta semplicemente senza prenotazione automatica — lo staff la
      // integra a mano come per qualsiasi altra richiesta
      console.error('pacchetto-prenota-provvisoria: dati insufficienti', { richiestaId, salaTagliaId: r.salaTagliaId, dataRichiesta: r.dataRichiesta, fasciaOra: r.fasciaOra });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, skipped: true }) };
    }

    // Controllo di conflitto: stessa sala, stessa data già occupata da
    // un'altra prenotazione (Firestore non permette una query diretta
    // dentro l'array "dates", ma per una singola sala sono pochi
    // documenti — si filtra lato server)
    const bookingsSnap = await db.collection('bookings').where('sala', '==', salaId).get();
    const conflitto = bookingsSnap.docs.some((docSnap) => {
      const dates = docSnap.data().dates || [];
      return dates.some((d) => d.date === r.dataRichiesta);
    });

    if (conflitto) {
      await richiestaRef.set({ pagamentoStato: 'conflitto', updatedAt: new Date().toISOString() }, { merge: true });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, conflict: true }) };
    }

    let filmDoc = null;
    if (r.filmId) {
      const filmSnap = await db.collection('films').doc(r.filmId).get();
      if (filmSnap.exists) filmDoc = filmSnap.data();
    }
    const startMin = timeToMin(r.fasciaOra);
    const endTime = minToTime(startMin + (filmDoc && filmDoc.duration ? filmDoc.duration : 120));
    const filmTitolo = r.filmPreferenza || '';

    const scadenza = new Date(Date.now() + ORE_VALIDITA * 3600 * 1000);
    const bookingId = db.collection('bookings').doc().id;
    await db.collection('bookings').doc(bookingId).set({
      id: bookingId,
      richiestaId,
      name: (r.nome || 'Cliente') + (filmTitolo ? ' — ' + filmTitolo : ''),
      type: 'privato',
      sala: salaId,
      filmId: r.filmId || '',
      contact: [r.email, r.telefono].filter(Boolean).join(' · '),
      seats: parseInt(r.numOspiti, 10) || 0,
      note: ['PROVVISORIA — in attesa di bonifico entro ' + scadenza.toLocaleString('it-CH') + '.', r.servizi ? 'Servizi: ' + r.servizi : '', r.note || ''].filter(Boolean).join(' '),
      dates: [{ date: r.dataRichiesta, start: r.fasciaOra, end: endTime }],
      createdBy: 'Pacchetto (in attesa di bonifico)',
      createdAt: new Date().toISOString(),
      updatedBy: 'Pacchetto (in attesa di bonifico)',
      updatedAt: new Date().toISOString(),
    });

    await richiestaRef.set({
      pagamentoStato: 'in_attesa_bonifico',
      pagamentoScadenza: scadenza.toISOString(),
      stato: 'programmata',
      bookingId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, bookingId }) };
  } catch (err) {
    console.error('pacchetto-prenota-provvisoria', err);
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
