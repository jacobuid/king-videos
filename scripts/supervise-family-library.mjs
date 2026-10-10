import {readFileSync,writeFileSync,existsSync,appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';

// Keep the authorized queue moving even when the interactive session is idle.
// Never reset a live queue; retries resume from its successful publication log.
const batch=process.env.FAMILY_BATCH||'oct10-family';
if(!/^[a-z0-9-]+$/.test(batch))throw Error('Invalid batch name');
const statusPath=`logs/${batch}-supervisor.json`;
const supervisor={state:'monitoring',attempt:0,lastFailures:[]};
function save(){supervisor.updatedAt=new Date().toISOString();writeFileSync(statusPath,JSON.stringify(supervisor,null,2));}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
let pid=Number(readFileSync(`logs/${batch}.pid`,'utf8').trim());
save();
while(true){
 while(alive(pid)){await sleep(60000);}
 const status=JSON.parse(readFileSync(`logs/${batch}-status.json`,'utf8'));
 supervisor.lastFailures=status.failures;supervisor.completed=status.completed;supervisor.total=status.total;save();
 if(status.completed+status.skipped===status.total&&status.failures.length===0){supervisor.state='queue-finished';save();break;}
 supervisor.attempt++;
 if(supervisor.attempt>3){supervisor.state='needs-agent-review';save();break;}
 supervisor.state='retrying';save();
 await sleep(Math.min(supervisor.attempt*60000,180000));
 const child=spawn(process.execPath,['--env-file=.env','--import','./scripts/b2-upload-agent.mjs','scripts/process-family-library.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>appendFileSync(`logs/${batch}-run.log`,data));
 child.stderr.on('data',data=>appendFileSync(`logs/${batch}-errors.log`,data));
 child.on('error',error=>{supervisor.error=error.message;save();});
 pid=child.pid;supervisor.pid=pid;writeFileSync(`logs/${batch}.pid`,String(pid));supervisor.state='monitoring';save();
 await new Promise(resolve=>child.once('exit',resolve));
}
