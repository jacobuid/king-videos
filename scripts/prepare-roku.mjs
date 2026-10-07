import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import sharp from 'sharp'
import QRCode from 'qrcode'
import {collections} from '../apps/web/src/collections.js'

// Only public URLs and curated collection metadata are packaged on the TV.
if(existsSync('.env'))process.loadEnvFile('.env')
else if(existsSync('../../.env'))process.loadEnvFile('../../.env')
const root=existsSync('apps/roku/manifest')?'apps/roku':'.'
const webRoot=root==='.'?'../web':'apps/web'
const api=process.env.VITE_API_URL
if(!api||!/^https:\/\//.test(api))throw Error('Set VITE_API_URL to the deployed HTTPS API before building Roku.')
const web=process.env.ROKU_WEB_URL||'https://jacobuid.github.io/king-videos/'
if(!/^https:\/\//.test(web))throw Error('ROKU_WEB_URL must be HTTPS')
const main=readFileSync(webRoot+'/src/main.jsx','utf8'),legacy=main.match(/const legacyProfilePictures=(\{[^\n]+\})/)[1]
const legacyAvatars=Function('return ('+legacy+')')()
writeFileSync(root+'/config.json',JSON.stringify({api:api.replace(/\/$/,''),web:web.replace(/\/?$/,'/'),collections,legacyAvatars},null,2)+'\n')
mkdirSync(root+'/images',{recursive:true})
const logo=webRoot+'/public/logo-kingflix.png'
await sharp(root+'/assets/roku-tile.png').resize(336,210,{fit:'contain',background:'#000000'}).png().toFile(root+'/images/channel-icon.png')
await sharp(logo).resize(336,210,{fit:'contain',background:'#101010'}).png().toFile(root+'/images/header-logo.png')
await sharp(root+'/assets/roku-loading.png').resize(1920,1080,{fit:'contain',background:'#000000'}).png().toFile(root+'/images/splash.png')
const trimmed=await sharp(logo).trim().png().toBuffer()
const logoInfo=await sharp(trimmed).metadata()
const crownWidth=Math.round(logoInfo.width*0.22),wordStart=Math.round(logoInfo.width*0.24)
const crown=await sharp(trimmed).extract({left:0,top:0,width:crownWidth,height:logoInfo.height}).resize(300,190,{fit:'contain',background:'#000000'}).png().toBuffer()
const wordmark=await sharp(trimmed).extract({left:wordStart,top:0,width:logoInfo.width-wordStart,height:logoInfo.height}).resize(900,180,{fit:'contain',background:'#000000'}).png().toBuffer()
await sharp({create:{width:1000,height:420,channels:3,background:'#000000'}}).composite([{input:crown,left:350,top:12},{input:wordmark,left:50,top:205}]).png().toFile(root+'/images/pairing-logo.png')
await QRCode.toFile(root+'/images/link-qr.png',web+'?roku=',{width:240,margin:3,errorCorrectionLevel:'M'})
const box=(width,height,stroke,fill,radius)=>Buffer.from('<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="'+(width-2)+'" height="'+(height-2)+'" rx="'+radius+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"/></svg>')
await sharp(box(64,116,'#eec052','#101419',12)).png().toFile(root+'/images/code-box.png')
await sharp(box(460,140,'#a55be2','#630bb2',20)).png().toFile(root+'/images/link-button.png')
console.log('Prepared public Roku configuration and KINGFLIX artwork.')
