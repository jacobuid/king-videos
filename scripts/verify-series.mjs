import process from 'node:process'

const seriesId=process.argv[2]
if(!seriesId)throw new Error('Usage: node scripts/verify-series.mjs <series-id>')
for(const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY'])if(!process.env[name])throw new Error(`${name} is required`)

const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},databaseName=process.env.D1_DATABASE||'king-videos-prod'
const databasesResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,{headers:cfHeaders}),databases=await databasesResponse.json(),database=databases.result?.find(item=>item.name===databaseName)
if(!database)throw new Error(`Cloudflare D1 database ${databaseName} was not found`)
const sql="SELECT COUNT(*) AS records, SUM(CASE WHEN description IS NOT NULL AND description <> '' THEN 1 ELSE 0 END) AS descriptions, SUM(CASE WHEN subtitle_key IS NOT NULL THEN 1 ELSE 0 END) AS subtitles, COUNT(DISTINCT season_number) AS seasons FROM media WHERE series_id=?"
const queryResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params:[seriesId]})}),query=await queryResponse.json()
if(!queryResponse.ok||!query.success)throw new Error(`D1 query failed: ${JSON.stringify(query.errors||query)}`)
const databaseCounts=query.result?.[0]?.results?.[0]

const basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64'),authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi,bucketName=process.env.B2_BUCKET||'king-videos'
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
let nextFileName,files=[]
do{const page=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix:`movies/${seriesId}/`,startFileName:nextFileName,maxFileCount:10000});files.push(...page.files);nextFileName=page.nextFileName}while(nextFileName)
const latest=new Map();for(const file of files)if(!latest.has(file.fileName))latest.set(file.fileName,file)
const objects=[...latest.values()],extension=name=>name.toLowerCase().match(/\.([^.]+)$/)?.[1]||'other',byType={}
for(const object of objects)byType[extension(object.fileName)]=(byType[extension(object.fileName)]||0)+1
console.log(JSON.stringify({seriesId,database:databaseCounts,storage:{objects:objects.length,bytes:objects.reduce((sum,item)=>sum+item.contentLength,0),byType}},null,2))
