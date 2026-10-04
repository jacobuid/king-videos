import { spawnSync } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

const input=resolve(process.argv[2]||''),output=resolve(process.argv[3]||'media-imports/home-videos/media.json')
if(!process.argv[2])throw new Error('Usage: node scripts/generate-home-videos-manifest.mjs <compressed-folder> [output.json]')
async function scan(folder){const files=[];for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())files.push(...await scan(path));else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.mp4')&&!entry.name.toLowerCase().endsWith('.partial.mp4'))files.push(path)}return files}
function dateFrom(relativeName){const name=basename(relativeName,extname(relativeName)),compact=name.match(/(?:^|\D)((?:19|20)\d{2})(\d{2})(\d{2})(?:\D|$)/),dated=name.match(/(?:^|\D)((?:19|20)\d{2})[ _-]+(\d{1,2})-(\d{1,2})(?:\D|$)/),leadingYear=name.match(/^((?:19|20)\d{2})(?:\D|$)/),folderYear=relativeName.split(/[\\/]/).map(part=>part.match(/^((?:19|20)\d{2})$/)?.[1]).find(Boolean),anyYear=name.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);const match=compact||dated;if(match){const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);if(month>=1&&month<=12&&day>=1&&day<=31)return{date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,year}}const year=Number(leadingYear?.[1]||folderYear||anyYear?.[1]||0);return{date:year?String(year):null,year:year||null}}
function titleFrom(relativeName){return basename(relativeName,extname(relativeName)).replace(/^((?:19|20)\d{2})(?:\d{4}|[ _-]+\d{1,2}-\d{1,2})?[ _-]*/,'').replace(/_/g,' ').replace(/\s+/g,' ').trim()||basename(relativeName,extname(relativeName))}
function duration(path){const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{encoding:'utf8',windowsHide:true});const seconds=Math.round(Number(probe.stdout));return Number.isFinite(seconds)?seconds:null}
const files=(await scan(input)).filter(path=>!/^\((?:Front|Main)\).*Katie.*Caleb.*Wedding/i.test(basename(path))).sort((a,b)=>a.localeCompare(b)),items=files.map(path=>{const file=relative(input,path).replaceAll('\\','/'),date=dateFrom(file);return{file,path,title:titleFrom(file),...date,duration:duration(path)}}),byYear=new Map()
for(const item of items){const key=item.year||0,list=byYear.get(key)||[];list.push(item);byYear.set(key,list)}
const episodes=[]
for(const[year,list]of [...byYear].sort((a,b)=>a[0]-b[0]))list.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.title.localeCompare(b.title)).forEach((item,index)=>episodes.push({file:item.file,title:item.title,season:year,episode:index+1,date:item.date,year:item.year,duration:item.duration}))
const manifest={id:'home-videos',title:'Home Videos',category:'home-videos',description:'Family home videos organized by recording date.',genres:[],rating:'NR',minAge:0,episodes}
await mkdir(dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify(manifest,null,2)}\n`)
console.log(`Wrote ${episodes.length} Home Video records to ${output}; ${episodes.filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')).length} include month and day.`)
