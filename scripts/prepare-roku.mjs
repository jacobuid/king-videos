import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import sharp from 'sharp'
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
await sharp(logo).resize(336,210,{fit:'contain',background:'#101010'}).png().toFile(root+'/images/channel-icon.png')
await sharp(logo).resize(1920,1080,{fit:'contain',background:'#101010'}).png().toFile(root+'/images/splash.png')
console.log('Prepared public Roku configuration and KINGFLIX artwork.')
