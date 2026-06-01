const CACHE_NAME = 'taskmatrix-ios-v1';
const ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Cache miss:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first for app shell, network-first for Supabase API
  if (event.request.url.includes('supabase.co/rest')) {
    return; // Let Supabase API calls go through
  }
  
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
