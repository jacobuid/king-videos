// Cache only catalog data, never profile authorization, playback grants, or watch history.
const pending=new WeakMap<D1Database,Promise<unknown[]>>()
export const catalogCacheKey=(origin:string)=>new Request(`${origin}/__internal/catalog-v1`)
export async function cachedCatalog<T>(db:D1Database,cache:Cache,origin:string):Promise<T[]>{
  const key=catalogCacheKey(origin),hit=await cache.match(key).catch(()=>undefined)
  if(hit)return await hit.json() as T[]
  let load=pending.get(db)
  if(!load){
    load=(async()=>{
      const result=await db.prepare('SELECT * FROM media ORDER BY created_at DESC,id DESC').all<T>()
      console.info(JSON.stringify({event:'d1_usage',query:'catalog',rowsRead:result.meta.rows_read,rowsReturned:result.results.length}))
      // Await the write so subsequent pagination requests reuse this snapshot.
      await cache.put(key,new Response(JSON.stringify(result.results),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}})).catch(()=>{console.warn('Catalog cache write failed')})
      return result.results
    })()
    pending.set(db,load)
  }
  try{return await load as T[]}finally{if(pending.get(db)===load)pending.delete(db)}
}
export async function invalidateCatalog(cache:Cache,origin:string){await cache.delete(catalogCacheKey(origin)).catch(()=>{console.warn('Catalog cache invalidation failed; snapshot expires within 60 seconds');return false})}
export function libraryPage<T extends {title:string;min_age:number;category:string}>(rows:T[],search:string,age:number,homeOnly:number,limit:number,offset:number){
  const term=search.toLowerCase()
  return rows.filter(m=>m.title.toLowerCase().includes(term)&&m.min_age<=age&&(!homeOnly||m.category.toLowerCase().replace(/[- ]/g,'').includes('homevideo'))).slice(offset,offset+limit)
}
export function managePage<T extends {title:string;series_title:string|null;rating:string|null;min_age:number;created_at?:string;quality?:string|null}>(rows:T[],search:string,rating:string,ageFrom:string,ageTo:string,limit:number,offset:number,sort='uploaded-desc',quality=''){
  const term=search.toLowerCase()
  const filtered=rows.filter(m=>(!quality||(quality==='unknown'?!m.quality:m.quality===quality))&&(m.title.toLowerCase().includes(term)||(m.series_title||'').toLowerCase().includes(term))&&(!rating||(rating==='missing'?!m.rating?.trim():m.rating===rating))&&(!ageFrom||m.min_age>=Number(ageFrom))&&(!ageTo||m.min_age<=Number(ageTo)))
  if(sort==='title-asc'||sort==='title-desc')filtered.sort((a,b)=>(sort==='title-desc'?-1:1)*(a.series_title||a.title).localeCompare(b.series_title||b.title))
  else if(sort==='uploaded-asc')filtered.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')))
  // The cached catalog already orders newest uploads first, including stable ties.
  return filtered.slice(offset,offset+limit)
}

