const CACHE='nordisk-mobilvask-v2';
const SHELL=['/','/portal/','/portal/login/','/manifest.webmanifest','/logo.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(u.pathname.startsWith('/portal')?'/portal/':'/')));return}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
