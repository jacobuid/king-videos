import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,renameSync,appendFileSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const quality=process.argv.includes('--lossless')?'lossless':process.argv.includes('--high-quality')?'high-quality':'compatible-only';
const all=JSON.parse(readFileSync('logs/new-video-library-jobs.json'));
const excludedAnneSeries=new Set(['anne-of-green-gables-1985','anne-of-avonlea-1987','anne-the-continuing-story-2000']);
const jobs=all.filter(j=>!excludedAnneSeries.has(j.seriesId)&&(quality!=='compatible-only'||j.sourceVideoCodec==='h264'));
jobs.sort((a,b)=>Number(b.sourceVideoCodec==='h264')-Number(a.sourceVideoCodec==='h264'));
const packages=join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
const bin=join(packages,readdirSync(packages).find(f=>f.startsWith('ffmpeg-')),'bin'),ffmpeg=join(bin,'ffmpeg.exe'),ffprobe=join(bin,'ffprobe.exe');
const statePath=`logs/new-videos-${quality}-status.json`,state={quality,total:jobs.length,completed:0,failures:[],workers:[{id:1},{id:2}]};
const save=()=>writeFileSync(statePath,JSON.stringify({...state,updatedAt:new Date().toISOString()},null,2));
const preflight=spawnSync('powershell.exe',['-NoProfile','-Command',"[System.IO.DriveInfo]::new('C:\\').AvailableFreeSpace"],{encoding:'utf8',windowsHide:true});
if(preflight.status!==0||Number(preflight.stdout.trim())<6*1024**3){state.status='needs-disk-space';state.freeBytes=Number(preflight.stdout.trim())||0;save();throw Error('At least 6 GiB free on C: is required before conversion.');}
function run(command,args,log,onData){return new Promise((ok,bad)=>{const c=spawn(command,args,{windowsHide:true});for(const stream of [c.stdout,c.stderr])stream.on('data',b=>{appendFileSync(log,b);onData?.(String(b))});c.on('error',bad);c.on('close',code=>code===0?ok():bad(Error('Process failed '+code+'; see '+log)));});}
function validate(j){const r=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',j.video],{windowsHide:true,encoding:'utf8'});if(r.status!==0)throw Error('Output validation failed');const p=JSON.parse(r.stdout),v=p.streams.find(s=>s.codec_type==='video');if(v?.codec_name!=='h264'||v.width!==j.sourceWidth||v.height!==j.sourceHeight||Math.abs(Number(p.format.duration)-j.duration)>3||!p.streams.some(s=>s.codec_type==='audio'))throw Error('Output duration, dimensions or codecs invalid');}
let next=0;
async function worker(w){while(next<jobs.length){const j=jobs[next++];w.title=j.seriesTitle?j.seriesTitle+' — '+j.title:j.title;try{
 const folder=dirname(j.video);mkdirSync(folder,{recursive:true});w.status='preparing';save();
 if(!existsSync(j.video)){
  const free=spawnSync('powershell.exe',['-NoProfile','-Command',"[System.IO.DriveInfo]::new('C:\\').AvailableFreeSpace"],{encoding:'utf8',windowsHide:true});if(Number(free.stdout.trim())<6*1024**3)throw Error('Less than 6 GiB free; conversion paused for this file');
  const partial=j.video.replace(/\.mp4$/,'.partial.mp4');if(existsSync(partial))throw Error('Partial output requires review');
  const args=['-v','warning','-xerror','-i',j.sourceVideo,'-map','0:v:0','-map','0:a:0'];
  if(j.sourceVideoCodec==='h264')args.push('-c:v','copy');else if(quality==='lossless')args.push('-c:v','libx264','-preset','fast','-crf','0');else args.push('-c:v','h264_nvenc','-preset','p7','-rc','vbr','-cq','16','-b:v','0');
  if(j.sourceAudioCodec==='aac')args.push('-c:a','copy');else args.push('-c:a','aac','-b:a','192k');
  args.push('-movflags','+faststart','-progress','pipe:1','-n',partial);w.status=j.sourceVideoCodec==='h264'?'remuxing':'encoding';
  await run(ffmpeg,args,`logs/new-video-${j.id}-conversion.log`,data=>{const time=data.match(/out_time_us=(\d+)/);if(time){w.progress=Math.min(100,Number(time[1])/1e6/j.duration*100);save();}});
  const original=j.video;j.video=partial;validate(j);j.video=original;renameSync(partial,j.video);
 }
 validate(j);j.processing=j.sourceVideoCodec==='h264'?'H.264 video and AAC audio copied unchanged into fast-start MP4':'Native-resolution H.264 NVENC CQ 16, preset p7; AAC audio 192 kbps';
 const localManifest=JSON.parse(readFileSync(j.manifestPath));localManifest.processing=j.processing;localManifest.outputBytes=statSync(j.video).size;writeFileSync(j.manifestPath,JSON.stringify(localManifest,null,2)+'\n');
 w.status='uploading';w.progress=0;save();
 const stage=resolve('logs',j.id+'-upload.json');writeFileSync(stage,JSON.stringify({...j,category:'movie'}));
 await run(process.execPath,['--env-file=.env','--import',pathToFileURL(resolve('scripts/b2-upload-agent.mjs')).href,'scripts/import-b2-movie.mjs',stage,'--folder',dirname(j.manifestPath),'--resume','--upload-only'],`logs/new-video-${j.id}-upload.log`,data=>{const match=data.match(/KINGFLIX_UPLOAD_PROGRESS (\{[^\r\n]+\})/);if(match){const p=JSON.parse(match[1]);if(p.key.endsWith('.mp4')){w.progress=p.progress;save();}}});
 state.completed++;console.log('Uploaded '+w.title);
 }catch(e){state.failures.push({id:j.id,error:e.message});console.error(w.title+': '+e.message);}finally{w.status='idle';save();}}
 w.status='finished';save();}
await Promise.all(state.workers.map(worker));state.finishedAt=new Date().toISOString();save();
// Captions may finish searching after their video upload. Send a second small-assets pass once the search is done.
while(existsSync('logs/new-video-subtitles-status.json')&&!JSON.parse(readFileSync('logs/new-video-subtitles-status.json')).finishedAt)await new Promise(r=>setTimeout(r,10000));
for(const j of jobs.filter(j=>!state.failures.some(f=>f.id===j.id))){if(!existsSync(join(dirname(j.manifestPath),j.id+'.srt')))continue;const stage=resolve('logs',j.id+'-upload.json');try{await run(process.execPath,['--env-file=.env','scripts/import-b2-movie.mjs',stage,'--folder',dirname(j.manifestPath),'--subtitles-only','--upload-only','--resume'],`logs/new-video-${j.id}-captions.log`);}catch(e){state.failures.push({id:j.id,phase:'captions',error:e.message});save();}}
state.captionsFinishedAt=new Date().toISOString();save();console.log(JSON.stringify({completed:state.completed,failures:state.failures.length}));
