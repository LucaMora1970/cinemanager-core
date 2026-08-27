const nodemailer = require('nodemailer');

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Method not allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'JSON non valido' }) };
  }

  const to = String(data.to || '').trim();
  const link = String(data.link || '').trim();
  const nome = String(data.nome || '').trim();
  const tipoLabel = String(data.tipoLabel || '').trim();

  // Validazione minima lato server: non fidarsi del client per l'indirizzo
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !link) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Parametri mancanti o non validi' }) };
  }

  try {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const subject = 'La tua richiesta — Cinema Multisala Teatro';
    const saluto = nome ? `Ciao ${nome},` : 'Ciao,';
    const tipoRiga = tipoLabel ? ` (${tipoLabel})` : '';

    const text = `${saluto}\n\nAbbiamo ricevuto la tua richiesta${tipoRiga}.\n`
      + `Puoi seguirne lo stato a questo link — salvalo:\n${link}\n\n`
      + `Ti risponderemo il prima possibile.\n\nCinema Multisala Teatro — Mendrisio`;

    const html = `<p>${esc(saluto)}</p>`
      + `<p>Abbiamo ricevuto la tua richiesta${esc(tipoRiga)}.</p>`
      + `<p>Puoi seguirne lo stato a questo link — salvalo:</p>`
      + `<p><a href="${esc(link)}">${esc(link)}</a></p>`
      + `<p>Ti risponderemo il prima possibile.</p>`
      + `<p>Cinema Multisala Teatro — Mendrisio</p>`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
