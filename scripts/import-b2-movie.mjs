import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'

const manifestPath=resolve(process.argv[2]||'')
if(!process.argv[2])throw new Error('Usage: node scripts/import-b2-movie.mjs <media.json>')
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),folder=resolve(manifest.localFolder||'')
for(const name of ['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!process.env[name])throw new Error(`${name} is required`)
if(manifest.category!=='movie'||!manifest.video||!manifest.thumbnail)throw new Error('A movie manifest requires category, video, and thumbnail fields')

const basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed: ${await authResponse.text()}`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const bucketName=process.env.B2_BUCKET||'king-videos',buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const prefix=`movies/${manifest.id}/`,existing=new Set(),listed=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix,maxFileCount:1000})
for(const file of listed.files||[])existing.add(file.fileName)
let upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId})
async function uploadFile(file,key,type){if(existing.has(key)){console.log(`Already uploaded; skipping ${key}`);return}const bytes=await readFile(resolve(folder,file)),hash=createHash('sha1').update(bytes).digest('hex');for(let attempt=1;attempt<=5;attempt++){const response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':type,'Content-Length':String(bytes.length),'X-Bz-Content-Sha1':hash},body:bytes});if(response.ok){console.log(`Uploaded ${file}`);return}if(attempt===5)throw new Error(`Upload failed for ${key}: ${await response.text()}`);upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});await new Promise(done=>setTimeout(done,attempt*1000))}}
const videoKey=`${prefix}${manifest.id}.mp4`,thumbnailKey=`${prefix}${basename(manifest.thumbnail)}`,thumbnailType=extname(manifest.thumbnail).toLowerCase()==='.png'?'image/png':'image/jpeg'
await uploadFile(manifest.thumbnail,thumbnailKey,thumbnailType)
await uploadFile(manifest.video,videoKey,'video/mp4')

const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
const sql='INSERT INTO media(id,title,description,category,video_key,thumbnail_key,mime_type,kids_allowed,release_date,year,genres,rating,duration_seconds,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,video_key=excluded.video_key,thumbnail_key=excluded.thumbnail_key,mime_type=excluded.mime_type,kids_allowed=excluded.kids_allowed,release_date=excluded.release_date,year=excluded.year,genres=excluded.genres,rating=excluded.rating,duration_seconds=excluded.duration_seconds,featured=excluded.featured'
const params=[manifest.id,manifest.title,manifest.description||'','movie',videoKey,thumbnailKey,'video/mp4',manifest.kids?1:0,manifest.date||null,manifest.year||null,JSON.stringify(manifest.genres||[]),manifest.rating||null,manifest.duration||null,manifest.featured?1:0]
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})}),result=await response.json()
if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)
console.log(`Imported movie: ${manifest.title}`)
