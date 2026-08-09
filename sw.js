/* ---------------------------------------------------
   SERVICE WORKER — Cache-First
   Bei jeder inhaltlichen Änderung an einer der unten gelisteten Dateien
   CACHE_NAME hochzählen (z.B. 'ciclo-cache-v10'), sonst liefert der
   Service Worker Nutzer:innen weiterhin die alte, gecachte Fassung aus.
   Zum Testen von Änderungen daher immer ein Inkognito-/privates Fenster
   verwenden, um die Cache-Falle beim normalen Neuladen zu umgehen.
--------------------------------------------------- */
const CACHE_NAME = 'ciclo-cache-v11';

// Relative Pfade (kein führendes "/"), damit es auch unter einem
// GitHub-Pages-Projektpfad (z.B. /reponame/) funktioniert.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/data/app-data.js',
  './js/01-storage.js',
  './js/02-state-theme.js',
  './js/03-utils.js',
  './js/04-calendar.js',
  './js/05-navigation.js',
  './js/06-import.js',
  './js/07-chart.js',
  './js/08-stats-progress.js',
  './js/09-settings.js',
  './js/10-app-init.js',
  './icons/icon192.png',
  './icons/icon512.png',
  './icons/appletouchicon.png',
  './icons/favicon.png',
  './icons/logo-bee.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Nur erfolgreiche, same-origin Antworten zusätzlich in den Cache legen
          // (z.B. Dateien, die künftig zum App-Shell dazukommen).
          if (response && response.status === 200 && response.type === 'basic'){
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
