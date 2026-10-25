import * as std from 'qjs:std';import * as os from 'qjs:os';
import {runProbe} from '../../dist/native-memory/bundle/probe-entry.js';
const root=scriptArgs[1];
const recordPath=scriptArgs.find(s=>s.startsWith('--record='))?.slice(9),record=recordPath?std.open(recordPath,'wb'):null;
try{await runProbe({recordFrame:record?f=>{if(record.write(f.pixels.buffer,f.pixels.byteOffset,f.pixels.byteLength)!==f.pixels.byteLength)throw Error('Short pixel write');}:undefined,desktop:scriptArgs.includes('--desktop'),now:()=>Date.now(),sleep:ms=>os.sleep(ms),log:o=>console.log(JSON.stringify(o)),json:name=>JSON.parse(std.loadFile(root+'/'+name)),open:name=>{const file=std.open(root+'/'+name,'rb');if(!file)throw Error('Cannot open '+name);file.seek(0,std.SEEK_END);const size=file.tell();return {size,read:(at,n)=>{file.seek(at,std.SEEK_SET);const b=new Uint8Array(n),got=file.read(b.buffer,0,n);if(got!==n)throw Error('Short read');return b;},close:()=>file.close()};}});}finally{record?.close();}
