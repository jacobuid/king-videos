import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const apply=process.argv.includes('--apply');
async function json(url,options){for(let attempt=1;attempt<=5;attempt++){try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)}),j=await r.json();if(!r.ok||j.success===false)throw Error('API error '+r.status);return j;}catch(e){if(attempt===5)throw e;await new Promise(r=>setTimeout(r,attempt*2000));}}}
const base='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/d1/database',headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'};
const db=(await json(base,{headers})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
const rows=(await json(base+'/'+db.uuid+'/query',{method:'POST',headers,body:JSON.stringify({sql:'SELECT id,series_id,video_key,thumbnail_key,subtitle_key FROM media',params:[]})})).result.flatMap(r=>r.results||[]);
const protectedKeys=new Set(rows.flatMap(r=>[r.video_key,r.thumbnail_key,r.subtitle_key]).filter(Boolean));
// This video is served directly by the API and has no media catalog row.
protectedKeys.add('movies/specials/happy-birthday/happy-birthday.mp4');
const pending=new Set();
if(existsSync('logs/new-video-library-jobs.json'))for(const j of JSON.parse(readFileSync('logs/new-video-library-jobs.json'))){if(j.seriesId!=='icarly')continue;for(const key of [`movies/${j.id}/${j.id}.mp4`,`movies/${j.id}/thumbnail.webp`,`movies/${j.id}/${j.id}.en.vtt`]){protectedKeys.add(key);pending.add(key);}}
const auth=await json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(process.env.B2_BOOTSTRAP_KEY_ID+':'+process.env.B2_BOOTSTRAP_APPLICATION_KEY).toString('base64')}});
const b2=(op,body)=>json(auth.apiInfo.storageApi.apiUrl+'/b2api/v4/'+op,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});
const bucketName=process.env.B2_BUCKET||'king-videos',bucket=(await b2('b2_list_buckets',{accountId:auth.accountId,bucketName})).buckets.find(b=>b.bucketName===bucketName);
const versions=[];let next;
do{const r=await b2('b2_list_file_versions',{bucketId:bucket.bucketId,maxFileCount:1000,...(next?{startFileName:next.name,startFileId:next.id}:{})});versions.push(...r.files);next=r.nextFileName?{name:r.nextFileName,id:r.nextFileId}:null;}while(next);
const grouped=new Map();for(const v of versions){const g=grouped.get(v.fileName)||[];g.push(v);grouped.set(v.fileName,g);}
const obsolete=[],unreferenced=[],missing=[];
for(const [key,list] of grouped){const sorted=list.slice().sort((a,b)=>b.uploadTimestamp-a.uploadTimestamp);if(protectedKeys.has(key)){if(sorted[0].action!=='upload')missing.push(key);obsolete.push(...sorted.slice(1).map(v=>({...v,reason:'Older version of protected file'})));}else unreferenced.push(...sorted.map(v=>({...v,reason:'Not referenced by live catalog or pending iCarly imports'})));}
for(const key of protectedKeys)if(!grouped.has(key)&&!pending.has(key)&&!key.startsWith('external/'))missing.push(key);
const summaries={};for(const v of unreferenced){const prefix=v.fileName.split('/').slice(0,2).join('/');const s=summaries[prefix]||={files:0,bytes:0,examples:[]};s.files++;s.bytes+=v.contentLength||0;if(s.examples.length<3)s.examples.push(v.fileName);}
const summary={catalogRows:rows.length,b2Versions:versions.length,storedGiB:versions.reduce((n,v)=>n+(v.contentLength||0),0)/1024**3,obsoleteVersions:obsolete.length,obsoleteGiB:obsolete.reduce((n,v)=>n+(v.contentLength||0),0)/1024**3,unreferencedVersions:unreferenced.length,unreferencedGiB:unreferenced.reduce((n,v)=>n+(v.contentLength||0),0)/1024**3,missingProtectedKeys:missing};
const retainedVersions=[...grouped.entries()].filter(([key])=>protectedKeys.has(key)).map(([,list])=>list.slice().sort((a,b)=>b.uploadTimestamp-a.uploadTimestamp)[0]);
const report={summary,obsolete,unreferenced,retainedVersions,groups:summaries,protectedKeys:[...protectedKeys]};writeFileSync('logs/b2-storage-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));
if(apply){const plan=JSON.parse(readFileSync('logs/b2-storage-delete-plan.json'));const present=new Set(versions.map(v=>v.fileId));let deleted=0,bytes=0,nextJob=0;
 await Promise.all([1,2,3].map(async()=>{while(nextJob<plan.files.length){const candidate=plan.files[nextJob++];if(!present.has(candidate.fileId))continue;const actual=versions.find(v=>v.fileId===candidate.fileId);if(actual.fileName!==candidate.fileName)throw Error('Deletion plan filename mismatch');const allowed=obsolete.some(v=>v.fileId===actual.fileId)||unreferenced.some(v=>v.fileId===actual.fileId);if(!allowed)throw Error('File became protected; refusing deletion: '+actual.fileName);await b2('b2_delete_file_version',{fileName:actual.fileName,fileId:actual.fileId});deleted++;bytes+=actual.contentLength||0;writeFileSync('logs/b2-storage-cleanup-status.json',JSON.stringify({deleted,recoveredGiB:bytes/1024**3},null,2));}}));
 console.log(JSON.stringify({deleted,recoveredGiB:bytes/1024**3}));
}
