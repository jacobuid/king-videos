import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';

// Download popularity breaks ties only among original-English identity matches.
// Timestamp checks are a screening measure, not proof of dialogue synchronization.
const apply=process.argv.includes('--apply'),limitArg=process.argv.indexOf('--limit');
const limit=limitArg<0?Infinity:Number(process.argv[limitArg+1]);
const onlyArg=process.argv.indexOf('--only'),only=onlyArg<0?null:process.argv[onlyArg+1];
const statePath='logs/subtitles-status.json',reportPath='logs/subtitles-report.json';
mkdirSync('logs/subtitles',{recursive:true});
const prior=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{results:[]};
const results=new Map(prior.results.map(r=>[r.id,r]));
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'};
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
const databases=await (await fetch(base,{headers})).json();
const database=databases.result?.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
if(!database)throw Error('Database not found');
async function query(sql,params=[]){const r=await fetch(`${base}/${database.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.success)throw Error('D1 query failed: '+JSON.stringify(j.errors));return j.result.flatMap(x=>x.results||[]);}
const rows=await query("SELECT id,title,year,category,series_id,series_title,season_number,episode_number,duration_seconds,video_key,subtitle_key,subtitle_url FROM media WHERE category IN ('movie','tv','short') ORDER BY CASE WHEN category='movie' THEN 0 ELSE 1 END,title");
writeFileSync('logs/subtitles-catalog.json',JSON.stringify(rows,null,2));
const existing=rows.filter(r=>r.subtitle_key||r.subtitle_url).length;
const ignoredShort=r=>r.id.startsWith('disney-short-')||r.video_key?.startsWith('movies/disney-classic-shorts/');
const jobs=rows.filter(r=>!ignoredShort(r)&&!r.subtitle_key&&!r.subtitle_url&&(!only||r.id===only)).slice(0,limit);
const state={startedAt:new Date().toISOString(),total:jobs.length,alreadyCaptioned:existing,ignoredDisneyShorts:rows.filter(ignoredShort).length,completed:0,added:0,notFound:0,review:0,failures:[],workers:[{id:1,status:'idle'},{id:2,status:'idle'}]};
function save(){state.updatedAt=new Date().toISOString();state.remaining=state.total-state.completed;writeFileSync(statePath,JSON.stringify(state,null,2));writeFileSync(reportPath,JSON.stringify({updatedAt:state.updatedAt,results:[...results.values()]},null,2));}
save();
let auth,bucket;
if(apply){const r=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(process.env.B2_BOOTSTRAP_KEY_ID+':'+process.env.B2_BOOTSTRAP_APPLICATION_KEY).toString('base64')}});if(!r.ok)throw Error('B2 authorization failed');auth=await r.json();const bs=await b2('b2_list_buckets',{accountId:auth.accountId,bucketName:process.env.B2_BUCKET||'king-videos'});bucket=bs.buckets.find(b=>b.bucketName===(process.env.B2_BUCKET||'king-videos'));if(!bucket)throw Error('Bucket not found');}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function b2(op,body){const r=await fetch(auth.apiInfo.storageApi.apiUrl+'/b2api/v4/'+op,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('B2 '+op+' HTTP '+r.status);return r.json();}
let nextRequest=0;
async function site(url){if(new URL(url).hostname!=='www.subtitlecat.com')throw Error('Unexpected subtitle host');const slot=Math.max(Date.now(),nextRequest);nextRequest=slot+500;await sleep(Math.max(0,slot-Date.now()));for(let i=0;i<3;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(r.status===429||r.status>=500){if(i===2)throw Error('SubtitleCat HTTP '+r.status);await sleep((i+1)*5000);continue;}if(!r.ok)throw Error('SubtitleCat HTTP '+r.status);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>3*1024*1024)throw Error('Subtitle response too large');return bytes;}catch(e){if(i===2)throw e;await sleep((i+1)*2000);}}}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#039;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const normalize=s=>s.toLowerCase().normalize('NFKD').replace(/&/g,'and').replace(/[^a-z0-9]/g,'').replace(/^the/,'');
function names(row){const a=[row.series_title||row.title];if(!row.series_id)a.push(row.id.replaceAll('-',' '));if(row.id==='101-dalmatians')a.push('101 Dalmatians');if(row.id==='laputa-castle-in-the-sky')a.push('Castle in the Sky');if(row.id==='the-lion-king-1-1-5-hakuna-matata')a.push('The Lion King 1 1 2','The Lion King 1.5');return a;}
function candidates(html,row){const candidates=[];for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const body=tr[1],link=body.match(/<a\b[^>]*href=["']([^"']*subs\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/i);if(!link||! /\(translated from English\)/i.test(body))continue;const title=decode(link[2].replace(/<[^>]*>/g,'')).trim(),norm=normalize(title);if(!names(row).some(n=>norm.includes(normalize(n))))continue;
if(row.series_id){const pattern=new RegExp(`(?:s0*${row.season_number}[^a-z0-9]*e0*${row.episode_number})(?![0-9])`,'i');if(!pattern.test(title))continue;}else if(row.year&&!new RegExp(`(?:^|[^0-9])${row.year}(?:[^0-9]|$)`).test(title))continue;
const downloads=Number((body.match(/sub-table__metric-value[^>]*>\s*([\d,]+)[\s\S]{0,100}?downloads/i)?.[1]||'0').replaceAll(',',''));
candidates.push({title,downloads,page:new URL(decode(link[1]),'https://www.subtitlecat.com/').href});}
return candidates.sort((a,b)=>b.downloads-a.downloads);}
function parseSrt(bytes,row){let text=bytes[0]===255&&bytes[1]===254?bytes.toString('utf16le'):bytes.toString('utf8');text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');if(/<html|<!doctype/i.test(text)||text.includes('\ufffd'))throw Error('Invalid subtitle encoding or HTML response');const cues=[...text.matchAll(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g)];const seconds=m=>Number(m[0])*3600+Number(m[1])*60+Number(m[2])+Number(m[3])/1000;let previous=-1;for(const c of cues){const start=seconds(c.slice(1,5)),end=seconds(c.slice(5,9));if(end<=start||start<previous-.1)throw Error('Invalid or unsorted subtitle timestamps');previous=start;}
if(cues.length<Math.max(15,row.duration_seconds/90))throw Error('Too few captions for full video');const first=seconds(cues[0].slice(1,5)),last=seconds(cues.at(-1).slice(5,9)),duration=Number(row.duration_seconds);if(!duration)throw Error('Video runtime unavailable');if(last>duration+2||last<duration-Math.max(150,duration*.12)||first>240)throw Error(`Timing range mismatch: captions end ${Math.round(last)}s, video ${duration}s`);
const words=text.replace(/^\d+$/gm,'').replace(/.*-->.*\n/g,'').replace(/<[^>]*>/g,'').split(/\s+/);const english=words.filter(w=>/^(the|and|you|i|to|is|it|of|a|in|we|that|this|what|my|me|are|not|your|on|for|with)$/i.test(w)).length;if(english<words.length*.04)throw Error('English language check failed');
return {text,cues:cues.length,first,last,duration,vtt:'WEBVTT\n\n'+text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2').trim()+'\n'};}
async function upload(row,subtitle){const key=`${dirname(row.video_key).replaceAll('\\','/')}/${row.id}.en.vtt`,body=Buffer.from(subtitle.vtt),sha1=createHash('sha1').update(body).digest('hex');
for(let attempt=1;attempt<=4;attempt++){try{const u=await b2('b2_get_upload_url',{bucketId:bucket.bucketId});const r=await fetch(u.uploadUrl,{method:'POST',headers:{Authorization:u.authorizationToken,'X-Bz-File-Name':encodeURIComponent(key),'Content-Type':'text/vtt; charset=utf-8','Content-Length':String(body.length),'X-Bz-Content-Sha1':sha1},body,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Caption upload HTTP '+r.status);const result=await r.json();if(result.contentSha1!==sha1||result.contentLength!==body.length)throw Error('Uploaded caption verification failed');break;}catch(e){if(attempt===4)throw e;await sleep(attempt*2000);}}
await query("UPDATE media SET subtitle_key=? WHERE id=? AND (subtitle_key IS NULL OR subtitle_key='') AND (subtitle_url IS NULL OR subtitle_url='')",[key,row.id]);const verify=await query('SELECT subtitle_key FROM media WHERE id=?',[row.id]);if(verify[0]?.subtitle_key!==key)throw Error('Caption catalog link changed or did not save');return key;}
const dubShows=new Set(['sonic-x','pokemon-origins']);
const dubMovies=new Set(['my-neighbor-totoro','from-up-on-poppy-hill','porco-rosso','when-marnie-was-there','ponyo','kiki-s-delivery-service','my-neighbors-the-yamadas','whisper-of-the-heart','tales-from-earthsea','nausicaa-of-the-valley-of-the-wind','howl-s-moving-castle','pom-poko','only-yesterday','laputa-castle-in-the-sky','spirited-away','the-wind-rises','princess-mononoke']);
let next=0;
async function worker(w){while(next<jobs.length){const row=jobs[next++];Object.assign(w,{status:'searching',title:row.series_title?`${row.series_title} S${row.season_number}E${row.episode_number}`:row.title});save();const record={id:row.id,title:row.title,seriesTitle:row.series_title};try{
if(results.get(row.id)?.status==='added'){Object.assign(record,results.get(row.id));state.added++;continue;}
if(!row.video_key||!row.duration_seconds||row.id==='origins'){record.status='review';record.reason='Combined video or missing video/runtime metadata';state.review++;continue;}
const label=row.series_id?`${row.series_title} S${String(row.season_number).padStart(2,'0')}E${String(row.episode_number).padStart(2,'0')}`:`${row.title} ${row.year||''}`;
const html=(await site('https://www.subtitlecat.com/index.php?search='+encodeURIComponent(label)+'&show=1000')).toString();let options=candidates(html,row);
if(!options.length&&!row.series_id){for(const alt of names(row).slice(1,3)){const fallback=(await site('https://www.subtitlecat.com/index.php?search='+encodeURIComponent(`${alt} ${row.year||''}`)+'&show=1000')).toString();options=candidates(fallback,row);if(options.length)break;}}
let selected=null;const rejected=[];for(const candidate of options.slice(0,5)){try{const page=(await site(candidate.page)).toString();const a=[...page.matchAll(/<a\b[^>]*>/gi)].find(m=>/id=["']download_en["']/i.test(m[0]))?.[0];const href=a?.match(/href=["']([^"']+\.srt)["']/i)?.[1];if(!href)throw Error('No existing English subtitle download');const url=new URL(decode(href),candidate.page).href;const bytes=await site(url),subtitle=parseSrt(bytes,row);selected={...candidate,url,subtitle};break;}catch(e){rejected.push({title:candidate.title,downloads:candidate.downloads,reason:e.message});}}
record.rejected=rejected;if(!selected){record.status=options.length?'review':'not-found';record.reason=options.length?'No candidate passed validation':'No matching original-English release';state[options.length?'review':'notFound']++;continue;}
const file=`logs/subtitles/${row.id}.srt`;writeFileSync(file,selected.subtitle.text);Object.assign(record,{source:selected.page,download:selected.url,release:selected.title,downloads:selected.downloads,cueCount:selected.subtitle.cues,lastCueSeconds:selected.subtitle.last,videoSeconds:selected.subtitle.duration,localFile:file,synchronization:'Runtime-screened; dialogue synchronization unverified'});
if((dubMovies.has(row.id)||dubShows.has(row.series_id))&&!/english[. _-]*dub|dubbed|dub[. _-]*english/i.test(selected.title)){record.status='review';record.reason='English dub dialogue must be checked against translated subtitles';state.review++;continue;}
if(apply){w.status='uploading';save();record.subtitleKey=await upload(row,selected.subtitle);record.status='added';state.added++;}else{record.status='validated';state.review++;}
console.log(`${record.status}: ${w.title} (${selected.downloads} downloads)`);
}catch(error){record.status='failed';record.reason=error.message;state.failures.push({id:row.id,title:row.title,error:error.message});}finally{results.set(row.id,record);state.completed++;Object.assign(w,{status:'idle',title:null});save();}}
w.status='finished';save();}
await Promise.all(state.workers.map(worker));state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({completed:state.completed,added:state.added,review:state.review,notFound:state.notFound,failures:state.failures.length}));
