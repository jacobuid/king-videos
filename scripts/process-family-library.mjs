import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,statSync,statfsSync,copyFileSync,renameSync,appendFileSync,unlinkSync} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import sharp from 'sharp';
import {classicGenres} from './media-genres.mjs';

// Batch inputs are generated and ignored by Git. Keep originals; discard only
// this job's prepared video after verified upload and successful publication.
const batch=process.env.FAMILY_BATCH||'oct10-family';
if(!/^[a-z0-9-]+$/.test(batch))throw Error('Invalid batch name');
const definitions=JSON.parse(readFileSync(`media-imports/${batch}-definitions.json`,'utf8'));
const scan=JSON.parse(readFileSync(`logs/${batch}-scan.json`,'utf8'));
const output=`C:/Users/jacob/Downloads/KINGFLIX/web-ready/${batch}`;
const statePath=`logs/${batch}-status.json`,reportPath=`logs/${batch}-completed.json`;
const state={total:scan.length,completed:0,skipped:0,failures:[],workers:[{id:1},{id:2}]};
const completed=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):[];
let next=0;
mkdirSync('logs',{recursive:true});
const save=()=>{state.updatedAt=new Date().toISOString();writeFileSync(statePath,JSON.stringify(state,null,2));};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const packages=join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
const bin=join(packages,readdirSync(packages).find(n=>n.startsWith('ffmpeg-')),'bin');
function probe(file){const r=spawnSync(join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw Error('Cannot probe '+basename(file));return JSON.parse(r.stdout);}
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'};
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
state.workers.forEach(w=>w.stage='loading catalog and metadata');save();
const database=(await json(base,{headers})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
if(!database)throw Error('Database not found');
async function query(sql,params=[]){const r=await json(`${base}/${database.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});if(!r.success)throw Error('Database query failed');return r.result[0].results;}
const metadataPath=`media-imports/${batch}-metadata.json`;
let metadata=existsSync(metadataPath)?JSON.parse(readFileSync(metadataPath,'utf8')):null;
if(!metadata){
 const wanted=new Map(definitions.map(d=>[d.imdbId,d]));metadata={};
 const controller=new AbortController(),response=await fetch('https://datasets.imdbws.com/title.basics.tsv.gz',{signal:controller.signal});
 if(!response.ok)throw Error('IMDb HTTP '+response.status);
 const source=Readable.fromWeb(response.body),stream=source.pipe(createGunzip());source.on('error',e=>stream.destroy(e));
 try{for await(const line of createInterface({input:stream,crlfDelay:Infinity})){const f=line.split('\t'),d=wanted.get(f[0]);if(!d)continue;if(Number(f[5])!==(d.imdbYear||d.year))throw Error('IMDb year mismatch '+d.title);let genres=f[8].split(',').map(g=>g==='Sci-Fi'?'Science Fiction':g==='Sport'?'Sports':g==='Animation'?(d.animation||'Animation'):g);metadata[d.imdbId]={title:f[2],year:Number(f[5]),genres:classicGenres(genres,d.year)};if(Object.keys(metadata).length===wanted.size)break;}}
 finally{controller.abort();source.destroy();stream.destroy();}
 if(Object.keys(metadata).length!==wanted.size)throw Error('Missing IMDb matches');
 writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n');
}
function episodeInfo(row,d){
 if(d.type!=='tv')return {id:d.id,title:d.title};
 if(Number.isInteger(row.season)&&row.season>0&&Number.isInteger(row.episode)&&row.episode>0&&row.title)return {id:`${d.id}-s${String(row.season).padStart(2,'0')}e${String(row.episode).padStart(3,'0')}`,season:row.season,episode:row.episode,title:row.title};
 const direct=row.name.match(/S(\d+)E(\d+)\s*-\s*(.*?)\.[^.]+$/i);
 if(direct)return {id:`${d.id}-s${direct[1]}e${direct[2]}`,season:Number(direct[1]),episode:Number(direct[2]),title:direct[3]};
 const season=Number(row.name.match(/Season\s+(\d+)/i)?.[1]||row.name.match(/\bS(\d+)\b/i)?.[1]);
 const global=Number(row.name.match(/Ep\.\s*(\d+)/i)?.[1]||row.name.match(/\bE(\d+)/i)?.[1]);
 if(!season||!global)throw Error('Unrecognized episode filename '+row.name);
 const episode=d.id==='little-bear'||d.id==='franklin'?global-(season-1)*13:global;
 if(episode<1||episode>100)throw Error('Episode numbering needs review '+row.name);
 const title=d.id==='pj-masks'?row.name.split('｜')[0].replace(/\s+E\d+$/i,'').trim():row.name.replace(/^.*?Season\s+\d+\s*[-｜:：]\s*/i,'').replace(/\s*-\s*Ep\..*$/i,'').replaceAll('⧸',' / ').trim();
 return {id:`${d.id}-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}`,season,episode,title};
}
const jobs=scan.map(row=>{const d=definitions.find(d=>row.folder.startsWith(d.prefix));if(!d)throw Error('Unknown folder '+row.folder);return {...row,definition:d,...episodeInfo(row,d)};});
const ids=new Set();for(const j of jobs){if(ids.has(j.id))throw Error('Duplicate episode slot '+j.id);ids.add(j.id);}
// Complete remux jobs first so movies and Avatar can upload while cartoons convert.
jobs.sort((a,b)=>Number(!['h264','hevc'].includes(a.video?.codec))-Number(!['h264','hevc'].includes(b.video?.codec))||a.id.localeCompare(b.id));
state.total=jobs.length;save();
async function run(command,args,log,onLine){await new Promise((done,reject)=>{const child=spawn(command,args,{windowsHide:true});let pending='';child.stdout.on('data',chunk=>{appendFileSync(log,chunk);pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)onLine?.(line);});child.stderr.on('data',chunk=>appendFileSync(log,chunk));child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('Process exited '+code+'; see '+log)));});}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
async function processJob(job,w){
 const d=job.definition;Object.assign(w,{title:d.type==='tv'?`${d.title} S${job.season} E${job.episode}: ${job.title}`:job.title,stage:'checking source',progress:0,bytesSent:0,totalBytes:0});save();
 if(completed.some(c=>c.id===job.id)){state.completed++;return;}
 const existing=await query('SELECT id FROM media WHERE id=? OR (category=? AND title=? AND year=? AND COALESCE(series_id,\'\')=? AND COALESCE(season_number,0)=? AND COALESCE(episode_number,0)=?)',[job.id,d.type,job.title,d.year,d.type==='tv'?d.id:'',job.season??0,job.episode??0]);
 if(existing.length){state.skipped++;return;}
 if(job.error)throw Error(job.error);
 const before=statSync(job.path);await pause(10000);const after=statSync(job.path);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('Source still changing');
 const disk=statfsSync('C:/');if(disk.bavail*disk.bsize<5*1024**3)throw Error('Less than 5 GiB free; source retained');
 const p=probe(job.path),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 const copyVideo=['h264','hevc'].includes(v.codec_name);if(!copyVideo&&v.pix_fmt!=='yuv420p')throw Error('Compatibility conversion needs bit-depth review');
 const folder=join(output,job.id);mkdirSync(folder,{recursive:true});
 const video=join(folder,job.id+'.mp4'),partial=join(folder,job.id+'.partial.mp4');
 const compatibleAudio=a.codec_name==='aac'&&a.channels<=2;
 function validate(file){const out=probe(file),ov=out.streams.find(s=>s.codec_type==='video');if(ov?.width!==v.width||ov.height!==v.height||ov.pix_fmt!==v.pix_fmt||ov.codec_name!==(copyVideo?v.codec_name:'h264')||(!copyVideo&&(ov.profile!=='High'||ov.level>41))||Math.abs(Number(out.format.duration)-Number(p.format.duration))>3||!out.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'&&s.channels<=2))throw Error('Output validation failed; original retained');}
 w.stage=copyVideo?'preserving original video':'GPU compatibility conversion';save();
 if(!existsSync(video)){
  const args=['-hide_banner','-v','error','-xerror','-y','-i',job.path,'-map','0:v:0','-map','0:a:0'];
  if(!compatibleAudio&&a.channels>2)args.push('-map','0:a:0');
  args.push('-c:v',copyVideo?'copy':'h264_nvenc');
  if(!copyVideo)args.push('-preset','p7','-tune','hq','-rc','vbr','-cq','12','-b:v','0','-spatial-aq','1','-temporal-aq','1','-rc-lookahead','32','-bf','3','-pix_fmt',v.pix_fmt,'-profile:v','high','-level:v','4.1','-maxrate','10M','-bufsize','20M','-g','120','-fps_mode','passthrough');
  if(v.codec_name==='hevc')args.push('-tag:v','hvc1');
  if(compatibleAudio)args.push('-c:a','copy');else{args.push('-c:a:0','aac','-b:a:0','192k','-ac:a:0','2');if(a.channels>2)args.push('-c:a:1','copy','-disposition:a:0','default','-disposition:a:1','0');}
  args.push('-movflags','+faststart','-progress','pipe:1',partial);
  await run(join(bin,'ffmpeg.exe'),args,`logs/family-${job.id}-prepare.log`,line=>{if(line.startsWith('out_time_us=')){w.progress=Math.min(99,Number(line.slice(12))/1e6/Number(p.format.duration)*100);save();}});
  validate(partial);renameSync(partial,video);
 }else validate(video);
 const manifestFolder=resolve(`media-imports/${batch}`,job.id);mkdirSync(manifestFolder,{recursive:true});
 const thumbnail=join(manifestFolder,'thumbnail.webp');if(!job.images.length)throw Error('Missing thumbnail');
 await sharp(job.images[0]).rotate().resize(1280,720,{fit:'contain',background:'#000000'}).webp({quality:80,effort:5}).toFile(thumbnail);
 const stem=basename(job.path).replace(/\.[^.]+$/,'').toLowerCase();
 const subs=walk(dirname(job.path)).filter(f=>/\.(srt|vtt)$/i.test(f)&&!/(forced|\.fre\.|\.spa\.|spanish|french)/i.test(basename(f))&&statSync(f).size>2000).sort((a,b)=>Number(basename(b).toLowerCase().startsWith(stem))-Number(basename(a).toLowerCase().startsWith(stem))||Number(/english|\.en\./i.test(basename(b)))-Number(/english|\.en\./i.test(basename(a))));
 // Sidecars for a different episode must never attach to this episode.
 let sub=subs.find(f=>d.type!=='tv'||basename(f).toLowerCase().startsWith(stem));
 if(!sub){const track=p.streams.filter(s=>s.codec_type==='subtitle'&&['subrip','ass','ssa','webvtt','mov_text'].includes(s.codec_name)&&!s.disposition?.forced&&(/^(eng|en)$/i.test(s.tags?.language||'')||/english/i.test(s.tags?.title||''))).sort((a,b)=>Number(/sdh/i.test(a.tags?.title||''))-Number(/sdh/i.test(b.tags?.title||'')))[0];if(track){sub=join(folder,job.id+'.en.srt');await run(join(bin,'ffmpeg.exe'),['-v','error','-y','-i',job.path,'-map',`0:${track.index}`,'-c:s','srt',sub],`logs/family-${job.id}-captions.log`);}}
 if(sub&&resolve(sub)!==resolve(join(folder,job.id+'.en'+sub.slice(-4))))copyFileSync(sub,join(folder,job.id+'.en'+sub.slice(-4)));
 const manifest={id:job.id,title:job.title,category:'movie',year:d.year,description:d.description,rating:d.rating,minAge:d.minAge,kids:d.minAge===0,video,thumbnail,duration:Math.round(Number(p.format.duration)),genres:metadata[d.imdbId].genres,imdbId:d.imdbId,metadataSources:[`https://www.imdb.com/title/${d.imdbId}/`],sourceVideo:job.path,processing:copyVideo?'Original video copied without re-encoding':'H.264 NVIDIA NVENC P7 HQ CQ 12 compatibility conversion; original resolution and frame rate retained; original source preserved'};
 const manifestPath=join(manifestFolder,'media.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 w.stage='upload';w.progress=0;save();
 await run(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',manifestPath,'--folder',folder,'--upload-only','--resume','--concurrency','2'],`logs/family-${job.id}-upload.log`,line=>{if(line.startsWith('KINGFLIX_UPLOAD_PROGRESS ')){const progress=JSON.parse(line.slice(24));Object.assign(w,{progress:progress.progress,bytesSent:progress.bytesSent,totalBytes:progress.totalBytes});save();}});
 w.stage='publishing';save();
 await query('INSERT INTO media(id,title,description,category,video_key,thumbnail_key,subtitle_key,mime_type,kids_allowed,series_id,series_title,season_number,episode_number,year,genres,rating,duration_seconds,blocked,min_age) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[job.id,job.title,d.description,d.type,`movies/${job.id}/${job.id}.mp4`,`movies/${job.id}/thumbnail.webp`,sub?`movies/${job.id}/${job.id}.en.vtt`:null,'video/mp4',d.minAge===0?1:0,d.type==='tv'?d.id:null,d.type==='tv'?d.title:null,job.season??null,job.episode??null,d.year,JSON.stringify(manifest.genres),d.rating,manifest.duration,0,d.minAge]);
 completed.push({id:job.id,title:w.title,publishedAt:new Date().toISOString(),videoCopied:copyVideo,encoder:copyVideo?'copy':'h264_nvenc'});writeFileSync(reportPath,JSON.stringify(completed,null,2)+'\n');state.completed++;
 // The importer checks each uploaded video's SHA-1 and size before publication.
 // Only remove this generated file, never any original or another batch output.
 const resolvedVideo=resolve(video),resolvedRoot=resolve(output);if(!resolvedVideo.startsWith(resolvedRoot+'\\'))throw Error('Prepared-file cleanup outside batch refused');unlinkSync(resolvedVideo);
 w.stage='completed';w.progress=100;save();
}
await Promise.all(state.workers.map(async w=>{while(next<jobs.length){const job=jobs[next++];try{await processJob(job,w);}catch(e){state.failures.push({id:job.id,title:job.title,error:e.message});w.stage='failed';save();}}w.stage='idle';save();}));
