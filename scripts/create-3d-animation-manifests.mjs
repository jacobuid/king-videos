import { execFile } from 'node:child_process'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync=promisify(execFile)
const source=resolve(process.argv[2]||'D:/king-videos/3D Animation-compressed')
const destination=resolve(process.argv[3]||'media-imports/3d-animation')
const definitions={
  'Big Hero 6 (2014)':{id:'big-hero-6',title:'Big Hero 6',date:'2014-11-07',year:2014,genres:['Animation','Action','Adventure','Family'],rating:'PG',wiki:'Big_Hero_6_(film)'},
  'Brave (2012)':{id:'brave',title:'Brave',date:'2012-06-22',year:2012,genres:['Animation','Adventure','Fantasy','Family'],rating:'PG',wiki:'Brave_(2012_film)'},
  'Cars (2006)':{id:'cars',title:'Cars',date:'2006-06-09',year:2006,genres:['Animation','Comedy','Family','Sports'],rating:'G',wiki:'Cars_(film)'},
  'Cars 2 (2011)':{id:'cars-2',title:'Cars 2',date:'2011-06-24',year:2011,genres:['Animation','Action','Comedy','Family'],rating:'G',wiki:'Cars_2'},
  'Coco (2017)':{id:'coco',title:'Coco',date:'2017-11-22',year:2017,genres:['Animation','Fantasy','Family','Music'],rating:'PG',wiki:'Coco_(2017_film)'},
  'Epic (2013)':{id:'epic-2013',title:'Epic',date:'2013-05-24',year:2013,genres:['Animation','Adventure','Fantasy','Family'],rating:'PG',wiki:'Epic_(2013_film)'},
  'Finding Dory (2016)':{id:'finding-dory',title:'Finding Dory',date:'2016-06-17',year:2016,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Finding_Dory'},
  'Finding Nemo (2003)':{id:'finding-nemo',title:'Finding Nemo',date:'2003-05-30',year:2003,genres:['Animation','Adventure','Comedy','Family'],rating:'G',wiki:'Finding_Nemo'},
  'Frozen (2013) [1080p]':{id:'frozen',title:'Frozen',date:'2013-11-27',year:2013,genres:['Animation','Fantasy','Family','Music'],rating:'PG',wiki:'Frozen_(2013_film)'},
  'Frozen II (2019)':{id:'frozen-2',title:'Frozen II',date:'2019-11-22',year:2019,genres:['Animation','Adventure','Fantasy','Family'],rating:'PG',wiki:'Frozen_II'},
  'Horton Hears A Who (2008)':{id:'horton-hears-a-who',title:'Horton Hears a Who!',date:'2008-03-14',year:2008,genres:['Animation','Adventure','Comedy','Family'],rating:'G',wiki:'Horton_Hears_a_Who!_(film)'},
  'How To Train Your Dragon (2010)':{id:'how-to-train-your-dragon',title:'How to Train Your Dragon',date:'2010-03-26',year:2010,genres:['Animation','Action','Adventure','Family'],rating:'PG',wiki:'How_to_Train_Your_Dragon_(film)'},
  'How To Train Your Dragon 2 (2014)':{id:'how-to-train-your-dragon-2',title:'How to Train Your Dragon 2',date:'2014-06-13',year:2014,genres:['Animation','Action','Adventure','Family'],rating:'PG',wiki:'How_to_Train_Your_Dragon_2'},
  'Ice Age (2002)':{id:'ice-age',title:'Ice Age',date:'2002-03-15',year:2002,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ice_Age_(2002_film)'},
  'Ice Age 2 - The Meltdown (2006)':{id:'ice-age-the-meltdown',title:'Ice Age: The Meltdown',date:'2006-03-31',year:2006,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ice_Age:_The_Meltdown'},
  'Ice Age 3 - Dawn of the Dinosaurs (2009)':{id:'ice-age-dawn-of-the-dinosaurs',title:'Ice Age: Dawn of the Dinosaurs',date:'2009-07-01',year:2009,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ice_Age:_Dawn_of_the_Dinosaurs'},
  'Ice Age 4 - Continental Drift (2012)':{id:'ice-age-continental-drift',title:'Ice Age: Continental Drift',date:'2012-07-13',year:2012,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ice_Age:_Continental_Drift'},
  'Ice Age 5 - Collision Course (2016)':{id:'ice-age-collision-course',title:'Ice Age: Collision Course',date:'2016-07-22',year:2016,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ice_Age:_Collision_Course'},
  'Inside Out (2015)':{id:'inside-out',title:'Inside Out',date:'2015-06-19',year:2015,genres:['Animation','Comedy','Drama','Family'],rating:'PG',wiki:'Inside_Out_(2015_film)'},
  'Kung Fu Panda (2008)':{id:'kung-fu-panda',title:'Kung Fu Panda',date:'2008-06-06',year:2008,genres:['Animation','Action','Comedy','Family'],rating:'PG',wiki:'Kung_Fu_Panda_(film)'},
  'Kung Fu Panda 2':{id:'kung-fu-panda-2',title:'Kung Fu Panda 2',date:'2011-05-26',year:2011,genres:['Animation','Action','Comedy','Family'],rating:'PG',wiki:'Kung_Fu_Panda_2'},
  'Kung Fu Panda 3 (2016)':{id:'kung-fu-panda-3',title:'Kung Fu Panda 3',date:'2016-01-29',year:2016,genres:['Animation','Action','Comedy','Family'],rating:'PG',wiki:'Kung_Fu_Panda_3'},
  'Kung Fu Panda 4 (2024) [720p] [WEBRip] [YTS.MX]':{id:'kung-fu-panda-4',title:'Kung Fu Panda 4',date:'2024-03-08',year:2024,genres:['Animation','Action','Comedy','Family'],rating:'PG',wiki:'Kung_Fu_Panda_4'},
  'Leap! (2016)':{id:'leap-2016',title:'Leap!',date:'2016-10-19',year:2016,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Ballerina_(2016_film)'},
  'Luca (2021)':{id:'luca',title:'Luca',date:'2021-06-18',year:2021,genres:['Animation','Adventure','Comedy','Family'],rating:'PG',wiki:'Luca_(2021_film)'}
}

async function duration(file){const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]);return Math.round(Number(stdout.trim()))}
const wait=milliseconds=>new Promise(done=>setTimeout(done,milliseconds))
async function description(page){for(let attempt=1;attempt<=6;attempt++){const response=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`,{headers:{'User-Agent':'King Videos metadata importer (private family media catalog)'}});if(response.ok){const result=await response.json();await wait(750);return result.extract}if(response.status!==429||attempt===6)throw new Error(`Wikipedia lookup failed for ${page} (${response.status})`);await wait(attempt*5000)}}

await mkdir(destination,{recursive:true})
const created=[]
for(const [folderName,definition] of Object.entries(definitions)){
  const folder=join(source,folderName),files=await readdir(folder),video=files.find(name=>extname(name).toLowerCase()==='.mp4'&&!name.endsWith('.partial.mp4')),thumbnail=files.find(name=>['.webp','.png','.jpg','.jpeg'].includes(extname(name).toLowerCase()))
  if(!video||!thumbnail)continue
  const videoPath=join(folder,video)
  if(!(await stat(videoPath)).size)continue
  const manifest={id:definition.id,title:definition.title,description:await description(definition.wiki),date:definition.date,year:definition.year,category:'movie',genres:definition.genres,rating:definition.rating,kids:true,blocked:false,duration:await duration(videoPath),video,thumbnail,metadataSource:`https://en.wikipedia.org/wiki/${definition.wiki}`,sourceFolder:folderName}
  const manifestFolder=join(destination,definition.id);await mkdir(manifestFolder,{recursive:true});await writeFile(join(manifestFolder,'media.json'),`${JSON.stringify(manifest,null,2)}\n`);created.push(definition.id);console.log(`Created ${definition.id}`)
}
console.log(`Created ${created.length} completed movie manifests in ${destination}`)
