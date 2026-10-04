import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classicGenres } from './media-genres.mjs'

// KINGFLIX genres: Cartoon = 2D; Animation = 3D (including stop motion).
// Use reviewed import groups to identify 2D titles; preserve every other genre.
const apply=process.argv.includes('--apply')
const threeDExceptions=new Set(['sonic-prime','chicken-little','dinosaur','rudolph-the-red-nosed-reindeer','a-bug-s-life','bolt','despicable-me','despicable-me-2','despicable-me-3','polar-express','the-polar-express'])
const twoD=new Set(),manifests=[]
async function visit(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const path=join(folder,entry.name)
    if(entry.isDirectory()){await visit(path);continue}
    if(entry.name!=='media.json')continue
    const manifest=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''))
    const isThreeD=path.replaceAll('\\','/').includes('/3d-animation/')||threeDExceptions.has(manifest.id)
    function update(item,inheritedId,inheritedYear){
      const id=item.id||inheritedId
      const year=item.year||Number((item.date||'').slice(0,4))||inheritedYear
      if(!isThreeD&&Array.isArray(item.genres)&&item.genres.some(g=>g==='Animation'||g==='Cartoon')){
        if(id)twoD.add(id)
        item.genres=[...new Set(item.genres.map(g=>g==='Animation'?'Cartoon':g))]
      }
      if(Array.isArray(item.genres)&&manifest.category!=='home-videos')item.genres=classicGenres(item.genres,year)
      for(const key of ['items','episodes'])for(const child of item[key]||[])update(child,id,year)
    }
    const before=JSON.stringify(manifest)
    update(manifest,manifest.id)
    if(before!==JSON.stringify(manifest))manifests.push({path,manifest})
  }
}
await visit('media-imports')
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`
async function request(url,options={}){
  const response=await fetch(url,{headers,...options})
  const result=await response.json()
  if(!response.ok||!result.success)throw Error(JSON.stringify(result.errors))
  return result
}
const database=(await request(base)).result.find(db=>db.name===(process.env.D1_DATABASE||'king-videos-prod'))
if(!database)throw Error('D1 database not found')
const query=(sql,params=[])=>request(`${base}/${database.uuid}/query`,{method:'POST',body:JSON.stringify({sql,params})})
const rows=(await query('SELECT id,title,series_id,category,year,release_date,genres FROM media')).result.flatMap(r=>r.results)
const changes=rows.map(row=>{
  let genres=JSON.parse(row.genres)
  if(twoD.has(row.series_id||row.id))genres=[...new Set(genres.map(g=>g==='Animation'?'Cartoon':g))]
  if(row.category!=='home-videos')genres=classicGenres(genres,row.year||Number((row.release_date||'').slice(0,4)))
  return {...row,newGenres:JSON.stringify(genres)}
}).filter(row=>JSON.stringify(JSON.parse(row.genres))!==row.newGenres)
const report={changedVideos:changes.length,changedManifests:manifests.length,applied:false,changes}
await writeFile('logs/animation-genre-fix.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({changedVideos:changes.length,changedManifests:manifests.length,series:[...new Set(changes.filter(r=>r.series_id).map(r=>r.series_id))],movies:changes.filter(r=>!r.series_id).length}))
if(apply){
  const groups=new Map()
  for(const row of changes){const key=JSON.stringify([row.genres,row.newGenres]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  for(const group of groups.values())for(let offset=0;offset<group.length;offset+=40){
    const chunk=group.slice(offset,offset+40)
    await query(`UPDATE media SET genres=? WHERE genres=? AND id IN (${chunk.map(()=>'?').join(',')})`,[chunk[0].newGenres,chunk[0].genres,...chunk.map(r=>r.id)])
  }
  const verified=new Map((await query('SELECT id,genres FROM media')).result.flatMap(r=>r.results).map(r=>[r.id,r.genres]))
  for(const row of changes)if(verified.get(row.id)!==row.newGenres)throw Error(`Genre verification failed: ${row.title}`)
  for(const {path,manifest} of manifests)await writeFile(path,JSON.stringify(manifest,null,2)+'\n')
  report.applied=true
  await writeFile('logs/animation-genre-fix.json',JSON.stringify(report,null,2))
  console.log(`Verified ${changes.length} live genre corrections and updated ${manifests.length} manifests.`)
}
