// Pure transport helpers: no art, timers, processes or I/O on import.
export function viewportOf(message){
 if(message?.type!=='viewport'||!Number.isSafeInteger(message.revision)||message.revision<1||typeof message.visible!=='boolean')throw Error('Invalid overlay viewport');
 if(!message.visible)return null;
 const {columns,rows,cellWidth,cellHeight}=message;
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>125000||![6,8,10,12,16].includes(cellWidth)||cellHeight!==cellWidth*2)throw Error('Invalid overlay grid');
 return {columns,rows,cellAspect:.5,revision:message.revision,cellWidth,cellHeight};
}
export function cropFrame(frame,revision){
 const lines=frame.text.split('\n');
 if(lines.length!==frame.rows||lines.some(s=>s.length!==frame.columns))throw Error('Invalid frame dimensions');
 let left=frame.columns,top=frame.rows,right=-1,bottom=-1;
 for(let y=0;y<lines.length;y++)for(let x=0;x<lines[y].length;x++){
  const c=lines[y].charCodeAt(x);if(c<0x2800||c>0x28ff)throw Error('Only Braille cells may cross the overlay bridge');
  if(c!==0x2800){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 }
 return {type:'frame',revision,x:right<0?0:left,y:right<0?0:top,columns:right<0?0:right-left+1,rows:right<0?0:bottom-top+1,
  text:right<0?'':lines.slice(top,bottom+1).map(s=>s.slice(left,right+1)).join('\n')};
}

// Request/ack rendering: never queue obsolete frames behind a slow native painter.
export function createFramePump({pet,send,now=()=>performance.now()}){
 let viewport=null,inFlight=false,last=null,lastFrame=null,revision=0,paused=false,disposed=false,nextPaint=0;
 const alive=()=>{if(disposed)throw Error('Overlay pump is disposed');};
 return {
  viewport(message){alive();const next=viewportOf(message);revision=message.revision;viewport=next;last=null;lastFrame=null;nextPaint=0;},
  pause(value){alive();paused=!!value;last=null;lastFrame=null;nextPaint=0;},
  ack(){alive();inFlight=false;},
  tick(){
   alive();if(inFlight||!viewport||paused)return false;
   const t=now(),dt=last===null?0:Math.max(0,(t-last)/1000);last=t;
   pet.step(dt);if(t<nextPaint)return false;
   const source=pet.frame(viewport),frame=cropFrame(source,revision);
   nextPaint=source.state?.state==='sleep'?t+200:0;
   // A held seat/down pose can be byte-identical for seconds. Advance the life
   // clock normally but avoid JSON, IPC, bitmap allocation and native repaint.
   if(lastFrame&&frame.x===lastFrame.x&&frame.y===lastFrame.y&&frame.columns===lastFrame.columns&&frame.rows===lastFrame.rows&&frame.text===lastFrame.text)return false;
   inFlight=true;
   try{send(frame);lastFrame=frame;}catch(error){inFlight=false;throw error;}return true;
  },
  interact(kind){alive();if(!['ball','treat','tug'].includes(kind))throw Error('Invalid overlay interaction');const accepted=pet.interact(kind);if(accepted){lastFrame=null;nextPaint=0;}return accepted;},
  get hidden(){return !viewport||paused;},
  dispose(){if(!disposed){disposed=true;viewport=lastFrame=null;pet.dispose();}},
 };
}
