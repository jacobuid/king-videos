import React,{useEffect,useRef,useState} from 'react'
import {AuthProvider,ForgotPassword,ProfileMenu,Reauthenticate,SignIn,SignUp,useAuth} from '@jacobuid/king-auth'
import './auth.css'

export {ProfileMenu,useAuth}

export function AuthGate({children,logo}){
  return <AuthProvider appName="Kingflix" appPath={import.meta.env.BASE_URL}><SessionGate logo={logo}>{children}</SessionGate></AuthProvider>
}

function SessionGate({children,logo}){
  const {user,isSignedIn,isLoading,error,refresh}=useAuth()
  const [screen,setScreen]=useState('signin')
  if(isLoading)return <main className="signed-out">{logo}<p role="status">Checking your account…</p></main>
  if(error)return <main className="signed-out">{logo}<p role="alert">KingAuth is unavailable. Please try again.</p><button onClick={()=>refresh().catch(()=>{})}>Try again</button></main>
  if(isSignedIn)return <React.Fragment key={user.id}>{children}</React.Fragment>
  const heading=screen==='signup'?'Create your account.':screen==='reset'?'Reset your password.':'Welcome back.'
  const description=screen==='signup'?'One King Auth account for all your King apps.':screen==='reset'?'We’ll help you get back to your account.':'Sign in to your King Auth account.'
  return <main className="signed-out auth-screen">
    <div className="auth-brand">{logo}</div>
    <section className="auth-panel" aria-labelledby="auth-title">
      <nav className="auth-tabs" aria-label="Account access">
        <button type="button" aria-pressed={screen==='signin'} onClick={()=>setScreen('signin')}>Sign in</button>
        <button type="button" aria-pressed={screen==='signup'} onClick={()=>setScreen('signup')}>Create account</button>
      </nav>
      <header className="auth-heading"><h1 id="auth-title">{heading}</h1><p>{description}</p></header>
      <div className="auth-content" key={screen}>
        {screen==='signup'?<SignUp title={null}/>:screen==='reset'?<ForgotPassword title={null}/>:<SignIn title={null}/>}
      </div>
      {screen==='signin'&&<button type="button" className="auth-link" onClick={()=>setScreen('reset')}>Forgot your password?</button>}
      {screen==='reset'&&<button type="button" className="auth-link" onClick={()=>setScreen('signin')}>Back to sign in</button>}
      {screen==='signup'&&<p className="auth-approval-note">New accounts require email verification and owner approval.</p>}
      <footer className="auth-footer"><svg width="15" height="17" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M10 1.5 18 5v5.5c0 4.5-3.3 7.8-8 10-4.7-2.2-8-5.5-8-10V5l8-3.5Z" stroke="currentColor" strokeWidth="1.5"/><path d="m6.5 10.5 2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Secure sign-in by King Auth</span></footer>
    </section>
  </main>
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
