// Service worker minimo: nessuna cache. Serve solo a soddisfare i requisiti
// di installabilità PWA (icona in home screen) — ogni richiesta va sempre in
// rete, mai dati vecchi per la programmazione (che cambia ogni giorno).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
