const IMAGE_CACHE='kingflix-static-images-v1'

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('kingflix-static-images-')&&key!==IMAGE_CACHE).map(key=>caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url)
  if(request.method!=='GET'||request.destination!=='image'||url.origin!==self.location.origin)return
  event.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
    const cached=await cache.match(request),refresh=fetch(request).then(response=>{if(response.ok)cache.put(request,response.clone());return response}).catch(()=>cached)
    return cached||refresh
  }))
})
