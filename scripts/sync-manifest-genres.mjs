import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

for(const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!process.env[name])throw new Error(`${name} is required`)
const root=resolve('media-imports'),directories=await readdir(root,{withFileTypes:true}),manifests=[]
for(const directory of directories){if(!directory.isDirectory())continue;try{manifests.push(JSON.parse((await readFile(join(root,directory.name,'media.json'),'utf8')).replace(/^\uFEFF/,'')))}catch(error){if(error.code!=='ENOENT')throw error}}
for(const manifest of manifests)if(!Array.isArray(manifest.genres)||manifest.genres.length>3)throw new Error(`${manifest.id} must have between zero and three genres`)

const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const databasesResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers}),databases=await databasesResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
for(const manifest of manifests){const series=manifest.category==='tv',sql=`UPDATE media SET genres=? WHERE ${series?'series_id':'id'}=?`,params=[JSON.stringify(manifest.genres),manifest.id],response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})}),result=await response.json();if(!response.ok||!result.success)throw new Error(`D1 update failed for ${manifest.id}: ${JSON.stringify(result.errors||result)}`);console.log(`Updated ${manifest.title}: ${manifest.genres.join(', ')}`)}
