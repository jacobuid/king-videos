import {readFileSync,writeFileSync,existsSync} from 'node:fs';

// Fix season prefixes retained by filenames that use a fullwidth colon.
// This is metadata-only; it never changes sources or uploaded video objects.
const scan=JSON.parse(readFileSync('logs/oct10-family-scan.json','utf8'));
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'};
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
const base=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
const db=(await json(base,{headers})).result.find(d=>d.name===(process.env.D1_DATABASE||'king-videos-prod'));
if(!db)throw Error('Database not found');
let updated=0,pending=0;
for(const row of scan){
 if(!/^Franklin Season\s+\d+\s*：/.test(row.name))continue;
 const season=Number(row.name.match(/Season\s+(\d+)/)[1]),episode=Number(row.name.match(/Ep\.\s*(\d+)/)[1])-(season-1)*13;
 const id=`franklin-s${String(season).padStart(2,'0')}e${String(episode).padStart(3,'0')}`;
 const title=row.name.replace(/^.*?Season\s+\d+\s*[-｜:：]\s*/i,'').replace(/\s*-\s*Ep\..*$/i,'').replaceAll('⧸',' / ').trim();
 const result=await json(`${base}/${db.uuid}/query`,{method:'POST',headers,body:JSON.stringify({sql:'UPDATE media SET title=? WHERE id=? AND series_id=? RETURNING id',params:[title,id,'franklin']})});
 if(!result.success)throw Error('Title update failed');
 if(!result.result[0].results.length){pending++;continue;}
 const path=`media-imports/oct10-family/${id}/media.json`;
 if(existsSync(path)){const manifest=JSON.parse(readFileSync(path,'utf8'));manifest.title=title;writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');}
 updated++;
}
console.log(JSON.stringify({updated,pending}));
