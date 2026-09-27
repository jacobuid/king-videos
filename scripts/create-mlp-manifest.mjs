import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const listTitle='List of My Little Pony: Friendship Is Magic episodes'
const api='https://en.wikipedia.org/w/api.php'
const headers={'User-Agent':'Kingflix metadata importer (private family media catalog)'}
const decode=value=>value.replace(/<[^>]+>/g,'').replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number))).replace(/&#x([0-9a-f]+);/gi,(_,number)=>String.fromCodePoint(Number.parseInt(number,16))).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&nbsp;',' ').trim()
const response=await fetch(`${api}?action=parse&page=${encodeURIComponent(listTitle)}&prop=text&format=json&origin=*`,{headers})
if(!response.ok)throw new Error(`Wikipedia episode list request failed: ${response.status}`)
const html=(await response.json()).parse.text['*'],rows=[...html.matchAll(/<tr class="vevent module-episode-list-row"[^>]*>([\s\S]*?)<\/tr>/g)].map(match=>match[1])
const episodes=[];let previous=null
for(const row of rows){
  const numbers=row.match(/<th[^>]*id="ep(\d+)"[^>]*>\s*(\d+)\s*<\/th>\s*<td[^>]*>\s*(\d+)\s*<\/td>/)
  if(!numbers)continue
  const overall=Number(numbers[1]);if(overall>117)break
  const season=overall<=26?1:overall<=52?2:overall<=65?3:overall<=91?4:5,episode=Number(numbers[3]),summary=row.match(/<td class="summary"([^>]*)>([\s\S]*?)<\/td>/),date=row.match(/class="bday dtstart published updated itvstart">(\d{4}-\d{2}-\d{2})<\/span>/)?.[1]||null
  let title,articleTitle
  if(summary){const anchor=summary[2].match(/<a [^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);title=decode(anchor?.[2]||summary[2]);articleTitle=decode(anchor?.[1]||title);const parts=summary[1].match(/rowspan="(\d+)"/);previous={title,articleTitle,part:1};if(parts&&Number(parts[1])>1)title=`${title}, Part 1`}
  else if(previous){previous.part++;title=`${previous.title}, Part ${previous.part}`;articleTitle=previous.articleTitle}
  else continue
  episodes.push({season,episode,title,articleTitle,date,year:date?Number(date.slice(0,4)):null})
}
if(episodes.length!==117)throw new Error(`Expected 117 episodes for seasons 1-5, found ${episodes.length}`)

const articleCounts=new Map();for(const episode of episodes)articleCounts.set(episode.articleTitle,(articleCounts.get(episode.articleTitle)||0)+1)
const extracts=new Map(),articleTitles=[...articleCounts.keys()]
for(let index=0;index<articleTitles.length;index+=20){const titles=articleTitles.slice(index,index+20),query=await fetch(`${api}?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(titles.join('|'))}`,{headers});if(!query.ok)throw new Error(`Wikipedia descriptions request failed: ${query.status}`);const data=await query.json();for(const page of Object.values(data.query.pages||{}))extracts.set(page.title,page.extract||'');const aliases=[...(data.query.normalized||[]),...(data.query.redirects||[])];for(const alias of aliases){const target=extracts.get(alias.to);if(target)extracts.set(alias.from,target)}}
function descriptionFor(episode){const extract=extracts.get(episode.articleTitle)||'',match=extract.match(/(?:In this episode,?|The episodes? follow(?:s)?|The (?:plot|story) (?:follows|centers on)|The episode (?:follows|centers on))\s+([^.!?]+[.!?])/i),sentences=extract.split(/(?<=[.!?])\s+/).filter(sentence=>sentence.length>30&&!/\b(?:aired|written|directed|received|episode of|episodes? of|is the)\b/i.test(sentence)),fallback=sentences[0]||`The ponies face a new friendship lesson in ${episode.title}.`,text=(match?.[1]||fallback).replace(/\s+/g,' ').trim(),limit=articleCounts.get(episode.articleTitle)>1?12:24,words=text.split(' ');return words.length>limit?`${words.slice(0,limit).join(' ').replace(/[,:;]$/,'')}…`:text}
const seasonYears={1:2010,2:2011,3:2012,4:2013,5:2015}
const manifest={id:'my-little-pony-friendship-is-magic',title:'My Little Pony: Friendship Is Magic',description:'Twilight Sparkle and her friends explore Equestria, solve problems, and learn lasting lessons about friendship.',category:'tv',genres:['Adventure','Cartoon','Family'],rating:'TV-Y7',year:2010,kids:true,blocked:false,thumbnail:'thumb.png',metadataSource:'https://en.wikipedia.org/wiki/List_of_My_Little_Pony:_Friendship_Is_Magic_episodes',episodes:episodes.map(item=>({season:item.season,episode:item.episode,title:item.title,description:descriptionFor(item),year:item.year||seasonYears[item.season]}))}
const output=resolve('media-imports/my-little-pony-friendship-is-magic/media.json');await mkdir(resolve('media-imports/my-little-pony-friendship-is-magic'),{recursive:true});await writeFile(output,`${JSON.stringify(manifest,null,2)}\n`)
console.log(`Created ${output} with ${manifest.episodes.length} episodes`)
