// v++ zvyšte při updatech, aby se cache snadno obnovila
const SW_VERSION = 'altiven-2.0.0';
const STATIC_CACHE = `static-${SW_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './cenik.html',
  './novanabidka.html',
  './vytvoritsmlouvu.html',
  './vytvorenakarta.html',
  './predavaciprotokol.html',
  './generovatfakturu.html',
  './css/style.css',
  './js/script.js',
  './js/firebase.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== STATIC_CACHE ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

// Strategie: cache-first pro statická aktiva; network-first pro HTML
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isHTML = req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    // Network first → když offline, spadni do cache
    e.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Cache first pro CSS/JS/ikony
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const resClone = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put(req, resClone));
        return res;
      }))
    );
  }
});
