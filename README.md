# CineManager — Core

Applicazione web per la gestione della programmazione cinematografica.
Versione modulare multi-cinema.

## Struttura

```
cinemanager-core/
│
├── index.html              ← shell HTML, carica config + moduli JS
│
├── config/
│   ├── teatro-mendrisio.js ← configurazione Cinema Teatro Mendrisio
│   ├── schema.js           ← template per nuovo cinema (copiare e compilare)
│   └── [cinema-nuovo].js   ← aggiungere un file per ogni nuovo cinema
│
├── css/
│   ├── app.css             ← stili interfaccia principale
│   └── print.css           ← stili stampa e PDF
│
└── js/
    ├── core.js             ← Firebase, auth, stato S{}, navigazione, utility
    ├── film.js             ← CRUD film, archivio, TMDB
    ├── stampa.js           ← PDF, cartelli, copertine A4
    ├── prenotazioni.js     ← booking, import/export CSV
    ├── playlist.js         ← playlist sale
    ├── social.js           ← post social, canvas Instagram
    ├── staff_email.js      ← turni personale, email, newsletter
    ├── import_pc.js        ← import ProCinema, distributori
    ├── proposta.js         ← proposta programmazione, box office
    └── extra.js            ← moduli aggiuntivi
```

## Aggiungere un nuovo cinema

1. Crea un nuovo Firebase project su https://console.firebase.google.com
2. Copia `config/schema.js` → `config/cinema-nome.js`
3. Compila tutti i campi (firebase, sale, nome, colore...)
4. Cambia in `index.html` la riga:
   ```html
   <script src="config/teatro-mendrisio.js"></script>
   ```
   con:
   ```html
   <script src="config/cinema-nome.js"></script>
   ```
5. Deploy su GitHub Pages → pronto

## Aggiornare un modulo per tutti i cinema

```bash
# Migliora js/programmazione.js (o qualsiasi modulo)
git add js/programmazione.js
git commit -m "fix: miglioramento griglia programmazione"
git push

# Tutti i cinema che puntano a questo repo ricevono
# l'aggiornamento automaticamente al prossimo caricamento.
```

## Tecnologie

- HTML + CSS + JavaScript vanilla (no framework, no build step)
- Firebase Firestore (database real-time per cinema)
- Firebase Auth (Google login)
- GitHub Pages (hosting gratuito)
- TMDB API (metadati film, poster, backdrop)

## Versione originale

Il file `cinema_programmazione.html` (Cinema Teatro Mendrisio) rimane
invariato e autonomo. Questo repo è la versione modulare derivata.
