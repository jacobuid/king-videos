import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useAuth } from '@clerk/clerk-react'
import './style.css'

const key=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const api=import.meta.env.VITE_API_URL

function App(){
  const{getToken}=useAuth()
  const[profiles,setProfiles]=useState([])
  const[profile,setProfile]=useState(null)
  const[profileToken,setProfileToken]=useState('')
  const[pendingProfile,setPendingProfile]=useState(null)
  const[pin,setPin]=useState('')
  const[createOpen,setCreateOpen]=useState(false)
  const[newName,setNewName]=useState('')
  const[newPin,setNewPin]=useState('')
  const[newIsKids,setNewIsKids]=useState(false)
  const[pinOpen,setPinOpen]=useState(false)
  const[media,setMedia]=useState([])
  const[selected,setSelected]=useState(null)
  const[query,setQuery]=useState('')
  const[error,setError]=useState('')
  async function request(path,options={}){
    const token=await getToken()
    const response=await fetch(`${api}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(profileToken?{'X-Profile-Token':profileToken}:{}),...options.headers}})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(data.error||`Request failed: ${response.status}`)
    return data
  }
  useEffect(()=>{request('/api/profiles').then(setProfiles).catch(e=>setError(e.message))},[])
  useEffect(()=>{if(profile&&profileToken)request(`/api/library?profileId=${encodeURIComponent(profile.id)}`).then(setMedia).catch(e=>setError(e.message))},[profile,profileToken])
  async function unlock(selectedProfile,enteredPin=''){
    try{
      setError('')
      const result=await request(`/api/profiles/${selectedProfile.id}/unlock`,{method:'POST',body:JSON.stringify({pin:enteredPin}),headers:{'X-Profile-Token':''}})
      setProfileToken(result.token);setProfile(selectedProfile);setPendingProfile(null);setPin('')
    }catch(e){setError(e.message)}
  }
  function chooseProfile(selectedProfile){selectedProfile.hasPin?setPendingProfile(selectedProfile):unlock(selectedProfile)}
  async function addProfile(event){
    event.preventDefault()
    try{const created=await request('/api/profiles',{method:'POST',body:JSON.stringify({name:newName,pin:newPin,isKids:newIsKids})});setProfiles([...profiles,created]);setNewName('');setNewPin('');setNewIsKids(false);setCreateOpen(false);setError('')}catch(e){setError(e.message)}
  }
  async function updatePin(event){
    event.preventDefault()
    try{const result=await request(`/api/profiles/${profile.id}/pin`,{method:'POST',body:JSON.stringify({pin})});setProfiles(profiles.map(p=>p.id===profile.id?{...p,hasPin:result.hasPin}:p));setProfile({...profile,hasPin:result.hasPin});setProfileToken('');setProfile(null);setPin('');setPinOpen(false);setError('PIN updated. Unlock the profile again.')}catch(e){setError(e.message)}
  }
  async function play(item){try{setSelected({...item,...await request(`/api/media/${item.id}/play`,{method:'POST',body:JSON.stringify({profileId:profile.id})})})}catch(e){setError(e.message)}}
  async function toggleKids(){try{const result=await request(`/api/profiles/${profile.id}/type`,{method:'POST',body:JSON.stringify({isKids:!profile.isKids})});const updated={...profile,isKids:result.isKids};setProfile(updated);setProfiles(profiles.map(p=>p.id===profile.id?updated:p));setMedia([]);const library=await request(`/api/library?profileId=${encodeURIComponent(profile.id)}`);setMedia(library);setError('')}catch(e){setError(e.message)}}
  async function saveProgress(event){if(!selected||!profile||!Number.isFinite(event.target.currentTime))return;try{await request('/api/progress',{method:'POST',body:JSON.stringify({profileId:profile.id,mediaId:selected.id,positionSeconds:Math.floor(event.target.currentTime)})})}catch(e){setError(e.message)}}
  function switchProfile(){setProfile(null);setProfileToken('');setSelected(null);setMedia([]);setPinOpen(false);setError('')}

  return <main>
    <header><h1>King Videos</h1><UserButton/></header>
    {error&&<p role="alert">{error}</p>}
    {!profile?<section>
      <h2>Who's watching?</h2>
      <div className="grid">{profiles.map(p=><button key={p.id} onClick={()=>chooseProfile(p)}>{p.name}{p.isKids&&<small> Kids</small>}{p.hasPin&&<small> PIN</small>}</button>)}<button onClick={()=>setCreateOpen(true)}>Add profile</button></div>
      {pendingProfile&&<form className="dialog" onSubmit={event=>{event.preventDefault();unlock(pendingProfile,pin)}}>
        <h3>Enter PIN for {pendingProfile.name}</h3><input autoFocus inputMode="numeric" type="password" maxLength="4" pattern="[0-9]{4}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} aria-label="Four digit PIN"/>
        <div><button type="submit">Unlock</button> <button type="button" onClick={()=>{setPendingProfile(null);setPin('')}}>Cancel</button></div>
      </form>}
      {createOpen&&<form className="dialog" onSubmit={addProfile}>
        <h3>Add profile</h3><label>Name<input autoFocus maxLength="40" required value={newName} onChange={e=>setNewName(e.target.value)}/></label>
        <label>Optional four digit PIN<input inputMode="numeric" type="password" maxLength="4" pattern="[0-9]{4}" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,''))}/></label>
        <label className="check"><input type="checkbox" checked={newIsKids} onChange={e=>setNewIsKids(e.target.checked)}/> Kids profile</label>
        <div><button type="submit">Create</button> <button type="button" onClick={()=>setCreateOpen(false)}>Cancel</button></div>
      </form>}
    </section>:<>
      <nav><button onClick={switchProfile}>Switch profile</button><span>{profile.name}{profile.isKids?' · Kids':''}</span><button onClick={toggleKids}>{profile.isKids?'Make standard':'Make Kids'}</button><button onClick={()=>{setPin('');setPinOpen(true)}}>{profile.hasPin?'Change PIN':'Set PIN'}</button></nav>
      {pinOpen&&<form className="dialog" onSubmit={updatePin}><h3>{profile.hasPin?'Change or remove PIN':'Set profile PIN'}</h3><label>New four digit PIN<input autoFocus inputMode="numeric" type="password" maxLength="4" pattern="[0-9]{4}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label>{profile.hasPin&&<small>Leave blank to remove the PIN.</small>}<div><button type="submit">Save</button> <button type="button" onClick={()=>setPinOpen(false)}>Cancel</button></div></form>}
      <input aria-label="Search movies" placeholder="Search movies" value={query} onChange={e=>setQuery(e.target.value)}/>
      {selected&&<section><h2>{selected.title}</h2><video controls autoPlay src={selected.url} onPause={saveProgress} onEnded={saveProgress} onSeeked={saveProgress}/><button onClick={()=>setSelected(null)}>Close</button></section>}
      <section><h2>Library</h2><div className="grid">{media.filter(m=>m.title.toLowerCase().includes(query.toLowerCase())).map(m=><button className="card" key={m.id} onClick={()=>play(m)}>{m.thumbnailUrl&&<img src={m.thumbnailUrl} alt=""/>}<strong>{m.title}</strong><small>{m.category||'Movie'}</small></button>)}</div>{!media.length&&<p>No media yet. Add a movie to the catalog to begin.</p>}</section>
    </>}
  </main>
}

createRoot(document.getElementById('root')).render(key&&api?<ClerkProvider publishableKey={key}><SignedOut><main><h1>King Videos</h1><SignInButton mode="modal"><button>Sign in</button></SignInButton></main></SignedOut><SignedIn><App/></SignedIn></ClerkProvider>:<main><h1>King Videos</h1><p>Set VITE_CLERK_PUBLISHABLE_KEY and VITE_API_URL to configure this app.</p></main>)
