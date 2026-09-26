import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'

const manifestPath=resolve(process.argv[2]||''),subtitlesOnly=process.argv.includes('--subtitles-only'),uploadOnly=process.argv.includes('--upload-only'),resume=process.argv.includes('--resume'),fileArg=process.argv.indexOf('--file'),onlyFile=fileArg>=0?process.argv[fileArg+1]:null,concurrencyArg=process.argv.indexOf('--concurrency'),concurrency=concurrencyArg>=0?Number(process.argv[concurrencyArg+1]):3
if(!process.argv[2]||(fileArg>=0&&!onlyFile)||!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('Usage: node scripts/import-b2-series.mjs <media.json> [--upload-only] [--subtitles-only] [--file <filename>] [--concurrency 1-8]')
const manifest=JSON.parse((await readFile(manifestPath,'utf8')).replace(/^\uFEFF/,'')),folder=resolve(manifest.localFolder||'')
const required=['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY',...(uploadOnly?[]:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])]
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)

const bucketName=process.env.B2_BUCKET||'king-videos',basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const existingKeys=new Set()
if(resume){let startFileName;do{const page=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix:`movies/${manifest.id}/`,maxFileCount:10000,...(startFileName?{startFileName}:{})});for(const file of page.files||[])existingKeys.add(file.fileName);startFileName=page.nextFileName}while(startFileName);console.log(`Resume mode: found ${existingKeys.size} existing files in Backblaze`)}
async function uploadBytes(bytes,key,type){if(resume&&existingKeys.has(key)){console.log(`Already uploaded; skipping ${key}`);return}const hash=createHash('sha1').update(bytes).digest('hex');let upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});for(let attempt=1;attempt<=5;attempt++){try{const response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':type,'Content-Length':String(bytes.length),'X-Bz-Content-Sha1':hash},body:bytes});if(response.ok){existingKeys.add(key);return}if(response.status<500&&response.status!==401)throw new Error(`Upload failed for ${key}: ${await response.text()}`)}catch(error){if(attempt===5)throw error;console.warn(`Upload attempt ${attempt} failed for ${key}; retrying`)}upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});await new Promise(resolve=>setTimeout(resolve,attempt*1000))}throw new Error(`Upload failed for ${key} after five attempts`)}
async function uploadFile(path,key,type){return uploadBytes(await readFile(path),key,type)}
function srtToVtt(value){return `WEBVTT\n\n${value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2').trim()}\n`}
function normalizeTitle(value){return value.toLowerCase().replace(/&/g,'and').replace(/robotnick/g,'robotnik').replace(/\btoo tail tails\b/g,'too tall tails').replace(/\bthe pinball fortress\b/g,'pinball fortress').replace(/[^a-z0-9]+/g,'')}
const episodeMetadata=new Map((manifest.episodes||[]).map(item=>[normalizeTitle(item.title),item]))
const episodeMetadataBySlot=new Map((manifest.episodes||[]).map(item=>[`${item.season}-${item.episode}`,item]))

let thumbnailKey=null
if(manifest.thumbnail&&!subtitlesOnly){thumbnailKey=`movies/${manifest.id}/${basename(manifest.thumbnail)}`;const thumbnailType=manifest.thumbnail.toLowerCase().endsWith('.png')?'image/png':'image/jpeg';console.log(`Uploading ${manifest.thumbnail}`);await uploadFile(resolve(folder,manifest.thumbnail),thumbnailKey,thumbnailType)}
let database=null
const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
if(!uploadOnly){const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json();database=databases.result?.find(item=>item.name===databaseName);if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)}
async function query(sql,params){if(uploadOnly)return;const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})});const result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)}

