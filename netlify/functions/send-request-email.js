const nodemailer = require('nodemailer');
// build-marker: 20260827-1710

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
  const kind = String(data.kind || 'richiesta').trim();
  const proposta = String(data.proposta || '').trim();

  // Validazione minima lato server: non fidarsi del client per l'indirizzo
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !link) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Parametri mancanti o non validi' }) };
  }
  if (kind === 'proposta' && !proposta) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Proposta mancante' }) };
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

    const saluto = nome ? `Ciao ${nome},` : 'Ciao,';
    const tipoRiga = tipoLabel ? ` (${tipoLabel})` : '';

    let subject, text, html;

    if (kind === 'proposta') {
      subject = 'La nostra proposta — Cinema Multisala Teatro';

      text = `${saluto}\n\nEcco la nostra proposta per la tua richiesta${tipoRiga}:\n\n${proposta}\n\n`
        + `Puoi rivedere la proposta e lo stato della richiesta a questo link — salvalo:\n${link}\n\n`
        + `Per confermare o discuterne, rispondi pure a questa email.\n\nCinema Multisala Teatro — Mendrisio`;

      const propostaHtml = esc(proposta).replace(/\n/g, '<br>');
      html = `<p>${esc(saluto)}</p>`
        + `<p>Ecco la nostra proposta per la tua richiesta${esc(tipoRiga)}:</p>`
        + `<p style="white-space:pre-line">${propostaHtml}</p>`
        + `<p>Puoi rivedere la proposta e lo stato della richiesta a questo link — salvalo:</p>`
        + `<p><a href="${esc(link)}">${esc(link)}</a></p>`
        + `<p>Per confermare o discuterne, rispondi pure a questa email.</p>`
        + `<p>Cinema Multisala Teatro — Mendrisio</p>`;
    } else {
      subject = 'La tua richiesta — Cinema Multisala Teatro';

      text = `${saluto}\n\nAbbiamo ricevuto la tua richiesta${tipoRiga}.\n`
        + `Puoi seguirne lo stato a questo link — salvalo:\n${link}\n\n`
        + `Ti risponderemo il prima possibile.\n\nCinema Multisala Teatro — Mendrisio`;

      html = `<p>${esc(saluto)}</p>`
        + `<p>Abbiamo ricevuto la tua richiesta${esc(tipoRiga)}.</p>`
        + `<p>Puoi seguirne lo stato a questo link — salvalo:</p>`
        + `<p><a href="${esc(link)}">${esc(link)}</a></p>`
        + `<p>Ti risponderemo il prima possibile.</p>`
        + `<p>Cinema Multisala Teatro — Mendrisio</p>`;
    }

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
