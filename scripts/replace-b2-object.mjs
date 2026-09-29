import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const [fileArg,keyArg,typeArg='application/octet-stream']=process.argv.slice(2)
if(!fileArg||!keyArg)throw new Error('Usage: node --env-file=.env scripts/replace-b2-object.mjs <file> <object-key> [content-type]')
for(const name of ['B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY'])if(!process.env[name])throw new Error(`${name} is required`)
const file=resolve(fileArg),size=(await stat(file)).size,basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed: ${await authResponse.text()}`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const bucketName=process.env.B2_BUCKET||'king-videos',buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const hash=createHash('sha1');for await(const chunk of createReadStream(file))hash.update(chunk);const sha1=hash.digest('hex')
for(let attempt=1;attempt<=5;attempt++){
  try{
    const upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId}),response=await fetch(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(keyArg),'Content-Type':typeArg,'Content-Length':String(size),'X-Bz-Content-Sha1':sha1},body:createReadStream(file),duplex:'half'})
    if(response.ok){console.log(`Uploaded ${basename(file)} to ${keyArg} (${size} bytes)`);process.exit(0)}
    if(attempt===5)throw new Error(await response.text())
  }catch(error){if(attempt===5)throw error}
  await new Promise(done=>setTimeout(done,attempt*2000))
}
