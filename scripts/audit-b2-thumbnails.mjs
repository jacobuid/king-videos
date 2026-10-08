import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import sharp from 'sharp';
const apply=process.argv.includes('--apply'),retry=process.argv.includes('--retry'),report=retry?JSON.parse(readFileSync('logs/b2-thumbnail-audit.json','utf8')):{total:0,completed:0,changed:0,unchanged:0,beforeBytes:0,afterBytes:0,failures:[],items:[]};
const retryKeys=new Set(report.failures.map(f=>f.key));if(retry)report.failures=[];
function save(){report.updatedAt=new Date().toISOString();writeFileSync('logs/b2-thumbnail-audit.json',JSON.stringify(report,null,2));}
async function json(url,options={}){for(let i=0;i<4;i++){try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(error){if(i===3)throw error;}}}
const auth=await json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')}});
const storage=auth.apiInfo.storageApi,b2=(op,body)=>json(`${storage.apiUrl}/b2api/v4/${op}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});
const bucketName=process.env.B2_BUCKET||'king-videos',bucket=(await b2('b2_list_buckets',{accountId:auth.accountId,bucketName})).buckets.find(b=>b.bucketName===bucketName);
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
const db=(await json(base,{headers})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
const catalog=await json(`${base}/${db.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql:'SELECT DISTINCT thumbnail_key FROM media WHERE thumbnail_key IS NOT NULL',params:[]})});if(!catalog.success)throw Error('Catalog query failed');
const referenced=new Set(catalog.result[0].results.map(r=>r.thumbnail_key));
const files=[];let next;do{const r=await b2('b2_list_file_names',{bucketId:bucket.bucketId,maxFileCount:10000,...(next?{startFileName:next}:{})});files.push(...r.files.filter(f=>/\.(png|jpe?g|webp)$/i.test(f.fileName)&&(referenced.has(f.fileName)||(/^(movies|series|tv|home-videos)\//i.test(f.fileName)&&!/\/profiles?\//i.test(f.fileName)))));next=r.nextFileName;}while(next);
if(retry){for(let i=files.length-1;i>=0;i--)if(!retryKeys.has(files[i].fileName))files.splice(i,1);}else report.total=files.length;save();let index=0;
await Promise.all(Array.from({length:3},async()=>{while(index<files.length){const file=files[index++],key=file.fileName;try{
 const r=await fetch(`${storage.downloadUrl}/file/${bucketName}/${key.split('/').map(encodeURIComponent).join('/')}`,{headers:{Authorization:auth.authorizationToken},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Download HTTP '+r.status);const input=Buffer.from(await r.arrayBuffer()),meta=await sharp(input).metadata();
 const needsResize=meta.width!==1280||meta.height!==720,oversized=input.length>200*1024;let output=input,type=file.contentType;
 if(needsResize||oversized){
  const image=()=>sharp(input).rotate().flatten({background:'#000000'}).resize(1280,720,{fit:'contain',background:'#000000'});
  if(/\.png$/i.test(key)){output=await image().png({palette:true,colours:256,compressionLevel:9,dither:0.5}).toBuffer();type='image/png';}
  else{for(const quality of [82,76,70,64]){output=/\.webp$/i.test(key)?await image().webp({quality,effort:6}).toBuffer():await image().jpeg({quality,mozjpeg:true}).toBuffer();if(output.length<=200*1024)break;}type=/\.webp$/i.test(key)?'image/webp':'image/jpeg';}
  if(!needsResize&&output.length>=input.length)output=input;
 }
 const hash=createHash('sha1').update(output).digest('hex'),changed=hash!==createHash('sha1').update(input).digest('hex');
 if(changed&&apply){const upload=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});const uploaded=await json(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':type,'Content-Length':String(output.length),'X-Bz-Content-Sha1':hash},body:output});if(uploaded.contentSha1!==hash||uploaded.contentLength!==output.length)throw Error('Upload verification failed');}
 const after=await sharp(output).metadata();if(after.width!==1280||after.height!==720)throw Error('Dimension verification failed');
 report.items.push({key,beforeWidth:meta.width,beforeHeight:meta.height,beforeBytes:input.length,afterBytes:output.length,changed,over200KB:output.length>200*1024});report.beforeBytes+=input.length;report.afterBytes+=output.length;report.completed++;if(changed)report.changed++;else report.unchanged++;save();
 }catch(error){report.failures.push({key,error:error.message});save();}}}));
console.log(JSON.stringify({total:report.total,completed:report.completed,changed:report.changed,unchanged:report.unchanged,savedBytes:report.beforeBytes-report.afterBytes,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
