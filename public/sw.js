/* Takhti AI Studio offline shell. API responses and user data are never cached. */
const CACHE = 'takhti-ai-shell-v15-1';
const scopeURL = new URL(self.registration.scope);
const path = value => new URL(value, scopeURL).pathname;
const CORE = [path('./'), path('index.html'), path('manifest.webmanifest'), path('favicon.svg'), path('offline.html')];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(fetch(req).then(response => {
    if (response.ok && (req.mode === 'navigate' || CORE.includes(url.pathname))) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(req.mode === 'navigate' ? path('index.html') : req, copy));
    }
    return response;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match(path('offline.html')) : Response.error())));
});
