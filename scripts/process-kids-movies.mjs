import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,statSync,renameSync,appendFileSync} from 'node:fs';
import {join,dirname,basename,extname,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Agent,setGlobalDispatcher} from 'undici';
import sharp from 'sharp';
import {classicGenres} from './media-genres.mjs';
setGlobalDispatcher(new Agent({headersTimeout:0,bodyTimeout:0,connect:{timeout:30000}}));
const review=JSON.parse(readFileSync('logs/kids-source-review.json')),assets=JSON.parse(readFileSync('logs/kids-folder-files.json','utf8').replace(/^\uFEFF/,''));
const root=join(process.env.LOCALAPPDATA,'Microsoft','WinGet','Packages');
const hb=join(root,readdirSync(root).find(n=>n.startsWith('HandBrake.HandBrake')&&existsSync(join(root,n,'HandBrakeCLI.exe'))),'HandBrakeCLI.exe');
const ffRoot=join(root,'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
function find(dir,name){for(const f of readdirSync(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory()){const found=find(p,name);if(found)return found;}else if(f.name===name)return p;}}
const ffmpeg=find(ffRoot,'ffmpeg.exe'),ffprobe=find(ffRoot,'ffprobe.exe');
const output='C:\\Users\\jacob\\Downloads\\KINGFLIX\\kids-movies';
const changes={
'Spirit Stallion Of The Cimarron':['Spirit: Stallion of the Cimarron',2002,'Spirit:_Stallion_of_the_Cimarron'],
'Hallmark - Christmas Under Wraps':['Christmas Under Wraps',2014,'Christmas_Under_Wraps'],
'Home Alone 2 Lost in New York':['Home Alone 2: Lost in New York',1992],
'Air Bud 2 - Golden Receiver':['Air Bud: Golden Receiver',1998],
'Air Bud 3 - World Pup':['Air Bud: World Pup',2000],
'Air Bud 4 - Seventh Inning Fetch':['Air Bud: Seventh Inning Fetch',2002],
'Air Bud 5 - Spikes Back':['Air Bud: Spikes Back',2003],
'Alvin and the Chipmunks 2 - The Squeakquel':['Alvin and the Chipmunks: The Squeakquel',2009],
'Doctor Dolittle':['Dr. Dolittle',1998,'Dr._Dolittle_(1998_film)'],
'High School Musical 3':['High School Musical 3: Senior Year',2008],
'Night at the Museum 3 - Battle of the Smithsonian':['Night at the Museum: Battle of the Smithsonian',2009],
'Night at the Museum 2 - Secret of the Tomb':['Night at the Museum: Secret of the Tomb',2014],
'Spy Kids 2 Island of Lost Dreams':['Spy Kids 2: The Island of Lost Dreams',2002],
'Spy Kids 3 Game Over':['Spy Kids 3-D: Game Over',2003],
'Spy Kids 4 - All the Time in the World':['Spy Kids: All the Time in the World',2011],
'The Princess Diaries 2':['The Princess Diaries 2: Royal Engagement',2004],
'King.Of.Kings.1961.720p.BRRip.x264-x0r':['King of Kings',1961,'King_of_Kings_(1961_film)'],
'LittleMarines2':['Little Marines 2',1992],
'Little.Marines':['Little Marines',1990],
'Wingfeather':['The Wingfeather Saga: A Crow for the Carriage',2017,'The_Wingfeather_Saga'],
'Homeward Bound':['Homeward Bound: The Incredible Journey',1993],
};
const slug=s=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const onlyAt=process.argv.indexOf('--only'),only=onlyAt<0?null:process.argv[onlyAt+1];
const statusPath=only?`logs/kids-${only}-retry-status.json`:'logs/kids-movies-status.json';
const jobs=review.pending.map(row=>{const c=changes[row.title]||[row.title,row.year];let id=slug(c[0]);if(['Peter Pan','The Star','The Secret Garden','The Borrowers','Annie','Inspector Gadget','Sonic The Hedgehog'].includes(c[0]))id+='-'+c[1];return {...row,title:c[0],year:c[1],wiki:c[2],id,mode:extname(row.path).toLowerCase()==='.mp4'&&row.codec==='h264'&&row.audio.every(a=>a.codec==='aac')?'unchanged':row.codec==='h264'?'remux':'encode'};}).filter(row=>row.id!=='anne-of-green-gables'&&(!only||row.id===only));
if(new Set(jobs.map(j=>j.id)).size!==jobs.length)throw Error('Duplicate IDs in queue');
jobs.sort((a,b)=>({encode:0,remux:1,unchanged:2}[a.mode])-({encode:0,remux:1,unchanged:2}[b.mode]));
const state={startedAt:new Date().toISOString(),total:jobs.length,completed:0,uploaded:0,failures:[],review:[],workers:[{id:1,status:'idle'},{id:2,status:'idle'}]};
function save(){state.remaining=state.total-state.completed-state.failures.length;state.updatedAt=new Date().toISOString();writeFileSync(statusPath,JSON.stringify(state,null,2));}
writeFileSync(only?`logs/kids-${only}-retry-queue.json`:'logs/kids-movies-queue.json',JSON.stringify({output,jobs,excluded:review.existing,duplicates:review.duplicates},null,2));save();
function run(command,args,log,onData){return new Promise((ok,bad)=>{const child=spawn(command,args,{windowsHide:true});let text='';child.stdout.on('data',b=>{text=(text+b).slice(-100000);appendFileSync(log,b);onData?.(String(b));});child.stderr.on('data',b=>{text=(text+b).slice(-100000);appendFileSync(log,b);onData?.(String(b));});child.on('error',bad);child.on('close',code=>ok({code,text}));});}
function validate(row,path){const r=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',path],{windowsHide:true,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error('Output probe failed');const p=JSON.parse(r.stdout),v=p.streams.find(s=>s.codec_type==='video');if(!v||v.codec_name!=='h264'||!p.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'))throw Error('Output codecs invalid');const duration=Number(p.format.duration),ratio=Number(v.display_aspect_ratio?.split(':')[0])/Number(v.display_aspect_ratio?.split(':')[1]);if(Math.abs(duration-row.seconds)>Math.max(3,row.seconds*.001)||Math.abs(ratio-row.ratio)>.03||v.width>row.width+2||v.height>row.height+2)throw Error('Output duration, resolution or aspect mismatch');return p;}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Metadata HTTP '+r.status);return r;}
const clean=s=>s.replace(/<[^>]+>/g,' ').replace(/&#\d+;/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\[\d+\]/g,'').replace(/\s+/g,' ').trim();
async function metadata(row){if(row.title.startsWith('The Wingfeather Saga:'))return {extract:'Three siblings encounter danger and wonder in the fantasy world of Aerwiar in this animated short.',source:'https://new.centricitymusic.com/andrew-petersons-wingfeather-saga-short-film-premieres/'};
const base=row.title.replaceAll(' ','_');const pages=[row.wiki,`${base}_(${row.year}_film)`,`${base}_(film)`,base].filter(Boolean);
for(const page of [...new Set(pages)]){try{const url='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(page),j=await (await get(url)).json();if(j.type==='disambiguation'||!j.extract||row.year&&!j.extract.includes(String(row.year)))continue;return {extract:j.extract,source:j.content_urls.desktop.page,image:j.originalimage?.source||j.thumbnail?.source};}catch{}}
for(const page of [...new Set(pages)]){try{const url='https://en.wikipedia.org/wiki/'+encodeURIComponent(page),html=await (await get(url)).text();const start=html.indexOf('mw-parser-output');const body=html.slice(start);for(const p of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)){const text=clean(p[1]);if(text.length>100&&(!row.year||text.includes(String(row.year))))return {extract:text,source:url,image:html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1]};}}catch{}}
return null;}
async function rating(row){const urls=[`https://www.rottentomatoes.com/m/${slug(row.title).replaceAll('-','_')}`,`https://movies.disney.com/${slug(row.title)}`];for(const url of urls){try{const html=await (await get(url)).text();for(const x of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){let j;try{j=JSON.parse(x[1]);}catch{continue;}if(j['@type']!=='Movie'||!j.contentRating||!['G','PG','PG-13','R','NR','TV-G','TV-PG'].includes(j.contentRating))continue;const title=slug(j.name).replace(/^the-/,'');if(title!==slug(row.title).replace(/^the-/,''))continue;const year=Number(String(j.dateCreated).slice(0,4));if(year&&Math.abs(year-row.year)>2)continue;return {rating:j.contentRating,ratingSource:url};}}catch{}}return {};}
function englishSubtitle(row){const found=assets.filter(a=>dirname(a.FullName)===dirname(row.path)&&/\.(srt|vtt)$/i.test(a.FullName));return found.filter(a=>!/\b(?:spanish|french|german|forced)\b/i.test(a.FullName)).sort((a,b)=>Number(/english|\.eng\./i.test(b.FullName))-Number(/english|\.eng\./i.test(a.FullName)))[0]?.FullName;}
let next=0;
async function worker(w){while(next<jobs.length){const row=jobs[next++];Object.assign(w,{status:'preparing',title:row.title,mode:row.mode,progress:0});save();try{
const folder=join(output,row.id),manifestFolder=resolve('media-imports/kids-movies',row.id);mkdirSync(folder,{recursive:true});mkdirSync(manifestFolder,{recursive:true});
let video=row.path;const target=join(folder,row.id+'.mp4'),partial=join(folder,row.id+'.partial.mp4');
if(row.mode!=='unchanged'){video=target;if(existsSync(target))validate(row,target);else{if(existsSync(partial))throw Error('Partial output exists; requires review');const free=spawnSync('powershell.exe',['-NoProfile','-Command',"[System.IO.DriveInfo]::new('C:\\').AvailableFreeSpace"],{encoding:'utf8',windowsHide:true});if(Number(free.stdout.trim())<6*1024**3)throw Error('Less than 6 GiB free');w.status=row.mode==='remux'?'remuxing':'encoding';save();let args,command;if(row.mode==='remux'){command=ffmpeg;args=['-v','warning','-i',row.path,'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a',row.audio[0]?.codec==='aac'?'copy':'aac'];if(row.audio[0]?.codec!=='aac')args.push('-b:a','192k');args.push('-movflags','+faststart','-n',partial);}else{command=hb;args=['-i',row.path,'-o',partial,'-f','av_mp4','-e','nvenc_h264','--encoder-preset','slow','-q','18','--crop-mode','none','--non-anamorphic','--keep-display-aspect','-a','1','-E','av_aac','-B','160','--mixdown','stereo','--optimize'];}let buffer='',last=0;const result=await run(command,args,`logs/kids-${row.id}-conversion.log`,data=>{buffer=(buffer+data).slice(-3000);w.progress=Number([...buffer.matchAll(/Encoding:[^\r\n]*?([\d.]+) %/g)].at(-1)?.[1]||w.progress);w.speed=[...buffer.matchAll(/avg ([\d.]+) fps/g)].at(-1)?.[1]||w.speed;w.eta=[...buffer.matchAll(/ETA ([^\r\n)]+)/g)].at(-1)?.[1]||w.eta;if(Date.now()-last>2000){last=Date.now();save();}});if(result.code!==0&&!(row.mode==='encode'&&/work result = 0/.test(result.text)&&/Encode done!/.test(result.text)))throw Error('Conversion failed: '+result.code);if([...result.text.matchAll(/decoder done: \d+ frames, (\d+) decoder errors/g)].some(m=>Number(m[1])))throw Error('Decoder errors');w.status='validating';save();validate(row,partial);renameSync(partial,target);}}
w.status='metadata';save();const manifestPath=join(manifestFolder,'media.json');let manifest;if(existsSync(manifestPath))manifest=JSON.parse(readFileSync(manifestPath));else{
const meta=await metadata(row);let genres=row.title==='Spirit: Stallion of the Cimarron'||row.title==='Space Jam'?['Cartoon','Adventure','Family']:row.title==='The Star'||row.title.startsWith('The Wingfeather Saga:')?['Animation','Adventure','Family']:['Live Action','Family'];genres=classicGenres(genres,row.year);
manifest={id:row.id,title:row.title,category:row.title.startsWith('The Wingfeather Saga:')?'short':'movie',year:row.year||null,date:null,description:meta?meta.extract.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0,1).join(' ').split(/\s+/).slice(0,90).join(' '):'',genres,duration:Math.round(row.seconds),video,thumbnail:join(manifestFolder,'thumbnail.webp'),sourceFolder:dirname(video),sourceVideo:row.path,processing:row.mode,metadataSource:meta?.source||null,...await rating(row)};
if(!meta||/Little Red Riding Hood|Anne Of Green Gables|Little Marines/.test(row.title)){manifest.metadataReview=true;state.review.push({id:row.id,title:row.title,reason:row.title==='Anne Of Green Gables'?'97-minute file appears to be only part of the 199-minute production':'Identity or metadata needs review'});}
const thumbnail=join(manifestFolder,'thumbnail.webp');let thumbReady=false;if(meta?.image){try{await sharp(Buffer.from(await (await get(meta.image.replaceAll('&amp;','&'))).arrayBuffer())).resize({width:1280,withoutEnlargement:true}).webp({quality:85}).toFile(thumbnail);thumbReady=true;}catch{}}
if(!thumbReady){const frame=join(folder,'thumbnail-frame.jpg');const rr=await run(ffmpeg,['-v','error','-ss',String(Math.round(row.seconds*.2)),'-i',video,'-frames:v','1','-y',frame],`logs/kids-${row.id}-thumbnail.log`);if(rr.code!==0)throw Error('Thumbnail generation failed');await sharp(frame).resize({width:1280,withoutEnlargement:true}).webp({quality:85}).toFile(thumbnail);}
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
const subtitle=englishSubtitle(row);if(subtitle)manifest.subtitleSource=subtitle;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
// Stage only small assets next to converted outputs; unchanged videos upload directly from G:.
const uploadFolder=folder;const uploadManifest={...manifest,video,thumbnail:manifest.thumbnail};if(subtitle){const {copyFileSync}=await import('node:fs');copyFileSync(subtitle,join(uploadFolder,row.id+extname(subtitle)));}const jobManifest=join(folder,'media.json');writeFileSync(jobManifest,JSON.stringify(uploadManifest,null,2)+'\n');
w.status='uploading';w.encodingProgress=100;w.progress=0;w.bytesUploaded=0;w.sourceBytes=row.bytes;w.outputBytes=statSync(video).size;save();const rr=await run(process.execPath,['--env-file=.env','--import',pathToFileURL(resolve('scripts/b2-upload-agent.mjs')).href,'scripts/import-b2-movie.mjs',jobManifest,'--folder',uploadFolder,'--resume','--concurrency','3','--upload-only'],`logs/kids-${row.id}-upload.log`,data=>{const wait=data.match(/KINGFLIX_UPLOAD_WAIT (\{[^\r\n]+\})/);if(wait){try{const info=JSON.parse(wait[1]);w.status='waiting-network';w.networkError=info.error;w.retrySeconds=info.retrySeconds||60;save();}catch{}}const line=data.match(/KINGFLIX_UPLOAD_PROGRESS (\{[^\r\n]+\})/);if(line){try{const progress=JSON.parse(line[1]);if(progress.key.endsWith('.mp4')){w.status='uploading';delete w.networkError;delete w.retrySeconds;w.bytesUploaded=progress.bytesSent;w.totalUploadBytes=progress.totalBytes;w.progress=progress.progress;save();}}catch{}}});if(rr.code!==0)throw Error('Upload failed; see movie upload log');state.completed++;state.uploaded++;console.log('Uploaded '+row.title);
}catch(e){state.failures.push({id:row.id,title:row.title,error:e.message});console.error(row.title+': '+e.message);}finally{Object.assign(w,{status:'idle',title:null});save();}}
w.status='finished';save();}
await Promise.all(state.workers.map(worker));state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({completed:state.completed,failures:state.failures.length}));
