import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const folder=resolve(process.argv[2]||''),output=resolve(process.argv[3]||'')
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node scripts/create-drake-josh-manifest.mjs <video-folder> <output-media.json>')
const previous=await readFile(output,'utf8').then(JSON.parse).catch(()=>null),files=(await readdir(folder)).filter(name=>name.toLowerCase().endsWith('.mp4')).sort(),oldByFile=new Map((previous?.episodes||[]).map(item=>[item.file,item]))
const cleanTitle=value=>value.replace(/\s*\([^)]*(?:p|Web-DL)[^)]*\)\s*$/i,'').replace(/^Hug Me, Brother, PILOT$/i,'Pilot').replace(/^The Mean Teacher$/i,'Mean Teacher').replace(/^The Drake and Josh Inn$/i,'The Drake & Josh Inn').replace(/^Drew and Jerry$/i,'Drew & Jerry').replace(/^Josh is Done$/i,'Josh Is Done').replace(/^My Dinner With Bobo$/i,'My Dinner with Bobo').replace(/^Really Big Shrimp, Part 1-2$/i,'Really Big Shrimp')
const episodes=files.map(file=>{const match=file.match(/S(\d+)\s*E(\d+)(?:-E(\d+))?\s*-\s*(.+)\.mp4$/i);if(!match)throw new Error(`Unrecognized video filename: ${file}`);const season=Number(match[1]),episode=Number(match[2]),title=cleanTitle(match[4]),previousItem=oldByFile.get(file)||{};return{season,episode,title,file,...(match[3]?{episodeEnd:Number(match[3])}:{}),...previousItem}})
const manifest={
  id:'drake-and-josh',
  title:'Drake & Josh',
  description:'Two very different teenage stepbrothers navigate family, school, friendships, and increasingly chaotic misadventures together.',
  category:'tv',
  year:2004,
  genres:['Comedy','Family','Live Action'],
  rating:'TV-Y7',
  kids:true,
  blocked:false,
  thumbnail:'thumb.png',
  metadataSource:'https://en.wikipedia.org/wiki/List_of_Drake_%26_Josh_episodes',
  episodes
}
await writeFile(output,JSON.stringify(manifest,null,2)+'\n')
console.log(`Wrote ${episodes.length} video entries across ${new Set(episodes.map(item=>item.season)).size} season groups`)
