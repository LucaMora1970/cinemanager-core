// Controllo giornaliero delle durate dei film (funzione pianificata, vedi netlify.toml).
// Per ogni film con durata 0 e codice TMDB chiede a TMDB la durata (runtime): appena è
// nota la scrive in films/{id}.duration. Non tocca mai una durata già presente e non
// cerca per titolo (i segnaposto "Untitled…" restano com'erano).
//
// Parte solo dalla pianificazione di Netlify (il corpo contiene next_run): una chiamata
// pubblica qualsiasi viene rifiutata. Richiede la variabile TMDB_API_KEY su Netlify.
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async function (event) {
  let pianificata = false;
  try { pianificata = !!JSON.parse(event.body || '{}').next_run; } catch (e) { /* non pianificata */ }
  if (!pianificata) return { statusCode: 403, body: 'Solo da pianificazione' };

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error('film-durate: manca TMDB_API_KEY su Netlify');
    return { statusCode: 500, body: 'TMDB_API_KEY mancante' };
  }

  try {
    initAdmin();
    const db = admin.firestore();
    const snap = await db.collection('films').get();
    const lista = snap.docs.filter((d) => {
      const f = d.data();
      return !(Number(f.duration) > 0) && f.tmdbId;
    });
    let aggiornati = 0, nonAncora = 0, errori = 0;
    for (const d of lista) {
      const f = d.data();
      try {
        const r = await fetch('https://api.themoviedb.org/3/movie/' + encodeURIComponent(f.tmdbId) + '?language=it-IT&api_key=' + key);
        if (!r.ok) { errori++; continue; }
        const det = await r.json();
        if (det && det.runtime > 0) {
          // transazione: se nel frattempo qualcuno ha inserito la durata a mano non si sovrascrive
          await db.runTransaction(async (tx) => {
            const cur = await tx.get(d.ref);
            if (cur.exists && !(Number(cur.data().duration) > 0)) {
              tx.update(d.ref, { duration: det.runtime, durataImportataIl: new Date().toISOString() });
              aggiornati++;
            }
          });
          console.log('durata importata:', f.title, det.runtime, 'min');
        } else nonAncora++;
      } catch (e) { errori++; console.error('film-durate', d.id, e); }
      await pausa(200);
    }
    console.log(`film-durate: controllati ${lista.length}, aggiornati ${aggiornati}, non ancora note ${nonAncora}, errori ${errori}`);
    return { statusCode: 200, body: JSON.stringify({ controllati: lista.length, aggiornati, nonAncora, errori }) };
  } catch (e) {
    console.error('film-durate', e);
    return { statusCode: 500, body: 'errore' };
  }
};
