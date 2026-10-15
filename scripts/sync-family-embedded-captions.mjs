import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,statSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const sources=JSON.parse(readFileSync('logs/oct10-family-scan.json','utf8')).filter(r=>r.folder.startsWith('Avatar The Last')||r.folder==='PAW Patrol The Dino Movie');
const packages=join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe'),bin=join(packages,readdirSync(packages).find(n=>n.startsWith('ffmpeg-')),'bin');
const state={total:sources.length,completed:0,failures:[],items:[]},statusPath='logs/oct10-family-captions-status.json';
function save(){state.updatedAt=new Date().toISOString();writeFileSync(statusPath,JSON.stringify(state,null,2));}save();
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const db=(await json(base,{headers})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
async function query(sql,params){const r=await json(`${base}/${db.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});if(!r.success)throw Error('D1 failed');return r.result[0].results;}
for(const source of sources){
 const direct=source.name.match(/S(\d+)E(\d+)/i),id=direct?`avatar-the-last-airbender-2024-s${direct[1]}e${direct[2]}`:'paw-patrol-the-dino-movie';
 try{
  state.active=id;state.stage='waiting for publication';save();
  const manifest=resolve('media-imports/oct10-family',id,'media.json');
  let record;while(true){record=(await query('SELECT id,subtitle_key FROM media WHERE id=?',[id]))[0];if(record&&existsSync(manifest))break;await new Promise(done=>setTimeout(done,60000));}
  const p=spawnSync(join(bin,'ffprobe.exe'),['-v','error','-show_streams','-of','json',source.path],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error('Subtitle source probe failed');
  const track=JSON.parse(p.stdout).streams.filter(s=>s.codec_type==='subtitle'&&s.tags?.language==='eng'&&!s.disposition?.forced&&['subrip','ass','ssa','webvtt','mov_text'].includes(s.codec_name)).sort((a,b)=>Number(/sdh/i.test(a.tags?.title||''))-Number(/sdh/i.test(b.tags?.title||'')))[0];if(!track)throw Error('No full English text subtitle');
  const folder=resolve('C:/Users/jacob/Downloads/KINGFLIX/web-ready/oct10-family',id);mkdirSync(folder,{recursive:true});
  const srt=join(folder,id+'.en.srt');
  state.stage='extracting English captions';save();
  const extraction=spawnSync(join(bin,'ffmpeg.exe'),['-v','error','-y','-i',source.path,'-map',`0:${track.index}`,'-c:s','srt',srt],{encoding:'utf8',windowsHide:true,timeout:120000});if(extraction.status!==0||!existsSync(srt)||statSync(srt).size<2000)throw Error('Subtitle extraction failed');
  state.stage='uploading captions';save();
  const upload=spawnSync(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',manifest,'--folder',folder,'--upload-only','--subtitles-only','--resume'],{encoding:'utf8',windowsHide:true,timeout:120000});appendFileSync('logs/oct10-family-captions-run.log',upload.stdout||'');if(upload.status!==0)throw Error('Caption upload failed');
  const key=`movies/${id}/${id}.en.vtt`;await query('UPDATE media SET subtitle_key=? WHERE id=?',[key,id]);
  state.completed++;state.items.push({id,subtitleKey:key,sourceTrack:track.index,language:'eng'});save();
 }catch(error){state.failures.push({id,error:error.message});save();}
}
state.stage=state.failures.length?'needs review':'complete';delete state.active;save();
