import React,{useEffect,useRef,useState} from 'react'
import {AuthProvider,ForgotPassword,ProfileMenu,Reauthenticate,SignIn,useAuth} from '@jacobuid/king-auth'
import './auth.css'

export {ProfileMenu,useAuth}

export function AuthGate({children,logo}){
  return <AuthProvider appName="Kingflix" appPath={import.meta.env.BASE_URL}><SessionGate logo={logo}>{children}</SessionGate></AuthProvider>
}

function SessionGate({children,logo}){
  const {user,isSignedIn,isLoading,error,refresh}=useAuth()
  const [reset,setReset]=useState(false)
  if(isLoading)return <main className="signed-out">{logo}<p role="status">Checking your account…</p></main>
  if(error)return <main className="signed-out">{logo}<p role="alert">KingAuth is unavailable. Please try again.</p><button onClick={()=>refresh().catch(()=>{})}>Try again</button></main>
  if(isSignedIn)return <React.Fragment key={user.id}>{children}</React.Fragment>
  return <main className="signed-out">{logo}<p>Your private video library.</p><section className="auth-panel">{reset?<ForgotPassword/>:<SignIn/>}<button className="auth-link" onClick={()=>setReset(!reset)}>{reset?'Back to sign in':'Forgot your password?'}</button></section></main>
}

// The API derives the action and consumes KingAuth's proof once before writing.
export function useConfirmedFetch(){
  const [challenge,setChallenge]=useState(null)
  const pending=useRef(null)
  useEffect(()=>()=>{pending.current?.reject(new Error('Password verification was cancelled.'));pending.current=null},[])
  function finish(proof){const current=pending.current;pending.current=null;setChallenge(null);if(proof)current?.resolve(proof);else current?.reject(new Error('Password verification was cancelled.'))}
  async function confirmedFetch(url,options={}){
    const response=await fetch(url,options)
    if(response.status!==403)return response
    const data=await response.clone().json().catch(()=>({}))
    if(data.code!=='REAUTHENTICATION_REQUIRED'||typeof data.action!=='string')return response
    if(pending.current)throw new Error('Finish the current password confirmation first.')
    const proof=await new Promise((resolve,reject)=>{pending.current={resolve,reject};setChallenge(data.action)})
    const headers=new Headers(options.headers);headers.set('X-Reauthentication-Proof',proof)
    return fetch(url,{...options,headers})
  }
  const confirmation=challenge?<PasswordConfirmation action={challenge} finish={finish}/>:null
  return [confirmedFetch,confirmation]
}

function PasswordConfirmation({action,finish}){
  const dialog=useRef(null)
  useEffect(()=>{dialog.current.showModal()},[])
  return <dialog ref={dialog} className="auth-dialog" aria-label="Confirm your password" onCancel={event=>{event.preventDefault();finish()}}><p>Enter your KingAuth password to continue.</p><Reauthenticate key={action} action={action} onSuccess={({proof})=>finish(proof)}/><button className="auth-link" onClick={()=>finish()}>Cancel</button></dialog>
}
