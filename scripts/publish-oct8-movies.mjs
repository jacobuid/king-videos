import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import sharp from 'sharp';
import {classicGenres} from './media-genres.mjs';
const jobs=JSON.parse(readFileSync('logs/new-movies-oct8-scan.json','utf8')).filter(j=>!j.excluded);
const definitions=JSON.parse(readFileSync('media-imports/oct8-movie-definitions.json','utf8'));
const cache='media-imports/oct8-movie-metadata.json';
let metadata=existsSync(cache)?JSON.parse(readFileSync(cache,'utf8')):null;
if(!metadata){
 const wanted=new Map(definitions.map(d=>[d[1],d])),matches=new Map();
 const controller=new AbortController(),response=await fetch('https://datasets.imdbws.com/title.basics.tsv.gz',{signal:controller.signal});if(!response.ok)throw Error('IMDb HTTP '+response.status);
 const source=Readable.fromWeb(response.body),stream=source.pipe(createGunzip());source.on('error',error=>stream.destroy(error));
 try{for await(const line of createInterface({input:stream,crlfDelay:Infinity})){const f=line.split('\t');if(!wanted.has(f[0]))continue;const [id,imdbId,rating,description,availableAge,edition]=wanted.get(f[0]),job=jobs.find(j=>j.id===id);if(Number(f[5])!==job.year)throw Error('IMDb year mismatch '+id);matches.set(imdbId,{id,imdbId,rating,description,year:job.year,genres:classicGenres(f[8].split(',').map(g=>g==='Sci-Fi'?'Science Fiction':g==='Sport'?'Sports':g),job.year),minAge:availableAge??(rating==='PG-13'?16:rating==='R'?21:0),kids:rating==='PG'||rating==='G',metadataPending:false,genreSource:'https://datasets.imdbws.com/title.basics.tsv.gz',metadataSources:[`https://www.imdb.com/title/${imdbId}/`],...(id==='daredevil'?{edition:'Director’s cut',ratingSource:'https://en.wikipedia.org/wiki/Daredevil_(film)'}:{})});if(matches.size===jobs.length)break;}}
 finally{controller.abort();source.destroy();stream.destroy();}
 if(matches.size!==jobs.length)throw Error('Missing IMDb matches');metadata=[...matches.values()];writeFileSync(cache,JSON.stringify(metadata,null,2)+'\n');
}
const reportPath='logs/oct8-movies-published.json',report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{published:[],total:jobs.length};
const published=new Set(report.published.map(m=>m.id));
while(published.size<jobs.length){
 const completed=existsSync('logs/new-movies-oct8-completed.jsonl')?readFileSync('logs/new-movies-oct8-completed.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
 for(const item of completed){
  if(published.has(item.id))continue;
  try{
   const job=jobs.find(j=>j.id===item.id),folder=resolve(`media-imports/oct8-movies/${item.id}`),path=join(folder,'media.json'),m=JSON.parse(readFileSync(path,'utf8'));
   const thumbnail=join(folder,'thumbnail.webp');
   if(!existsSync(thumbnail)){const images=readdirSync(dirname(job.path)).filter(f=>/\.(png|webp|avif|jpe?g)$/i.test(f)&&!/^www\./i.test(f));if(images.length!==1)continue;await sharp(join(dirname(job.path),images[0])).resize(1280,720,{fit:'contain',background:'#000000'}).webp({quality:80,effort:5}).toFile(thumbnail);}
   Object.assign(m,metadata.find(d=>d.id===item.id));writeFileSync(path,JSON.stringify(m,null,2)+'\n');
   const r=spawnSync(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',path,'--folder',dirname(m.video),'--resume','--concurrency','2'],{encoding:'utf8',windowsHide:true});
   if(r.status!==0)throw Error(r.stderr||r.stdout||'Import failed');console.log(r.stdout.trim());published.add(item.id);report.published.push({id:item.id,title:m.title,publishedAt:new Date().toISOString()});report.completed=published.size;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }catch(error){console.error(item.id,error.message);}
 }
 if(published.size<jobs.length)await new Promise(done=>setTimeout(done,60000));
}
console.log('All new movies published');
