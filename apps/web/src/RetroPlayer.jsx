import KingflixPlayer from './KingflixPlayer'
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faExpand,faPlay,faPause,faBackward,faForward,faXmark} from '@fortawesome/free-solid-svg-icons'

const duration=ms=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:ms

export default function RetroPlayer({playback,television,saveProgress,onClose}){
  const shell=useRef(null),video=useRef(null),closeButton=useRef(null),animation=useRef(null),active=useRef(true)
  const initialized=useRef(false)
  const[fullscreenPlayback,setFullscreenPlayback]=useState(null)
  const lastPosition=useRef(null),lastSaved=useRef(-1),latestSave=useRef(saveProgress)
  const[paused,setPaused]=useState(true)
  const[phase,setPhase]=useState('opening'),[needsPlay,setNeedsPlay]=useState(false),[buffering,setBuffering]=useState(false),[error,setError]=useState('')
  latestSave.current=saveProgress
  function persist(force=false){
    const seconds=lastPosition.current
    if(!initialized.current||seconds===null||(!force&&Math.abs(seconds-lastSaved.current)<15))return
    if(seconds===lastSaved.current)return
    lastSaved.current=seconds
    void latestSave.current(playback,seconds)
  }
  function tvTransform(){
    const from=television.getBoundingClientRect(),to=shell.current.getBoundingClientRect()
    return `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`
  }
  async function start(){
    setError('');setNeedsPlay(false)
    try{await video.current.play()}catch{if(active.current)setNeedsPlay(true)}
  }
  useLayoutEffect(()=>{
    active.current=true
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    animation.current=shell.current.animate([{transform:tvTransform(),opacity:.5},{transform:'none',opacity:1}],{duration:duration(520),easing:'cubic-bezier(.2,.8,.2,1)'})
    animation.current.finished.then(()=>{if(active.current){setPhase('watching');closeButton.current?.focus({preventScroll:true});void start()}}).catch(()=>{})
    return()=>{active.current=false;animation.current?.cancel();document.body.style.overflow=previousOverflow}
  },[])
  useEffect(()=>{
    const flush=()=>persist(true),onVisibility=()=>{if(document.visibilityState==='hidden')flush()}
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',onVisibility)
    return()=>{persist(true);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',onVisibility)}
  },[])
  useEffect(()=>{
    const player=video.current
    const syncControls=()=>{
      if(document.fullscreenElement)return
      const fullscreenVideo=shell.current?.querySelector('.player-overlay video')
      const resume=fullscreenVideo&&!fullscreenVideo.paused
      if(fullscreenVideo)saveFullscreenProgress(fullscreenVideo.currentTime)
      setFullscreenPlayback(null)
      if(resume)requestAnimationFrame(()=>{if(active.current)void start()})
    }
    const nativeEnter=()=>{player.controls=true}
    const nativeExit=()=>{player.controls=false}
    document.addEventListener('fullscreenchange',syncControls)
    player.addEventListener('webkitbeginfullscreen',nativeEnter)
    player.addEventListener('webkitendfullscreen',nativeExit)
    return()=>{
      document.removeEventListener('fullscreenchange',syncControls)
      player.removeEventListener('webkitbeginfullscreen',nativeEnter)
      player.removeEventListener('webkitendfullscreen',nativeExit)
    }
  },[])
  async function close(){
    if(phase!=='watching')return
    setPhase('closing');video.current.pause();persist(true)
    try{
      if(document.fullscreenElement)await document.exitFullscreen()
      if(!active.current)return
      animation.current=shell.current.animate([{transform:'none',opacity:1},{transform:tvTransform(),opacity:.5}],{duration:duration(400),easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'})
      await animation.current.finished
      if(active.current)onClose()
    }catch{if(active.current)onClose()}
  }
  async function fullscreen(){
    const player=video.current,position=player.currentTime
    player.pause()
    setFullscreenPlayback({...playback,startAt:position})
    try{
      if(shell.current.requestFullscreen)await shell.current.requestFullscreen()
      // On iPad without element fullscreen, the normal player fills the viewport
      // and provides the same controls and native fullscreen option as elsewhere.
    }catch{ /* Keep the standard viewport player available. */ }
  }
  function saveFullscreenProgress(seconds){
    lastPosition.current=Math.floor(seconds)
    if(video.current&&Math.abs(video.current.currentTime-seconds)>1)video.current.currentTime=seconds
    persist(true)
  }
  function skip(seconds){
    const player=video.current
    if(!Number.isFinite(player.duration))return
    player.currentTime=Math.max(0,Math.min(player.duration,player.currentTime+seconds))
  }
  function onKeyDown(event){
    if(event.key==='Escape'&&!document.fullscreenElement){event.preventDefault();void close()}
    if(event.key==='Tab'){
      const targets=[...shell.current.querySelectorAll('button:not(:disabled),video')].filter(node=>node.getClientRects().length)
      const first=targets[0],last=targets.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  }
  return <div className={`retro-player-overlay retro-player-${phase}`} onKeyDown={onKeyDown}>
    <section ref={shell} className={`retro-crt-shell${fullscreenPlayback?' retro-standard-player':''}`} role="dialog" aria-modal="true" aria-label={`Watching ${playback.title}`}>
      {fullscreenPlayback&&<KingflixPlayer selected={fullscreenPlayback} saveProgress={saveFullscreenProgress} onClose={close}/>}
      <img className="retro-tv-frame" src={`${import.meta.env.BASE_URL}tv-modal.png`} alt="" aria-hidden="true" draggable="false"/>
      <header className="retro-crt-toolbar">
        <button ref={closeButton} className="retro-tv-exit" type="button" onClick={close} disabled={phase!=='watching'} aria-label="Return to VHS cover" title="Return to VHS cover"><FontAwesomeIcon icon={faXmark}/></button>

      </header>
      <div className="retro-tv-controls" role="group" aria-label="TV playback controls">
        <button type="button" onClick={()=>paused?start():video.current.pause()} disabled={phase!=='watching'} aria-label={paused?'Play':'Pause'} title={paused?'Play':'Pause'}><FontAwesomeIcon icon={paused?faPlay:faPause}/></button>
        <button type="button" onClick={()=>skip(-30)} disabled={phase!=='watching'} aria-label="Rewind 30 seconds" title="Rewind 30 seconds"><FontAwesomeIcon icon={faBackward}/></button>
        <button type="button" onClick={()=>skip(30)} disabled={phase!=='watching'} aria-label="Forward 30 seconds" title="Forward 30 seconds"><FontAwesomeIcon icon={faForward}/></button>
        <button type="button" onClick={fullscreen} disabled={phase!=='watching'} aria-label="Watch fullscreen" title="Fullscreen"><FontAwesomeIcon icon={faExpand}/></button>
      </div>
      <div className="retro-crt-screen">
        <video ref={video} playsInline preload="auto" tabIndex="0" aria-label={playback.title} onLoadedMetadata={()=>{const player=video.current;if(playback.startAt>0&&playback.startAt<player.duration){player.currentTime=playback.startAt}else initialized.current=true}}
          onTimeUpdate={()=>{lastPosition.current=Math.floor(video.current.currentTime);persist()}}
          onSeeked={()=>{initialized.current=true;lastPosition.current=Math.floor(video.current.currentTime);persist(true)}}
          onPlay={()=>setPaused(false)} onPlaying={()=>{setPaused(false);setNeedsPlay(false);setBuffering(false)}} onWaiting={()=>setBuffering(true)} onCanPlay={()=>setBuffering(false)}
          onPause={()=>{setPaused(true);lastPosition.current=Math.floor(video.current.currentTime);persist(true)}}
          onEnded={()=>{setPaused(true);lastPosition.current=Math.floor(video.current.currentTime);persist(true)}}
          onError={()=>{setBuffering(false);setError('This tape could not play. Return to its cover and try Play again.')}}>
          <source src={playback.url} type={playback.mimeType||'video/mp4'}/>
          {playback.subtitleUrl&&<track kind="captions" src={playback.subtitleUrl} srcLang="en" label="English"/>}
        </video>
        <div className="retro-crt-glass" aria-hidden="true"/>
        {needsPlay&&!error&&<button className="retro-player-start" type="button" onClick={start}><FontAwesomeIcon icon={faPlay}/> Play</button>}
        {buffering&&!error&&<span className="retro-player-status" role="status">Loading tape…</span>}
        {error&&<p className="retro-player-error" role="alert">{error}</p>}
      </div>
      <div className="retro-crt-footer" aria-hidden="true"><span className="retro-power-light"/> KINGFLIX · STEREO</div>
    </section>
  </div>
}
