import process from 'node:process'

const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)

const seriesId=process.argv[2]||'bluey',page=process.argv[3]||'List of Bluey episodes'
const source=`https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g,'_'))}`
const api=`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&origin=*`
const response=await fetch(api,{headers:{'User-Agent':'King Videos metadata importer'}})
if(!response.ok)throw new Error(`Wikipedia request failed (${response.status})`)
const html=(await response.json()).parse.text['*']
const text=value=>value.replace(/<[^>]+>/g,' ').replace(/&#(x?[0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim()
const normalize=value=>text(value).replace(/^"|"$/g,'').toLowerCase().replace(/^bluey\s*[:：]\s*/,'').replace(/^joe's first day.*$/,'joe and tell').replace(/\(part \d+ of \d+\)|\(blue talks\)/g,'').replace(/pyjama/g,'pajama').replace(/\bwants\b/g,'want').replace(/\bms pepper\b/g,'mrs pepper').replace(/\bmovie\b/g,'').replace(/\b2\b/g,'two').replace(/^(a|the) /,'').normalize('NFKD').replace(/[^a-z0-9]+/gi,'')
const episodes=[]
const pattern=/<tr class="vevent[^]*?<td class="summary"[^>]*>([^]*?)<\/td>[^]*?<\/tr><tr class="expand-child">[^]*?<div class="shortSummaryText"[^>]*>([^]*?)<\/div>/g
for(const match of html.matchAll(pattern)){const title=text(match[1]).replace(/^"|"$/g,''),description=text(match[2]);if(title&&description)episodes.push({title,description})}
if(episodes.length<10)throw new Error(`Only found ${episodes.length} episode descriptions; Wikipedia markup may have changed`)

const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const databaseName=process.env.D1_DATABASE||'king-videos-prod'
const databasesResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers})
const databases=await databasesResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params=[]){const resultResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})}),result=await resultResponse.json();if(!resultResponse.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`);return result.result?.[0]?.results||[]}

const media=await query('SELECT id,title FROM media WHERE series_id=?',[seriesId])
const descriptions=new Map(episodes.map(item=>[normalize(item.title),item.description]))
let updated=0
for(const item of media){const key=normalize(item.title),alias=key==='postmanandgroundslava'?[...descriptions].find(([candidate])=>candidate.includes('postmanandgroundslava'))?.[1]:key==='crazychristmas'?[...descriptions].find(([candidate])=>candidate.startsWith('crazychristmas'))?.[1]:null,description=descriptions.get(key)||alias;if(!description){console.log(`No Wikipedia match: ${item.title}`);continue}await query('UPDATE media SET description=? WHERE id=?',[description,item.id]);updated++}
console.log(`Updated ${updated} of ${media.length} ${seriesId} records from ${source}`)
