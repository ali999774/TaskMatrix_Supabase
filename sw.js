const CACHE_NAME = 'taskmatrix-v3'; // bumped to force CDN pre-cache on existing installs
const ASSETS_TO_CACHE = [
  '/TaskMatrix_Supabase/',
  '/TaskMatrix_Supabase/index.html',
  '/TaskMatrix_Supabase/sw.js',
  'https://ali999774.github.io/TaskMatrix_Supabase/',
  'https://ali999774.github.io/TaskMatrix_Supabase/index.html'
];

// CDN scripts required for the app to function offline.
// Cached with no-cors so opaque responses are accepted.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.js'
];

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
      // Pre-cache CDN scripts with no-cors (opaque responses are fine for scripts)
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          cache.add(new Request(url, { mode: 'no-cors' }))
            .catch(err => console.warn('[SW] Failed to pre-cache CDN:', url, err))
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
          // If mutation and failing due to network/offline
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method)) {
            try {
              await queueRequest(event.request.clone());
              // Register Background Sync if available
              if ('sync' in self.registration) {
                await self.registration.sync.register('sync-tasks');
              }
            } catch (idbError) {
              console.error('[SW] Failed to queue request:', idbError);
            }
          }
          
          return new Response(JSON.stringify({ 
            error: 'Offline', 
            message: 'Your changes are queued and will sync when you are back online.',
            status: 503 
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // FIX 3: navigate = cache-first so offline refresh serves the cached shell
  // rather than going blank when the network fetch fails
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // Try cache first
      const cached =
        (await cache.match(event.request)) ||
        (await cache.match('/TaskMatrix_Supabase/index.html')) ||
        (await cache.match('https://ali999774.github.io/TaskMatrix_Supabase/index.html')) ||
        (await cache.match('/'));
      if (cached) return cached;
      // Cache miss — try network and cache the response for next time
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
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

// --- BACKGROUND SYNC ---

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    console.log('[SW] Background sync triggered: sync-tasks');
    event.waitUntil(processQueue());
  }
});

// --- INDEXEDDB HELPERS ---

async function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function queueRequest(request) {
  const db = await getDB();
  const body = await request.text();
  const entry = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const addRequest = store.add(entry);
    addRequest.onsuccess = () => resolve();
    addRequest.onerror = (e) => reject(e.target.error);
  });
}

async function processQueue() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const requests = await new Promise((resolve) => {
    const getAll = store.getAll();
    getAll.onsuccess = () => resolve(getAll.result);
  });

  if (requests.length === 0) return;

  console.log(`[SW] Processing ${requests.length} pending saves...`);

  for (const req of requests) {
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body
      });

      if (response.ok) {
        console.log(`[SW] Successfully synced request: ${req.id}`);
        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
        deleteTx.objectStore(STORE_NAME).delete(req.id);
      } else {
        console.warn(`[SW] Sync failed for request ${req.id}:`, response.status);
      }
    } catch (error) {
      console.error(`[SW] Network error during sync for request ${req.id}:`, error);
      break; // Stop processing if we're still offline
    }
  }
}
