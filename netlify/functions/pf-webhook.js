// Webhook PostFinance Checkout — l'unico punto che può segnare una
// richiesta come "pagata" (il client non può farlo da solo, vedi
// firestore.rules). Va registrato nel back-office PostFinance come
// Webhook Listener sull'entità Transaction, con firma abilitata.
//
// Alla conferma del pagamento fa tutto quello che oggi lo staff farebbe a
// mano per il pacchetto fisso:
//  1. segna la richiesta come pagata/programmata
//  2. crea la prenotazione in Programmazione (bookings)
//  3. genera la ricevuta PDF e la manda per email al cliente
//
// Idempotente: i webhook possono arrivare più di una volta per lo stesso
// evento, e PostFinance ripete l'invio finché non risponde 200 — se la
// richiesta risulta già pagata non rifà nulla.
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { Configuration, HttpBearerAuth, TransactionsService, WebhookEncryptionKeysService, TransactionState } = require('postfinancecheckout');

const CORS = { 'Access-Control-Allow-Origin': '*' };
const IVA_ALIQUOTA = 0.081; // IVA svizzera standard — vedi ricevuta

// Stessa mappa di salaId() in js/app.js: le taglie del pacchetto sono
// configurate in gestione.html come una delle 4 sale reali (mignon/1908/
// ciak/teatro), non un id numerico astratto — se in futuro cambia lì va
// aggiornata anche qui
const SALA_ID = { teatro: '1', ciak: '2', '1908': '3', mignon: '4' };

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  const serviceAccount = JSON.parse(json);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function pfConfig() {
  const auth = new HttpBearerAuth(parseInt(process.env.PF_USER_ID, 10), process.env.PF_APPLICATION_KEY);
  return new Configuration({ httpBearerAuth: auth });
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeToMin(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return h * 60 + m;
}
function minToTime(min) {
  min = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

// Ricevuta PDF: intestazione cinema, dettaglio del pacchetto, importo con
// scomposizione IVA — pdfkit costruisce il documento in memoria, nessun
// file temporaneo (siamo in una funzione serverless)
function buildRicevutaPdf({ richiestaId, r, filmTitolo, totale, transactionId }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const netto = totale / (1 + IVA_ALIQUOTA);
    const iva = totale - netto;
    const oggi = new Date().toLocaleDateString('it-CH');

    doc.fontSize(16).font('Helvetica-Bold').text('Cinema Multisala Teatro Mendrisio');
    doc.fontSize(9).font('Helvetica').fillColor('#666').text('Fabbrica dei Sogni Sagl');
    doc.fillColor('#000').fontSize(10).text('Via Vincenzo Vela 21, 6850 Mendrisio');
    doc.text('Partita IVA: CHE-111.733.277');
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica-Bold').text('Ricevuta di pagamento');
    doc.fontSize(9).font('Helvetica').fillColor('#666').text(`Data: ${oggi}  ·  N. transazione: ${transactionId}  ·  Rif. richiesta: ${richiestaId}`);
    doc.fillColor('#000').moveDown(1);

    doc.fontSize(11).font('Helvetica-Bold').text('Pacchetto sala privata');
    doc.font('Helvetica').fontSize(10);
    if (filmTitolo) doc.text(`Film: ${filmTitolo}`);
    if (r.salaTagliaLabel) doc.text(`Sala: ${r.salaTagliaLabel}`);
    if (r.dataRichiesta) doc.text(`Data: ${r.dataRichiesta}`);
    if (r.fasciaOra) doc.text(`Orario: ${r.fasciaOra}`);
    if (r.numOspiti) doc.text(`Ospiti: ${r.numOspiti}`);
    if (r.servizi) doc.text(`Servizi offerti: ${r.servizi}`);
    doc.moveDown(1);

    const fmt = (n) => 'CHF ' + n.toFixed(2);
    doc.font('Helvetica').text(`Importo netto: ${fmt(netto)}`);
    doc.text(`IVA ${(IVA_ALIQUOTA * 100).toFixed(1)}%: ${fmt(iva)}`);
    doc.font('Helvetica-Bold').fontSize(12).text(`Totale pagato: ${fmt(totale)}`);
    doc.moveDown(2);

    doc.fontSize(9).font('Helvetica').fillColor('#666').text('Grazie per aver scelto Cinema Multisala Teatro Mendrisio.');

    doc.end();
  });
}

