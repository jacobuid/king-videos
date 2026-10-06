import React,{useEffect,useState} from 'react'

export default function RokuDevices({request,onDone}){
  const[code,setCode]=useState(()=>new URLSearchParams(window.location.search).get('roku')||'')
  const[name,setName]=useState('Living room Roku'),[devices,setDevices]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[linked,setLinked]=useState(false)
  async function load(){setDevices(await request('/api/roku/devices'))}
  useEffect(()=>{load().catch(error=>setError(error.message))},[])
  async function link(event){event.preventDefault();setBusy(true);setError('');try{await request('/api/roku/link',{method:'POST',body:JSON.stringify({code,name})});setLinked(true);setCode('');await load()}catch(error){setError(error.message)}finally{setBusy(false)}}
  async function remove(id){setBusy(true);setError('');try{await request('/api/roku/devices/'+encodeURIComponent(id),{method:'DELETE'});await load()}catch(error){setError(error.message)}finally{setBusy(false)}}
  return <section className="profile-stage"><form className="profile-form" onSubmit={link}><h2>Link your Roku</h2><p>Enter the code displayed by the KINGFLIX app on your TV.</p>{error&&<p role="alert">{error}</p>}{linked&&<p role="status">Roku linked. Choose a profile on your TV to start watching.</p>}<label>TV code<input autoFocus required maxLength="9" autoComplete="off" value={code} onChange={event=>{setCode(event.target.value.toUpperCase());setLinked(false)}} placeholder="ABCD1234"/></label><label>Device name<input required maxLength="60" value={name} onChange={event=>setName(event.target.value)}/></label><div className="form-actions"><button className="primary-button" disabled={busy} type="submit">{busy?'Linking…':'Link Roku'}</button><button type="button" onClick={onDone}>Done</button></div>{devices.length>0&&<><h3>Linked devices</h3>{devices.map(device=><div className="form-actions" key={device.id}><span>{device.name}</span><button type="button" className="danger-button" disabled={busy} onClick={()=>remove(device.id)}>Unlink</button></div>)}</>}</form></section>
}
