const CACHE_NAME = 'preview-static-2026.08.19.3';
const CORE = ['./','./index.html','./styles.css','./app.js','./game-core.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./version.json'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if(event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
async function networkFirst(request){
  const cache = await caches.open(CACHE_NAME);
  try { const response = await fetch(request, {cache:'no-store'}); if(response.ok) cache.put(request,response.clone()); return response; }
  catch { return (await cache.match(request)) || (request.mode === 'navigate' ? cache.match('./index.html') : Response.error()); }
}
self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if(event.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/ws/') || u.pathname === '/sw.js') return;
  event.respondWith(networkFirst(event.request));
});
