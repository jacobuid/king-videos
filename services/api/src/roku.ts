type RokuEnv={DB:D1Database;CLERK_SECRET_KEY:string}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
const random=(size:number)=>Array.from(crypto.getRandomValues(new Uint8Array(size)),n=>n.toString(16).padStart(2,'0')).join('')
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')
export const rokuPathAllowed=(path:string,method:string)=>
  method==='GET'&&['/api/profiles','/api/library','/api/progress','/api/favorites'].includes(path)||
  method==='POST'&&(/^\/api\/profiles\/[^/]+\/unlock$/.test(path)||/^\/api\/media\/[^/]+\/play$/.test(path)||path==='/api/progress'||path==='/api/favorites')||
  method==='DELETE'&&['/api/favorites','/api/roku/signout'].includes(path)

export async function revokeRoku(request:Request,env:RokuEnv){
  const token=request.headers.get('Authorization')!.replace(/^Bearer /,'')
  await env.DB.prepare('UPDATE roku_devices SET revoked_at=? WHERE token_hash=?').bind(Date.now(),await hash(token)).run()
  return json({ok:true})
}

export async function authorizeRoku(request:Request,env:RokuEnv){
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||''
  if(!/^kfr_[a-f0-9]{64}$/.test(token))return null
  const device=await env.DB.prepare('SELECT user_id FROM roku_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await hash(token),Date.now()).first<{user_id:string}>()
  return device?{userId:device.user_id,has:(_?:unknown)=>false}:null
}

// Only the random device secret can poll. Only a signed-in browser can approve.
export async function publicRokuRoute(request:Request,env:RokuEnv,path:string):Promise<Response|null>{
  if(request.method!=='POST')return null
  if(path==='/api/roku/pair'){
    const now=Date.now(),requester=await hash(env.CLERK_SECRET_KEY+':roku:'+ (request.headers.get('CF-Connecting-IP')||'local'))
    await env.DB.prepare('DELETE FROM roku_pairings WHERE expires_at<?').bind(now).run()
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM roku_pairings WHERE requester_hash=? AND created_at>?').bind(requester,now-600000).first<{n:number}>()
    if((count?.n||0)>=5)return json({error:'Too many linking requests. Try again in ten minutes.'},429)
    const token='kfr_'+random(32),code=random(4).toUpperCase(),expires=now+600000
    await env.DB.prepare('INSERT INTO roku_pairings(token_hash,code,requester_hash,created_at,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token),code,requester,now,expires).run()
    return json({token,code,expires,interval:5},201)
  }
  if(path==='/api/roku/pair/status'){
    const body=await request.json()as{token?:string}
    if(!/^kfr_[a-f0-9]{64}$/.test(body.token||''))return json({error:'Invalid device token.'},400)
    const tokenHash=await hash(body.token!),now=Date.now()
    const device=await env.DB.prepare('SELECT expires_at,revoked_at FROM roku_devices WHERE token_hash=?').bind(tokenHash).first<{expires_at:number;revoked_at:number|null}>()
    if(device)return json({status:device.revoked_at||device.expires_at<=now?'expired':'linked'})
    const pairing=await env.DB.prepare('SELECT expires_at FROM roku_pairings WHERE token_hash=?').bind(tokenHash).first<{expires_at:number}>()
    return json({status:pairing&&pairing.expires_at>now?'pending':'expired'})
  }
  return null
}

export async function browserRokuRoute(request:Request,env:RokuEnv,path:string,userId:string):Promise<Response|null>{
  if(path==='/api/roku/link'&&request.method==='POST'){
    const body=await request.json()as{code?:string;name?:string},code=(typeof body.code==='string'?body.code:'').replace(/\s|-/g,'').toUpperCase(),now=Date.now()
    if(!/^[A-F0-9]{8}$/.test(code))return json({error:'Enter the eight-character code shown on your Roku.'},400)
    const pairing=await env.DB.prepare('SELECT token_hash FROM roku_pairings WHERE code=? AND expires_at>?').bind(code,now).first<{token_hash:string}>()
    if(!pairing)return json({error:'That code has expired or was not found.'},404)
    await env.DB.prepare('INSERT OR IGNORE INTO roku_devices(id,user_id,name,token_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,(typeof body.name==='string'?body.name:'Roku').trim().slice(0,60)||'Roku',pairing.token_hash,now,now+90*86400000).run()
    const owner=await env.DB.prepare('SELECT user_id FROM roku_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(pairing.token_hash,now).first<{user_id:string}>()
    return owner?.user_id===userId?json({ok:true}):json({error:'This code has already been used.'},409)
  }
  if(path==='/api/roku/devices'&&request.method==='GET')return json((await env.DB.prepare('SELECT id,name,created_at AS createdAt,expires_at AS expiresAt FROM roku_devices WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC').bind(userId,Date.now()).all()).results)
  const match=path.match(/^\/api\/roku\/devices\/([^/]+)$/)
  if(match&&request.method==='DELETE'){
    await env.DB.prepare('UPDATE roku_devices SET revoked_at=? WHERE id=? AND user_id=?').bind(Date.now(),match[1],userId).run()
    return json({ok:true})
  }
  return null
}
