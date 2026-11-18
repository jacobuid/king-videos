import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {authorize} from '../src/auth.ts'

registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.includes('/services/api/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context)
  return next(specifier,context)
}})
const {default:api}=await import('../src/index.ts')
const env={WEB_ORIGINS:'https://videos.example,http://localhost:5173',APP_SIGNING_SECRET:'test-secret'}
const request=(headers={})=>new Request('https://api.example/api/manage-access',{method:'POST',headers:{Origin:'https://videos.example',Authorization:'Bearer credential',...headers}})

test('missing application signing key fails closed before issuing any tokens',async()=>{
  const response=await api.fetch(request(),{...env,APP_SIGNING_SECRET:undefined},{})
  assert.equal(response.status,503)
  assert.equal(response.headers.get('Cache-Control'),'no-store')
})

test('backend accepts any verified KingAuth account from a trusted frontend origin',async()=>{
  const original=globalThis.fetch
  try{
    let user={id:'owner',emailVerified:true},calls=0
    globalThis.fetch=async(url,options)=>{
      calls++
      assert.equal(url,'https://kingauth.app/api/browser/get-session')
      assert.equal(options.headers.Origin,'https://videos.example')
      assert.equal(options.headers.Authorization,'Bearer credential')
      assert.equal(options.redirect,'manual')
      return Response.json({user})
    }
    assert.deepEqual(await authorize(request(),env),{userId:'owner'})
    user={id:'other',emailVerified:true};assert.deepEqual(await authorize(request(),env),{userId:'other'})
    user={id:'owner',emailVerified:false};assert.equal(await authorize(request(),env),null)
    user={id:'',emailVerified:true};assert.equal(await authorize(request(),env),null)
    const before=calls
    assert.equal(await authorize(request({Origin:'https://attacker.example'}),env),null)
    assert.equal(await authorize(new Request('https://api.example'),env),null)
    assert.equal(calls,before)
  }finally{globalThis.fetch=original}
})

test('management consumes an action-scoped proof; missing, mismatched and reused proofs fail',async()=>{
  const original=globalThis.fetch
  try{
    const proofs=new Map([['management','manage:access'],['avatar','profile:kid:avatar']])
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers.Origin,'https://videos.example')
      if(url.endsWith('/get-session'))return Response.json({user:{id:'owner',emailVerified:true}})
      assert.ok(url.endsWith('/reauthentication/consume'))
      const {proof,action}=JSON.parse(options.body)
      const allowed=proofs.get(proof)===action
      if(allowed)proofs.delete(proof)
      return Response.json({allowed},{status:allowed?200:403})
    }
    const missing=await api.fetch(request(),env,{})
    assert.equal(missing.status,403)
    assert.equal((await missing.json()).action,'manage:access')
    assert.equal((await api.fetch(request({'X-Reauthentication-Proof':'avatar'}),env,{})).status,403)
    const success=await api.fetch(request({'X-Reauthentication-Proof':'management'}),env,{})
    assert.equal(success.status,200)
    assert.ok((await success.json()).token)
    assert.equal((await api.fetch(request({'X-Reauthentication-Proof':'management'}),env,{})).status,403)
  }finally{globalThis.fetch=original}
})

test('revoked sessions and central service failures never grant API access',async()=>{
  const original=globalThis.fetch
  try{
    globalThis.fetch=async()=>new Response(null,{status:401})
    assert.equal((await api.fetch(request(),env,{})).status,401)
    globalThis.fetch=async()=>new Response(null,{status:503})
    await assert.rejects(authorize(request(),env),/unavailable/)
  }finally{globalThis.fetch=original}
})
