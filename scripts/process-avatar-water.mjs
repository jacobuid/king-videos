import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,copyFileSync,renameSync,statSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createGunzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
import sharp from 'sharp';
const input=JSON.parse(readFileSync('logs/avatar-way-of-water-probe.json','utf8')),id='avatar-the-way-of-water';
const folder=`C:/Users/jacob/Downloads/KINGFLIX/web-ready/${id}`,manifestFolder=resolve(`media-imports/${id}`);
mkdirSync(folder,{recursive:true});mkdirSync(manifestFolder,{recursive:true});
const video=join(folder,id+'.mp4'),partial=join(folder,id+'.partial.mp4');
const packages=join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe'),bin=join(packages,readdirSync(packages).find(f=>f.startsWith('ffmpeg-')),'bin');
const status={total:1,completed:0,stage:'prepare',progress:0,failures:[],source:input.source,output:video};
function save(){status.updatedAt=new Date().toISOString();writeFileSync('logs/avatar-water-status.json',JSON.stringify(status,null,2));}
function validate(path){const r=spawnSync(join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8',windowsHide:true});if(r.error||r.status!==0)throw Error('Output probe failed');const p=JSON.parse(r.stdout),v=p.streams.find(s=>s.codec_type==='video'),original=input.streams.find(s=>s.codec_type==='video'),audio=p.streams.filter(s=>s.codec_type==='audio');if(v.codec_name!=='h264'||v.width!==original.width||v.height!==original.height||Math.abs(Number(p.format.duration)-Number(input.format.duration))>1||audio.length!==2||audio[0].channels!==2||audio[1].channels!==6)throw Error('Output validation failed');}
async function run(command,args,onData){await new Promise((done,reject)=>{const child=spawn(command,args,{windowsHide:true});child.stdout.on('data',d=>{appendFileSync('logs/avatar-water-process.log',d);onData?.(d.toString())});child.stderr.on('data',d=>appendFileSync('logs/avatar-water-process.log',d));child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('Process exited '+code)));});}
try{
 save();
 if(!existsSync(video)){
  await run(join(bin,'ffmpeg.exe'),['-hide_banner','-v','error','-y','-i',input.source,'-map','0:v:0','-map','0:a:0','-map','0:a:0','-c:v','copy','-c:a:0','aac','-b:a:0','192k','-ac:a:0','2','-c:a:1','copy','-disposition:a:0','default','-disposition:a:1','0','-movflags','+faststart','-progress','pipe:1',partial],data=>{const m=data.match(/out_time_us=(\d+)/);if(m){status.progress=Math.min(99,Number(m[1])/1e6/Number(input.format.duration)*100);save();}});
  validate(partial);renameSync(partial,video);
 }else validate(video);
 const thumbnail=join(manifestFolder,'thumbnail.webp');await sharp('C:/Users/jacob/Downloads/KINGFLIX/thumbnails/avatar 2 the way of water.jpg').resize(1280,720,{fit:'contain',background:'#000000'}).webp({quality:80,effort:5}).toFile(thumbnail);
 copyFileSync('C:/Users/jacob/Downloads/KINGFLIX/videos/Avatar.The.Way.Of.Water.2022.1080p.WEBRip.x264.AAC5.1-[YTS.MX].srt',join(folder,id+'.en.srt'));
 status.stage='metadata';status.progress=0;save();
 const cachedPath=join(manifestFolder,'media.json');let genres=existsSync(cachedPath)?JSON.parse(readFileSync(cachedPath,'utf8')).genres:null;
 if(!genres){const response=await fetch('https://datasets.imdbws.com/title.basics.tsv.gz');if(!response.ok)throw Error('IMDb dataset HTTP '+response.status);const sourceStream=Readable.fromWeb(response.body),stream=sourceStream.pipe(createGunzip());sourceStream.on('error',error=>stream.destroy(error));
 for await(const line of createInterface({input:stream,crlfDelay:Infinity})){const f=line.split('\t');if(f[0]==='tt1630029'){if(Number(f[5])!==2022)throw Error('IMDb year mismatch');genres=f[8].split(',').map(g=>g==='Sci-Fi'?'Science Fiction':g);sourceStream.destroy();stream.destroy();break;}}
 }
 if(!genres)throw Error('IMDb match missing');
 const manifest={id,title:'Avatar: The Way of Water',category:'movie',year:2022,date:'2022-12-16',duration:Math.round(Number(input.format.duration)),rating:'PG-13',minAge:16,kids:false,genres,description:'Jake Sully and Neytiri seek refuge with their children among Pandora’s ocean clans, but a returning threat forces the family to fight for their new home.',video,thumbnail,sourceVideo:input.source,originalBytes:statSync(input.source).size,preparedBytes:statSync(video).size,processing:'Original 1920x1036 H.264 video copied without re-encoding; original 5.1 AAC retained plus stereo AAC compatibility track; fast-start MP4',imdbId:'tt1630029',genreSource:'https://datasets.imdbws.com/title.basics.tsv.gz',metadataSources:['https://www.imdb.com/title/tt1630029/','https://movies.disney.com/avatar-the-way-of-water'],metadataPending:false};
 const manifestPath=join(manifestFolder,'media.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 status.stage='upload';save();
 await run(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',manifestPath,'--folder',folder,'--resume','--concurrency','2'],data=>{for(const line of data.split('\n'))if(line.startsWith('KINGFLIX_UPLOAD_PROGRESS ')){try{const p=JSON.parse(line.slice(24));Object.assign(status,{progress:p.progress,bytesSent:p.bytesSent,totalBytes:p.totalBytes});save();}catch{}}});
 status.stage='completed';status.progress=100;status.completed=1;save();
}catch(error){status.stage='failed';status.failures.push(error.message);save();throw error;}
