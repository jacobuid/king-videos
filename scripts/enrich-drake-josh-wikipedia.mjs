import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const manifestPath=resolve(process.argv[2]||''),wikiPath=resolve(process.argv[3]||'')
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node scripts/enrich-drake-josh-wikipedia.mjs <media.json> <wikitext-file>')
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),wiki=await readFile(wikiPath,'utf8')
const normalize=value=>value.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'').replace(/^thefoamfinger$/,'foamfinger')
const plain=value=>value
  .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,' ')
  .replace(/<ref\b[^>]*\/\s*>/gi,' ')
  .replace(/<!--.*?-->/gs,' ')
  .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g,'$1')
  .replace(/\[\[([^\]]+)\]\]/g,'$1')
  .replace(/\{\{[^{}]*\}\}/g,' ')
  .replace(/'{2,}/g,'')
  .replace(/<[^>]+>/g,' ')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
  .replace(/\s+/g,' ').trim()
const synopsis=value=>{const text=plain(value),sentences=text.match(/[^.!?]+[.!?]+(?:["'](?=\s|$))?/g)||[text];let result='';for(const sentence of sentences){if(result&&result.length+sentence.trim().length+1>420)break;result+=(result?' ':'')+sentence.trim();if(result.length>=220)break}return result||text.slice(0,420)}
const entries=[]
for(const block of wiki.split(/(?=\{\{Episode list\b)/g).slice(1)){
  const titleMatch=block.match(/\n\s*\|\s*(?:Title|RTitle)\s*=\s*(.+)/),dateMatch=block.match(/\n\s*\|\s*OriginalAirDate\s*=\s*\{\{Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})/),summaryMatch=block.match(/\n\s*\|\s*ShortSummary\s*=\s*([\s\S]*?)(?=\n\s*\|\s*[A-Za-z0-9]+\s*=|\n\}\})/)
  if(!titleMatch||!dateMatch||!summaryMatch)continue
  const title=plain(titleMatch[1]),[,year,month,day]=dateMatch
  entries.push({title,date:`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`,year:Number(year),description:synopsis(summaryMatch[1])})
}
const byTitle=new Map(entries.map(item=>[normalize(item.title),item])),missing=[]
for(const episode of manifest.episodes){const metadata=byTitle.get(normalize(episode.title));if(!metadata){missing.push(episode.title);continue}Object.assign(episode,metadata,{title:episode.title})}
if(missing.length||entries.length!==manifest.episodes.length)throw new Error(`Wikipedia mapping mismatch: parsed ${entries.length}, manifest ${manifest.episodes.length}, missing ${missing.join(', ')}`)
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n')
console.log(`Enriched ${entries.length} Drake & Josh entries from Wikipedia`)