const allNames=await readdir(folder),names=allNames.filter(name=>name.toLowerCase().endsWith('.mp4')&&!/\(1\)|\(AUSLAN\)/i.test(name)&&(!manifest.excludeEpisodeZero||!/(?:^|\s)E00(?:\s|\b)/i.test(name))&&(!onlyFile||name.toLowerCase()===onlyFile.toLowerCase())).sort(),seenHashes=new Set()
if(onlyFile&&!names.length)throw new Error(`Video file was not found: ${onlyFile}`)
let imported=0,subtitles=0
async function importName(name,fileIndex){
  const match=name.match(/S(\d+)\s*E(\d+)\s*-\s*(.+)\.mp4$/i),numbered=name.match(/-\s*Ep\.?\s*(\d+)\s*-\s*(.+?)(?:\s+\(\d+p[^)]*\))?\.mp4$/i),special=name.match(/-\s*SPECIAL\s*-\s*(.+?)(?:\s+\(\d+p[^)]*\))?\.mp4$/i),short=name.match(/^Shorts\s*-\s*(.+)\.mp4$/i)
  if(!match&&!numbered&&!special&&!short){console.log(`Skipping unrecognized video: ${name}`);return}
  const sourceTitle=(match?.[3]||numbered?.[2]||special?.[1]||short?.[1]).trim().replace(/\s+\(\d+p\s+WebRip\)?$/i,''),parsedSeason=match?Number(match[1]):special||short?0:1,parsedEpisode=match?Number(match[2]):numbered?Number(numbered[1]):fileIndex+1,metadata=episodeMetadata.get(normalizeTitle(sourceTitle))||episodeMetadataBySlot.get(`${parsedSeason}-${parsedEpisode}`),season=metadata?.season??parsedSeason,episode=metadata?.episode??parsedEpisode,title=metadata?.title||sourceTitle,slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),id=`${manifest.id}-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}-${slug}`,videoKey=`movies/${manifest.id}/season-${season}/${id}.mp4`
  const stem=name.replace(/\.mp4$/i,''),subtitleName=['.en.srt','.srt','.en.vtt','.vtt'].map(extension=>allNames.find(candidate=>candidate.toLowerCase()===`${stem}${extension}`.toLowerCase())).find(Boolean),subtitleKey=subtitleName?`movies/${manifest.id}/season-${season}/${id}.en.vtt`:null
  if(subtitleName){console.log(`Uploading subtitles: ${subtitleName}`);const value=await readFile(resolve(folder,subtitleName),'utf8'),vtt=Buffer.from(subtitleName.toLowerCase().endsWith('.srt')?srtToVtt(value):value,'utf8');await uploadBytes(vtt,subtitleKey,'text/vtt; charset=utf-8');subtitles++}
  if(subtitlesOnly){if(subtitleKey)await query('UPDATE media SET subtitle_key=? WHERE series_id=? AND lower(title)=lower(?)',[subtitleKey,manifest.id,title]);return}
  const bytes=await readFile(resolve(folder,name)),hash=createHash('sha1').update(bytes).digest('hex')
  if(seenHashes.has(hash)){console.log(`Skipping duplicate video: ${name}`);return}
  seenHashes.add(hash);console.log(`Uploading ${name}`);await uploadBytes(bytes,videoKey,'video/mp4')
  const sql='INSERT INTO media(id,title,description,category,video_key,thumbnail_key,subtitle_key,mime_type,kids_allowed,series_id,series_title,season_number,episode_number,year,genres,rating,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,video_key=excluded.video_key,thumbnail_key=excluded.thumbnail_key,subtitle_key=excluded.subtitle_key,mime_type=excluded.mime_type,kids_allowed=excluded.kids_allowed,series_id=excluded.series_id,series_title=excluded.series_title,season_number=excluded.season_number,episode_number=excluded.episode_number,year=excluded.year,genres=excluded.genres,rating=excluded.rating,featured=excluded.featured'
  if(!uploadOnly)await query(sql,[id,title,metadata?.description||manifest.description||'',manifest.category||'tv',videoKey,thumbnailKey,subtitleKey,'video/mp4',manifest.kids?1:0,manifest.id,manifest.title,season,episode,metadata?.year||manifest.year||null,JSON.stringify(manifest.genres||[]),manifest.rating||null,manifest.featured?1:0]);imported++;console.log(`${uploadOnly?'Uploaded':'Imported'} Season ${season}, Episode ${episode}: ${title}`)
}
let nextIndex=0
async function worker(){while(nextIndex<names.length){const fileIndex=nextIndex++;await importName(names[fileIndex],fileIndex)}}
console.log(`Processing ${names.length} videos with ${Math.min(concurrency,names.length)} parallel upload workers`)
await Promise.all(Array.from({length:Math.min(concurrency,names.length)},()=>worker()))
console.log(subtitlesOnly?`Uploaded ${subtitles} subtitle files for ${manifest.title}`:`${uploadOnly?'Uploaded':'Imported'} ${imported} videos and ${subtitles} subtitle files for ${manifest.title}`)
