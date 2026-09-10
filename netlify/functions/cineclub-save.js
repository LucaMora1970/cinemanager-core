// Riceve una serata inviata da cineclub.html (pagina pubblica separata,
// protetta solo da un codice condiviso — non richiede login) e la scrive
// come prenotazione ricorrente ("Ricorrente", nota "(Cineclub)") più lo
// slide corrispondente in Eventi Speciali, con l'Admin SDK (bypassa le
// regole Firestore, che altrimenti richiederebbero un utente autenticato
// come per ogni altra scrittura di questo sito).
//
// Sicurezza: il codice d'accesso è verificato QUI, lato server (variabile
// d'ambiente CINECLUB_ACCESS_CODE) — la pagina client lo tiene solo per
// non mostrare il modulo a chi non ce l'ha, non è un controllo reale.
const admin = require('firebase-admin');

const CORS = { 'Access-Control-Allow-Origin': '*' };
const STORAGE_BUCKET = 'cinemanager-4c67c.firebasestorage.app';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  const serviceAccount = JSON.parse(json);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: STORAGE_BUCKET });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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

  const accessCode = String(data.accessCode || '');
  const expected = process.env.CINECLUB_ACCESS_CODE || '';
  if (!expected || accessCode !== expected) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Codice non valido' }) };
  }

  const titolo = String(data.titolo || '').trim();
  const dataSerata = String(data.data || '').trim();
  const ora = String(data.ora || '').trim();
  const sala = String(data.sala || '').trim();
  const descrizione = String(data.descrizione || '').trim();
  if (!titolo || !dataSerata || !ora || !['1', '2', '3', '4'].includes(sala)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Dati mancanti o non validi' }) };
  }

  try {
    initAdmin();
    const db = admin.firestore();
    const bookingId = uid();

    // Immagine facoltativa: stesso path "eventi/" già usato per le altre
    // immagini pubbliche (regole Storage già pronte per lettura pubblica)
    let immagine = '';
    if (data.imageBase64 && data.imageType) {
      const buffer = Buffer.from(String(data.imageBase64), 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Immagine troppo grande (max 5 MB)' }) };
      }
      const ext = String(data.imageType).split('/')[1] || 'jpg';
      const path = `eventi/cineclub_${bookingId}.${ext}`;
      const bucket = admin.storage().bucket();
      const file = bucket.file(path);
      await file.save(buffer, { metadata: { contentType: data.imageType } });
      immagine = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
    }

    const booking = {
      id: bookingId,
      richiestaId: '',
      name: titolo,
      type: 'ricorrente',
      sala,
      filmId: '',
      location: '', oaVia: '', oaKm: 0, oaClienteId: '', oaLuogoId: '', postazione: '',
      oaFilmTitle: '', oaFilmMode: '', oaDistributor: '', oaVersione: '', oaSpettatori: 0,
      oaCliente: '', oaStatusProiezione: '', oaPrenotato: '', oaConfermato: '', oaScaricato: '',
      linkedShowId: '',
      contact: '',
      seats: 0,
      note: '(inserito dal Cineclub)',
      mostraEventiSpeciali: true,
      immagine,
      descrizionePubblica: descrizione,
      dates: [{ date: dataSerata, start: ora, end: '' }],
      createdBy: 'cineclub', createdAt: new Date().toISOString(),
      updatedBy: 'cineclub', updatedAt: new Date().toISOString(),
    };
    await db.collection('bookings').doc(bookingId).set(booking);

    // Stessa logica di syncEventoSpecialeFromBooking() in js/app.js — qui
    // duplicata perché questa funzione gira lato server, senza accesso al
    // codice del client
    const ordineSnap = await db.collection('eventiSpeciali').get();
    let maxOrdine = 0;
    ordineSnap.forEach((d) => { const o = d.data().ordine || 0; if (o > maxOrdine) maxOrdine = o; });
    await db.collection('eventiSpeciali').doc(bookingId).set({
      id: bookingId,
      titolo,
      data: dataSerata,
      ora,
      badge: 'Cineclub',
      sottotitolo: '',
      descrizione,
      immagine,
      link: '',
      prezzoRidotto: false,
      etichettaProgramma: '',
      ordine: maxOrdine + 1,
      attivo: true,
      bookingId,
    });

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, bookingId }) };
  } catch (err) {
    console.error('cineclub-save', err);
    return { statusCode: 502, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
