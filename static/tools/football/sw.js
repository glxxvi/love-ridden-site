// sw.js — stale-while-revalidate, HTTP-cache-safe. v15.
const VERSION = 'v15';
const CACHE = `safb-${VERSION}`;
const SHELL = [
  './', './index.html', './app.js', './storage.js', './roster.js',
  './game-state.js', './drive.html', './drive.js',
  './engine/engine.js', './engine/config.js', './engine/field.js',
  './engine/stats.js', './engine/prose.js', './engine/test-teams.js',
  './manifest.webmanifest', './vendor/fflate.min.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

// Precache with no-store so we don't inherit stale browser HTTP cache entries.
async function precache(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(url, res);
    }
  } catch {}
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(() => Promise.allSettled(SHELL.map(precache)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cleanResponse(res) {
  if (!res.redirected) return res;
  const body = await res.clone().blob();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // cache: 'no-store' forces a real network request, bypassing HTTP cache.
  const networkPromise = fetch(e.request, { cache: 'no-store' })
    .then(async res => {
      if (res && res.status === 200) {
        try {
          const clean = await cleanResponse(res.clone());
          const cache = await caches.open(CACHE);
          await cache.put(e.request, clean);
        } catch {}
      }
      return res;
    })
    .catch(() => null);

  e.waitUntil(networkPromise);

  e.respondWith(
    caches.match(e.request).then(async cached => {
      if (cached && cached.status === 200 && !cached.redirected) return cached;
      const res = await networkPromise;
      if (res) return res;
      const shell = await caches.match('./index.html');
      return shell || new Response('', { status: 503 });
    })
  );
});