// Test-only painter stand-in: no GUI, no art, and no external processes.
import {writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
writeFileSync(process.argv[2],JSON.stringify({pid:process.pid}));
const input=createInterface({input:process.stdin});
input.on('line',line=>{if(JSON.parse(line).type==='quit')process.exit(0);});
input.on('close',()=>process.exit(0));
if(process.argv[3]==='ready')console.log(JSON.stringify({type:'ready',pickerVisible:true}));
