// Crea una Transaction PostFinance Checkout per il pacchetto fisso e
// restituisce l'URL della Payment Page a cui il client fa redirect —
// chiamata da submitRichiesta() in js/richiesta-shared.js subito dopo aver
// scritto la richiesta su Firestore (che quindi esiste già anche se il
// pagamento fallisce o viene abbandonato: resta visibile allo staff come
// "in attesa di pagamento").
//
// L'importo è sempre letto da Firestore con l'Admin SDK, mai fidandosi di
// un valore mandato dal client — vedi anche pf-webhook.js, che completa la
// catena in modo asincrono quando il pagamento viene confermato.
const admin = require('firebase-admin');
const { Configuration, HttpBearerAuth, TransactionsService, LineItemType } = require('postfinancecheckout');

const CORS = { 'Access-Control-Allow-Origin': '*' };

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
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
    const snap = await db.collection('richiesteEventi').doc(richiestaId).get();
    if (!snap.exists) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Richiesta non trovata' }) };
    }
    const r = snap.data();

    // Importo autorevole: quello salvato sulla richiesta (calcolato lato
    // client con gli stessi parametri configurati in gestione.html, ma qui
    // ri-letto da Firestore — non dal payload di questa chiamata)
    const importo = parseFloat(r.pacchettoPrezzoTotale);
    if (!importo || importo <= 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Importo della richiesta non valido' }) };
    }

    const spaceId = parseInt(process.env.PF_SPACE_ID, 10);
    const transactionsService = new TransactionsService(pfConfig());

    const siteBase = (process.env.SITE_URL || 'https://www.cinemamultisalateatro.ch').replace(/\/+$/, '');
    const statusUrl = `${siteBase}/richiesta.html?id=${encodeURIComponent(richiestaId)}`;

    const filmTitolo = r.filmPreferenza || '';
    const transactionCreate = {
      currency: 'CHF',
      merchantReference: richiestaId,
      successUrl: statusUrl,
      failedUrl: statusUrl,
      customerEmailAddress: r.email || undefined,
      // Il cliente conferma sulla pagina PostFinance senza dover tornare
      // indietro per un secondo passaggio di conferma
      autoConfirmationEnabled: true,
      lineItems: [
        {
          uniqueId: 'pacchetto-' + richiestaId,
          name: 'Pacchetto sala privata' + (filmTitolo ? ' — ' + filmTitolo : ''),
          quantity: 1,
          amountIncludingTax: importo,
          type: LineItemType.Product,
        },
      ],
    };

    const transaction = await transactionsService.postPaymentTransactions({ space: spaceId, transactionCreate });
    const paymentPageUrl = await transactionsService.getPaymentTransactionsIdPaymentPageUrl({ id: transaction.id, space: spaceId });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPageUrl }),
    };
  } catch (err) {
    console.error('pf-create-transaction', err);
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String((err && err.message) || err) }),
    };
  }
};
