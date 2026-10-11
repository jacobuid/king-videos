import React,{useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faArrowRotateRight,faPlay,faRotateLeft} from '@fortawesome/free-solid-svg-icons'
import RetroPlayer from './RetroPlayer'
import './retro.css'
import retroMedia from './retro-media.json'

const shelfBottoms=[24.2,41.1,56.8,72.8,88]
const tapesPerShelf=8
const motionDuration=ms=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:ms
const artworkUrl=path=>/^https?:\/\//i.test(path)?path:`${import.meta.env.BASE_URL}${path}`

function VhsCase({item,back=false}){
  const base=import.meta.env.BASE_URL
  return <div className={`retro-case${back?' retro-case-back':''}`}>
    <div className={`retro-case-paper${back&&item.retroBackThumbnail?' has-back-art':''}`}>{back?(item.retroBackThumbnail?<img src={artworkUrl(item.retroBackThumbnail)} alt={`${item.title} back cover`}/>:<><strong>{item.title}</strong>{item.year&&<span>{item.year}</span>}<p>{item.description}</p><small>KINGFLIX HOME VIDEO<br/>Be kind. Rewind.</small></>):<img src={artworkUrl(item.retroThumbnail||'vhs-placeholder.svg')} alt=""/>}</div>
    <img className="retro-case-frame" src={`${base}vhs-${back?'back':'front'}.png`} alt="" draggable="false"/>
  </div>
}

function TapeDialog({item,origin,onClose,onPrepare,onPlay,skipEntrance=false}){
  const flight=useRef(null),dialog=useRef(null),putBack=useRef(null),animation=useRef(null),mounted=useRef(true)
  const[flipped,setFlipped]=useState(false),[phase,setPhase]=useState('opening')
  const[error,setError]=useState('')
  const busy=phase!=='ready'
  function shelfTransform(){
    const from=origin.getBoundingClientRect(),to=flight.current.getBoundingClientRect()
    return `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`
  }
  useLayoutEffect(()=>{
    mounted.current=true
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    if(skipEntrance){setPhase('ready');putBack.current?.focus({preventScroll:true});return()=>{mounted.current=false;animation.current?.cancel();document.body.style.overflow=previousOverflow}}
    animation.current=flight.current.animate([{transform:shelfTransform()},{transform:'none'}],{duration:motionDuration(480),easing:'cubic-bezier(.2,.8,.2,1)'})
    animation.current.finished.then(()=>{if(mounted.current){setPhase('ready');putBack.current?.focus({preventScroll:true})}}).catch(()=>{})
    return()=>{mounted.current=false;animation.current?.cancel();document.body.style.overflow=previousOverflow}
  },[])
  async function close(){
    if(busy)return
    setPhase('returning')
    animation.current=flight.current.animate([{transform:'none'},{transform:shelfTransform()}],{duration:motionDuration(430),easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'})
    try{await animation.current.finished;if(mounted.current)onClose()}catch{}
  }
  async function play(){
    if(busy)return
    setError('');setPhase('preparing')
    try{
      const playback=await onPrepare(item)
      if(!mounted.current)return
      setPhase('inserting')
      animation.current=flight.current.animate([{transform:'none',opacity:1},{transform:'translateY(100vh) rotate(5deg)',opacity:0}],{duration:motionDuration(520),easing:'cubic-bezier(.5,0,.8,.3)',fill:'forwards'})
      await animation.current.finished
      if(mounted.current)onPlay(playback)
    }catch(e){if(mounted.current){setPhase('ready');setError(e.message||'Could not load this tape.')}}
  }
  function onKeyDown(event){
    if(event.key==='Escape'){event.preventDefault();void close()}
    if(event.key==='Tab'){
      const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')]
      if(!buttons.length){event.preventDefault();return}
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus()}
      else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus()}
    }
  }
  return <div className={`retro-modal retro-modal-${phase}`} onKeyDown={onKeyDown}>
    <section ref={dialog} className="retro-dialog" role="dialog" aria-modal="true" aria-label={`${item.title} VHS preview`}>
      <div ref={flight} className="retro-flight">
        <div className={`retro-flipper${flipped?' is-flipped':''}`}>
          <div className="retro-face" aria-hidden={flipped}><VhsCase item={item}/></div>
          {item.retroBackThumbnail&&<div className="retro-face retro-face-back" aria-hidden={!flipped}><VhsCase item={item} back/></div>}
        </div>
        {item.retroBackThumbnail&&<button className="retro-flip" type="button" onClick={()=>setFlipped(value=>!value)} disabled={busy} aria-label={flipped?'Show front cover':'Show back cover'} title="Flip tape"><FontAwesomeIcon icon={faArrowRotateRight}/></button>}
      </div>
      <div className="retro-dialog-actions">
        <button ref={putBack} className="retro-put-back" type="button" onClick={close} disabled={busy}><FontAwesomeIcon icon={faRotateLeft}/> Put Back</button>
        <button className="retro-play-tape" type="button" onClick={play} disabled={busy||item.blocked}><FontAwesomeIcon icon={faPlay}/> {item.blocked?'Blocked':phase==='preparing'?'Loading…':'Play'}</button>
      </div>
      {error&&<p className="retro-dialog-error" role="alert">{error}</p>}
    </section>
  </div>
}

