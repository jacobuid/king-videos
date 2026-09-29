import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import process from 'node:process'

const manifestPath=resolve(process.argv[2]||''),folderArg=process.argv.indexOf('--folder'),concurrencyArg=process.argv.indexOf('--concurrency'),uploadOnly=process.argv.includes('--upload-only'),metadataOnly=process.argv.includes('--metadata-only'),resume=process.argv.includes('--resume')
if(!process.argv[2]||(folderArg>=0&&!process.argv[folderArg+1])||(concurrencyArg>=0&&!process.argv[concurrencyArg+1]))throw new Error('Usage: node scripts/import-b2-movie.mjs <media.json> [--folder <media-folder>] [--concurrency <workers>] [--resume]')
const concurrency=Math.max(1,Number(concurrencyArg>=0?process.argv[concurrencyArg+1]:1)||1)
const manifest=JSON.parse((await readFile(manifestPath,'utf8')).replace(/^\uFEFF/,'')),folder=resolve(folderArg>=0?process.argv[folderArg+1]:dirname(manifestPath))
for(const name of ['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!process.env[name])throw new Error(`${name} is required`)
if(!['movie','short'].includes(manifest.category)||!manifest.video||!manifest.thumbnail)throw new Error('A movie or short manifest requires category, video, and thumbnail fields')

const basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed: ${await authResponse.text()}`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const bucketName=process.env.B2_BUCKET||'king-videos',buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const prefix=`movies/${manifest.id}/`,existing=new Map(),listed=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix,maxFileCount:1000})
for(const file of listed.files||[])existing.set(file.fileName,Number(file.contentLength))
async function fileSha1(path){const hash=createHash('sha1');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')}
async function uploadFile(file,key,type){const path=resolve(folder,file),size=(await stat(path)).size,remoteSize=existing.get(key);if(remoteSize!==undefined&&(!resume||remoteSize===size)){console.log(`Already uploaded; skipping ${key}${resume?' (size matches)':''}`);return}if(remoteSize!==undefined)console.log(`Remote size differs; replacing ${key}`);const hash=await fileSha1(path);for(let attempt=1;attempt<=5;attempt++){try{const upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId}),response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':type,'Content-Length':String(size),'X-Bz-Content-Sha1':hash},body:createReadStream(path),duplex:'half'});if(response.ok){console.log(`Uploaded ${file}`);return}const error=await response.text();if(attempt===5)throw new Error(`Upload failed for ${key}: ${error}`);console.warn(`Upload attempt ${attempt} failed for ${file}; retrying`)}catch(error){if(attempt===5)throw error;console.warn(`Upload attempt ${attempt} failed for ${file}: ${error.message}; retrying`)}await new Promise(done=>setTimeout(done,attempt*2000))}}
const videoKey=`${prefix}${manifest.id}.mp4`,thumbnailKey=`${prefix}${basename(manifest.thumbnail)}`,thumbnailExtension=extname(manifest.thumbnail).toLowerCase(),thumbnailType=thumbnailExtension==='.png'?'image/png':thumbnailExtension==='.webp'?'image/webp':'image/jpeg'
if(!metadataOnly){const tasks=[[manifest.thumbnail,thumbnailKey,thumbnailType],[manifest.video,videoKey,'video/mp4']],workers=Array.from({length:Math.min(concurrency,tasks.length)},async()=>{while(tasks.length){const task=tasks.shift();if(task)await uploadFile(...task)}});await Promise.all(workers)}

if(uploadOnly){console.log(`Uploaded ${manifest.category}: ${manifest.title}`);process.exit(0)}
const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
const sql='INSERT INTO media(id,title,description,category,video_key,thumbnail_key,mime_type,kids_allowed,release_date,year,genres,rating,duration_seconds,blocked) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,video_key=excluded.video_key,thumbnail_key=excluded.thumbnail_key,mime_type=excluded.mime_type,kids_allowed=excluded.kids_allowed,release_date=excluded.release_date,year=excluded.year,genres=excluded.genres,rating=excluded.rating,duration_seconds=excluded.duration_seconds,blocked=excluded.blocked'
const params=[manifest.id,manifest.title,manifest.description||'',manifest.category,videoKey,thumbnailKey,'video/mp4',manifest.kids?1:0,manifest.date||null,manifest.year||null,JSON.stringify(manifest.genres||[]),manifest.rating||null,manifest.duration||null,manifest.blocked?1:0]
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})}),result=await response.json()
if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)
console.log(`Imported ${manifest.category}: ${manifest.title}`)
