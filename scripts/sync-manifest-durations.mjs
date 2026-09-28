import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const manifestPath=resolve(process.argv[2]||''),folder=resolve(process.argv[3]||'')
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node scripts/sync-manifest-durations.mjs <media.json> <video-folder>')
function findHandBrake(){if(process.env.HANDBRAKE_PATH&&existsSync(process.env.HANDBRAKE_PATH))return process.env.HANDBRAKE_PATH;const root=join(process.env.LOCALAPPDATA||'','Microsoft','WinGet','Packages');for(const packageName of existsSync(root)?readdirSync(root):[]){const candidate=join(root,packageName,'HandBrakeCLI.exe');if(existsSync(candidate))return candidate}throw new Error('HandBrakeCLI.exe was not found')}
function jsonBlock(text){const start=text.indexOf('{',text.indexOf('JSON Title Set:'));let depth=0,string=false,escape=false;for(let index=start;index<text.length;index++){const char=text[index];if(string){if(escape)escape=false;else if(char==='\\')escape=true;else if(char==='"')string=false;continue}if(char==='"'){string=true;continue}if(char==='{')depth++;else if(char==='}'&&--depth===0)return JSON.parse(text.slice(start,index+1))}throw new Error('HandBrake JSON was not found')}
function scan(file){return new Promise((resolveScan,reject)=>{const child=spawn(findHandBrake(),['--scan','--json','-i',file],{windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>{try{if(code!==0)throw new Error(`HandBrake exited ${code}`);const value=jsonBlock(output).TitleList[0].Duration;resolveScan(value.Hours*3600+value.Minutes*60+value.Seconds)}catch(error){reject(error)}})})}
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),queue=[...(manifest.items||manifest.episodes||[])];let cursor=0,completed=0
async function worker(){while(cursor<queue.length){const item=queue[cursor++],file=item.video||item.file;if(!file)throw new Error(`${item.title||'Manifest item'} has no video or file property`);item.duration=await scan(resolve(folder,file));completed++;console.log(`${completed}/${queue.length} ${item.title}: ${item.duration}s`)}}
await Promise.all(Array.from({length:4},worker));await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n')
