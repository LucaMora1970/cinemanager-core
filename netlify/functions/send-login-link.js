// Genera e manda un link di accesso "email link" (passwordless) per
// gestione.html, ma tramite il NOSTRO sistema di posta (nodemailer, stesse
// variabili SMTP_* già usate da send-request-email.js/pf-webhook.js) invece
// che l'invio automatico di Firebase — quest'ultimo arriva da un dominio
// Firebase generico con poca reputazione e finisce spesso in spam o non
// arriva affatto. Il link generato è identico nella forma a quello che
// avrebbe prodotto sendSignInLinkToEmail() lato client: il codice che lo
// completa in gestione.html (isSignInWithEmailLink/signInWithEmailLink)
// resta invariato, cambia solo il canale di consegna.
//
// Una volta effettuato il primo accesso riuscito, Firebase Auth mantiene la
// sessione sul browser indefinitamente (persistenza di default) — non serve
// nessuna "registrazione del dispositivo" a parte: risolvere la consegna
// del link risolve anche quello.
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const CORS = { 'Access-Control-Allow-Origin': '*' };
const SITE_URL = 'https://www.cinemamultisalateatro.ch/gestione.html';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString('utf8');
  const serviceAccount = JSON.parse(json);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
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
  const email = String(data.email || '').trim().toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email non valida' }) };
  }

  try {
    initAdmin();
    const db = admin.firestore();

    // Non riveliamo mai se l'email è autorizzata o meno nella risposta —
    // stesso messaggio "controlla la tua email" in entrambi i casi lato
    // client — ma mandiamo il link solo se è davvero nella lista di
    // gestione.html -> Utenti
    const usersSnap = await db.collection('settings').doc('users').get();
    const list = usersSnap.exists ? (usersSnap.data().list || []) : [];
    const authorized = list.some((u) => String(u.email || '').trim().toLowerCase() === email);

    if (authorized) {
      const link = await admin.auth().generateSignInWithEmailLink(email, { url: SITE_URL, handleCodeInApp: true });

      const port = parseInt(process.env.SMTP_PORT, 10) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const text = `Ciao,\n\nEcco il link per accedere a CineManager:\n${link}\n\n`
        + `Il link scade dopo un po' e vale una volta sola — se non riesci a usarlo, richiedine uno nuovo dalla pagina di accesso.\n\n`
        + `Cinema Multisala Teatro — Mendrisio`;
      const html = `<p>Ciao,</p><p>Ecco il link per accedere a CineManager:</p>`
        + `<p><a href="${link}" style="display:inline-block;background:#e8c84a;color:#1a1a20;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Accedi a CineManager</a></p>`
        + `<p style="font-size:12px;color:#888">Il link scade dopo un po' e vale una volta sola — se non riesci a usarlo, richiedine uno nuovo dalla pagina di accesso.</p>`
        + `<p>Cinema Multisala Teatro — Mendrisio</p>`;

      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Il tuo link di accesso — CineManager',
        text,
        html,
      });
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('send-login-link', err);
    return { statusCode: 502, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
