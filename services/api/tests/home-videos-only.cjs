const {test}=require('node:test')
const assert=require('node:assert/strict')
const {registerHooks}=require('node:module')
const {createHmac}=require('node:crypto')
registerHooks({resolve(specifier,context,next){
 if(specifier==='@jacobuid/king-auth/verifier')return {url:'data:text/javascript,export const createKingAuthVerifier=()=>({getSession:async()=>({user:{id:"user",emailVerified:true}})})',shortCircuit:true}
 if(specifier.startsWith('.')&&context.parentURL?.includes('/services/api/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context)
 return next(specifier,context)
}})
const loaded=import('../src/index.ts')
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}}
const secret='test-secret',body=Buffer.from(JSON.stringify({userId:'user',profileId:'profile',version:1,expires:Date.now()+60000})).toString('base64url'),token=body+'.'+createHmac('sha256',secret).update(body).digest('base64url')
async function call(path,restricted,category,method='POST',catalogSize=120){
  const queries=[]
  const env={APP_SIGNING_SECRET:secret,WEB_ORIGIN:'https://example.com',DB:{prepare(sql){const statement={bind(...args){queries.push({sql,args});return statement},async first(){return sql.includes('FROM profiles')?{pin_version:1,home_videos_only:restricted,date_of_birth:'1990-01-01'}:{id:'video',category,min_age:0,blocked:0,video_key:'movies/test.mp4',mime_type:'video/mp4',source_url:null,subtitle_url:null,subtitle_key:null}},async all(){return {results:Array.from({length:catalogSize},(_,i)=>({id:String(i),title:'Video '+i,category:i%2?'Home Videos':'Movies',min_age:0,genres:'[]'})),meta:{rows_read:catalogSize}}}};return statement}}}
  const request=new Request('https://example.com'+path,{method,headers:{Origin:'https://example.com',Authorization:'Bearer test-credential','X-Profile-Token':token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({profileId:'profile'})}:{})})
  return {response:await (await loaded).default.fetch(request,env,{}),queries}
}
test('restricted profile rejects movie playback and details',async()=>{
  assert.equal((await call('/api/media/video/play',1,'Movies')).response.status,403)
  assert.equal((await call('/api/media/video?profileId=profile',1,'Movies','GET')).response.status,403)
})
test('restricted profile allows home video category variants',async()=>{
  for(const category of ['Home Videos','home-videos','HomeVideo'])assert.equal((await call('/api/media/video/play',1,category)).response.status,200)
})
test('unrestricted profile still plays movies',async()=>assert.equal((await call('/api/media/video/play',0,'Movies')).response.status,200))
test('catalog restriction is applied before pagination for all catalog routes',async()=>{
  for(const route of ['library','home','search'])for(const restricted of [0,1]){
    const {response,queries}=await call('/api/'+route+'?profileId=profile&offset=50',restricted,'','GET')
    assert.equal(response.status,200)
    const items=await response.json()
    assert.equal(items.length,restricted?10:50)
    if(restricted)assert.ok(items.every(item=>item.category==='Home Videos'))
  }
})

test('browser catalog batches up to 500 titles and preserves profile restrictions',async()=>{
  const batch=await call('/api/library?profileId=profile&limit=500',0,'','GET',700)
  assert.equal(batch.response.status,200)
  assert.equal((await batch.response.json()).length,500)
  const restricted=await call('/api/library?profileId=profile&limit=500',1,'','GET',700)
  const items=await restricted.response.json()
  assert.equal(items.length,350)
  assert.ok(items.every(item=>item.category==='Home Videos'))
  const capped=await call('/api/library?profileId=profile&limit=999999',0,'','GET',700)
  assert.equal((await capped.response.json()).length,500)
})
