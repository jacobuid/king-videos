import process from 'node:process'

const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)

const source='https://en.wikipedia.org/wiki/List_of_Bluey_episodes'
const api='https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Bluey_episodes&prop=text&format=json&origin=*'
const response=await fetch(api,{headers:{'User-Agent':'King Videos metadata importer'}})
if(!response.ok)throw new Error(`Wikipedia request failed (${response.status})`)
const html=(await response.json()).parse.text['*']
const text=value=>value.replace(/<[^>]+>/g,' ').replace(/&#(x?[0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim()
const normalize=value=>text(value).replace(/^"|"$/g,'').normalize('NFKD').replace(/[^a-z0-9]+/gi,'').toLowerCase()
const episodes=[]
const pattern=/<tr class="vevent[^]*?<td class="summary"[^>]*>([^]*?)<\/td>[^]*?<\/tr><tr class="expand-child">[^]*?<div class="shortSummaryText"[^>]*>([^]*?)<\/div>/g
for(const match of html.matchAll(pattern)){const title=text(match[1]).replace(/^"|"$/g,''),description=text(match[2]);if(title&&description)episodes.push({title,description})}
if(episodes.length<150)throw new Error(`Only found ${episodes.length} episode descriptions; Wikipedia markup may have changed`)

const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const databaseName=process.env.D1_DATABASE||'king-videos-prod'
const databasesResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers})
const databases=await databasesResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params=[]){const resultResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})}),result=await resultResponse.json();if(!resultResponse.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`);return result.result?.[0]?.results||[]}

const media=await query("SELECT id,title FROM media WHERE series_id='bluey'")
const descriptions=new Map(episodes.map(item=>[normalize(item.title),item.description]))
let updated=0
for(const item of media){const description=descriptions.get(normalize(item.title));if(!description){console.log(`No Wikipedia match: ${item.title}`);continue}await query('UPDATE media SET description=? WHERE id=?',[description,item.id]);updated++}
console.log(`Updated ${updated} of ${media.length} Bluey records from ${source}`)
