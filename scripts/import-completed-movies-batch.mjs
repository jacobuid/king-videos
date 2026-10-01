import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const sourceRoot=resolve(process.argv[2]||'')
const concurrency=Math.max(1,Number(process.argv[3]||6))
if(!process.argv[2])throw new Error('Usage: node scripts/import-completed-movies-batch.mjs <completed-folder> [workers]')

const movies=[
  ['cars-3','Cars 3','Cars 3','Cars.3.2017.1080p.WEBRip.x264.AAC-Ozlem.mp4','compose.webp'],
  ['inside-out-2','Inside Out 2','www.SceneTime.com - Inside Out 2 2024 MULTi VF2 1080p WEB H265-FW','Inside Out 2 2024 MULTi VF2 1080p WEB H265-FW.mp4','compose.webp'],
  ['madagascar','Madagascar','Madagascar (2005)','Madagascar.2005.720p.BrRip.x264.YIFY.mp4','compose.webp'],
  ['meet-the-robinsons','Meet the Robinsons','Meet The Robinsons (2007)','Meet.The.Robinsons.2007.720p.BRrip.x264.YIFY.mp4','compose.webp'],
  ['ralph-breaks-the-internet','Ralph Breaks the Internet','Ralph Breaks The Internet (2018) [WEBRip] [720p] [YTS.AM]','Ralph.Breaks.The.Internet.2018.720p.WEBRip.x264-[YTS.AM].mp4','compose.webp'],
  ['tinker-bell','Tinker Bell','Tinker Bell (2008)','Tinker.Bell.2008.720p.BRrip.x264.GAZ.YIFY.mp4','compose.webp'],
  ['tinker-bell-great-fairy-rescue','Tinker Bell and the Great Fairy Rescue','Tinker Bell and The Great Fairy Rescue','Tinker.Bell.And.The.Great.Fairy.Rescue.2010.720p.BRrip.x264.GAZ.YIFY.mp4','compose.webp'],
  ['tinker-bell-lost-treasure','Tinker Bell and the Lost Treasure','Tinker Bell And The Lost Treasure (2009)','Tinker.Bell.And.The.Lost.Treasure.2009.720p.BRrip.x264.GAZ.YIFY.mp4','compose.webp'],
  ['the-pirate-fairy','The Pirate Fairy','Tinker Bell and the Pirate Fairy','Tinker Bell and the Pirate Fairy 2014 1080p MA WEB-DL H 264 DDP5 1-HHWEB.mp4','compose.webp'],
  ['toy-story','Toy Story','Toy Story (1995)','Toy.Story.1995.720p.BluRay.x264.YIFY.mp4','compose.webp'],
  ['toy-story-5','Toy Story 5','Toy Story 5','Toy Story 5 2026 720p AMZN WEB-DL DDP5 1 H 264-KyoGo.mp4','thumbnail.jpg'],
]

const workRoot=join(sourceRoot,'.upload-manifests')
await mkdir(workRoot,{recursive:true})
let next=0
const failures=[]
const completed=[]
const active=new Map()
const startedAt=new Date().toISOString()
const statusPath=join(sourceRoot,'upload-status.json')
let statusWrites=Promise.resolve()
function writeStatus(){
  statusWrites=statusWrites.then(()=>writeFile(statusPath,`${JSON.stringify({startedAt,updatedAt:new Date().toISOString(),total:movies.length,completed:completed.length,failed:failures.length,active:[...active.values()],pending:movies.length-completed.length-failures.length-active.size,completedTitles:completed,failures},null,2)}\n`))
  return statusWrites
}

async function run(movie){
  const [id,title,folderName,video,thumbnail]=movie
  const folder=join(sourceRoot,folderName)
  const files=await readdir(folder)
  if(!files.includes(video))throw new Error(`Missing video: ${join(folder,video)}`)
  if(!files.includes(thumbnail))throw new Error(`Missing thumbnail: ${join(folder,thumbnail)}`)
  const manifestPath=join(workRoot,`${id}.json`)
  await writeFile(manifestPath,`${JSON.stringify({id,title,category:'movie',video,thumbnail})}\n`)
  const args=['--env-file=.env','scripts/import-b2-movie.mjs',manifestPath,'--folder',folder,'--concurrency','1','--resume','--upload-only']
  await new Promise((done,reject)=>{
    const child=spawn(process.execPath,args,{cwd:process.cwd(),stdio:'inherit'})
    child.once('exit',code=>code===0?done():reject(new Error(`${title} exited with code ${code}`)))
    child.once('error',reject)
  })
}

async function worker(index){
  while(next<movies.length){
    const movie=movies[next++]
    active.set(index,movie[1])
    await writeStatus()
    console.log(`[Worker ${index}] Uploading ${movie[1]}`)
    try{await run(movie);completed.push(movie[1])}catch(error){failures.push({title:movie[1],error:String(error)});console.error(error)}finally{active.delete(index);await writeStatus()}
  }
}

console.log(`Starting ${Math.min(concurrency,movies.length)} parallel upload workers for ${movies.length} movies`)
await writeStatus()
await Promise.all(Array.from({length:Math.min(concurrency,movies.length)},(_,index)=>worker(index+1)))
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1}else console.log('All movie uploads complete')