async function inviaEmailConferma({ r, filmTitolo, totale, dettaglioRighe, pdfBuffer }) {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const saluto = r.nome ? `Ciao ${r.nome},` : 'Ciao,';
  const fmt = (n) => 'CHF ' + n.toFixed(2);
  const righeText = dettaglioRighe.map((r2) => '- ' + r2).join('\n');
  const righeHtml = dettaglioRighe.map((r2) => `<li>${esc(r2)}</li>`).join('');

  const text = `${saluto}\n\nIl tuo pagamento è confermato — la sala privata è prenotata, non serve fare altro.\n\n`
    + `Servizio: pacchetto sala privata${filmTitolo ? ' — ' + filmTitolo : ''}\n\n`
    + `Programma:\n${righeText}\n\n`
    + `Totale pagato: ${fmt(totale)}\n\n`
    + `Trovi la ricevuta in allegato.\n\nCinema Multisala Teatro — Mendrisio`;

  const html = `<p>${esc(saluto)}</p>`
    + `<p>Il tuo pagamento è confermato — la sala privata è prenotata, non serve fare altro.</p>`
    + `<p><b>Servizio:</b> pacchetto sala privata${filmTitolo ? ' — ' + esc(filmTitolo) : ''}</p>`
    + `<p><b>Programma:</b></p><ul>${righeHtml}</ul>`
    + `<p><b>Totale pagato:</b> ${fmt(totale)}</p>`
    + `<p>Trovi la ricevuta in allegato.</p>`
    + `<p>Cinema Multisala Teatro — Mendrisio</p>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: r.email,
    subject: 'Pagamento confermato — Cinema Multisala Teatro',
    text,
    html,
    attachments: [{ filename: 'ricevuta.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-signature' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  const rawBody = event.body || '';
  const signatureHeader = event.headers && (event.headers['x-signature'] || event.headers['X-Signature']);

  try {
    const config = pfConfig();

    // Verifica della firma ECDSA — senza, chiunque potrebbe chiamare questo
    // endpoint e far credere che una richiesta sia stata pagata
    if (signatureHeader) {
      const keysService = new WebhookEncryptionKeysService(config);
      const valid = await keysService.isContentValid(signatureHeader, rawBody);
      if (!valid) {
        console.error('pf-webhook: firma non valida');
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Firma non valida' }) };
      }
    } else {
      // Nessuna firma nell'header: rifiutiamo piuttosto che fidarci alla
      // cieca — va abilitata la firma sul Webhook Listener in PostFinance
      console.error('pf-webhook: header x-signature mancante');
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Firma mancante' }) };
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON non valido' }) };
    }

    const transactionId = payload.entityId || payload.transactionId || payload.id;
    if (!transactionId) {
      console.error('pf-webhook: payload senza id transazione', payload);
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Id transazione mancante nel payload' }) };
    }

    const spaceId = parseInt(process.env.PF_SPACE_ID, 10);
    const transactionsService = new TransactionsService(config);
    // Mai fidarsi solo del payload della notifica: si interroga sempre lo
    // stato reale della transazione tramite l'API
    const transaction = await transactionsService.getPaymentTransactionsId({ id: transactionId, space: spaceId });

    const richiestaId = transaction.merchantReference;
    if (!richiestaId) {
      console.error('pf-webhook: transazione senza merchantReference', transactionId);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) }; // niente da fare, ma non è un errore nostro
    }

    initAdmin();
    const db = admin.firestore();
    const richiestaRef = db.collection('richiesteEventi').doc(richiestaId);
    const richiestaSnap = await richiestaRef.get();
    if (!richiestaSnap.exists) {
      console.error('pf-webhook: richiesta non trovata', richiestaId);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }
    const r = richiestaSnap.data();

    if (transaction.state === TransactionState.Fulfill) {
      // Idempotenza: se è già stata processata (webhook ripetuto), non si
      // ricrea una seconda prenotazione né si rimanda una seconda email
      if (r.pagamentoStato === 'pagata') {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, already: true }) };
      }

      const filmTitolo = r.filmPreferenza || '';
      const totale = parseFloat(r.pacchettoPrezzoTotale) || 0;

      // ── Prenotazione automatica in Programmazione ──────────────────────
      const salaId = SALA_ID[String(r.salaTagliaId || '').toLowerCase()] || null;
      let filmDoc = null;
      if (r.filmId) {
        const filmSnap = await db.collection('films').doc(r.filmId).get();
        if (filmSnap.exists) filmDoc = filmSnap.data();
      }
      const startMin = r.fasciaOra ? timeToMin(r.fasciaOra) : null;
      const endTime = startMin != null
        ? minToTime(startMin + (filmDoc && filmDoc.duration ? filmDoc.duration : 120))
        : '';

      let bookingId = r.bookingId || null;
      if (salaId && r.dataRichiesta && r.fasciaOra) {
        bookingId = db.collection('bookings').doc().id;
        await db.collection('bookings').doc(bookingId).set({
          id: bookingId,
          richiestaId,
          name: (r.nome || 'Cliente') + (filmTitolo ? ' — ' + filmTitolo : ''),
          type: 'privato',
          sala: salaId,
          filmId: r.filmId || '',
          contact: [r.email, r.telefono].filter(Boolean).join(' · '),
          seats: parseInt(r.numOspiti, 10) || 0,
          note: ['Pacchetto pagato online.', r.servizi ? 'Servizi: ' + r.servizi : '', r.note || ''].filter(Boolean).join(' '),
          dates: [{ date: r.dataRichiesta, start: r.fasciaOra, end: endTime }],
          createdBy: 'Pagamento online',
          createdAt: new Date().toISOString(),
          updatedBy: 'Pagamento online',
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Sala non risolvibile o data/orario mancanti: non blocchiamo la
        // conferma del pagamento, ma senza prenotazione automatica —
        // resta visibile allo staff via pagamentoStato/lo stato richiesta
        console.error('pf-webhook: impossibile creare la prenotazione automatica', { richiestaId, salaTagliaId: r.salaTagliaId, dataRichiesta: r.dataRichiesta, fasciaOra: r.fasciaOra });
      }

      await richiestaRef.set({
        pagamentoStato: 'pagata',
        pagamentoTransactionId: String(transactionId),
        stato: 'programmata',
        bookingId: bookingId || '',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // ── Ricevuta PDF + email di conferma definitiva ────────────────────
      if (r.email) {
        try {
          const pdfBuffer = await buildRicevutaPdf({ richiestaId, r, filmTitolo, totale, transactionId });
          const dettaglioRighe = [
            r.salaTagliaLabel ? `Sala: ${r.salaTagliaLabel}` : '',
            r.dataRichiesta ? `Data: ${r.dataRichiesta}` : '',
            r.fasciaOra ? `Inizio proiezione: ${r.fasciaOra}` : '',
            endTime ? `Fine proiezione: ${endTime}` : '',
            r.numOspiti ? `Ospiti: ${r.numOspiti}` : '',
            r.servizi ? `Servizi offerti: ${r.servizi}` : '',
          ].filter(Boolean);
          await inviaEmailConferma({ r, filmTitolo, totale, dettaglioRighe, pdfBuffer });
        } catch (mailErr) {
          // La conferma del pagamento/prenotazione non va persa se
          // l'invio dell'email fallisce — resta comunque tutto salvato,
          // solo l'email andrà rimandata a mano
          console.error('pf-webhook: invio email fallito', mailErr);
        }
      }
    } else if (transaction.state === TransactionState.Failed || transaction.state === TransactionState.Decline || transaction.state === TransactionState.Voided) {
      await richiestaRef.set({ pagamentoStato: 'fallita', updatedAt: new Date().toISOString() }, { merge: true });
    }
    // Altri stati (PENDING, PROCESSING, AUTHORIZED...) non richiedono
    // nessuna azione qui: si aspetta lo stato finale

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('pf-webhook', err);
    // 502, non 200: PostFinance ripete l'invio finché non risponde 200 —
    // se qui è fallito qualcosa vogliamo che ritenti
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
