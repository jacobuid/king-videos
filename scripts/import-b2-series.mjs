import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'

const manifestPath=resolve(process.argv[2]||''),subtitlesOnly=process.argv.includes('--subtitles-only'),fileArg=process.argv.indexOf('--file'),onlyFile=fileArg>=0?process.argv[fileArg+1]:null
if(!process.argv[2]||(fileArg>=0&&!onlyFile))throw new Error('Usage: node scripts/import-b2-series.mjs <media.json> [--subtitles-only] [--file <filename>]')
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),folder=resolve(manifest.localFolder||'')
const required=['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)

const bucketName=process.env.B2_BUCKET||'king-videos',basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
let upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId})
async function uploadBytes(bytes,key,type){const hash=createHash('sha1').update(bytes).digest('hex');for(let attempt=1;attempt<=5;attempt++){try{const response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':type,'Content-Length':String(bytes.length),'X-Bz-Content-Sha1':hash},body:bytes});if(response.ok)return;if(response.status<500&&response.status!==401)throw new Error(`Upload failed for ${key}: ${await response.text()}`)}catch(error){if(attempt===5)throw error;console.warn(`Upload attempt ${attempt} failed for ${key}; retrying`)}upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});await new Promise(resolve=>setTimeout(resolve,attempt*1000))}throw new Error(`Upload failed for ${key} after five attempts`)}
async function uploadFile(path,key,type){return uploadBytes(await readFile(path),key,type)}
function srtToVtt(value){return `WEBVTT\n\n${value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2').trim()}\n`}

let thumbnailKey=null
if(manifest.thumbnail&&!subtitlesOnly){thumbnailKey=`movies/${manifest.id}/${basename(manifest.thumbnail)}`;console.log(`Uploading ${manifest.thumbnail}`);await uploadFile(resolve(folder,manifest.thumbnail),thumbnailKey,'image/jpeg')}
const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})});const result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)}

const allNames=await readdir(folder),names=allNames.filter(name=>name.toLowerCase().endsWith('.mp4')&&!/\(1\)|\(AUSLAN\)/i.test(name)&&(!onlyFile||name.toLowerCase()===onlyFile.toLowerCase())).sort(),seenHashes=new Set()
if(onlyFile&&!names.length)throw new Error(`Video file was not found: ${onlyFile}`)
let imported=0,subtitles=0
for(const name of names){
  const match=name.match(/S(\d+)\s*E(\d+)\s*-\s*(.+)\.mp4$/i),short=name.match(/^Shorts\s*-\s*(.+)\.mp4$/i)
  if(!match&&!short){console.log(`Skipping unrecognized video: ${name}`);continue}
  const season=match?Number(match[1]):0,episode=match?Number(match[2]):imported+1,title=(match?.[3]||short[1]).trim(),slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),id=`${manifest.id}-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}-${slug}`,videoKey=`movies/${manifest.id}/season-${season}/${id}.mp4`
  const stem=name.replace(/\.mp4$/i,''),subtitleName=['.en.srt','.srt','.en.vtt','.vtt'].map(extension=>allNames.find(candidate=>candidate.toLowerCase()===`${stem}${extension}`.toLowerCase())).find(Boolean),subtitleKey=subtitleName?`movies/${manifest.id}/season-${season}/${id}.en.vtt`:null
  if(subtitleName){console.log(`Uploading subtitles: ${subtitleName}`);const value=await readFile(resolve(folder,subtitleName),'utf8'),vtt=Buffer.from(subtitleName.toLowerCase().endsWith('.srt')?srtToVtt(value):value,'utf8');await uploadBytes(vtt,subtitleKey,'text/vtt; charset=utf-8');subtitles++}
  if(subtitlesOnly){if(subtitleKey)await query('UPDATE media SET subtitle_key=? WHERE series_id=? AND lower(title)=lower(?)',[subtitleKey,manifest.id,title]);continue}
  const bytes=await readFile(resolve(folder,name)),hash=createHash('sha1').update(bytes).digest('hex')
  if(seenHashes.has(hash)){console.log(`Skipping duplicate video: ${name}`);continue}
  seenHashes.add(hash);console.log(`Uploading ${name}`);await uploadBytes(bytes,videoKey,'video/mp4')
  const sql='INSERT INTO media(id,title,description,category,video_key,thumbnail_key,subtitle_key,mime_type,kids_allowed,series_id,series_title,season_number,episode_number,year,genres,rating,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,video_key=excluded.video_key,thumbnail_key=excluded.thumbnail_key,subtitle_key=excluded.subtitle_key,mime_type=excluded.mime_type,kids_allowed=excluded.kids_allowed,series_id=excluded.series_id,series_title=excluded.series_title,season_number=excluded.season_number,episode_number=excluded.episode_number,year=excluded.year,genres=excluded.genres,rating=excluded.rating,featured=excluded.featured'
  await query(sql,[id,title,manifest.description||'',manifest.category||'tv',videoKey,thumbnailKey,subtitleKey,'video/mp4',manifest.kids?1:0,manifest.id,manifest.title,season,episode,manifest.year||null,JSON.stringify(manifest.genres||[]),manifest.rating||null,manifest.featured?1:0]);imported++;console.log(`Imported Season ${season}, Episode ${episode}: ${title}`)
}
console.log(subtitlesOnly?`Uploaded ${subtitles} subtitle files for ${manifest.title}`:`Imported ${imported} videos and ${subtitles} subtitle files for ${manifest.title}`)
