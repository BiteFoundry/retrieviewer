// Loaded only by the default local Node host; browsers never import node:fs.
import {openSync,readSync,fstatSync,closeSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {indexedIndexLength,readIndexedIndex,createIndexedFrameStore} from './puppy-frame-indexed.mjs';
import {registerFrameStore} from './puppy-frame-store.mjs';

export function openFrameFile(url,options){
 const fd=openSync(url,'r');let owned=true;
 try{
  const stat=fstatSync(fd);if(!stat.isFile())throw Error('Invalid frame file');
  const read=(offset,size)=>{const out=new Uint8Array(size);let at=0;while(at<size){const n=readSync(fd,out,at,size-at,offset+at);if(!n)throw Error('Truncated frame file');at+=n;}return out;};
  const header=read(0,20),length=indexedIndexLength(header),index=readIndexedIndex(read(0,length),stat.size);
  const store=registerFrameStore(createIndexedFrameStore(index,{...options,read,expand:(b,n)=>gunzipSync(b,{maxOutputLength:Math.max(1,n)}),close:()=>closeSync(fd)}));owned=false;return store;
 }finally{if(owned)closeSync(fd);}
}
