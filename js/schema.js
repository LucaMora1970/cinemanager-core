// ══════════════════════════════════════════════════════════════════
// CineManager — Template configurazione nuovo cinema
// Copia questo file, rinominalo e compilalo per ogni nuovo cinema.
// ══════════════════════════════════════════════════════════════════

const CINEMA_CONFIG = {

  // ── Identità (obbligatorio) ──────────────────────────────────────
  id:        'cinema-id',          // identificatore unico, solo minuscole e trattini
  nome:      'Nome Cinema',        // nome completo (appare in stampe, email, social)
  nomeBreve: 'Nome Breve',         // nome breve (header app)
  indirizzo: 'Via ..., Città',
  sito:      'www.cinema.ch',
  telefono:  '+41 ...',
  email:     'info@cinema.ch',

  // ── Branding (obbligatorio) ──────────────────────────────────────
  colore: '#f0801a',               // colore brand principale (hex)
  logo:   'data:image/...',        // logo in base64 oppure URL https://...

  // ── Sale (obbligatorio, almeno 1) ────────────────────────────────
  sale: [
    { id:'1', nome:'Sala 1', short:'S1', colore:'#4a9ee8', posti:100 },
    // aggiungere altre sale...
  ],

  // ── Open Air (opzionale, lascia [] se non usato) ─────────────────
  openAir: [],

  // ── Settimana cinematografica ────────────────────────────────────
  primoGiorno:  'gio',             // 'gio' | 'ven' | 'lun'
  fasce:        ['14:00','16:00','18:00','20:30','22:00'],
  giorni:       ['Giovedì','Venerdì','Sabato','Domenica','Lunedì','Martedì','Mercoledì'],
  giorniBrevi:  ['Gio','Ven','Sab','Dom','Lun','Mar','Mer'],

  // ── Localizzazione ──────────────────────────────────────────────
  lingua:   'it',                  // 'it' | 'fr' | 'de' | 'en'
  locale:   'it-CH',              // per formati data e valuta
  valuta:   'CHF',                // 'CHF' | 'EUR'
  timezone: 'Europe/Zurich',

  // ── Firebase (creare un progetto su console.firebase.google.com) ─
  firebase: {
    apiKey:            'INSERIRE',
    authDomain:        'PROGETTO.firebaseapp.com',
    projectId:         'PROGETTO',
    storageBucket:     'PROGETTO.firebasestorage.app',
    messagingSenderId: 'NUMERO',
    appId:             '1:NUMERO:web:CODICE',
  },

  // ── TMDB API Key (https://www.themoviedb.org/settings/api) ───────
  tmdbApiKey: 'INSERIRE_CHIAVE_TMDB',

  // ── Funzionalità ─────────────────────────────────────────────────
  features: {
    cinetour:     false,
    boxOffice:    true,
    playlist:     true,
    newsletter:   true,
    proposta:     true,
    social:       true,
    staff:        true,
    distributori: true,
  },

  tabs: ['prog','lista','arch','prnt','mail','book','staff','users','playlist','social','news','prop','bo'],

};

// Espone su window per init.js
window.CINEMA_CONFIG = CINEMA_CONFIG;
