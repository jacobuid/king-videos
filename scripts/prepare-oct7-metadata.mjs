import {readFileSync,writeFileSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
import {classicGenres} from './media-genres.mjs';
const entries=[
['a-christmas-story','tt0085334','PG','A_Christmas_Story','Young Ralphie dreams of receiving a Red Ryder BB gun for Christmas, despite repeated warnings from the adults around him.'],
['ant-man','tt0478970','PG-13','Ant-Man_(film)','Scott Lang joins scientist Hank Pym on a dangerous heist using a suit that lets him shrink in size while gaining extraordinary strength.'],
['aquaman','tt1477834','PG-13','Aquaman_(film)','Arthur Curry must embrace his Atlantean heritage and prevent a war between the underwater kingdoms and the surface world.'],
['avatar','tt0499549','PG-13','Avatar_(2009_film)','On Pandora, former Marine Jake Sully becomes part of the Na’vi world and faces a choice between his mission and the people he has come to love.'],
['the-avengers','tt0848228','PG-13','The_Avengers_(2012_film)','Nick Fury brings together Earth’s mightiest heroes to stop Loki and an alien army from conquering the planet.'],
['avengers-age-of-ultron','tt2395427','PG-13','Avengers:_Age_of_Ultron','The Avengers reunite when an artificial intelligence created to protect humanity becomes a threat to its survival.'],
['avengers-endgame','tt4154796','PG-13','Avengers:_Endgame','After Thanos’s devastating victory, the surviving Avengers undertake a final mission to bring back those they lost.'],
['avengers-infinity-war','tt4154756','PG-13','Avengers:_Infinity_War','The Avengers and their allies battle Thanos as he searches for the Infinity Stones and the power to reshape the universe.'],
['back-to-the-future','tt0088763','PG','Back_to_the_Future','Teenager Marty McFly travels to 1955 in Doc Brown’s time machine and must reunite his future parents before he can return home.'],
['back-to-the-future-part-ii','tt0096874','PG','Back_to_the_Future_Part_II','Marty and Doc travel into the future, then race to repair a changed timeline after a sports almanac falls into the wrong hands.'],
['batman-begins','tt0372784','PG-13','Batman_Begins','Bruce Wayne returns to Gotham and becomes Batman, confronting the corruption and fear that threaten his city.'],
['the-dark-knight','tt0468569','PG-13','The_Dark_Knight','Batman, Jim Gordon and Harvey Dent fight organized crime in Gotham as the Joker pushes the city toward chaos.'],
['the-dark-knight-rises','tt1345836','PG-13','The_Dark_Knight_Rises','Years after retreating from public life, Bruce Wayne returns as Batman when Bane threatens to destroy Gotham.'],
['battle-los-angeles','tt1217613','PG-13','Battle:_Los_Angeles','A squad of Marines fights to rescue civilians in Los Angeles during a devastating alien invasion.'],
['battleship','tt1440129','PG-13','Battleship_(film)','A naval exercise becomes a battle for survival when an alien force traps a fleet near Hawaii.'],
['ben-hur-1959','tt0052618','G','Ben-Hur_(1959_film)','Betrayed by his childhood friend and condemned to slavery, Judah Ben-Hur returns to seek justice in Roman-occupied Judea.'],
['ben-hur-2016','tt2638144','PG-13','Ben-Hur_(2016_film)','Judah Ben-Hur survives years of slavery and returns to confront the adopted brother who betrayed him.']
];
const wanted=new Map(entries.map(e=>[e[1],e])),matches=new Map();
const response=await fetch('https://datasets.imdbws.com/title.basics.tsv.gz');
if(!response.ok)throw Error('IMDb dataset HTTP '+response.status);
const stream=Readable.fromWeb(response.body).pipe(createGunzip());
for await(const line of createInterface({input:stream,crlfDelay:Infinity})){
 const f=line.split('\t');if(!wanted.has(f[0]))continue;
 matches.set(f[0],{imdbId:f[0],title:f[2],year:Number(f[5]),genres:f[8].split(',')});
 if(matches.size===entries.length){stream.destroy();break;}
}
if(matches.size!==entries.length)throw Error('Missing IMDb matches');
for(const [id,imdbId,rating,wiki,description] of entries){
 const path=`media-imports/oct7-movies/${id}/media.json`,m=JSON.parse(readFileSync(path,'utf8')),match=matches.get(imdbId);
 if(match.year!==m.year)throw Error('IMDb year mismatch '+id);
 Object.assign(m,{description,rating,minAge:rating==='PG-13'?16:rating==='R'?21:0,kids:rating==='G'||rating==='PG',genres:classicGenres(match.genres.map(g=>g==='Sci-Fi'?'Science Fiction':g==='Sport'?'Sports':g),m.year),imdbId,metadataPending:false,metadataSources:[`https://www.imdb.com/title/${imdbId}/`,`https://en.wikipedia.org/wiki/${wiki}`],genreSource:'https://datasets.imdbws.com/title.basics.tsv.gz'});
 writeFileSync(path,JSON.stringify(m,null,2)+'\n');
}
writeFileSync('media-imports/oct7-movie-metadata.json',JSON.stringify([...matches.values()],null,2)+'\n');
console.log('Prepared verified genres and metadata for '+entries.length+' movies');
