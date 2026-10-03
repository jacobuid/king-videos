import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1]}
const manifestPath=resolve(value('--manifest')||'media-imports/home-videos/media.json')
const source=resolve(value('--source')||'G:/Other computers/My PC/Google - WD Sync/00 - Home Videos')
const fallback=resolve(value('--fallback')||'G:/Other computers/My PC/Google - WD Sync/00 - Home Videos-compressed')
const output=resolve(value('--output')||'G:/Other computers/My PC/Google - WD Sync/00 - Home Videos-thumbnails')
const statusPath=resolve(value('--status-file')||'home-videos-thumbnails-progress.json')
const concurrency=Math.max(1,Math.min(8,Number(value('--concurrency')||4)))
const required=['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)

const manifest=JSON.parse(await readFile(manifestPath,'utf8')),episodes=manifest.episodes||[]
const bucketName=process.env.B2_BUCKET||'king-videos',basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const existing=new Map();let startFileName
do{const page=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix:`movies/${manifest.id}/`,maxFileCount:10000,...(startFileName?{startFileName}:{})});for(const file of page.files||[])existing.set(file.fileName,file.contentLength);startFileName=page.nextFileName}while(startFileName)

const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})}),result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)}
function slug(value){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
async function exists(path){try{await stat(path);return true}catch{return false}}
function frame(path,seconds){return new Promise((resolveFrame,reject)=>{const chunks=[],child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(seconds),'-i',path,'-frames:v','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true});child.stdout.on('data',chunk=>chunks.push(chunk));let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0&&chunks.length?resolveFrame(Buffer.concat(chunks)):reject(new Error(error||`FFmpeg exited ${code}`)))})}
async function upload(bytes,key){if(existing.get(key)===bytes.length)return false;const hash=createHash('sha1').update(bytes).digest('hex');for(let attempt=1;attempt<=5;attempt++){const target=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});try{const response=await fetch(target.uploadUrl,{method:'POST',headers:{Authorization:target.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':'image/webp','Content-Length':String(bytes.length),'X-Bz-Content-Sha1':hash},body:bytes});if(response.ok){existing.set(key,bytes.length);return true}if(response.status<500)throw new Error(await response.text())}catch(error){if(attempt===5)throw error}await new Promise(done=>setTimeout(done,attempt*1000))}return false}

let next=0,processed=0,uploaded=0,skipped=0,failed=0,active=0,statusWrite=Promise.resolve()
function saveStatus(state='running'){const snapshot={updatedAt:new Date().toISOString(),state,total:episodes.length,processed,active,remaining:episodes.length-processed-active,uploaded,skipped,failed};statusWrite=statusWrite.then(()=>writeFile(statusPath,`${JSON.stringify(snapshot,null,2)}\n`));return statusWrite}
async function processEpisode(item){const id=`${manifest.id}-s${String(item.season).padStart(2,'0')}e${String(item.episode).padStart(3,'0')}-${slug(item.title)}`,key=`movies/${manifest.id}/season-${item.season}/${id}.webp`,destination=join(output,`season-${item.season}`,`${id}.webp`)
  let input=join(source,...item.file.split('/'));if(!await exists(input))input=join(fallback,...item.file.split('/'));if(!await exists(input))throw new Error(`Source video not found: ${item.file}`)
  let bytes;if(await exists(destination))bytes=await readFile(destination);else{const seek=item.duration&&item.duration<25?Math.max(1,Math.floor(item.duration/2)):15,jpeg=await frame(input,seek);bytes=await sharp(jpeg).resize({width:640,withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer();await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes)}
  if(await upload(bytes,key))uploaded++;else skipped++
  await query('UPDATE media SET thumbnail_key=? WHERE id=?',[key,id]);console.log(`${processed+1}/${episodes.length} ${item.title}`)
}
async function worker(){while(next<episodes.length){const item=episodes[next++];active++;await saveStatus();try{await processEpisode(item)}catch(error){failed++;console.error(`${item.file}: ${error.message}`)}finally{active--;processed++;await saveStatus()}}}
await saveStatus();await Promise.all(Array.from({length:Math.min(concurrency,episodes.length)},()=>worker()));await saveStatus(failed?'complete-with-failures':'complete')
console.log(`Finished ${processed} thumbnails: ${uploaded} uploaded, ${skipped} already present, ${failed} failed`)
