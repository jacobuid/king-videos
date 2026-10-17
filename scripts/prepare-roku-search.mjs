import {mkdirSync,writeFileSync} from 'node:fs'
import sharp from 'sharp'

export async function prepareRokuSearch(root){
  mkdirSync(root+'/data',{recursive:true})
  const modes={letters:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',numbers:'0123456789.,!?&-+/:;()[]@#%',accents:'ÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕØÚÙÛÜÝŸßŒ'}
  const key=label=>({label})
  const grids=Object.entries(modes).map(([mode,letters])=>({modes:mode,rows:[
    {keys:[...letters.slice(0,13)].map(key)},
    {keys:[...letters.slice(13,26)].map(key)},
    {keys:[...'1234567890'].map(key).concat({label:'⌫',strOut:'backspace',autoRepeat:1})},
    {keys:[{label:'ABC',strOut:'letters',keyWidthFHD:110,keyWidthHD:73},{label:'123',strOut:'numbers',keyWidthFHD:110,keyWidthHD:73},{label:'áéü',strOut:'accents',keyWidthFHD:110,keyWidthHD:73},{label:'Space',strOut:'space'},{label:'Clear',strOut:'clear',keyWidthFHD:110,keyWidthHD:73}]}
  ]}))
  writeFileSync(root+'/data/search-keyboard.json',JSON.stringify({keyboardWidthFHD:1105,keyboardHeightFHD:300,keyboardWidthHD:737,keyboardHeightHD:200,sections:[{grids}]},null,2))
  const svg=(w,h,body)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)
  const output=async(name,w,h,body)=>sharp(svg(w,h,body)).png().toFile(`${root}/images/search-${name}.png`)
  const rounded=(w,h,fill,stroke,r=10,sw=2)=>`<rect x="${sw/2}" y="${sw/2}" width="${w-sw}" height="${h-sw}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
  const gold='<defs><linearGradient id="gold"><stop stop-color="#ffe681"/><stop offset=".6" stop-color="#efc443"/><stop offset="1" stop-color="#917022"/></linearGradient></defs>'
  await output('field',1460,88,rounded(1460,88,'#111214','#f3cc57',13,3))
  await output('nav',290,76,rounded(290,76,'transparent','transparent'))
  await output('nav-gold',290,76,gold+rounded(290,76,'url(#gold)','#ffe78c',10))
  await output('nav-active',290,76,rounded(290,76,'#ffffff','#ffffff',10))
  await sharp(svg(230,74,rounded(230,74,'#a5202c','#d84a55',10))).png().toFile(`${root}/images/detail-blocked.png`)
  await output('nav-focus',290,76,rounded(290,76,'none','#ffffff',10,3))
  await output('chip',280,46,rounded(280,46,'#1a1c1e','#727272',23))
  await output('chip-focus',280,46,rounded(280,46,'#342a13','#f3cc57',23,3))
  await output('card',234,265,rounded(234,265,'#101112','#383838',7))
  await output('card-focus',234,265,rounded(234,265,'#17150f','#f3cc57',7,3))
  const paths={
    'detail-play':'<path d="M10 5 34 20 10 35Z" fill="white" stroke="none"/>',
    'detail-back':'<path d="M23 7 10 20l13 13 M11 20h25"/>',
    'detail-plus':'<path d="M20 5v30 M5 20h30"/>',
    'detail-check':'<path d="m6 21 9 9L35 9"/>',
    'detail-episodes':'<path d="M14 9h23 M14 20h23 M14 31h23 M4 9h1 M4 20h1 M4 31h1"/>',
    'detail-blocked':'<circle cx="20" cy="20" r="15"/><path d="m10 10 20 20"/>',
    'home-videos':'<rect x="2" y="10" width="25" height="23" rx="4"/><path d="m27 17 11-6v21l-11-6Z M8 6h13"/>',
    icon:'<circle cx="16" cy="16" r="11"/><path d="m24 24 11 11"/>',
    heart:'<path d="M20 34 5 19C-6 6 12-2 20 9 28-2 46 6 35 19Z"/>',
    movies:'<path d="M8 13h24l-3 23H11Z M7 13c-5-8 4-14 9-9 3-8 13-5 13 1 8-1 11 7 3 8 M16 18v13 M23 18v13"/>',
    shows:'<rect x="3" y="12" width="34" height="24" rx="4"/><path d="m12 2 8 10 8-10 M11 22h1"/>',
    profile:'<circle cx="20" cy="12" r="8"/><path d="M5 37v-5c0-12 30-12 30 0v5Z"/>',
    vhs:'<rect x="2" y="7" width="36" height="26" rx="3"/><rect x="7" y="12" width="26" height="12" rx="2"/><circle cx="12" cy="18" r="3"/><circle cx="28" cy="18" r="3"/><path d="M15 18h10 M13 29h14"/>',
    link:'<path d="m16 25-4 4a7 7 0 0 1-10-10l9-9a7 7 0 0 1 10 0 M24 15l4-4a7 7 0 0 1 10 10l-9 9a7 7 0 0 1-10 0 M13 27l14-14"/>'
  }
  for(const [name,p] of Object.entries(paths))await output(name,40,40,`<g fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${p}</g>`)
  // Deterministic ambient backdrop; no movie artwork or mockup content is baked in.
  await output('backdrop',1920,1080,'<defs><radialGradient id="warm"><stop stop-color="#5d4118" stop-opacity=".2"/><stop offset="1" stop-color="#030405" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="#060708"/><ellipse cx="1440" cy="430" rx="950" ry="590" fill="url(#warm)"/>')
}
