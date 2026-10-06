import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {classicGenres} from './media-genres.mjs'

// Reviewed IMDb title/year matches; only genres change, never ratings or access rules.
const sources=JSON.parse(readFileSync('media-imports/movie-genres-imdb.json','utf8'))
const apply=process.argv.includes('--apply')
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`
async function request(url,options={}){
  const response=await fetch(url,{headers,...options})
  const data=await response.json()
  if(!response.ok||!data.success)throw Error(`Cloudflare query failed: ${JSON.stringify(data.errors)}`)
  return data
}
const database=(await request(base)).result.find(db=>db.name===(process.env.D1_DATABASE||'king-videos-prod'))
if(!database)throw Error('D1 database not found')
async function query(sql,params=[]){return (await request(`${base}/${database.uuid}/query`,{method:'POST',body:JSON.stringify({sql,params})})).result.flatMap(result=>result.results||[])}
const rows=await query("SELECT id,title,year,genres FROM media WHERE category='movie'")
function genresFor(source,year){
  if(!Array.isArray(source.genres)||!source.genres.length||source.genres.some(genre=>typeof genre!=='string'))throw Error('Invalid IMDb genres')
  const genres=source.genres.map(genre=>{
    if(genre==='Animation'){
      if(!['2d','3d'].includes(source.animationStyle))throw Error(`Animation style needs review: ${source.imdbId}`)
      return source.animationStyle==='2d'?'Cartoon':'Animation'
    }
    return genre==='Sci-Fi'?'Science Fiction':genre==='Sport'?'Sports':genre
  })
  return classicGenres(genres,year)
}
const changes=[],unmatched=[]
for(const row of rows){
  const source=sources[row.id]
  if(!source||!Number.isInteger(source.year)||!row.year||Math.abs(source.year-row.year)>1){unmatched.push({id:row.id,title:row.title,reason:'Title/version or release year needs review'});continue}
  const genres=genresFor(source,row.year)
  if(JSON.stringify(JSON.parse(row.genres||'[]'))!==JSON.stringify(genres))changes.push({...row,genresBefore:row.genres,newGenres:genres})
}
const local=[]
function visit(folder){
  for(const entry of readdirSync(folder,{withFileTypes:true})){
    const path=join(folder,entry.name)
    if(entry.isDirectory()){visit(path);continue}
    if(entry.name!=='media.json')continue
    const manifest=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')),before=JSON.stringify(manifest)
    function update(item,category){
      const source=sources[item.id]
      if(category==='movie'&&source&&!item.excludeFromUploads&&item.year&&Math.abs(source.year-item.year)<=1){
        item.genres=genresFor(source,item.year)
        item.imdbId=source.imdbId
        item.imdbGenres=source.genres
        item.genresSource=source.source
        if(source.animationStyle)item.animationStyle=source.animationStyle
      }
      for(const key of ['items','episodes'])for(const child of item[key]||[])update(child,child.category||category)
    }
    update(manifest,manifest.category)
    if(before!==JSON.stringify(manifest))local.push({path,manifest})
  }
}
visit('media-imports')
mkdirSync('logs',{recursive:true})
const report={matched:rows.length-unmatched.length,total:rows.length,changes,localManifests:local.map(item=>item.path),unmatched,applied:false}
writeFileSync('logs/imdb-movie-genres-report.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({matched:report.matched,total:report.total,changed:changes.length,localManifests:local.length,unmatched}))
if(apply){
  for(const row of changes)await query('UPDATE media SET genres=? WHERE id=? AND genres=?',[JSON.stringify(row.newGenres),row.id,row.genresBefore])
  const verified=new Map((await query("SELECT id,genres FROM media WHERE category='movie'")).map(row=>[row.id,row.genres]))
  for(const row of changes)if(verified.get(row.id)!==JSON.stringify(row.newGenres))throw Error(`Genre verification failed for ${row.title}`)
  for(const item of local)writeFileSync(item.path,JSON.stringify(item.manifest,null,2)+'\n')
  report.applied=true
  report.finishedAt=new Date().toISOString()
  writeFileSync('logs/imdb-movie-genres-report.json',JSON.stringify(report,null,2)+'\n')
  console.log(`Verified ${changes.length} live movie genre updates and ${local.length} local manifests.`)
}
