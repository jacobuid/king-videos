import { readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import sharp from 'sharp'

const root=resolve('media-imports'),videoRoot=resolve(process.argv[2]||'D:/king-videos/Batman-compressed')
const wikiApi='https://en.wikipedia.org/w/api.php'
const episodePage='List_of_Batman:_The_Animated_Series_episodes'

function text(value){return value.replace(/<br\s*\/?\s*>/gi,' ').replace(/<hr\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#160;|&nbsp;/g,' ').replace(/&#8202;/g,'').replace(/&amp;/g,'&').replace(/&quot;|&#34;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&ndash;/g,'–').replace(/&mdash;/g,'—').replace(/\s+/g,' ').trim()}
function key(value){return value.toLowerCase().replace(/&/g,'and').replace(/\bthe\b/g,'').replace(/part\s*(one|1)/g,'part1').replace(/part\s*(two|2)/g,'part2').replace(/[^a-z0-9]+/g,'')}
async function api(params){const url=new URL(wikiApi);for(const [name,value] of Object.entries({format:'json',origin:'*',...params}))url.searchParams.set(name,value);const response=await fetch(url,{headers:{'User-Agent':'King Videos metadata importer'}});if(!response.ok)throw new Error(`Wikipedia request failed (${response.status})`);return response.json()}

const episodePages=[episodePage,'The_New_Batman_Adventures'],metadata=new Map()
for(const pageName of episodePages){
  const parsed=await api({action:'parse',page:pageName,prop:'text'}),html=parsed.parse.text['*']
  const rows=[...html.matchAll(/<tr class="vevent module-episode-list-row"[\s\S]*?<td class="summary"[\s\S]*?>([\s\S]*?)<\/td>[\s\S]*?<span class="bday dtstart published updated itvstart">(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?<\/tr>\s*<tr class="expand-child">[\s\S]*?<td class="description"[\s\S]*?<div class="shortSummaryText"[^>]*>([\s\S]*?)<\/div><\/td><\/tr>/g)]
  for(const row of rows){const title=text(row[1]).replace(/^"|"$/g,''),description=text(row[3]).replace(/\s*(?:Note|Notes):?\s.*$/i,'').trim();metadata.set(key(title),{title,date:row[2],year:Number(row[2].slice(0,4)),description})}
  for(const row of html.matchAll(/<tr class="vevent module-episode-list-row"[\s\S]*?<td class="summary"[\s\S]*?>([\s\S]*?)<\/td>[\s\S]*?<span class="bday dtstart published updated itvstart">(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?<\/tr>/g)){const title=text(row[1]).replace(/^"|"$/g,''),id=key(title);if(!metadata.has(id))metadata.set(id,{title,date:row[2],year:Number(row[2].slice(0,4)),description:''})}
}
metadata.set(key('Blind as a Batman'),metadata.get(key('Blind as a Bat')))
metadata.set(key('Deep Freeze'),[...metadata].find(([id])=>id.endsWith(key('Deep Freeze')))?.[1])
metadata.set(key('Judgement Day'),metadata.get(key('Judgment Day')))

const series=[
  {id:'batman-the-animated-series',title:'Batman: The Animated Series',page:'Batman:_The_Animated_Series',folder:'Batman The Animated Series',prefix:'Batman T.A.S',year:1992,description:'Batman protects Gotham City from a gallery of criminals while confronting the tragedy and responsibility behind his mission.'},
  {id:'the-new-batman-adventures',title:'The New Batman Adventures',page:'The_New_Batman_Adventures',folder:'The New Batman Adventures',prefix:'The New Batman Adventures',year:1997,description:'Batman continues defending Gotham City alongside a growing team of heroes, including Robin, Nightwing, and Batgirl.'},
]

for(const show of series){
  const folder=join(videoRoot,show.folder),files=(await readdir(folder)).filter(name=>name.toLowerCase().endsWith('.mp4')).sort(),episodes=[],missing=[]
  for(const file of files){const match=file.match(/S(\d+)\s*E(\d+)\s*-\s*(.+?)\s*\(480p\)\.mp4$/i);if(!match)continue;const title=match[3].trim(),found=metadata.get(key(title));if(!found)missing.push(title);episodes.push({season:Number(match[1]),episode:Number(match[2]),title,file,...(found?{date:found.date,year:found.year,description:found.description}:{})})}
  const summary=await api({action:'query',prop:'extracts|pageimages',exintro:'1',explaintext:'1',piprop:'thumbnail',pithumbsize:'1400',titles:show.page}),page=Object.values(summary.query.pages)[0],thumbnail=page.thumbnail?.source
  if(thumbnail){const response=await fetch(thumbnail);if(!response.ok)throw new Error(`Thumbnail download failed for ${show.title}`);await sharp(Buffer.from(await response.arrayBuffer())).resize({width:1200,withoutEnlargement:true}).jpeg({quality:84,mozjpeg:true}).toFile(join(root,show.id,'thumb.jpg'))}
  const manifest={id:show.id,title:show.title,description:page.extract||show.description,category:'tv',year:show.year,genres:['Animation','Action','Adventure','Superhero'],rating:'TV-PG',kids:true,blocked:false,thumbnail:'thumb.jpg',metadataSource:`https://en.wikipedia.org/wiki/${show.page}`,episodeMetadataSource:`https://en.wikipedia.org/wiki/${show.id==='the-new-batman-adventures'?'The_New_Batman_Adventures':episodePage}`,episodes}
  await writeFile(join(root,show.id,'media.json'),`${JSON.stringify(manifest,null,2)}\n`)
  console.log(`${show.title}: ${episodes.length} episodes, ${missing.length} unmatched metadata${missing.length?` (${missing.join('; ')})`:''}`)
}
