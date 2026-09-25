import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'

const manifestPath=resolve(process.argv[2]||'')
if(!process.argv[2])throw new Error('Usage: node scripts/import-media.mjs <media.json>')
const folder=dirname(manifestPath),manifest=JSON.parse((await readFile(manifestPath,'utf8')).replace(/^\uFEFF/,''))
const required=['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)
const bucketName=process.env.B2_BUCKET||'king-videos'
const basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed: ${await authResponse.text()}`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const thumbnail=await readFile(resolve(folder,manifest.thumbnail)),thumbnailKey=`movies/${manifest.id}/${basename(manifest.thumbnail)}`
const upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId})
const uploadResponse=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(thumbnailKey),'Content-Type':'image/jpeg','Content-Length':String(thumbnail.length),'X-Bz-Content-Sha1':createHash('sha1').update(thumbnail).digest('hex')},body:thumbnail})
if(!uploadResponse.ok)throw new Error(`Thumbnail upload failed: ${await uploadResponse.text()}`)

if(manifest.source?.provider!=='internet-archive')throw new Error('This importer currently supports source.provider = internet-archive')
const identifier=manifest.source.identifier,metadataResponse=await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)
if(!metadataResponse.ok)throw new Error(`Internet Archive metadata failed (${metadataResponse.status})`)
const metadata=await metadataResponse.json()
const files=(metadata.files||[]).filter(file=>file.name?.toLowerCase().endsWith('.mp4')&&!file.name.toLowerCase().endsWith('.ia.mp4'))
const cloudflareHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const databaseName=process.env.D1_DATABASE||'king-videos-prod'
const databasesResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cloudflareHeaders})
const databases=await databasesResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cloudflareHeaders,body:JSON.stringify({sql,params})});const result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)}
for(const file of files){
  const match=file.name.match(/S(\d+)E(\d+)([A-D])?\s+(.+)\.mp4$/i);if(!match){console.log(`Skipping unrecognized episode: ${file.name}`);continue}
  const season=Number(match[1]),episode=Number(match[2]),suffix=(match[3]||'').toLowerCase(),title=match[4],id=`${manifest.id}-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}${suffix}`
  const sourceUrl=`https://archive.org/download/${encodeURIComponent(identifier)}/${file.name.split('/').map(encodeURIComponent).join('/')}`
  const sql=`INSERT INTO media(id,title,description,category,video_key,source_url,thumbnail_key,mime_type,kids_allowed,series_id,series_title,season_number,episode_number,genres,rating,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,source_url=excluded.source_url,thumbnail_key=excluded.thumbnail_key,mime_type=excluded.mime_type,kids_allowed=excluded.kids_allowed,series_id=excluded.series_id,series_title=excluded.series_title,season_number=excluded.season_number,episode_number=excluded.episode_number,genres=excluded.genres,rating=excluded.rating,featured=excluded.featured`
  await query(sql,[id,title,manifest.description||'',manifest.category||'tv',`external/archive/${identifier}/${file.name}`,sourceUrl,thumbnailKey,'video/mp4',manifest.kids?1:0,manifest.id,manifest.title,season,episode,JSON.stringify(manifest.genres||[]),manifest.rating||null,manifest.featured?1:0])
  console.log(`Imported S${season} E${episode}: ${title}`)
}
console.log(`Imported ${files.length} Internet Archive video files for ${manifest.title}`)
