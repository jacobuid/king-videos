const {test}=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')
const vm=require('node:vm')
const fs=require('node:fs')
const {webcrypto,createHmac}=require('node:crypto')
const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleExports={}
vm.runInNewContext(code,{exports:moduleExports,require:name=>name==='@clerk/backend'?{createClerkClient:()=>({authenticateRequest:async()=>({toAuth:()=>({userId:'user'})})})}:{reverificationErrorResponse:()=>{}},Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,btoa,atob,console,Date,Intl})
const secret='test-secret',body=Buffer.from(JSON.stringify({userId:'user',profileId:'profile',version:1,expires:Date.now()+60000})).toString('base64url'),token=body+'.'+createHmac('sha256',secret).update(body).digest('base64url')
async function call(path,restricted,category,method='POST'){
  const queries=[]
  const env={CLERK_SECRET_KEY:secret,DB:{prepare(sql){const statement={bind(...args){queries.push({sql,args});return statement},async first(){return sql.includes('FROM profiles')?{pin_version:1,home_videos_only:restricted,date_of_birth:'1990-01-01'}:{id:'video',category,min_age:0,blocked:0,video_key:'movies/test.mp4',mime_type:'video/mp4',source_url:null,subtitle_url:null,subtitle_key:null}},async all(){return {results:[]}}};return statement}}}
  const request=new Request('https://example.com'+path,{method,headers:{'X-Profile-Token':token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({profileId:'profile'})}:{})})
  return {response:await moduleExports.default.fetch(request,env,{}),queries}
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
    const query=queries.find(query=>query.sql.includes('FROM media'))
    assert.match(query.sql,/homevideo%.*ORDER BY.*LIMIT.*OFFSET/)
    assert.equal(query.args[0],'%%')
    assert.ok(query.args[1]>=0)
    assert.deepEqual(query.args.slice(2),[restricted,50,50])
  }
})