export default function RetroPage({media=[],progress=[],getPlayback,saveProgress}){
  const base=import.meta.env.BASE_URL
  const[chosen,setChosen]=useState(null),[playing,setPlaying]=useState(null),[stage,setStage]=useState('idle'),[page,setPage]=useState(0),[returnToCover,setReturnToCover]=useState(false)
  const origin=useRef(null),television=useRef(null)
  const tapes=media.filter(item=>item.retro===true).map(item=>{const art=retroMedia.find(cover=>cover.id===item.id);return {...item,retroThumbnail:art?.retroThumbnail||item.thumbnailUrl,retroBackThumbnail:art?.retroBackThumbnail}})
  const pages=Math.max(1,Math.ceil(tapes.length/(tapesPerShelf*shelfBottoms.length)))
  const visible=tapes.slice(page*40,(page+1)*40)
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[pages,page])
  useEffect(()=>{if(stage!=='starting')return;const timer=setTimeout(()=>setStage('watching'),motionDuration(1500));return()=>clearTimeout(timer)},[stage])
  function choose(index,node){origin.current=node;setReturnToCover(false);setChosen(index)}
  function putBack(){setChosen(null);origin.current?.focus({preventScroll:true})}
  async function prepare(item){const response=await getPlayback(item),position=progress.find(p=>p.mediaId===item.id)?.positionSeconds||0;return {...response,startAt:position<(item.durationSeconds||Infinity)*.98?position:0}}
  function play(playback){setChosen(null);setPlaying(playback);setStage('starting')}
  function closePlayer(){setReturnToCover(true);setChosen(playing);setPlaying(null);setStage('idle')}
  const modalOpen=chosen!==null||stage==='watching'
  return <><div className="retro-room" inert={modalOpen?'':undefined} aria-hidden={modalOpen?true:undefined}>
    <img className="retro-background" src={`${base}retro.jpg`} alt="A colorful retro bedroom with wooden video shelves, a CRT television and a video game console" fetchPriority="high"/>
    <a className="retro-back" href={base}>← Back to KINGFLIX</a>
    <div ref={television} className="retro-television" role="status"><div className="retro-tv-idle"><span>KINGFLIX</span><strong>{stage==='starting'?'PLAY ▶':'INSERT A VHS TAPE'}</strong><small>Be kind. Rewind.</small></div>{stage==='starting'&&<div className="retro-tv-static" aria-hidden="true"/>}</div>
    <div className="retro-shelves" aria-label="VHS collection preview">
      {shelfBottoms.map((bottom,row)=><div className="retro-shelf" key={bottom} style={{bottom:`${100-bottom}%`}} aria-label={`Shelf ${row+1}`}>
        {visible.slice(row*tapesPerShelf,(row+1)*tapesPerShelf).map(item=><button key={item.id} className={`retro-tape${chosen?.id===item.id?' is-selected':''}`} type="button" disabled={stage!=='idle'} onClick={event=>choose(item,event.currentTarget)} aria-label={`Pick up ${item.title}`}><img className="retro-shelf-cover" src={artworkUrl(item.retroThumbnail||'vhs-placeholder.svg')} alt="" draggable="false"/></button>)}
      </div>)}
    </div>
    {!tapes.length&&<p className="retro-empty">No retro movies are available for this profile yet.</p>}
    {pages>1&&<nav className="retro-pagination" aria-label="More VHS shelves"><button onClick={()=>setPage(p=>p-1)} disabled={page===0||stage!=='idle'} aria-label="Previous shelves">◀</button><span>{page+1} / {pages}</span><button onClick={()=>setPage(p=>p+1)} disabled={page===pages-1||stage!=='idle'} aria-label="Next shelves">▶</button></nav>}
  </div>{chosen!==null&&<TapeDialog item={chosen} origin={origin.current} onClose={putBack} onPrepare={prepare} onPlay={play} skipEntrance={returnToCover}/>}{stage==='watching'&&playing&&<RetroPlayer playback={playing} television={television.current} saveProgress={saveProgress} onClose={closePlayer}/>}</>
}
