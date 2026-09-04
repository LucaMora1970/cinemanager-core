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

    if (kind === 'nuova-richiesta-staff') {
      subject = `Nuova richiesta${tipoRiga}${nome ? ' — ' + nome : ''}`;

      text = `È arrivata una nuova richiesta dal sito${tipoRiga}:\n\n${riepilogo}\n\n`
        + `Dettagli e gestione: ${link}\n\n`
        + `Cinema Multisala Teatro — Mendrisio`;

      const riepilogoHtml = esc(riepilogo).replace(/\n/g, '<br>');
      html = `<p>È arrivata una nuova richiesta dal sito${esc(tipoRiga)}:</p>`
        + `<p style="white-space:pre-line">${riepilogoHtml}</p>`
        + `<p><a href="${esc(link)}">${esc(link)}</a></p>`
        + `<p>Cinema Multisala Teatro — Mendrisio</p>`;
    } else if (kind === 'staff-approvazione') {
      subject = `Richiesta compleanno da approvare${nome ? ' — ' + nome : ''}`;

      text = `Nuova richiesta compleanno confermata dal cliente, in attesa di conferma:\n\n${riepilogo}\n\n`
        + `Approva: ${approvaLink}\n\n`
        + `Rifiuta: ${rifiutaLink}\n\n`
        + `Basta cliccare uno dei due link — il primo che risponde chiude la richiesta per tutti.`;

      const riepilogoHtml = esc(riepilogo).replace(/\n/g, '<br>');
      html = `<p>Nuova richiesta compleanno confermata dal cliente, in attesa di conferma:</p>`
        + `<p style="white-space:pre-line">${riepilogoHtml}</p>`
        + `<p><a href="${esc(approvaLink)}" style="color:#1b8f4c;font-weight:bold">Approva</a>&nbsp;&nbsp;&nbsp;`
        + `<a href="${esc(rifiutaLink)}" style="color:#c0392b;font-weight:bold">Rifiuta</a></p>`
        + `<p>Basta cliccare uno dei due link — il primo che risponde chiude la richiesta per tutti.</p>`;
    } else if (kind === 'esito-approvazione') {
      const approvata = esito === 'approvata';
      const nomeFest = String(data.nomeFesteggiato || '').trim();
      subject = approvata
        ? `Compleanno al cinema prenotato`
        : `La tua richiesta di compleanno`;

      if (approvata) {
        // Due scorciatoie per inoltrare subito il link invito senza doverlo
        // ricopiare a mano — stesso schema già usato su richiesta.html
        const shareText = `Sei invitato al compleanno${nomeFest ? ' di ' + nomeFest : ''}! Tutti i dettagli qui: ${link}`;
        const mailtoShare = 'mailto:?subject=' + encodeURIComponent(`Invito al compleanno${nomeFest ? ' di ' + nomeFest : ''}`) + '&body=' + encodeURIComponent(shareText);
        const waShare = 'https://wa.me/?text=' + encodeURIComponent(shareText);
        const confermaRiga = nomeFest ? `è tutto confermato! Il compleanno di ${nomeFest} è ufficialmente prenotato.` : 'è tutto confermato! Il tuo compleanno è ufficialmente prenotato.';

        text = `${saluto}\n\n${confermaRiga} Trovi qui il link da condividere con i tuoi invitati:\n${link}\n\n`
          + `Condividilo comodamente:\nEmail: ${mailtoShare}\nWhatsApp: ${waShare}\n\nCinema Multisala Teatro — Mendrisio`;

        html = `<p>${esc(saluto)}</p><p>${esc(confermaRiga)} Trovi qui il link da condividere con i tuoi invitati:</p><p><a href="${esc(link)}">${esc(link)}</a></p>`
          + `<p style="margin-top:18px">`
          + `<a href="${esc(mailtoShare)}" style="display:inline-block;background:#f0801a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:10px">Condividi via Email</a>`
          + `<a href="${esc(waShare)}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Condividi su WhatsApp</a>`
          + `</p><p>Cinema Multisala Teatro — Mendrisio</p>`;
      } else {
        text = `${saluto}\n\nPurtroppo non siamo riusciti ad accogliere questa richiesta. Scrivici per valutare un'alternativa.\n\nPuoi rivedere lo stato della richiesta qui:\n${link}\n\nCinema Multisala Teatro — Mendrisio`;
        html = `<p>${esc(saluto)}</p><p>Purtroppo non siamo riusciti ad accogliere questa richiesta. Scrivici per valutare un'alternativa.</p><p>Puoi rivedere lo stato della richiesta qui:</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>Cinema Multisala Teatro — Mendrisio</p>`;
      }
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

      // riepilogo: solo il pacchetto fisso lo passa (film/sala/data/orari/
      // ospiti/servizi/totale) — per tutte le altre richieste resta vuoto,
      // nessun cambiamento nel testo
      const riepilogoTxt = riepilogo ? `\n${riepilogo}\n` : '';
      text = `${saluto}\n\nAbbiamo ricevuto la tua richiesta${tipoRiga}.\n${riepilogoTxt}`
        + `Puoi seguirne lo stato a questo link — salvalo:\n${link}\n\n`
        + `Ti risponderemo il prima possibile.\n\nCinema Multisala Teatro — Mendrisio`;

      const riepilogoHtml = riepilogo ? `<p style="white-space:pre-line">${esc(riepilogo).replace(/\n/g, '<br>')}</p>` : '';
      html = `<p>${esc(saluto)}</p>`
        + `<p>Abbiamo ricevuto la tua richiesta${esc(tipoRiga)}.</p>`
        + riepilogoHtml
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
