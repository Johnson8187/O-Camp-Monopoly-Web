const BUILD_VERSION = '2026.08.22.52';

















const CACHE_NAME = `preview-static-${BUILD_VERSION}`;
const CORE = [
  './?v=' + BUILD_VERSION,
  './index.html?v=' + BUILD_VERSION,
  './styles.css?v=' + BUILD_VERSION,
  './app.js?v=' + BUILD_VERSION,
  './game-core.js?v=' + BUILD_VERSION,
  './game-fx.js?v=' + BUILD_VERSION,
  './manifest.webmanifest?v=' + BUILD_VERSION,
  './icon.svg?v=' + BUILD_VERSION,
  './icon-192.png?v=' + BUILD_VERSION,
  './icon-512.png?v=' + BUILD_VERSION,
  './version.json?v=' + BUILD_VERSION,
  './assets/life-festival-plaza-v1.png?v=' + BUILD_VERSION,
];


async function cacheOne(cache, url){
  try{
    const response = await fetch(new Request(url, {cache:'no-store'}));
    if(response.ok) await cache.put(url, response.clone());
  }catch{}
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(CORE.map(url => cacheOne(cache, url))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request){
  const cache = await caches.open(CACHE_NAME);
  try{
    const response = await fetch(request, {cache:'no-store'});
    if(response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }catch{
    const cached = await cache.match(request);
    if(cached) return cached;
    if(request.mode === 'navigate'){
      return (await cache.match('./index.html?v=' + BUILD_VERSION))
        || (await cache.match('./?v=' + BUILD_VERSION))
        || Response.error();
    }
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.pathname === '/sw.js') return;
  event.respondWith(networkFirst(request));
});
