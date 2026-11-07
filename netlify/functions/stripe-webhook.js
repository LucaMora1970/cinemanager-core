// Webhook Stripe — l'unico punto che consegna un buono regalo acquistato online.
// Registrato in Stripe (Sviluppatori → Webhook) sull'evento checkout.session.completed.
// La firma è verificata con STRIPE_WEBHOOK_SECRET: senza quella, chiunque potrebbe
// "simulare" un pagamento e farsi mandare un codice.
//
// Stesso account Stripe della biglietteria: gli eventi che non riguardano i buoni
// (metadata.tipo !== "buono_regalo") vengono ignorati con 200.
//
// Idempotente: Stripe può ripetere lo stesso evento. Lo stato dell'ordine sta in
// ordiniBuoni/{sessionId}: senza-codice → codice-assegnato → consegnato. Se l'email
// fallisce risponde 500 e Stripe riprova, senza assegnare un secondo codice.
const admin = require('firebase-admin');
const crypto = require('crypto');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

function firmaValida(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const t = parts.t;
  const v1 = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const atteso = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return v1.some((s) => s.length === atteso.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(atteso)));
}

async function mail(payload) {
  const r = await fetch('https://cinema-import-proxy.netlify.app/.netlify/functions/send-request-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('email ' + r.status);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const h = event.headers || {};
  if (!firmaValida(raw, h['stripe-signature'] || h['Stripe-Signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, body: 'Firma non valida' };
  }

  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return { statusCode: 400, body: 'JSON non valido' }; }
  if (ev.type !== 'checkout.session.completed') return { statusCode: 200, body: 'ignorato' };
  const s = ev.data && ev.data.object;
  const m = (s && s.metadata) || {};
  if (m.tipo !== 'buono_regalo') return { statusCode: 200, body: 'non è un buono' };
  if (s.payment_status !== 'paid') return { statusCode: 200, body: 'non ancora pagato' };

  try {
    initAdmin();
    const db = admin.firestore();
    const valore = Number(m.valore);
    const ordRef = db.collection('ordiniBuoni').doc(s.id);

    // 1) assegna un codice libero (una sola volta, in transazione)
    const stato = await db.runTransaction(async (tx) => {
      const o = await tx.get(ordRef);
      if (o.exists && ['codice-assegnato', 'consegnato'].includes(o.data().stato)) return o.data();
      const q = await tx.get(db.collection('promoCodes').where('type', '==', 'buono').where('discountValue', '==', valore).limit(10));
      const libero = q.docs.find((d) => d.data().discountUnit !== '%');
      const base = {
        sessionId: s.id, valore, nome: m.nome || '', email: m.email || s.customer_email || '',
        perChi: m.perChi || '', messaggio: m.messaggio || '',
        importoPagato: (s.amount_total || 0) / 100, creatoIl: o.exists ? o.data().creatoIl : new Date().toISOString(),
      };
      if (!libero) {
        const r = { ...base, stato: 'senza-codice' };
        tx.set(ordRef, r);
        return r;
      }
      const c = libero.data();
      const r = { ...base, stato: 'codice-assegnato', codice: c.code };
      tx.set(ordRef, r);
      tx.set(db.collection('codiciAssegnati').doc('ca_' + s.id), {
        code: c.code, type: c.type, discountValue: c.discountValue || 0, discountUnit: c.discountUnit || '',
        assignedToName: base.nome, assignedToEmail: base.email, concorso: 'Acquisto online (Stripe)',
        assignedAt: new Date().toISOString(), assignedBy: 'stripe',
      });
      tx.delete(libero.ref);
      return r;
    });

    // 2) nessun codice disponibile: pagamento incassato ma da gestire a mano
    if (stato.stato === 'senza-codice') {
      const st = await db.doc('settings/richiesteStaff').get();
      const staff = ((st.exists && st.data().emails) || []).filter(Boolean);
      for (const to of staff) {
        await mail({
          kind: 'nuova-richiesta-staff', to, nome: stato.nome, tipoLabel: 'Buono regalo — DA CONSEGNARE',
          riepilogo: `Pagamento Stripe ricevuto ma NESSUN codice libero da CHF ${valore} in archivio.\nCliente: ${stato.nome} <${stato.email}>\nImporto: CHF ${stato.importoPagato}\nOrdine: ${s.id}\nImporta nuovi codici e inviali a mano, oppure rimborsa da Stripe.`,
          link: 'https://www.cinemamultisalateatro.ch/gestione.html',
        }).catch((e) => console.error('avviso staff', e));
      }
      return { statusCode: 200, body: 'senza codice' };
    }

    // 3) consegna per email (se fallisce → 500, Stripe riprova; il codice resta lo stesso)
    if (stato.stato === 'codice-assegnato') {
      const regalo = stato.perChi ? `Un regalo per ${stato.perChi}. ` : '';
      const msg = stato.messaggio ? `«${stato.messaggio}» ` : '';
      await mail({
        kind: 'codice-premio', to: stato.email, nome: stato.nome,
        titolo: 'Il tuo buono regalo — Cinema Multisala Teatro',
        descrizione: `Grazie per il tuo acquisto! ${regalo}${msg}Ecco il tuo buono regalo da CHF ${valore}.`,
        codice: stato.codice, scadenza: '',
      });
      await ordRef.update({ stato: 'consegnato', consegnatoIl: new Date().toISOString() });
    }
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('stripe-webhook', e);
    return { statusCode: 500, body: 'errore' };
  }
};
