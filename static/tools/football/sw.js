// sw.js — stale-while-revalidate. Serve cached instantly; refresh in background.
// No manual VERSION bumps required for future updates — the cache catches up on the
// next load after any push.

const VERSION = 'v13';
const CACHE = `safb-${VERSION}`;
const SHELL = [
  './', './index.html', './app.js', './storage.js', './roster.js',
  './game-state.js', './drive.html', './drive.js',
  './engine/engine.js', './engine/config.js', './engine/field.js',
  './engine/stats.js', './engine/prose.js', './engine/test-teams.js',
  './manifest.webmanifest', './vendor/fflate.min.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => console.log(`[sw] ${VERSION} active`))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Kick off a background fetch unconditionally — this keeps the cache fresh.
  const networkPromise = fetch(e.request)
    .then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => null);

  e.waitUntil(networkPromise);

  // Serve cache if present; otherwise await the network; otherwise fall back to shell.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return networkPromise.then(res => res || caches.match('./index.html'));
    })
  );
});