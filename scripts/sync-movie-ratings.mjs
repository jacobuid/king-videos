import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Source-backed US certifications; never infer a certification from a genre or age.
const apply=process.argv.includes('--apply'),discover=process.argv.includes('--discover');
const dataPath='media-imports/movie-ratings.json';
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'};
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
const databases=await (await fetch(base,{headers})).json();
const db=databases.result?.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
if(!db)throw Error('Database not found');
async function query(sql,params=[]){const r=await fetch(`${base}/${db.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});const j=await r.json();if(!r.ok||!j.success)throw Error(JSON.stringify(j.errors));return j.result.flatMap(x=>x.results||[]);}
const catalog=await query("SELECT id,title,year,rating FROM media WHERE category='movie'");
const manifests=[];
function walk(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory())walk(p);else if(f.name==='media.json'){const m=JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));if(m.category==='movie')manifests.push({path:p,media:m});}}}
walk('media-imports');
const sources=existsSync(dataPath)?JSON.parse(readFileSync(dataPath,'utf8')):{};
const norm=s=>s.toLowerCase().replace(/&amp;/g,'and').replace(/&/g,'and').normalize('NFKD').replace(/[^a-z0-9]/g,'').replace(/^the/,'');
const aliases={
  '101-dalmatians':['101-dalmatians','101_dalmatians_1961'],
  '101-dalmatians-2-patch-s-london-adventure':['101-dalmatians-ii-patchs-london-adventure','101_dalmatians_ii_patchs_london_adventure'],
  'cinderella':['cinderella-1950','cinderella'],
  'alice-in-wonderland':['alice-in-wonderland-1951','alice_in_wonderland_1951'],
  'the-jungle-book':['the-jungle-book-1967','the_jungle_book_1967'],
  'the-lion-king':['the-lion-king-1994','lion_king'],
  'the-lion-king-1-1-5-hakuna-matata':['the-lion-king-1-12','the_lion_king_1_12'],
  'atlantis-2-milo-s-return':['atlantis-milos-return','atlantis_milos_return'],
  'belle-s-magical-world':['belles-magical-world','belles_magical_world'],
  'lilo-and-stitch':['lilo-and-stitch','lilo_and_stitch'],
  'laputa-castle-in-the-sky':['castle-in-the-sky','castle_in_the_sky'],
  'polar-express':['the-polar-express','polar_express'],
  'the-legend-of-tarzan':['the-legend-of-tarzan','the_legend_of_tarzan'],
  'lilo-and-stitch-2-stitch-has-a-glitch':['lilo-stitch-2-stitch-has-a-glitch','lilo_and_stitch_2'],
  'buzz-lightyear-of-star-command-the-adventure-begins':['buzz-lightyear-of-star-command','buzz_lightyear_of_star_command_the_adventure_begins'],
  'pocahontas-ii-journey-to-a-new-world':['pocahontas-ii','pocahontas_ii_journey_to_a_new_world'],
  'the-little-mermaid-2-return-to-the-sea':['the-little-mermaid-ii-return-to-the-sea','little_mermaid_ii_return_to_the_sea'],
  'the-love-bug':['the-love-bug-1969','love_bug'],
  'that-darn-cat':['that-darn-cat-1965','1002147-that_darn_cat'],
  'the-land-before-time':['the-land-before-time','land_before_time'],
  'the-pagemaster':['the-pagemaster','pagemaster'],
  'aladdin':['aladdin','aladdin_1992'],
  'beauty-and-the-beast':['beauty-and-the-beast','beauty_and_the_beast_1991'],
  'only-yesterday':['only-yesterday','only_yesterday_1991'],
  'my-little-pony-the-movie':['my-little-pony-the-movie','my_little_pony_the_movie_2017'],
  'the-transformers-the-movie':['the-transformers-the-movie','transformers_the_movie'],
  'charlie-brown-bon-voyage':['bon-voyage-charlie-brown','bon_voyage_charlie_brown'],
  'charlie-brown-christmas':['a-charlie-brown-christmas','charlie_brown_christmas'],
  'charlie-brown-thanksgiving':['a-charlie-brown-thanksgiving','charlie_brown_thanksgiving'],
  'charlie-brown-great-pumpkin':['its-the-great-pumpkin-charlie-brown','its_the_great_pumpkin_charlie_brown'],
};
const allowed=new Set(['G','PG','PG-13','R','NC-17','NR','TV-G','TV-PG','TV-Y','TV-Y7','TV-14','TV-MA']);
async function lookup(row){
  const slug=row.title.toLowerCase().replace(/&/g,'and').replace(/[’':!,.?()]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const candidates=[`https://movies.disney.com/${aliases[row.id]?.[0]||slug}`,`https://www.rottentomatoes.com/m/${aliases[row.id]?.[1]||slug.replaceAll('-','_')}`];
  for(const url of candidates){try{
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)continue;
    const html=await response.text();
    for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)){
      let parsed;try{parsed=JSON.parse(match[1]);}catch{continue;}
      for(const m of [parsed,...(Array.isArray(parsed)?parsed:parsed['@graph']||[])]){
        if(m['@type']!=='Movie'||!allowed.has(m.contentRating))continue;
        const names=[row.title];if(row.id==='101-dalmatians')names.push('101 Dalmatians');if(row.id==='laputa-castle-in-the-sky')names.push('Castle in the Sky');
        const sourceName=(m.name||'').replace(/^Walt Disney's /i,'').replace(/\s*\((?:Signature Collection|Diamond Edition)\)/i,'').replace(/ Official Site presented by Disney Movies$/i,'');
        if(row.id==='the-lion-king-1-1-5-hakuna-matata')names.push('The Lion King 1 1/2');
        if(!names.some(n=>norm(n)===norm(sourceName)))continue;
        const year=Number(String(m.dateCreated||'').slice(0,4));
        // Foreign releases may have later US theatrical dates. Disney remakes must match exactly.
        const lateUsRelease=['only-yesterday','whisper-of-the-heart','nausicaa-of-the-valley-of-the-wind'].includes(row.id);
        if(year&&row.year&&(url.includes('disney.com')?Math.abs(year-row.year)>1:!lateUsRelease&&Math.abs(year-row.year)>5))continue;
        return {rating:m.contentRating,source:url,sourceTitle:m.name,sourceDate:m.dateCreated||null,year:row.year};
      }
    }
  }catch(error){console.warn(`${row.title}: ${error.message}`);}}
  return null;
}
if(discover){const pending=[...new Map([...catalog.filter(r=>!r.rating),...manifests.map(m=>m.media).filter(m=>!m.rating)].map(m=>[m.id,m])).values()].filter(m=>!sources[m.id]);let next=0;
await Promise.all([1,2,3].map(async()=>{while(next<pending.length){const row=pending[next++],found=await lookup(row);if(found)sources[row.id]=found;console.log(`${row.title}: ${found?.rating||'needs source'}`);writeFileSync(dataPath,JSON.stringify(sources,null,2)+'\n');}}));}
let local=0,live=0;
if(apply){for(const {path,media} of manifests){const entry=sources[media.id];if(entry&&!media.rating){media.rating=entry.rating;media.ratingSource=entry.source;writeFileSync(path,JSON.stringify(media,null,2)+'\n');local++;}}
for(const row of catalog){const entry=sources[row.id];if(entry&&!row.rating){await query("UPDATE media SET rating=? WHERE id=? AND (rating IS NULL OR TRIM(rating)='')",[entry.rating,row.id]);live++;}}}
const remaining=(await query("SELECT id,title,year FROM media WHERE category='movie' AND (rating IS NULL OR TRIM(rating)='')"));
mkdirSync('logs',{recursive:true});writeFileSync('logs/movie-ratings-report.json',JSON.stringify({localUpdated:local,liveUpdated:live,remaining},null,2));
console.log(JSON.stringify({localUpdated:local,liveUpdated:live,remaining:remaining.length}));
