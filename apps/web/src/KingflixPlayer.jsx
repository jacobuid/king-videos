import React,{useEffect,useRef,useState} from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faPlay,faPause,faXmark,faRotateLeft,faRotateRight} from '@fortawesome/free-solid-svg-icons'
import {MediaPlayer as VidstackMediaPlayer,MediaProvider,Track} from '@vidstack/react'
import {defaultLayoutIcons,DefaultVideoLayout} from '@vidstack/react/player/layouts/default'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'
import './player.css'
const MediaPlayer=React.forwardRef((props,ref)=><VidstackMediaPlayer ref={ref} controlsDelay={5000} {...props}/>)
function mediaCrossOrigin(url){try{return new URL(url).hostname.endsWith('.backblazeb2.com')?'anonymous':undefined}catch{return undefined}}
function Logo(){return <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo-kingflix.png`} alt="Kingflix"/>}
function formatDuration(seconds){if(!seconds)return '';const minutes=Math.round(seconds/60),hours=Math.floor(minutes/60),remaining=minutes%60;return hours?`${hours}h${remaining?` ${remaining}m`:''}`:`${minutes}m`}
export default function KingflixPlayer({selected,saveProgress,onClose,nextEpisode=null,play}){
 const player=useRef(null),lastCheckpoint=useRef(0),position=useRef(null),ready=useRef(false),latestSave=useRef(saveProgress)
 latestSave.current=saveProgress
 useEffect(()=>()=>{if(position.current!==null)latestSave.current(position.current)},[selected.id])
 const[showNextCard,setShowNextCard]=useState(false)
 useEffect(()=>setShowNextCard(false),[selected.id])
  function checkpoint(){if(!ready.current||player.current?.seeking)return;position.current=player.current?.currentTime??position.current;const second=Math.floor(player.current?.currentTime||0);if(second-lastCheckpoint.current>=15){lastCheckpoint.current=second;saveProgress(second)}}
  function savePlayerProgress(){if(!ready.current||player.current?.seeking)return;if(player.current){position.current=player.current.currentTime;saveProgress(position.current)}}
  function togglePlayerControls(event){if(event.target.closest?.('.vds-controls,button,input,select,[role="menu"]'))return;player.current?.remoteControl?.toggleControls(event.nativeEvent)}
  async function togglePlayback(event){const button=event?.currentTarget;if(button){window.clearTimeout(button._playFeedbackTimer);button.classList.remove('play-feedback');void button.offsetWidth;button.classList.add('play-feedback');button._playFeedbackTimer=window.setTimeout(()=>button.classList.remove('play-feedback'),550)}try{if(player.current?.paused)await player.current.play();else await player.current?.pause()}catch{}}
  function skipPlayer(seconds,event){if(!player.current)return;const button=event?.currentTarget;if(button){window.clearTimeout(button._skipFeedbackTimer);button._skipFeedbackTotal=(button._skipFeedbackTotal||0)+seconds;button.dataset.feedback=`${button._skipFeedbackTotal>0?'+':''}${button._skipFeedbackTotal}`;button.classList.remove('skip-feedback');void button.offsetWidth;button.classList.add('skip-feedback');button._skipFeedbackTimer=window.setTimeout(()=>{button.classList.remove('skip-feedback');button._skipFeedbackTotal=0;button.dataset.feedback=seconds>0?'+10':'−10'},700)}player.current.remoteControl?.pauseControls(event?.nativeEvent);player.current.remoteControl?.resumeControls(event?.nativeEvent);const duration=Number.isFinite(player.current.duration)?player.current.duration:Infinity;player.current.currentTime=Math.max(0,Math.min(duration,player.current.currentTime+seconds));savePlayerProgress()}
  async function exitPlayerFullscreen(){
    const video=player.current?.querySelector?.('video')
    const nativeFullscreen=Boolean(video?.webkitDisplayingFullscreen||video?.webkitPresentationMode==='fullscreen')
    const nativeExit=nativeFullscreen?new Promise(resolve=>{let finished=false;const done=()=>{if(finished)return;finished=true;video?.removeEventListener?.('webkitendfullscreen',done);resolve()};video?.addEventListener?.('webkitendfullscreen',done,{once:true});window.setTimeout(done,1200)}):Promise.resolve()
    try{
      if(typeof player.current?.exitFullscreen==='function')await player.current.exitFullscreen('prefer-media')
    }catch{}
    try{
      if(video?.webkitDisplayingFullscreen&&typeof video.webkitExitFullscreen==='function')video.webkitExitFullscreen()
      else if(video?.webkitPresentationMode==='fullscreen'&&typeof video.webkitSetPresentationMode==='function')video.webkitSetPresentationMode('inline')
    }catch{}
    try{
      if(document.fullscreenElement&&typeof document.exitFullscreen==='function')await document.exitFullscreen()
      else if(document.webkitFullscreenElement&&typeof document.webkitExitFullscreen==='function')await document.webkitExitFullscreen()
    }catch{}
    await nativeExit
  }
  async function finishPlayback(){savePlayerProgress();await exitPlayerFullscreen();setShowNextCard(Boolean(nextEpisode))}
  async function closePlayer(){savePlayerProgress();await exitPlayerFullscreen();onClose()}

 return <section className="player-overlay"><div className="player-stage"><MediaPlayer key={selected.id} ref={player} title={selected.title} src={{src:selected.url,type:selected.mimeType||'video/mp4'}} autoPlay playsInline load="eager" crossOrigin={mediaCrossOrigin(selected.url)} onClick={togglePlayerControls} onLoadedMetadata={()=>{const startAt=selected.startAt||0;ready.current=startAt===0;if(player.current)player.current.currentTime=startAt;lastCheckpoint.current=Math.floor(startAt)}} onTimeUpdate={checkpoint} onPlay={()=>setShowNextCard(false)} onPause={savePlayerProgress} onEnded={finishPlayback} onSeeked={()=>{if(!ready.current&&Math.abs((player.current?.currentTime||0)-(selected.startAt||0))>.5)return;ready.current=true;savePlayerProgress()}}><MediaProvider>{selected.subtitleUrl&&<Track default src={selected.subtitleUrl} kind="subtitles" label="English" lang="en" type="vtt"/>}</MediaProvider><DefaultVideoLayout icons={defaultLayoutIcons} noGestures slots={{playButton:null}}/><div className="player-pause-info"><Logo/><strong>{selected.title}</strong><span>{[selected.year,selected.rating,formatDuration(selected.durationSeconds)].filter(Boolean).join(' · ')}</span></div><button className="player-close" onClick={closePlayer} aria-label="Close video" title="Close video"><FontAwesomeIcon icon={faXmark}/></button><div className="player-center-controls"><button className="player-skip" data-feedback="−10" onClick={event=>skipPlayer(-10,event)} aria-label="Go back 10 seconds"><FontAwesomeIcon icon={faRotateLeft}/><b>10</b></button><button className="player-center-play" onClick={togglePlayback} aria-label="Play or pause video"><FontAwesomeIcon className="center-play-icon" icon={faPlay}/><FontAwesomeIcon className="center-pause-icon" icon={faPause}/></button><button className="player-skip" data-feedback="+10" onClick={event=>skipPlayer(10,event)} aria-label="Go forward 10 seconds"><FontAwesomeIcon icon={faRotateRight}/><b>10</b></button></div>{showNextCard&&nextEpisode&&<button className="next-episode-card" onClick={()=>play(nextEpisode)} aria-label={`Play next episode: ${nextEpisode.title}`}><span className="next-episode-label">Up next</span>{nextEpisode.thumbnailUrl?<img src={nextEpisode.thumbnailUrl} alt=""/>:<span className="next-episode-placeholder"><FontAwesomeIcon icon={faPlay}/></span>}<span className="next-episode-copy"><small>{nextEpisode.seasonNumber?`Season ${nextEpisode.seasonNumber} · `:''}Episode {nextEpisode.episodeNumber||''}</small><strong>{nextEpisode.title}</strong><span><FontAwesomeIcon icon={faPlay}/> Play next episode</span></span></button>}</MediaPlayer></div></section>
}
