import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import sharp from 'sharp';
import {classicGenres} from './media-genres.mjs';
const jobs=JSON.parse(readFileSync('logs/new-movies-oct7-next-scan.json','utf8')).filter(j=>!j.excluded);
const definitions=[
 ['captain-america-civil-war','tt3498820','PG-13','Political pressure divides the Avengers into opposing teams led by Steve Rogers and Tony Stark.'],
 ['captain-america-the-first-avenger','tt0458339','PG-13','During World War II, Steve Rogers becomes a super soldier and confronts the Red Skull and HYDRA.'],
 ['captain-america-the-winter-soldier','tt1843866','PG-13','Steve Rogers and Natasha Romanoff uncover a conspiracy within S.H.I.E.L.D. while facing the mysterious Winter Soldier.'],
 ['casablanca','tt0034583','PG','In wartime Casablanca, nightclub owner Rick Blaine must decide whether to help his former love and her husband escape the Nazis.'],
 ['national-lampoons-christmas-vacation','tt0097958','PG-13','Clark Griswold plans a perfect family Christmas, but visiting relatives and a string of disasters derail his holiday.'],
 ['christmas-with-the-kranks','tt0388419','PG','A couple decides to skip Christmas and take a cruise, only to scramble when their daughter announces a surprise holiday visit.'],
 ['chronicle','tt1706593','PG-13','Three teenagers gain telekinetic abilities after discovering a mysterious object, but their new powers soon test their friendship.'],
 ['contact','tt0118884','PG','Astronomer Ellie Arroway discovers a signal from another civilization and joins an effort to make first contact.'],
 ['contagion','tt1598778','PG-13','As a deadly virus spreads worldwide, scientists race to find a vaccine while communities struggle with fear and misinformation.'],
 ['d2-the-mighty-ducks','tt0109520','PG','Coach Gordon Bombay reunites the Ducks to represent the United States in an international youth hockey tournament.'],
 ['d3-the-mighty-ducks','tt0116000','PG','The Ducks receive scholarships to a prestigious school, where a new coach and a rival varsity team challenge their unity.'],
 ['daredevil','tt0287978','R','Blind lawyer Matt Murdock fights crime as Daredevil, confronting the Kingpin, the assassin Bullseye and a dangerous new romance.'],
 ['deepwater-horizon','tt1860357','PG-13','Workers aboard the Deepwater Horizon drilling rig struggle to survive a catastrophic blowout in the Gulf of Mexico.'],
 ['despicable-me-4','tt7510222','PG','Gru and his family enter witness protection when escaped villain Maxime Le Mal sets out for revenge.']
];
const cache='media-imports/oct7-next-movie-metadata.json';
let metadata=existsSync(cache)?JSON.parse(readFileSync(cache,'utf8')):null;
if(!metadata){
 const wanted=new Map(definitions.map(d=>[d[1],d])),matches=new Map();
 const controller=new AbortController(),response=await fetch('https://datasets.imdbws.com/title.basics.tsv.gz',{signal:controller.signal});if(!response.ok)throw Error('IMDb HTTP '+response.status);
 const source=Readable.fromWeb(response.body),stream=source.pipe(createGunzip());source.on('error',error=>stream.destroy(error));
 try{for await(const line of createInterface({input:stream,crlfDelay:Infinity})){const f=line.split('\t');if(!wanted.has(f[0]))continue;const [id,imdbId,rating,description]=wanted.get(f[0]),job=jobs.find(j=>j.id===id);if(Number(f[5])!==job.year)throw Error('IMDb year mismatch '+id);matches.set(imdbId,{id,imdbId,rating,description,year:job.year,genres:classicGenres(f[8].split(',').map(g=>g==='Sci-Fi'?'Science Fiction':g==='Sport'?'Sports':g),job.year),minAge:rating==='PG-13'?16:rating==='R'?21:0,kids:rating==='PG'||rating==='G',metadataPending:false,genreSource:'https://datasets.imdbws.com/title.basics.tsv.gz',metadataSources:[`https://www.imdb.com/title/${imdbId}/`],...(id==='daredevil'?{edition:'Director’s cut',ratingSource:'https://en.wikipedia.org/wiki/Daredevil_(film)'}:{})});if(matches.size===jobs.length)break;}}
 finally{controller.abort();source.destroy();stream.destroy();}
 if(matches.size!==jobs.length)throw Error('Missing IMDb matches');metadata=[...matches.values()];writeFileSync(cache,JSON.stringify(metadata,null,2)+'\n');
}
const reportPath='logs/oct7-next-movies-published.json',report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{published:[],total:jobs.length};
const published=new Set(report.published.map(m=>m.id));
while(published.size<jobs.length){
 const completed=existsSync('logs/new-movies-oct7-next-completed.jsonl')?readFileSync('logs/new-movies-oct7-next-completed.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
 for(const item of completed){
  if(published.has(item.id))continue;
  try{
   const job=jobs.find(j=>j.id===item.id),folder=resolve(`media-imports/oct7-next-movies/${item.id}`),path=join(folder,'media.json'),m=JSON.parse(readFileSync(path,'utf8'));
   const thumbnail=join(folder,'thumbnail.webp');
   if(!existsSync(thumbnail)){const images=readdirSync(dirname(job.path)).filter(f=>/\.(png|webp|jpe?g)$/i.test(f)&&!/^www\./i.test(f));if(images.length!==1)continue;await sharp(join(dirname(job.path),images[0])).resize({width:1280,withoutEnlargement:true}).webp({quality:88}).toFile(thumbnail);}
   Object.assign(m,metadata.find(d=>d.id===item.id));writeFileSync(path,JSON.stringify(m,null,2)+'\n');
   const r=spawnSync(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/import-b2-movie.mjs',path,'--folder',dirname(m.video),'--resume','--concurrency','2'],{encoding:'utf8',windowsHide:true});
   if(r.status!==0)throw Error(r.stderr||r.stdout||'Import failed');console.log(r.stdout.trim());published.add(item.id);report.published.push({id:item.id,title:m.title,publishedAt:new Date().toISOString()});report.completed=published.size;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }catch(error){console.error(item.id,error.message);}
 }
 if(published.size<jobs.length)await new Promise(done=>setTimeout(done,60000));
}
console.log('All new movies published');
