// Genera snapshot statici delle pagine pubbliche con i contenuti reali già
// dentro l'HTML (oggi vuoti/"Caricamento…" per chi non esegue JavaScript —
// crawler più lenti e TUTTI gli scraper di anteprima social, che non
// eseguono mai JS). Eseguito da .github/workflows/prerender.yml ogni 15
// minuti. Per i visitatori reali non cambia nulla: lo stesso JS del sito
// gira sopra lo snapshot e lo sovrascrive quasi subito con dati live (vedi
// Contesto nel piano — tutti i contenitori target usano innerHTML=, quindi
// una seconda esecuzione del render è sempre sicura, mai duplica nulla).
//
// Non tocca MAI l'intero file: sostituisce solo il contenuto dei
// contenitori noti (vedi replaceDivContent), lasciando il resto di ogni
// pagina hand-authored byte-identico — niente rumore nei diff quando in
// futuro il template continua a essere modificato a mano.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SITE_URL = 'https://www.cinemamultisalateatro.ch';
const PROJECT_ID = 'cinemanager-4c67c';
const CONCURRENCY = 6;
const READY_TIMEOUT_MS = 20000;
const NAV_TIMEOUT_MS = 30000;

const STATIC_FILM_DESCRIPTION = 'Scheda del film in programma al Cinema Multisala Teatro di Mendrisio: trama, cast, trailer e orari degli spettacoli.';
const STATIC_EVENTO_DESCRIPTION = 'Tutti i film in programma per questa giornata speciale al Cinema Multisala Teatro di Mendrisio.';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function truncate(s, max) {
  s = (s || '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
}

// ── Server statico locale sulla checkout corrente (build riproducibile, non
// la versione live) ─────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff'
};

