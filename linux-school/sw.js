/* Офлайн: оболочка и курс кэшируются, при наличии сети берётся свежее. Поднимайте VERSION при выпуске. */
const VERSION = 'ls-6';
const SHELL = ['./', 'index.html', 'app/app.js', 'app/sandbox.js', 'app/style.css', 'manifest.webmanifest',
  'courses/index.json', 'courses/linux/course.json', 'courses/linux/extracts.json', 'courses/linux/L1.json', 'courses/linux/L2.json', 'courses/linux/L3.json', 'courses/linux/L4.json', 'courses/linux/recipes.json', 'courses/linux/commands.json', 'courses/linux/scripts.json', 'courses/sapr/tests.json',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
