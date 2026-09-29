import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

async function loadEnv(){
  try{for(const line of (await readFile(resolve('.env'),'utf8')).split(/\r?\n/)){const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!match||process.env[match[1]])continue;let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);process.env[match[1]]=value}}catch(error){if(error.code!=='ENOENT')throw error}
}
await loadEnv()

let manifestPaths=process.argv.slice(2).map(path=>resolve(path))
if(!manifestPaths.length){for await(const entry of (await import('node:fs/promises')).glob('media-imports/*/media.json'))manifestPaths.push(resolve(entry))}
const required=['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required in .env`)

const bucketName=process.env.B2_BUCKET||'king-videos',basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const dbResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await dbResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
async function query(sql,params){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})}),result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 query failed: ${JSON.stringify(result.errors||result)}`)}
async function upload(bytes,key){const upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId}),response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':'image/webp','Content-Length':String(bytes.length),'X-Bz-Content-Sha1':createHash('sha1').update(bytes).digest('hex')},body:bytes});if(!response.ok)throw new Error(`Upload failed for ${key}: ${await response.text()}`)}

for(const manifestPath of manifestPaths){
  const manifestText=await readFile(manifestPath,'utf8'),manifest=JSON.parse(manifestText.replace(/^\uFEFF/,''));if(!manifest.thumbnail)continue
  const folder=resolve(manifest.localFolder||dirname(manifestPath)),source=resolve(folder,manifest.thumbnail),oldKey=`movies/${manifest.id}/${basename(manifest.thumbnail)}`
  let input,hasLocal=true;try{input=await readFile(source)}catch{hasLocal=false;const response=await fetch(`${storage.downloadUrl}/file/${bucketName}/${oldKey.split('/').map(encodeURIComponent).join('/')}`,{headers:{Authorization:auth.authorizationToken}});if(!response.ok){console.warn(`Skipping ${manifest.title}: local and B2 thumbnails were not found`);continue}input=Buffer.from(await response.arrayBuffer())}
  const before=input.length,bytes=await sharp(input).rotate().resize({width:1280,height:720,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:5}).toBuffer(),output=resolve(folder,'thumb.webp')
  if(hasLocal)await writeFile(output,bytes)
  const key=`movies/${manifest.id}/thumb.webp`;await upload(bytes,key);await query('UPDATE media SET thumbnail_key=? WHERE id=? OR series_id=?',[key,manifest.id,manifest.id])
  if(manifest.thumbnail!=='thumb.webp')await writeFile(manifestPath,manifestText.replace(/("thumbnail"\s*:\s*")[^"]+("\s*[,}])/,`$1thumb.webp$2`))
  console.log(`${manifest.title}: ${(before/1048576).toFixed(2)} MB -> ${(bytes.length/1024).toFixed(0)} KB (${Math.round((1-bytes.length/before)*100)}% smaller)`)
}
