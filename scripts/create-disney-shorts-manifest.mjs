import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'

const folder=resolve(process.argv[2]||'D:/king-videos/disney-shorts-compressed'),output=resolve(process.argv[3]||'media-imports/disney-classic-shorts/media.json')
const files=await readdir(folder),videos=files.filter(file=>/\.(mp4|m4v|mov|mkv)$/i.test(file)).sort(),images=files.filter(file=>/\.(jpg|jpeg|png|webp)$/i.test(file)),imageByStem=new Map(images.map(file=>[basename(file,extname(file)).toLowerCase(),file]))
const cleanStem=file=>basename(file,extname(file)).replace(/\s*\[720p\]\s*$/i,'').trim(),cleanTitle=file=>cleanStem(file).replace(/^[^-]+ - /,'').trim(),slug=value=>value.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
const previous=await readFile(output,'utf8').then(JSON.parse).catch(()=>({items:[]})),previousByVideo=new Map((previous.items||[]).map(item=>[item.video,item]))
const items=videos.map(video=>{const stem=basename(video,extname(video)),thumbnail=imageByStem.get(stem.toLowerCase());if(!thumbnail)throw new Error(`Missing thumbnail for ${video}`);const old=previousByVideo.get(video)||{},title=old.title||cleanTitle(video);return {...old,id:old.id||`disney-short-${slug(title)}`,title,description:old.description||'',year:old.year||null,date:old.date||null,rating:old.rating||'TV-G',genres:old.genres||['Cartoon','Family'],kids:old.kids??true,blocked:old.blocked??false,duration:old.duration||null,video,thumbnail}})
const manifest={id:'disney-classic-shorts',title:'Disney Classic Shorts',category:'short',genres:['Cartoon','Family'],rating:'TV-G',items}
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(manifest,null,2)+'\n');console.log(`Created ${output} with ${items.length} individual shorts`)
