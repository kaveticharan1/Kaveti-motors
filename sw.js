// Service worker: makes the app installable and keeps the app screens available on weak signal.
// Car data and photos always come fresh from the internet; only the app files are cached.
// Change VERSION after every update so phones pick up the new files.
const VERSION = 'vm-v12';
const FILES = ['./', 'index.html', 'styles.css', 'config.js', 'js/app.js', 'js/store.js', 'js/calc.js', 'js/ui.js', 'js/native.js', 'js/cars-data.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/logo.svg', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase and CDN go straight to the network
  // Network first, cache as fallback: updates show immediately when online.
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
