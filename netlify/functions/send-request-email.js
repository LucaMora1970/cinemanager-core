const nodemailer = require('nodemailer');
// build-marker: 20260828-1000

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
  const riepilogo = String(data.riepilogo || '').trim();
  const approvaLink = String(data.approvaLink || '').trim();
  const rifiutaLink = String(data.rifiutaLink || '').trim();
  const esito = String(data.esito || '').trim();

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // "to" può contenere più indirizzi separati da virgola (es. i responsabili
  // da avvisare per l'approvazione) — ognuno deve essere valido
  const toList = to.split(',').map((s) => s.trim()).filter(Boolean);
  if (!toList.length || !toList.every((t) => EMAIL_RE.test(t))) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Destinatario mancante o non valido' }) };
  }
  if (kind === 'proposta' && !proposta) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Proposta mancante' }) };
  }
  if (kind === 'staff-approvazione' && (!approvaLink || !rifiutaLink)) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Link di approvazione mancanti' }) };
  }
  if (kind !== 'staff-approvazione' && !link) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Link mancante' }) };
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

    if (kind === 'staff-approvazione') {
      subject = `Richiesta compleanno da approvare${nome ? ' — ' + nome : ''}`;

      text = `Nuova richiesta compleanno confermata dal cliente, in attesa di conferma:\n\n${riepilogo}\n\n`
        + `✅ Approva: ${approvaLink}\n\n`
        + `❌ Rifiuta: ${rifiutaLink}\n\n`
        + `Basta cliccare uno dei due link — il primo che risponde chiude la richiesta per tutti.`;

      const riepilogoHtml = esc(riepilogo).replace(/\n/g, '<br>');
      html = `<p>Nuova richiesta compleanno confermata dal cliente, in attesa di conferma:</p>`
        + `<p style="white-space:pre-line">${riepilogoHtml}</p>`
        + `<p><a href="${esc(approvaLink)}" style="color:#1b8f4c;font-weight:bold">✅ Approva</a>&nbsp;&nbsp;&nbsp;`
        + `<a href="${esc(rifiutaLink)}" style="color:#c0392b;font-weight:bold">❌ Rifiuta</a></p>`
        + `<p>Basta cliccare uno dei due link — il primo che risponde chiude la richiesta per tutti.</p>`;
    } else if (kind === 'esito-approvazione') {
      const approvata = esito === 'approvata';
      subject = approvata
        ? `Confermato! Il compleanno${nome ? ' di ' + nome : ''} è confermato 🎉`
        : `La tua richiesta di compleanno`;

      text = approvata
        ? `${saluto}\n\nTutto confermato! Trovi qui il link da condividere con i tuoi invitati:\n${link}\n\nCinema Multisala Teatro — Mendrisio`
        : `${saluto}\n\nPurtroppo non siamo riusciti ad accogliere questa richiesta. Scrivici per valutare un'alternativa.\n\nPuoi rivedere lo stato della richiesta qui:\n${link}\n\nCinema Multisala Teatro — Mendrisio`;

      html = approvata
        ? `<p>${esc(saluto)}</p><p>Tutto confermato! Trovi qui il link da condividere con i tuoi invitati:</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>Cinema Multisala Teatro — Mendrisio</p>`
        : `<p>${esc(saluto)}</p><p>Purtroppo non siamo riusciti ad accogliere questa richiesta. Scrivici per valutare un'alternativa.</p><p>Puoi rivedere lo stato della richiesta qui:</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>Cinema Multisala Teatro — Mendrisio</p>`;
    } else if (kind === 'proposta') {
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
