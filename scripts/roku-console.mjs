import net from 'node:net'
const host=process.argv[2]
if(!host||net.isIP(host)===0)throw Error('Usage: node scripts/roku-console.mjs <Roku IP address>')
const socket=net.createConnection({host,port:8085})
socket.setTimeout(10000,()=>{console.error('Roku console timed out. Check Developer Mode and the IP address.');socket.destroy();process.exitCode=1})
socket.on('connect',()=>{socket.setTimeout(0);console.log('Connected to the Roku developer console. Press Ctrl+C to stop.')})
socket.on('data',chunk=>process.stdout.write(chunk))
socket.on('error',error=>{console.error(error.message);process.exitCode=1})
process.on('SIGINT',()=>{socket.end();process.exit(0)})
