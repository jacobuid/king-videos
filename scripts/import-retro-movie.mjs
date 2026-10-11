import {readFileSync,writeFileSync,readdirSync,mkdirSync,statSync,statfsSync,existsSync,copyFileSync,renameSync,appendFileSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import sharp from 'sharp';

// Curated retro imports retain frame timing and originals; resizing is opt-in.
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(typeof input.retro!=='boolean'||!/^[a-z0-9-]+$/.test(input.id))throw Error('Expected a movie with a boolean retro flag and a safe id');
const id=input.id,folder=resolve(`C:/Users/jacob/Downloads/KINGFLIX/web-ready/retro/${id}`),manifestFolder=resolve('media-imports/retro',id);
mkdirSync(folder,{recursive:true});mkdirSync(manifestFolder,{recursive:true});mkdirSync('logs',{recursive:true});
const statusPath=`logs/retro-${id}-status.json`,state={total:1,completed:0,stage:'checking source',progress:0,failures:[]};
const save=()=>{state.updatedAt=new Date().toISOString();writeFileSync(statusPath,JSON.stringify(state,null,2))};save();
const packages=join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
const bin=join(packages,readdirSync(packages).find(n=>n.startsWith('ffmpeg-')),'bin');
function probe(path){const r=spawnSync(join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw Error('Cannot probe '+basename(path));return JSON.parse(r.stdout)}
async function run(command,args,log,onLine){await new Promise((done,reject)=>{const child=spawn(command,args,{windowsHide:true});let pending='';child.stdout.on('data',chunk=>{appendFileSync(log,chunk);pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)onLine?.(line)});child.stderr.on('data',chunk=>appendFileSync(log,chunk));child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Process exited '+code+'; see '+log)))})}
try{
 const original=statSync(input.sourceVideo);await new Promise(done=>setTimeout(done,10000));const stable=statSync(input.sourceVideo);
 if(original.size!==stable.size||original.mtimeMs!==stable.mtimeMs)throw Error('Source is still changing');
 const disk=statfsSync('C:/');if(disk.bavail*disk.bsize<8*1024**3)throw Error('Less than 8 GiB free; original retained');
 const p=probe(input.sourceVideo),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 if(!v||!a)throw Error('Missing video or audio');
 const height=input.maxHeight?Math.min(v.height,input.maxHeight):v.height,width=height===v.height?v.width:Math.round(v.width*height/v.height/2)*2;
 if(!Number.isInteger(height)||height<2||height%2)throw Error('Invalid target height');
 const copy=height===v.height&&['h264','hevc'].includes(v.codec_name),large=width*height>1920*1080,codec=copy?v.codec_name:large?'hevc':'h264';
 if(!copy&&v.pix_fmt!=='yuv420p')throw Error('Source bit depth needs review');
 const output=join(folder,id+'.mp4'),partial=join(folder,id+'.partial.mp4');
 function validate(path){const o=probe(path),ov=o.streams.find(s=>s.codec_type==='video');if(ov?.width!==width||ov.height!==height||ov.pix_fmt!==v.pix_fmt||ov.codec_name!==codec||Math.abs(Number(o.format.duration)-Number(p.format.duration))>3||!o.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'&&s.channels===2))throw Error('Output validation failed');const rate=s=>{const[n,d]=s.avg_frame_rate.split('/').map(Number);return n/d};if(!Number.isFinite(rate(ov))||Math.abs(rate(ov)-rate(v))>.2)throw Error('Output frame rate changed')}
 Object.assign(state,{stage:copy?'preserving original video':'GPU compatibility conversion',width,height,codec});save();
 if(!existsSync(output)){
  const args=['-hide_banner','-v','error','-xerror','-y','-i',input.sourceVideo,'-map','0:v:0','-map','0:a:0','-c:v',copy?'copy':codec==='hevc'?'hevc_nvenc':'h264_nvenc'];
  if(!copy){if(height!==v.height)args.push('-vf',`scale=${width}:${height}:flags=lanczos`);args.push('-preset','p7','-tune','hq','-rc','vbr','-cq','12','-b:v','0','-spatial-aq','1','-temporal-aq','1','-rc-lookahead','32','-bf','3','-pix_fmt',v.pix_fmt,'-profile:v',codec==='hevc'?'main':'high','-level:v',codec==='hevc'?'5.1':'4.2','-maxrate',large?'30M':'20M','-bufsize',large?'60M':'40M','-g','120','-fps_mode','passthrough')}
  if(codec==='hevc')args.push('-tag:v','hvc1');
  args.push('-c:a',a.codec_name==='aac'&&a.channels===2?'copy':'aac');if(a.codec_name!=='aac'||a.channels!==2)args.push('-b:a','192k','-ac','2');
  args.push('-movflags','+faststart','-progress','pipe:1',partial);
  await run(join(bin,'ffmpeg.exe'),args,`logs/retro-${id}-encode.log`,line=>{if(line.startsWith('out_time_us=')){state.progress=Math.min(99,Number(line.slice(12))/1e6/Number(p.format.duration)*100);save()}});
  state.stage='validating output';save();validate(partial);renameSync(partial,output);
 }else validate(output);
 const thumbnail=join(manifestFolder,'thumbnail.webp');await sharp(input.thumbnail).rotate().resize(1280,720,{fit:'contain',background:'#000'}).webp({quality:80,effort:5}).toFile(thumbnail);
 if(input.subtitle)copyFileSync(input.subtitle,join(folder,id+'.en.vtt'));
 const manifest={...input,category:'movie',video:output,thumbnail,duration:Math.round(Number(p.format.duration)),processing:copy?'Original video copied':`${codec} NVENC CQ12; ${width}x${height}; original frame timing retained`};
 const manifestPath=join(manifestFolder,'media.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 state.stage='upload';state.progress=0;save();
 await run(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',manifestPath,'--folder',folder,'--resume','--concurrency','2'],`logs/retro-${id}-upload.log`,line=>{if(line.startsWith('KINGFLIX_UPLOAD_PROGRESS ')){const progress=JSON.parse(line.slice(24));Object.assign(state,progress);save()}});
 Object.assign(state,{stage:'completed',completed:1,progress:100,outputBytes:statSync(output).size,sourceBytes:original.size});save();
}catch(error){state.stage='failed';state.failures.push(error.message);save();throw error}
