const basic=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
const authResponse=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${basic}`}})
if(!authResponse.ok)throw new Error(`Backblaze authorization failed: ${await authResponse.text()}`)
const auth=await authResponse.json(),storage=auth.apiInfo.storageApi
async function b2(operation,body){const response=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`${operation} failed: ${await response.text()}`);return response.json()}
const bucketName=process.env.B2_BUCKET||'king-videos',buckets=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName}),bucket=buckets.buckets?.find(item=>item.bucketName===bucketName)
if(!bucket)throw new Error(`Backblaze bucket ${bucketName} was not found`)
const files=[];let startFileName
do{const page=await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix:'movies/',startFileName,maxFileCount:1000});files.push(...page.files);startFileName=page.nextFileName}while(startFileName)
const images=files.filter(file=>/\.(?:webp|jpe?g|png)$/i.test(file.fileName)).sort((a,b)=>b.contentLength-a.contentLength)
console.log(JSON.stringify({count:images.length,totalBytes:images.reduce((sum,file)=>sum+Number(file.contentLength),0),over300KB:images.filter(file=>file.contentLength>300*1024).map(file=>({key:file.fileName,bytes:Number(file.contentLength)})),images:images.map(file=>({key:file.fileName,bytes:Number(file.contentLength)}))},null,2))
