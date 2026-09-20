// sw.js
const CACHE_NAME = 'mm-enterprise-shell-v10'; // Bumped to v10 to force clean cache rebuild

// 🚨 STRICT REQUIREMENT: These paths must EXACTLY match your project directory.
// Any missing file will abort the PWA installation.
const APP_SHELL = [
    './',
    './index.html',
    './portal-manager.html',
    './manifest.json',
    
    // Core Engine (Updated for SSOT Architecture)
    './core/supabase-client.js',
    './core/offline-engine.js',
    './core/ui-core.js',
    './core/boot.js',
    './core/bughunter.js',
    './core/comms-engine.js',
    './core/premium.js',
    
    // Manager Sandbox (Consolidated overlay-menu.js added, old ones removed)
    './manager/manager-app.js',
    './manager/manager-db.js',
    './manager/ui-roster.js',
    './manager/ui-directory.js',
    './manager/ui-stats.js',
    './manager/ui-ledger.js',
    './manager/overlay-comms.js',
    './manager/overlay-calc.js',
    './manager/overlay-menu.js', 
    './manager/overlay-pulse.js',
    './manager/file-export.js',
    
    // Assets (Matching Manifest Paths)
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the waiting service worker to become the active worker
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    // Vaporize old caches to free up device storage
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control of all open pages immediately
});

// 🧠 ENTERPRISE ALGORITHM: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    // Bypass Supabase API calls (Data is handled by IndexedDB OfflineEngine, not the SW)
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(event.request);
            
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(() => {
                // Ignore network errors silently (user is offline)
            });

            // Return cached response instantly if available, otherwise wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
