import { createClerkClient } from '@clerk/backend'
import { reverificationErrorResponse } from '@clerk/shared/authorization-errors'
import { AwsClient } from 'aws4fetch'

interface Env { DB:D1Database; CLERK_SECRET_KEY:string; CLERK_PUBLISHABLE_KEY:string; B2_KEY_ID:string; B2_APPLICATION_KEY:string; B2_ENDPOINT:string; B2_BUCKET:string; WEB_ORIGIN?:string; WEB_ORIGINS?:string }
type Media={id:string;title:string;description:string;category:string;video_key:string;source_url:string|null;thumbnail_key:string|null;mime_type:string;created_at:string;kids_allowed:number;series_id:string|null;season_number:number|null;episode_number:number|null;release_date:string|null;year:number|null;genres:string;rating:string|null;duration_seconds:number|null;featured:number}
type Profile={id:string;user_id:string;name:string;pin_hash:string|null;pin_salt:string|null;pin_version:number;failed_attempts:number;locked_until:number|null;is_kids:number}
type ProfileToken={userId:string;profileId:string;version:number;expires:number}
const encoder=new TextEncoder()
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
const allowedKey=(key:string)=>key.startsWith('movies/')&&!key.includes('..')
const validPin=(pin:string)=>/^\d{4}$/.test(pin)
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
const fromBase64url=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),char=>char.charCodeAt(0))
const origins=(env:Env)=>(env.WEB_ORIGINS||env.WEB_ORIGIN||'').split(',').map(value=>value.trim()).filter(Boolean)

