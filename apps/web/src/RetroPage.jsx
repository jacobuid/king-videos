import React from 'react'
import './retro.css'

const shelfBottoms=[24.2,41.1,56.8,72.8,88]
const tapesPerShelf=8

export default function RetroPage(){
  const base=import.meta.env.BASE_URL
  return <div className="retro-room">
    <img className="retro-background" src={`${base}retro.jpg`} alt="A colorful retro bedroom with wooden video shelves, a CRT television and a video game console" fetchPriority="high"/>
    <a className="retro-back" href={base}>← Back to KINGFLIX</a>
    <h1 className="retro-screen"><span>KINGFLIX</span><strong>RETRO</strong><small>Be kind. Rewind.</small></h1>
    <div className="retro-shelves" aria-label="VHS collection preview">
      {shelfBottoms.map((bottom,row)=><div className="retro-shelf" key={bottom} style={{bottom:`${100-bottom}%`}} aria-label={`Shelf ${row+1}`}>
        {Array.from({length:tapesPerShelf},(_,column)=><img key={column} className="retro-tape" src={`${base}vhs-placeholder.svg`} alt={`VHS tape placeholder ${row*tapesPerShelf+column+1}`} width="90" height="150" style={{filter:`hue-rotate(${(row*47+column*31)%360}deg)`}}/>)}
      </div>)}
    </div>
  </div>
}
