const CACHE_NAME = 'taskmatrix-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/TaskMatrix_Supabase/',
  '/TaskMatrix_Supabase/index.html',
  '/TaskMatrix_Supabase/sw.js'
];

const DB_NAME = 'taskmatrix-offline';
const STORE_NAME = 'pending-saves';

// --- SERVICE WORKER LIFECYCLE ---

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
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

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/TaskMatrix_Supabase/index.html')
      )
    )
    return
  }

  // Everything else: Cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
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
