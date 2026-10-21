import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {DatabaseSync} from 'node:sqlite'

// Exercise the real routes with an authenticated Clerk session stub.
registerHooks({resolve(specifier,context,next){
 if(specifier==='@clerk/backend')return {url:'data:text/javascript,export const createClerkClient=()=>({authenticateRequest:async()=>({toAuth:()=>globalThis.avatarTestAuth})})',shortCircuit:true}
 if(specifier.startsWith('.')&&context.parentURL?.includes('/services/api/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context)
 return next(specifier,context)
}})
const {default:api}=await import('../src/index.ts')

function fixture(){
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,pin_hash TEXT,pin_salt TEXT,pin_version INTEGER DEFAULT 0,failed_attempts INTEGER DEFAULT 0,locked_until INTEGER,avatar TEXT)')
 const DB={prepare(sql){let params=[];return {bind(...values){params=values;return this},async first(){return sqlite.prepare(sql).get(...params)||null},async run(){return sqlite.prepare(sql).run(...params)}}}}
 return {DB,sqlite,CLERK_SECRET_KEY:'test-secret',CLERK_PUBLISHABLE_KEY:'test',WEB_ORIGIN:'https://test.invalid'}
}
async function profile(env,id,pin){
 const salt=new Uint8Array(16).fill(id==='dad'?1:2),data=new Uint8Array(salt.length+1+pin.length);data.set(salt);data[salt.length]=58;data.set(new TextEncoder().encode(pin),salt.length+1)
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.CLERK_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const hash=Buffer.from(await crypto.subtle.sign('HMAC',key,data)).toString('base64url')
 env.sqlite.prepare('INSERT INTO profiles(id,user_id,name,pin_hash,pin_salt,avatar) VALUES(?,?,?,?,?,?)').run(id,'owner',id,pin?hash:null,pin?Buffer.from(salt).toString('base64url'):null,'bluey.png')
}
async function save(env,id,body,fresh=false){
 globalThis.avatarTestAuth={userId:'owner',has:()=>fresh}
 return api.fetch(new Request(`https://test.invalid/api/profiles/${id}/avatar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatar:'sonic.png',...body})}),env,{})
}
test('avatar changes require the target PIN, with lockout and verified Clerk override',async()=>{
 const env=fixture()
 try{
 await profile(env,'dad','1234');await profile(env,'kid','5678');await profile(env,'open','')
 assert.equal((await save(env,'dad',{})).status,403)
 assert.equal((await save(env,'dad',{pin:'5678'})).status,403)
 assert.equal(env.sqlite.prepare('SELECT avatar FROM profiles WHERE id=?').get('dad').avatar,'bluey.png')
 assert.equal((await save(env,'dad',{pin:'1234'})).status,200)
 assert.equal((await save(env,'kid',{passwordOverride:true})).status,403)
 assert.equal((await save(env,'kid',{passwordOverride:true},true)).status,200)
 assert.equal((await save(env,'open',{})).status,403)
 assert.equal((await save(env,'open',{},true)).status,200)
 env.sqlite.prepare('UPDATE profiles SET locked_until=? WHERE id=?').run(Date.now()+300000,'dad')
 assert.equal((await save(env,'dad',{pin:'1234'})).status,429)
 assert.equal((await save(env,'dad',{passwordOverride:true},true)).status,200)
 }finally{env.sqlite.close();delete globalThis.avatarTestAuth}
})
