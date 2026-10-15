import {readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import sharp from 'sharp';

// Read-only audit of the full input batch against D1 and live B2 objects.
const scan=JSON.parse(readFileSync('logs/oct10-family-scan.json','utf8'));
const definitions=JSON.parse(readFileSync('media-imports/oct10-family-definitions.json','utf8'));
const publications=existsSync('logs/oct10-family-completed.json')?JSON.parse(readFileSync('logs/oct10-family-completed.json','utf8')):[];
const metadata=JSON.parse(readFileSync('media-imports/oct10-family-metadata.json','utf8'));
const captionIds=new Set(scan.filter(r=>r.folder.startsWith('Avatar The Last')).map(r=>{const m=r.name.match(/S(\d+)E(\d+)/i);return `avatar-the-last-airbender-2024-s${m[1]}e${m[2]}`;}).concat('paw-patrol-the-dino-movie'));
const expected=scan.map(source=>{
 const d=definitions.find(d=>source.folder.startsWith(d.prefix));if(!d)throw Error('Unknown batch folder');
 let id=d.id,season=null,episode=null;
 if(d.type==='tv'){
  const direct=source.name.match(/S(\d+)E(\d+)/i);
  if(direct){season=Number(direct[1]);episode=Number(direct[2]);id=`${d.id}-s${direct[1]}e${direct[2]}`;}
  else{season=Number(source.name.match(/Season\s+(\d+)/i)?.[1]||source.name.match(/\bS(\d+)\b/i)?.[1]);episode=Number(source.name.match(/Ep\.\s*(\d+)/i)?.[1]||source.name.match(/\bE(\d+)/i)?.[1]);if(['little-bear','franklin'].includes(d.id))episode-=(season-1)*13;id=`${d.id}-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}`;}
 }
 return {id,source,definition:d,season,episode};
});
if(expected.length!==145||new Set(expected.map(e=>e.id)).size!==145)throw Error('Expected batch scope is not 145 unique items');
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const cfHeaders={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'};
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
const db=(await json(base,{headers:cfHeaders})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
const result=await json(`${base}/${db.uuid}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql:'SELECT id,title,category,video_key,thumbnail_key,subtitle_key,series_id,series_title,season_number,episode_number,year,rating,min_age,blocked,duration_seconds,genres FROM media',params:[]})});
if(!result.success)throw Error('D1 query failed');const catalog=new Map(result.result[0].results.map(r=>[r.id,r]));
const auth=await json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')}});
const b2=(operation,body)=>json(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});
const bucketName=process.env.B2_BUCKET||'king-videos',bucket=(await b2('b2_list_buckets',{accountId:auth.accountId,bucketName})).buckets.find(b=>b.bucketName===bucketName);
const report={expected:expected.length,verified:0,pending:0,problems:[],items:[],checkedAt:new Date().toISOString()};let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<expected.length){const e=expected[next++],r=catalog.get(e.id),d=e.definition,item={id:e.id,title:r?.title||d.title,problems:[]};
 if(!r){report.pending++;report.items.push({...item,state:'not published'});continue;}
 if(!existsSync(e.source.path)||statSync(e.source.path).size!==e.source.bytes)item.problems.push('Original source missing or changed since scan');
 if(r.category!==d.type||r.year!==d.year||r.min_age!==d.minAge||r.rating!==d.rating||r.blocked!==0)item.problems.push('Catalog category/year/access/rating mismatch');
 if(JSON.stringify(JSON.parse(r.genres||'[]').slice().sort())!==JSON.stringify(metadata[d.imdbId].genres.slice().sort()))item.problems.push('IMDb/animation genre mismatch');
 if(d.type==='tv'&&(r.series_id!==d.id||r.series_title!==d.title||r.season_number!==e.season||r.episode_number!==e.episode))item.problems.push('TV episode/series mismatch');
 if(Math.abs(r.duration_seconds-e.source.duration)>3)item.problems.push('Catalog duration mismatch');
 if(r.video_key!==`movies/${e.id}/${e.id}.mp4`||r.thumbnail_key!==`movies/${e.id}/thumbnail.webp`)item.problems.push('Unexpected media keys');
 const publication=publications.find(p=>p.id===e.id);if(!publication)item.problems.push('Missing successful publication record');
 else if(publication.videoCopied!==['h264','hevc'].includes(e.source.video.codec))item.problems.push('Unexpected processing mode');
 const files=new Map((await b2('b2_list_file_names',{bucketId:bucket.bucketId,prefix:`movies/${e.id}/`,maxFileCount:100})).files.map(f=>[f.fileName,f]));
 const video=files.get(r.video_key);if(!video||video.contentLength<=0||!/^[a-f0-9]{40}$/i.test(video.contentSha1||''))item.problems.push('Missing/unverified B2 video');
 const thumbnailPath=join('media-imports/oct10-family',e.id,'thumbnail.webp'),thumbnail=files.get(r.thumbnail_key);
 if(!existsSync(thumbnailPath)||!thumbnail)item.problems.push('Missing thumbnail');else{const bytes=readFileSync(thumbnailPath),meta=await sharp(bytes).metadata();if(meta.width!==1280||meta.height!==720||thumbnail.contentLength!==bytes.length||thumbnail.contentSha1!==createHash('sha1').update(bytes).digest('hex'))item.problems.push('Thumbnail dimensions/hash mismatch');}
 if(r.subtitle_key&&!files.has(r.subtitle_key))item.problems.push('Missing B2 captions');
 if(captionIds.has(e.id)&&(!r.subtitle_key||!files.has(r.subtitle_key)))item.problems.push('Embedded English captions not yet preserved');
 item.state=item.problems.length?'needs review':'verified';if(item.problems.length)report.problems.push(item);else report.verified++;report.items.push(item);
 }}));
report.complete=report.verified===report.expected&&report.pending===0&&report.problems.length===0;
writeFileSync('logs/oct10-family-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({expected:report.expected,verified:report.verified,pending:report.pending,problems:report.problems,complete:report.complete}));
