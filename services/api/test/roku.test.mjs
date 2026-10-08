import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {publicRokuRoute,browserRokuRoute,authorizeRoku,revokeRoku,rokuPathAllowed} from '../src/roku.ts'
import {vttToSrt} from '../src/roku-captions.ts'

function fixture(){
  const sqlite=new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0014_roku_devices.sql',import.meta.url),'utf8'))
  const DB={prepare(sql){let params=[];return {bind(...values){params=values;return this},async run(){return sqlite.prepare(sql).run(...params)},async first(){return sqlite.prepare(sql).get(...params)||null},async all(){return {results:sqlite.prepare(sql).all(...params)}}}}}
  return {DB,CLERK_SECRET_KEY:'test-key',sqlite}
}
function request(path,body,token,method='POST'){return new Request('https://example.test'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})})})}

test('device cannot authenticate before browser approval; linking preserves account ownership',async()=>{
  const env=fixture(),pair=await(await publicRokuRoute(request('/api/roku/pair',{}),env,'/api/roku/pair')).json()
  assert.match(pair.token,/^kfr_[a-f0-9]{64}$/)
  assert.equal(await authorizeRoku(request('/api/profiles',null,pair.token,'GET'),env),null)
  assert.equal((await(await publicRokuRoute(request('/api/roku/pair/status',{token:pair.token}),env,'/api/roku/pair/status')).json()).status,'pending')
  assert.equal((await browserRokuRoute(request('/api/roku/link',{code:pair.code,name:'TV'}),env,'/api/roku/link','owner')).status,200)
  assert.equal((await authorizeRoku(request('/api/profiles',null,pair.token,'GET'),env)).userId,'owner')
  assert.equal((await browserRokuRoute(request('/api/roku/link',{code:pair.code}),env,'/api/roku/link','other')).status,409)
  assert.equal((await authorizeRoku(request('/api/profiles',null,pair.token,'GET'),env)).userId,'owner')
  assert.notEqual(env.sqlite.prepare('SELECT token_hash FROM roku_devices').get().token_hash,pair.token)
})

test('expired pairing, expired device, and revoked device cannot grant access',async()=>{
  const env=fixture(),pair=await(await publicRokuRoute(request('/api/roku/pair',{}),env,'/api/roku/pair')).json()
  env.sqlite.exec('UPDATE roku_pairings SET expires_at=0')
  assert.equal((await browserRokuRoute(request('/api/roku/link',{code:pair.code}),env,'/api/roku/link','owner')).status,404)
  const second=await(await publicRokuRoute(request('/api/roku/pair',{}),env,'/api/roku/pair')).json()
  await browserRokuRoute(request('/api/roku/link',{code:second.code}),env,'/api/roku/link','owner')
  await revokeRoku(request('/api/roku/signout',{},second.token,'DELETE'),env)
  assert.equal(await authorizeRoku(request('/api/profiles',null,second.token,'GET'),env),null)
  assert.equal((await(await publicRokuRoute(request('/api/roku/pair/status',{token:second.token}),env,'/api/roku/pair/status')).json()).status,'expired')
  env.sqlite.exec('UPDATE roku_devices SET revoked_at=NULL, expires_at=0')
  assert.equal(await authorizeRoku(request('/api/profiles',null,second.token,'GET'),env),null)
})

test('pairing creation is limited and unlinking is account scoped',async()=>{
  const env=fixture()
  let pair
  for(let i=0;i<5;i++)pair=await(await publicRokuRoute(request('/api/roku/pair',{}),env,'/api/roku/pair')).json()
  assert.equal((await publicRokuRoute(request('/api/roku/pair',{}),env,'/api/roku/pair')).status,429)
  await browserRokuRoute(request('/api/roku/link',{code:pair.code}),env,'/api/roku/link','owner')
  const id=env.sqlite.prepare('SELECT id FROM roku_devices').get().id
  await browserRokuRoute(request('/api/roku/devices/'+id,{},null,'DELETE'),env,'/api/roku/devices/'+id,'other')
  assert.ok(await authorizeRoku(request('/api/profiles',null,pair.token,'GET'),env))
  await browserRokuRoute(request('/api/roku/devices/'+id,{},null,'DELETE'),env,'/api/roku/devices/'+id,'owner')
  assert.equal(await authorizeRoku(request('/api/profiles',null,pair.token,'GET'),env),null)
})

test('device permissions exclude management, PIN changes, and linking other devices',()=>{
  for(const [path,method] of [['/api/manage-access','POST'],['/api/manage-media','GET'],['/api/profiles/p1','DELETE'],['/api/profiles/p1/pin','POST'],['/api/roku/link','POST'],['/api/roku/devices','GET']])assert.equal(rokuPathAllowed(path,method),false)
  for(const [path,method] of [['/api/library','GET'],['/api/profiles/p1/unlock','POST'],['/api/media/movie/play','POST'],['/api/progress','POST'],['/api/favorites','DELETE']])assert.equal(rokuPathAllowed(path,method),true)
})

test('Roku caption conversion handles cue IDs, settings, comments, and hourless times',()=>{
  const vtt='WEBVTT\n\nNOTE ignored\nmetadata\n\ncue-id\n00:01.250 --> 00:02.500 align:start\n<v Narrator>Hello</v>\n\n00:01:03.100 --> 00:01:04.200\n<c.red>World</c>\n'
  assert.equal(vttToSrt(vtt),'1\n00:00:01,250 --> 00:00:02,500\nHello\n\n2\n00:01:03,100 --> 00:01:04,200\nWorld\n')
  assert.equal(vttToSrt('1\n00:00:01,000 --> 00:00:02,000\nText'),'1\n00:00:01,000 --> 00:00:02,000\nText')
})

test('Roku delivery preserves open-ended and explicit ranges while browser chunks remain bounded',async()=>{
  const {videoOriginRange}=await import('../src/video-delivery.ts')
  assert.equal(videoOriginRange('bytes=0-',true),'bytes=0-')
  assert.equal(videoOriginRange('bytes=20000000-50000000',true),'bytes=20000000-50000000')
  assert.equal(videoOriginRange('bytes=0-',false),'bytes=0-16777215')
  assert.equal(videoOriginRange('bytes=10-20',false),'bytes=10-20')
  assert.equal(videoOriginRange('bytes=-1024',true),'bytes=-1024')
  assert.equal(videoOriginRange(null,true),null)
})

test('movie rating ages enforce PG-13 at 16 and R at 21 without changing other types',async()=>{
  const {movieRatingAge}=await import('../src/movie-ratings.ts')
  assert.equal(movieRatingAge('movie','PG-13',0),16)
  assert.equal(movieRatingAge('movie',' r ',0),21)
  assert.equal(movieRatingAge('movie','G',8),8)
  assert.equal(movieRatingAge('tv','PG-13',0),0)
})
