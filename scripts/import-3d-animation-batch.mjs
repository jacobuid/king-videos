import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const value=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined}
const shardIndex=Number(value('--shard-index')||0),shardCount=Number(value('--shard-count')||2),concurrency=Number(value('--concurrency')||3)
const manifestsRoot=resolve(value('--manifests')||'media-imports/3d-animation'),sourceRoot=resolve(value('--folder')||'D:/king-videos/3D Animation-compressed')
if(!Number.isInteger(shardIndex)||!Number.isInteger(shardCount)||shardIndex<0||shardIndex>=shardCount||!Number.isInteger(concurrency)||concurrency<1)throw new Error('Invalid shard or concurrency settings')
const folders=(await readdir(manifestsRoot,{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort(),selected=folders.filter((_,index)=>index%shardCount===shardIndex)
let next=0,failed=[]
async function run(id){const manifestPath=join(manifestsRoot,id,'media.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8')),folder=join(sourceRoot,manifest.sourceFolder);await new Promise((done,reject)=>{const child=spawn(process.execPath,['--env-file=.env','scripts/import-b2-movie.mjs',manifestPath,'--folder',folder,'--concurrency','3','--resume'],{cwd:process.cwd(),stdio:'inherit'});child.once('exit',code=>code===0?done():reject(new Error(`${id} exited with code ${code}`)));child.once('error',reject)})}
async function worker(){while(next<selected.length){const id=selected[next++];console.log(`[Shard ${shardIndex+1}/${shardCount}] Importing ${id}`);try{await run(id)}catch(error){failed.push({id,error:String(error)});console.error(error)}}}
console.log(`Starting shard ${shardIndex+1}/${shardCount}: ${selected.length} movies, ${concurrency} workers`)
await Promise.all(Array.from({length:Math.min(concurrency,selected.length)},worker))
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exitCode=1}else console.log(`Shard ${shardIndex+1}/${shardCount} complete`)