function signer(env:Env){return new AwsClient({accessKeyId:env.B2_KEY_ID,secretAccessKey:env.B2_APPLICATION_KEY,service:'s3',region:new URL(env.B2_ENDPOINT).hostname.split('.')[1]})}
async function b2Url(env:Env,key:string){const endpoint=env.B2_ENDPOINT.replace(/\/$/,'');const path=`${env.B2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;return(await signer(env).sign(`${endpoint}/${path}?X-Amz-Expires=300`,{aws:{signQuery:true}})).url}
function externalMediaUrl(value:string|null){if(!value)return null;try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='archive.org'&&url.pathname.startsWith('/download/')?url.href:null}catch{return null}}
async function authorize(request:Request,env:Env){const clerk=createClerkClient({secretKey:env.CLERK_SECRET_KEY,publishableKey:env.CLERK_PUBLISHABLE_KEY});return(await clerk.authenticateRequest(request,{authorizedParties:origins(env)})).toAuth()}
async function pinKey(env:Env,usage:KeyUsage[]){return crypto.subtle.importKey('raw',encoder.encode(env.CLERK_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,usage)}
function pinData(pin:string,salt:Uint8Array){const value=new Uint8Array(salt.length+1+pin.length);value.set(salt);value[salt.length]=58;value.set(encoder.encode(pin),salt.length+1);return value}
async function pinHash(env:Env,pin:string,salt:Uint8Array){return new Uint8Array(await crypto.subtle.sign('HMAC',await pinKey(env,['sign']),pinData(pin,salt)))}
async function verifyPin(env:Env,pin:string,salt:Uint8Array,hash:string){return crypto.subtle.verify('HMAC',await pinKey(env,['verify']),fromBase64url(hash),pinData(pin,salt))}
async function encodeProfileToken(env:Env,value:ProfileToken){const body=base64url(encoder.encode(JSON.stringify(value)));const key=await crypto.subtle.importKey('raw',encoder.encode(env.CLERK_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return `${body}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body))))}`}
async function decodeProfileToken(env:Env,token:string):Promise<ProfileToken|null>{try{const[body,signature]=token.split('.');const key=await crypto.subtle.importKey('raw',encoder.encode(env.CLERK_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',key,fromBase64url(signature),encoder.encode(body)))return null;const value=JSON.parse(new TextDecoder().decode(fromBase64url(body)))as ProfileToken;return value.expires>Date.now()?value:null}catch{return null}}
async function authorizedProfile(request:Request,env:Env,userId:string,profileId:string|undefined|null){if(!profileId)return null;const token=await decodeProfileToken(env,request.headers.get('X-Profile-Token')||'');if(!token||token.userId!==userId||token.profileId!==profileId)return null;const profile=await env.DB.prepare('SELECT pin_version,is_kids FROM profiles WHERE id=? AND user_id=?').bind(profileId,userId).first<{pin_version:number;is_kids:number}>();return profile&&profile.pin_version===token.version?profile:null}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const origin=request.headers.get('Origin');const cors:Record<string,string>={'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Profile-Token','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',Vary:'Origin'};if(origin&&origins(env).includes(origin))cors['Access-Control-Allow-Origin']=origin;if(request.method==='OPTIONS')return new Response(null,{headers:cors})
  try{
    const auth=await authorize(request,env),userId=auth?.userId;if(!userId)return withCors(json({error:'Unauthorized'},401),cors)
    const url=new URL(request.url),path=url.pathname
    if(path==='/api/manage-access'&&request.method==='POST'){
      if(!auth.has({reverification:{level:'first_factor',afterMinutes:1}}))return withCors(reverificationErrorResponse({level:'first_factor',afterMinutes:1}),cors)
      return withCors(json({ok:true}),cors)
    }
    if(path==='/api/profiles'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,name,pin_hash IS NOT NULL AS hasPin,is_kids AS isKids FROM profiles WHERE user_id=? ORDER BY created_at').bind(userId).all();return withCors(json(rows.results.map(row=>({...row,hasPin:Boolean(row.hasPin),isKids:Boolean(row.isKids)}))),cors)}
    if(path==='/api/profiles'&&request.method==='POST'){
      const body=await request.json()as{name?:string;pin?:string;isKids?:boolean};const name=body.name?.trim(),pin=body.pin?.trim()||''
      if(!name||name.length>40)return withCors(json({error:'Enter a profile name up to 40 characters.'},400),cors)
      if(body.isKids&&pin)return withCors(json({error:'Kids profiles cannot have a PIN.'},400),cors)
      if(pin&&!validPin(pin))return withCors(json({error:'PIN must contain exactly four digits.'},400),cors)
      const id=crypto.randomUUID();let hash:string|null=null,saltValue:string|null=null
      if(pin){const salt=crypto.getRandomValues(new Uint8Array(16));saltValue=base64url(salt);hash=base64url(await pinHash(env,pin,salt))}
      await env.DB.prepare('INSERT INTO profiles(id,user_id,name,pin_hash,pin_salt,is_kids) VALUES(?,?,?,?,?,?)').bind(id,userId,name,hash,saltValue,body.isKids?1:0).run()
      return withCors(json({id,name,hasPin:Boolean(pin),isKids:Boolean(body.isKids)},201),cors)
    }
    const profileMatch=path.match(/^\/api\/profiles\/([^/]+)\/(unlock|pin|type)$/)
    if(profileMatch&&request.method==='POST'){
      const profile=await env.DB.prepare('SELECT * FROM profiles WHERE id=? AND user_id=?').bind(profileMatch[1],userId).first<Profile>();if(!profile)return withCors(json({error:'Profile not found.'},404),cors)
      const body=await request.json()as{pin?:string}
      if(profileMatch[2]==='unlock'){
        if(profile.locked_until&&profile.locked_until>Date.now())return withCors(json({error:'Too many attempts. Try again in five minutes.'},429),cors)
        if(profile.pin_hash){const matches=validPin(body.pin||'')&&await verifyPin(env,body.pin!,fromBase64url(profile.pin_salt!),profile.pin_hash);if(!matches){const attempts=profile.failed_attempts+1,locked=attempts>=5?Date.now()+300000:null;await env.DB.prepare('UPDATE profiles SET failed_attempts=?,locked_until=? WHERE id=?').bind(locked?0:attempts,locked,profile.id).run();return withCors(json({error:locked?'Too many attempts. Try again in five minutes.':'Incorrect PIN.'},locked?429:403),cors)}}
        await env.DB.prepare('UPDATE profiles SET failed_attempts=0,locked_until=NULL WHERE id=?').bind(profile.id).run();return withCors(json({token:await encodeProfileToken(env,{userId,profileId:profile.id,version:profile.pin_version,expires:Date.now()+43200000})}),cors)
      }
      if(!await authorizedProfile(request,env,userId,profile.id))return withCors(json({error:'Unlock this profile first.'},403),cors)
      if(profileMatch[2]==='type'){const isKids=Boolean((body as {isKids?:boolean}).isKids);await env.DB.prepare('UPDATE profiles SET is_kids=? WHERE id=?').bind(isKids?1:0,profile.id).run();return withCors(json({isKids}),cors)}
      const pin=body.pin?.trim()||'';if(pin&&!validPin(pin))return withCors(json({error:'PIN must contain exactly four digits.'},400),cors)
      if(profile.is_kids&&pin)return withCors(json({error:'Kids profiles cannot have a PIN.'},400),cors)
      let hash:string|null=null,saltValue:string|null=null;if(pin){const salt=crypto.getRandomValues(new Uint8Array(16));saltValue=base64url(salt);hash=base64url(await pinHash(env,pin,salt))}
      await env.DB.prepare('UPDATE profiles SET pin_hash=?,pin_salt=?,pin_version=pin_version+1,failed_attempts=0,locked_until=NULL WHERE id=?').bind(hash,saltValue,profile.id).run();return withCors(json({hasPin:Boolean(pin)}),cors)
    }
    const profileIdMatch=path.match(/^\/api\/profiles\/([^/]+)$/)
    if(profileIdMatch&&request.method==='POST'){
      if(!await authorizedProfile(request,env,userId,profileIdMatch[1]))return withCors(json({error:'Unlock this profile first.'},403),cors)
      const body=await request.json()as{name?:string;isKids?:boolean};const name=body.name?.trim()
      if(!name||name.length>40)return withCors(json({error:'Enter a profile name up to 40 characters.'},400),cors)
      const existing=await env.DB.prepare('SELECT is_kids FROM profiles WHERE id=? AND user_id=?').bind(profileIdMatch[1],userId).first<{is_kids:number}>()
      if(existing?.is_kids&&!body.isKids&&!auth.has({reverification:{level:'first_factor',afterMinutes:1}}))return withCors(reverificationErrorResponse({level:'first_factor',afterMinutes:1}),cors)
      if(body.isKids)await env.DB.prepare('UPDATE profiles SET name=?,is_kids=1,pin_hash=NULL,pin_salt=NULL,pin_version=pin_version+1,failed_attempts=0,locked_until=NULL WHERE id=? AND user_id=?').bind(name,profileIdMatch[1],userId).run()
      else await env.DB.prepare('UPDATE profiles SET name=?,is_kids=0 WHERE id=? AND user_id=?').bind(name,profileIdMatch[1],userId).run()
      return withCors(json({id:profileIdMatch[1],name,isKids:Boolean(body.isKids),hasPin:body.isKids?false:undefined}),cors)
    }
    if(profileIdMatch&&request.method==='DELETE'){
      if(!await authorizedProfile(request,env,userId,profileIdMatch[1]))return withCors(json({error:'Unlock this profile first.'},403),cors)
      await env.DB.batch([env.DB.prepare('DELETE FROM progress WHERE profile_id=?').bind(profileIdMatch[1]),env.DB.prepare('DELETE FROM favorites WHERE profile_id=?').bind(profileIdMatch[1]),env.DB.prepare('DELETE FROM profiles WHERE id=? AND user_id=?').bind(profileIdMatch[1],userId)])
      return withCors(json({ok:true}),cors)
    }
    if((path==='/api/library'||path==='/api/home'||path==='/api/search')&&request.method==='GET'){const profile=await authorizedProfile(request,env,userId,url.searchParams.get('profileId'));if(!profile)return withCors(json({error:'Profile is locked.'},403),cors);const search=(url.searchParams.get('q')||'').slice(0,100),limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit'))||50)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const rows=await env.DB.prepare('SELECT * FROM media WHERE title LIKE ? AND (?=0 OR kids_allowed=1) ORDER BY featured DESC,created_at DESC LIMIT ? OFFSET ?').bind(`%${search}%`,profile.is_kids,limit,offset).all<Media>();const thumbnails=new Map<string,Promise<string>>();const thumbnail=async(key:string|null)=>{if(!key||!allowedKey(key))return null;let signed=thumbnails.get(key);if(!signed){signed=b2Url(env,key);thumbnails.set(key,signed)}return signed};const result=await Promise.all(rows.results.map(async m=>({id:m.id,title:m.title,description:m.description,category:m.category,mimeType:m.mime_type,createdAt:m.created_at,seriesId:m.series_id,seasonNumber:m.season_number,episodeNumber:m.episode_number,releaseDate:m.release_date,year:m.year,genres:JSON.parse(m.genres||'[]'),rating:m.rating,durationSeconds:m.duration_seconds,featured:Boolean(m.featured),thumbnailUrl:await thumbnail(m.thumbnail_key)})));return withCors(json(result),cors)}
    const mediaMatch=path.match(/^\/api\/media\/([^/]+)(\/play)?$/)
    if(mediaMatch){const m=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(mediaMatch[1]).first<Media>();if(!m)return withCors(json({error:'Not found'},404),cors);if(!mediaMatch[2]&&request.method==='GET')return withCors(json({id:m.id,title:m.title,description:m.description,category:m.category}),cors);if(mediaMatch[2]&&request.method==='POST'){const body=await request.json()as{profileId?:string};const profile=await authorizedProfile(request,env,userId,body.profileId);if(!profile)return withCors(json({error:'Profile is locked.'},403),cors);if(profile.is_kids&&!m.kids_allowed)return withCors(json({error:'This video is not available for Kids profiles.'},403),cors);const source=externalMediaUrl(m.source_url);if(source)return withCors(json({url:source,mimeType:m.mime_type}),cors);if(!allowedKey(m.video_key))return withCors(json({error:'Invalid media key'},500),cors);return withCors(json({url:await b2Url(env,m.video_key),mimeType:m.mime_type}),cors)}}
    if(path==='/api/progress'&&request.method==='POST'){const body=await request.json()as{profileId?:string;mediaId?:string;positionSeconds?:number};if(!Number.isInteger(body.positionSeconds)||body.positionSeconds!<0)return withCors(json({error:'Invalid position'},400),cors);if(!await authorizedProfile(request,env,userId,body.profileId))return withCors(json({error:'Profile is locked.'},403),cors);await env.DB.prepare('INSERT INTO progress(profile_id,media_id,position_seconds) VALUES(?,?,?) ON CONFLICT(profile_id,media_id) DO UPDATE SET position_seconds=excluded.position_seconds,updated_at=CURRENT_TIMESTAMP').bind(body.profileId,body.mediaId,body.positionSeconds).run();return withCors(json({ok:true}),cors)}
    if(path==='/api/progress'&&request.method==='GET'){const profileId=url.searchParams.get('profileId');if(!await authorizedProfile(request,env,userId,profileId))return withCors(json({error:'Profile is locked.'},403),cors);return withCors(json((await env.DB.prepare('SELECT media_id AS mediaId,position_seconds AS positionSeconds FROM progress WHERE profile_id=?').bind(profileId).all()).results),cors)}
    return withCors(json({error:'Not found'},404),cors)
  }catch(error){console.error(error);return withCors(json({error:'Internal error'},500),cors)}
}}satisfies ExportedHandler<Env>
function withCors(response:Response,headers:Record<string,string>){for(const[key,value]of Object.entries(headers))response.headers.set(key,value);return response}
