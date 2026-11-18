import {createKingAuthVerifier} from '@jacobuid/king-auth/verifier'

type AuthEnv={WEB_ORIGIN?:string;WEB_ORIGINS?:string}

export function kingAuth(request:Request,env:AuthEnv){
  const allowed=(env.WEB_ORIGINS||env.WEB_ORIGIN||'').split(',').map(value=>value.trim()).filter(Boolean)
  const origin=request.headers.get('Origin')
  // Bearer credentials are bound to the frontend origin by KingAuth.
  if(!origin||!allowed.includes(origin))return null
  return createKingAuthVerifier({origin,allowLocalhost:origin==='http://localhost:5173'})
}

export async function authorize(request:Request,env:AuthEnv){
  const verifier=kingAuth(request,env)
  if(!verifier)return null
  const session=await verifier.getSession(request)
  return session?.user.emailVerified&&session.user.id?{userId:session.user.id}:null
}

export async function confirmPassword(request:Request,env:AuthEnv,action:string){
  const proof=request.headers.get('X-Reauthentication-Proof')
  if(!proof)return false
  return await kingAuth(request,env)?.verifyReauthentication(request,{proof,action})===true
}

export const confirmationRequired=(action:string)=>new Response(JSON.stringify({
  error:'Confirm your KingAuth password to continue.',code:'REAUTHENTICATION_REQUIRED',action,
}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
