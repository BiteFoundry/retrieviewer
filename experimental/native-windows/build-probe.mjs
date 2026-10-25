import fs from 'node:fs';import path from 'node:path';
const expected='let lease=await acquireAssets(loadAsset,artProfile),data=lease.data;';
const result=await Bun.build({entrypoints:['experimental/native-windows/probe-entry.mjs'],outdir:'dist/native-memory/bundle',target:'browser',format:'esm',external:['node:*'],plugins:[{name:'isolated-asset-adapter',setup(build){build.onLoad({filter:/[\\/](retrieviewer|braille|puppy-clean|puppy-paper|puppy-paper-seat|puppy-paper-actions|puppy-paper-contact|puppy-frame-indexed)\.mjs$/},args=>{
 let source=fs.readFileSync(args.path,'utf8');
 if(args.path.endsWith('puppy-frame-indexed.mjs'))source=source.replace('for(let r=0,at=0;r<h;r++){','if(globalThis.__fast)globalThis.__fast.decodeRows(frame,rows,x,y,w,h,width);else for(let r=0,at=0;r<h;r++){');
 if(args.path.endsWith('retrieviewer.mjs')){if(!source.includes(expected))throw Error('Unrecognized core');source=source.replace(expected,'let lease={data:globalThis.__probeAssets,release:()=>{}},data=lease.data;');}
 if(args.path.endsWith('braille.mjs'))source=source.replace("if(method==='stable')return stableBraille", "if(method==='stable'&&globalThis.__fast)return globalThis.__fast.braille(rgba,width,height,brightness,contrast);if(method==='stable')return stableBraille");
 source=source.replace('for(let i=0,j=0;i<stride;i++,j+=4){const value=a[i]*(1-alpha)+b[i]*alpha;output[j]=output[j+1]=output[j+2]=value;}','if(globalThis.__fast)globalThis.__fast.blendGray(output,a,b,alpha);else for(let i=0,j=0;i<stride;i++,j+=4){const value=a[i]*(1-alpha)+b[i]*alpha;output[j]=output[j+1]=output[j+2]=value;}');
 source=source.replaceAll('for(let i=0,j=0;i<stride;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];','if(globalThis.__fast)globalThis.__fast.copyGray(out,frame);else for(let i=0,j=0;i<stride;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];');
 source=source.replace('for(let j=0,i=0;i<320*320;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];','if(globalThis.__fast)globalThis.__fast.copyGray(out,frame);else for(let j=0,i=0;i<320*320;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];');
 if(args.path.endsWith('puppy-paper.mjs')){
  source=source.replace('if(minify)filter.prepare(image);','if(minify&&!(globalThis.__fast&&transport))filter.prepare(image);');
  source=source.replace('out.fill(0);for(let i=3;i<out.length;i+=4)out[i]=255;','if(globalThis.__fast)globalThis.__fast.clear(out);else{out.fill(0);for(let i=3;i<out.length;i+=4)out[i]=255;}');
  source=source.replace('for(let dy=Math.max(0,minify?Math.floor(drawTop)', 'if(globalThis.__fast&&transport)globalThis.__fast.blit(out,image,{width,height,sourceN,left,top,side,sideX,originX,originY,drawTop,bottom,drawLeft,drawRight,flip:state.flip,layers:transport.layers});else for(let dy=Math.max(0,minify?Math.floor(drawTop)');
 }
 return {contents:source,loader:'js',resolveDir:path.dirname(args.path)};
 });}}]});
if(!result.success)throw Error(result.logs.join('\n'));console.log(JSON.stringify({files:result.outputs.map(o=>({path:o.path,size:o.size})),scope:'benchmark-only adapter; production files unchanged'}));
