import { readdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const folder=resolve(process.argv[2]||'')
if(!process.argv[2])throw new Error('Usage: node scripts/rename-scooby-files.mjs <folder>')
const page='List of Scooby-Doo, Where Are You! episodes',api=`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&origin=*`
const response=await fetch(api,{headers:{'User-Agent':'King Videos metadata importer'}})
if(!response.ok)throw new Error(`Wikipedia request failed (${response.status})`)
const html=(await response.json()).parse.text['*']
const text=value=>value.replace(/<[^>]+>/g,' ').replace(/&#(x?[0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim()
const titles=[]
for(const match of html.matchAll(/<tr class="vevent[^]*?<th[^>]*id="ep(\d+)"[^>]*>[^]*?<td[^>]*>[^]*?<\/td>[^]*?<td class="summary"[^>]*>([^]*?)<\/td>/g)){const overall=Number(match[1]),title=text(match[2]).replace(/^"|"$/g,'');if(overall>=1&&overall<=41)titles.push({overall,title})}
if(titles.length!==41)throw new Error(`Expected 41 episode titles, found ${titles.length}`)
const files=await readdir(folder)
for(const {overall,title} of titles){const season=overall<=17?1:overall<=25?2:3,episode=overall<=17?overall:overall<=25?overall-17:overall-25,source=files.find(name=>name.toLowerCase()===`s${String(season).padStart(2,'0')}e${String(episode).padStart(2,'0')}.m4v`),safe=title.replace(/[<>:"/\\|?*]/g,'').trim(),target=`Scooby Doo S${String(season).padStart(2,'0')} E${String(episode).padStart(2,'0')} - ${safe}.m4v`;if(!source){console.log(`Missing S${season}E${episode}: ${title}`);continue}await rename(join(folder,source),join(folder,target));console.log(`${source} -> ${target}`)}
