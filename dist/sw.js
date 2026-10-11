const CACHE='muszaknaplo-shell-v3-dropdown';
const FILES=['./','./style.css','./app.mjs','./model.mjs','./catalog.mjs','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./quick-entry.css','./quick-entry.mjs','./quick-entry-live.mjs'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const responses=await Promise.all(FILES.map(path=>fetch(new Request(path,{cache:'reload'}))));
    for(let i=0;i<responses.length;i++){
      const response=responses[i];
      if(!response.ok||response.redirected)throw new Error('Az offline fájlok még nem elérhetők.');
      await cache.put(FILES[i],response);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('muszaknaplo-shell-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>await caches.match('./')));
    return;
  }
  const known=FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname);
  if(known)event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
