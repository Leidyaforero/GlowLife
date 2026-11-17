const VERSION = 'glowlife-v2-private-finance';
const FILES = ['./', './index.html', './manifest.json', './finance.css', './finance.js', './finance-math.mjs', './vendor/identity.js', './vendor/identity-transport.js', './vendor/webauthn.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('glowlife-') && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Private data, auth responses and uploaded goal images must never enter offline caches.
  if(event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if(response.ok && response.type === 'basic') {
      const copy=response.clone();
      event.waitUntil(caches.open(VERSION).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(async()=>await caches.match(event.request)||new Response('Sin conexión. Vuelve a intentarlo cuando tengas internet.',{status:503})));
});