function startServer(root, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(root, urlPath === '/' ? '/index.html' : urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

// ── Lettura pubblica da Firestore (REST, nessuna credenziale: films ed
// eventiSpeciali sono "allow read: if true" — vedi firestore.rules) ────────
async function fetchDocIds(collectionName) {
  const ids = [];
  let pageToken;
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('mask.fieldPaths', 'title');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore REST ${collectionName} → HTTP ${res.status}`);
    const data = await res.json();
    for (const doc of data.documents || []) ids.push(doc.name.split('/').pop());
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

// ── Sostituzione chirurgica del contenuto di un <div id="..."> nel testo
// sorgente grezzo: scansione a parentesi bilanciate (gestisce i div
// annidati dentro i fragment renderizzati), nessun parser HTML coinvolto →
// zero rischio di riserializzare/alterare il resto del file ────────────────
function replaceDivContent(html, id, newInner) {
  const openRe = new RegExp(`<div[^>]*\\bid=["']${id}["'][^>]*>`);
  const m = openRe.exec(html);
  if (!m) throw new Error(`contenitore #${id} non trovato nel template`);
  const openEnd = m.index + m[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let depth = 1, closeStart = -1, match;
  while ((match = tagRe.exec(html))) {
    if (match[1] === '/') { depth--; if (depth === 0) { closeStart = match.index; break; } }
    else depth++;
  }
  if (closeStart === -1) throw new Error(`#${id}: </div> di chiusura non trovato (tag non bilanciati)`);
  return html.slice(0, openEnd) + newInner + html.slice(closeStart);
}

// ── Sostituzione di <title>/<meta description> con dati reali + inserimento
// di og:*/canonical (oggi assenti — causa delle anteprime social rotte) ───
function replaceTitleAndMeta(raw, { titleLine, descLine, title, description, ogImage, canonical, ogType }) {
  if (!raw.includes(titleLine)) throw new Error('riga <title> del template non trovata (il template è cambiato?)');
  if (!raw.includes(descLine)) throw new Error('riga <meta description> del template non trovata (il template è cambiato?)');
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  raw = raw.replace(titleLine, `<title>${t}</title>`);
  const seoBlock = [
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : '',
    `<meta property="og:url" content="${canonical}">`,
    `<link rel="canonical" href="${canonical}">`
  ].filter(Boolean).join('\n');
  return raw.replace(descLine, seoBlock);
}

// ── Le pagine flat non hanno più l'id nella query string (film-<id>.html
// invece di film.html?id=X): lo passiamo al JS live incorporandolo in una
// variabile globale, letta come fallback da film.html/evento-giorno.html
// quando location.search è vuoto — altrimenti al primo re-render live lo
// script cancellerebbe lo snapshot con "Film non specificato" ──────────────
function injectPrerenderId(raw, scriptTagLiteral, varName, id) {
  if (!raw.includes(scriptTagLiteral)) throw new Error(`tag ${scriptTagLiteral} non trovato nel template`);
  return raw.replace(scriptTagLiteral, `<script>window.${varName}=${JSON.stringify(id)};</script>\n${scriptTagLiteral}`);
}

async function runPool(items, limit, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector('body[data-prerender-ready="1"]', { timeout: READY_TIMEOUT_MS });
}

// ── Pagine singole (in-place: sostituisce solo i contenitori noti) ────────
async function renderInPlace(browser, { label, url, file, containers }) {
  const page = await browser.newPage();
  try {
    await gotoReady(page, url);
    const filePath = path.join(ROOT, file);
    let raw = fs.readFileSync(filePath, 'utf8');
    for (const id of containers) {
      const inner = await page.$eval(`#${id}`, el => el.innerHTML).catch(() => null);
      if (inner == null) { console.warn(`[${label}] #${id} non trovato, salto`); continue; }
      raw = replaceDivContent(raw, id, inner);
    }
    fs.writeFileSync(filePath, raw);
    console.log(`[${label}] aggiornato`);
    return true;
  } catch (e) {
    console.error(`[${label}] FALLITO:`, e.message);
    return false;
  } finally {
    await page.close();
  }
}

// ── Film: film.html?id=X → film-<id>.html (file flat, stessa directory —
// nessun path relativo da riscrivere, vedi piano) ───────────────────────
async function renderFilmPage(browser, id) {
  const page = await browser.newPage();
  try {
    await gotoReady(page, `${BASE}/film.html?id=${encodeURIComponent(id)}`);
    const title = await page.title();
    const rootHtml = await page.$eval('#root', el => el.innerHTML);
    const plotText = await page.$eval('#root .plot', el => el.textContent).catch(() => '');
    const description = truncate(plotText, 160) || STATIC_FILM_DESCRIPTION;
    const ogImage = await page.$eval('#root .hero img', el => el.src).catch(() => '');

    const templatePath = path.join(ROOT, 'film.html');
    let raw = fs.readFileSync(templatePath, 'utf8');
    raw = replaceDivContent(raw, 'root', rootHtml);
    raw = replaceTitleAndMeta(raw, {
      titleLine: '<title>Film — Cinema Multisala Teatro Mendrisio</title>',
      descLine: '<meta name="description" content="Scheda del film in programma al Cinema Multisala Teatro di Mendrisio: trama, cast, trailer e orari degli spettacoli.">',
      title, description, ogImage,
      canonical: `${SITE_URL}/film-${id}.html`,
      ogType: 'video.movie'
    });
    raw = injectPrerenderId(raw, '<script type="module">', '__PRERENDER_FILM_ID__', id);
    fs.writeFileSync(path.join(ROOT, `film-${id}.html`), raw);
    return true;
  } catch (e) {
    console.warn(`[film ${id}] saltato:`, e.message);
    return false;
  } finally {
    await page.close();
  }
}

// ── Eventi: evento-giorno.html?id=X → evento-giorno-<id>.html ───────────
async function renderEventoGiornoPage(browser, id) {
  const page = await browser.newPage();
  try {
    await gotoReady(page, `${BASE}/evento-giorno.html?id=${encodeURIComponent(id)}`);
    const title = await page.title();
    const promoHtml = await page.$eval('#promo', el => el.innerHTML).catch(() => null);
    if (promoHtml == null) { console.warn(`[evento ${id}] #promo non trovato, salto`); return false; }
    const gridHtml = await page.$eval('#film-grid', el => el.innerHTML).catch(() => null);
    const descText = await page.$eval('#promo .promo-desc', el => el.textContent).catch(() => '');
    const description = truncate(descText, 160) || STATIC_EVENTO_DESCRIPTION;
    const ogImage = await page.$eval('#promo .promo-img', el => el.src).catch(() => '');

    const templatePath = path.join(ROOT, 'evento-giorno.html');
    let raw = fs.readFileSync(templatePath, 'utf8');
    raw = replaceDivContent(raw, 'promo', promoHtml);
    if (gridHtml != null) raw = replaceDivContent(raw, 'film-grid', gridHtml);
    raw = replaceTitleAndMeta(raw, {
      titleLine: '<title>Evento speciale — Cinema Multisala Teatro</title>',
      descLine: '<meta name="description" content="Tutti i film in programma per questa giornata speciale al Cinema Multisala Teatro di Mendrisio.">',
      title, description, ogImage,
      canonical: `${SITE_URL}/evento-giorno-${id}.html`,
      ogType: 'website'
    });
    raw = injectPrerenderId(raw, '<script type="module">', '__PRERENDER_EVENT_ID__', id);
    fs.writeFileSync(path.join(ROOT, `evento-giorno-${id}.html`), raw);
    return true;
  } catch (e) {
    console.warn(`[evento ${id}] saltato:`, e.message);
    return false;
  } finally {
    await page.close();
  }
}

function writeSitemap(filmIds, eventIds) {
  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE_URL}/sala-privata.html`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${SITE_URL}/programmazione.html`, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE_URL}/lavora-con-noi.html`, changefreq: 'weekly', priority: '0.5' }
  ];
  const filmUrls = filmIds.map(id => ({ loc: `${SITE_URL}/film-${id}.html`, changefreq: 'weekly', priority: '0.6' }));
  const eventUrls = eventIds.map(id => ({ loc: `${SITE_URL}/evento-giorno-${id}.html`, changefreq: 'daily', priority: '0.6' }));
  const all = [...staticUrls, ...filmUrls, ...eventUrls];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + all.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')
    + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
}

async function main() {
  console.log('Avvio server statico locale su', BASE);
  const server = await startServer(ROOT, PORT);
  const browser = await chromium.launch();
  try {
    await renderInPlace(browser, {
      label: 'index.html', url: `${BASE}/index.html`, file: 'index.html',
      containers: ['in-sala-wrap', 'prossime-grid', 'cinewow-titles', 'cinewow-upcoming-titles']
    });
    await renderInPlace(browser, {
      label: 'lavora-con-noi.html', url: `${BASE}/lavora-con-noi.html`, file: 'lavora-con-noi.html',
      containers: ['lvContent']
    });
    // sala-privata.html (#catalogo-list) volutamente FUORI scope: il
    // catalogo non è più raggiungibile da nessuna pagina del sito (la
    // selezione film è stata spostata, filtrata, dentro
    // prenota-sala-privata.html) — verificato con l'utente, pagina lasciata
    // com'è per ora, nessun motivo di pre-renderizzarla

    console.log('Leggo films/eventiSpeciali da Firestore (pubblico, nessuna credenziale)…');
    const [filmIds, eventIds] = await Promise.all([fetchDocIds('films'), fetchDocIds('eventiSpeciali')]);
    console.log(`films: ${filmIds.length}, eventiSpeciali: ${eventIds.length}`);

    const renderedFilmIds = [];
    await runPool(filmIds, CONCURRENCY, async id => { if (await renderFilmPage(browser, id)) renderedFilmIds.push(id); });
    console.log(`film-<id>.html generati: ${renderedFilmIds.length}/${filmIds.length}`);

    const renderedEventIds = [];
    await runPool(eventIds, CONCURRENCY, async id => { if (await renderEventoGiornoPage(browser, id)) renderedEventIds.push(id); });
    console.log(`evento-giorno-<id>.html generati: ${renderedEventIds.length}/${eventIds.length}`);

    writeSitemap(renderedFilmIds, renderedEventIds);
    console.log('sitemap.xml rigenerata');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(e => { console.error('Prerender fallito:', e); process.exit(1); });
