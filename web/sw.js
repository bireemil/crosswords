const CACHE_NAME = 'arrow-words-memetic-v3';
const ASSETS = [
  './',
  './index.html',
  './menu.html',
  './styles.css',
  './app.js',
  './menu.js',
  './grids.jsonl',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    })))
  );
  self.clients.claim();
});

function isHtml(request) {
  return request.mode === 'navigate' || (request.headers.get('accept')||'').includes('text/html');
}
function isJsonLike(url) {
  return url.endsWith('.json') || url.endsWith('.jsonl');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Same-origin only
  if (url.origin !== location.origin) return;

  // Network-first for HTML and JSON/JSONL so updates appear quickly
  if (isHtml(request) || isJsonLike(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (CSS/JS/images)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Revalidate in background
        fetch(request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
        }).catch(()=>{});
        return cached;
      }
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
