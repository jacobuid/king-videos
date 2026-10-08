import {readFileSync,writeFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,basename,extname,resolve} from 'node:path';
const watch=process.argv.includes('--watch'),reportPath='logs/oct7-movies-published.json';
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{published:[]};
const published=new Set(report.published.map(m=>m.id));
async function check(){
 const completed=readFileSync('logs/new-movies-oct7-completed.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const pending=completed.filter(m=>!published.has(m.id));if(!pending.length)return;
 const authorization=Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64');
 const response=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${authorization}`}});
 if(!response.ok)throw Error('B2 authorization HTTP '+response.status);
 const auth=await response.json();
 async function b2(operation,body){const r=await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(operation+' HTTP '+r.status);return r.json();}
 const bucketName=process.env.B2_BUCKET||'king-videos';
 const bucket=(await b2('b2_list_buckets',{accountId:auth.accountId,bucketName})).buckets.find(b=>b.bucketName===bucketName);
 if(!bucket)throw Error('Bucket missing');
 for(const item of pending){
  const path=resolve(`media-imports/oct7-movies/${item.id}/media.json`),m=JSON.parse(readFileSync(path,'utf8'));
  if(m.metadataPending||!m.description||!m.rating||!m.genres?.length)throw Error('Incomplete metadata '+m.id);
  const prefix=`movies/${m.id}/`,files=(await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix,maxFileCount:1000})).files;
  for(const [local,key] of [[m.video,`${prefix}${m.id}.mp4`],[m.thumbnail,prefix+basename(m.thumbnail)]]){
   const remote=files.find(f=>f.fileName===key);
   if(!remote||remote.contentLength!==statSync(local).size||!remote.contentSha1)throw Error('B2 verification failed '+key);
  }
  const folder=dirname(m.video),subs=readdirSync(folder).filter(f=>['.srt','.vtt'].includes(extname(f).toLowerCase()));
  if(subs.length&&!files.some(f=>f.fileName===`${prefix}${m.id}.en.vtt`))throw Error('Subtitle not uploaded '+m.id);
  const result=spawnSync(process.execPath,['--env-file=.env','scripts/import-b2-movie.mjs',path,'--folder',folder,'--metadata-only'],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(result.stderr||result.stdout||'Import failed');
  console.log(result.stdout.trim());published.add(m.id);report.published.push({id:m.id,title:m.title,year:m.year,minAge:m.minAge,publishedAt:new Date().toISOString()});
  report.completed=published.size;report.total=17;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 }
}
do{
 try{await check();}catch(error){console.error(new Date().toISOString(),error.message);if(!watch)process.exitCode=1;}
 if(!watch||published.size===17)break;
 await new Promise(done=>setTimeout(done,60000));
}while(true);
console.log(`Published ${published.size}/17 movies`);
