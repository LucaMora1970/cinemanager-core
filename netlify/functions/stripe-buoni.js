// Vendita online dei buoni regalo con Stripe Checkout.
//  - action "catalogo": importi in vendita = importi dei buoni ancora liberi in
//    archivio (promoCodes, type "buono"), mai i codici. Attiva solo se
//    settings/buoniOnline.attivo === true (interruttore in gestione → Codici).
//  - action "checkout": crea la sessione di pagamento Stripe e restituisce l'URL.
// L'importo è verificato qui sul server contro l'archivio, mai fidandosi del
// browser. La consegna del codice avviene in stripe-webhook.js, solo a pagamento
// confermato.
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const SITE = 'https://www.cinemamultisalateatro.ch';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

function reply(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

const clean = (v, n) => String(v || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);

// { "25": 12, "50": 3 } — importo → quanti buoni liberi
async function stock(db) {
  const snap = await db.collection('promoCodes').where('type', '==', 'buono').get();
  const out = {};
  snap.docs.forEach((d) => {
    const c = d.data();
    if (c.discountUnit === '%' || !(c.discountValue > 0)) return;
    const k = String(c.discountValue);
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Metodo non consentito' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Richiesta non valida' }); }

  try {
    initAdmin();
    const db = admin.firestore();
    const flag = await db.doc('settings/buoniOnline').get();
    const attivo = flag.exists && flag.data().attivo === true;

    if (d.action === 'catalogo') {
      if (!attivo) return reply(200, { attivo: false, importi: [] });
      const s = await stock(db);
      const importi = Object.keys(s).map(Number).sort((a, b) => a - b).map((v) => ({ valore: v, disponibili: s[String(v)] }));
      return reply(200, { attivo: true, importi });
    }

    if (d.action === 'checkout') {
      if (!attivo) return reply(403, { error: 'La vendita online dei buoni non è attiva' });
      const valore = Number(d.valore);
      const nome = clean(d.nome, 80);
      const email = clean(d.email, 120).toLowerCase();
      const perChi = clean(d.perChi, 80);
      const messaggio = clean(d.messaggio, 300);
      if (!(valore > 0)) return reply(400, { error: 'Importo non valido' });
      if (!nome) return reply(400, { error: 'Inserisci il tuo nome' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Email non valida' });
      const s = await stock(db);
      if (!(s[String(valore)] > 0)) return reply(409, { error: 'Questo importo non è al momento disponibile' });

      const p = new URLSearchParams();
      p.set('mode', 'payment');
      p.set('locale', 'it');
      p.set('customer_email', email);
      p.set('line_items[0][quantity]', '1');
      p.set('line_items[0][price_data][currency]', 'chf');
      p.set('line_items[0][price_data][unit_amount]', String(Math.round(valore * 100)));
      p.set('line_items[0][price_data][product_data][name]', `Buono regalo CHF ${valore}`);
      p.set('line_items[0][price_data][product_data][description]', 'Cinema Multisala Teatro — Mendrisio');
      p.set('metadata[tipo]', 'buono_regalo');
      p.set('metadata[valore]', String(valore));
      p.set('metadata[nome]', nome);
      p.set('metadata[email]', email);
      p.set('metadata[perChi]', perChi);
      p.set('metadata[messaggio]', messaggio);
      p.set('success_url', `${SITE}/buoni-regalo.html?esito=ok`);
      p.set('cancel_url', `${SITE}/buoni-regalo.html?esito=annullato`);

      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: p.toString(),
      });
      const out = await r.json();
      if (!r.ok || !out.url) {
        console.error('stripe checkout', out);
        return reply(502, { error: 'Pagamento non disponibile al momento, riprova tra poco' });
      }
      return reply(200, { url: out.url });
    }

    return reply(400, { error: 'Azione sconosciuta' });
  } catch (e) {
    console.error('stripe-buoni', e);
    return reply(500, { error: 'Errore del servizio' });
  }
};
