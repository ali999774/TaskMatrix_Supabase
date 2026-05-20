const CACHE_NAME = 'taskmatrix-v8'; // bumped to kill old SW + pinned fix
const ASSETS_TO_CACHE = [
  '/TaskMatrix_Supabase/',
  '/TaskMatrix_Supabase/index.html',
  '/TaskMatrix_Supabase/sw.js',
  'https://ali999774.github.io/TaskMatrix_Supabase/',
  'https://ali999774.github.io/TaskMatrix_Supabase/index.html'
];

// CDN scripts no longer pre-cached with no-cors to save opaque storage limit.

const DB_NAME = 'taskmatrix-offline';
const STORE_NAME = 'pending-saves';

// --- SERVICE WORKER LIFECYCLE ---

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching app shell');
      // Cache local assets individually so one miss doesn't abort the install
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// --- FETCH STRATEGIES ---

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase API: Network-first, fallback to JSON error
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request.clone())
        .catch(async (error) => {
          return new Response(JSON.stringify({ 
            error: 'Offline', 
            message: 'Your changes will sync when you are back online.',
            status: 503 
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // navigate = network-first so deployments are always picked up immediately.
  // Only fall back to cache when truly offline.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // Try network first — always get the latest index.html
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        // Offline — serve cached shell
        const cached =
          (await cache.match(event.request)) ||
          (await cache.match('/TaskMatrix_Supabase/index.html')) ||
          (await cache.match('https://ali999774.github.io/TaskMatrix_Supabase/index.html')) ||
          (await cache.match('/'));
        if (cached) return cached;
        // Fully offline with no cache — return minimal fallback
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TaskMatrix — Offline</title></head>' +
          '<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;">' +
          '<div style="text-align:center;color:#374151;"><div style="font-size:48px;margin-bottom:16px;">📊</div>' +
          '<h2 style="margin-bottom:8px;">TaskMatrix is offline</h2>' +
          '<p style="color:#6b7280;">Reconnect to load your tasks.</p></div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
    })());
    return;
  }

  // Everything else: Cache-first, fallback to network and cache the response
  // so scripts/assets are available on the next offline visit
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        // Only cache valid responses (status 200 or opaque no-cors responses)
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return networkResponse;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});

// Background Sync and IndexedDB queuing logic has been removed.
// Offline sync is fully managed at the application layer by Dexie and flushPendingSync.
