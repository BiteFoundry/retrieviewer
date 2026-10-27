// One lazy, bounded cat instance. No art/model API or background worker.
const root=document.querySelector('#purrviewer');
if(root){
 const stage=root.querySelector('.cat-stage'),canvas=root.querySelector('canvas'),poster=root.querySelector('img');
 const ctx=canvas.getContext('2d',{alpha:false}),start=root.querySelector('[data-cat-start]'),pause=root.querySelector('[data-cat-pause]'),full=root.querySelector('[data-cat-full]'),status=root.querySelector('[data-cat-status]');
 const actions=[...root.querySelectorAll('[data-cat-action]')];
 const words={en:{start:'Meet the cat',loading:'Loading the cat…',retry:'Try loading again',greet:'Slow blink',treat:'Offer a treat',company:'Keep me company',tower:'Cat tower',wheel:'Exercise wheel',pause:'Pause',resume:'Resume',fullscreen:'Full screen',exit:'Exit full screen',scene:'Live ginger-cat preview with a cat tower and exercise wheel',controls:'Spend time with the cat',initial:'Meet the cat to begin. Nothing to install.',running:'Offer a treat, say hello, or just let the cat do its thing.',paused:'Taking a breather. Resume whenever you like.',failed:'Could not load the cat. Check your connection and try again.',unsupported:'This preview needs a browser with DecompressionStream support. Try a current Chrome, Edge, Firefox or Safari.',fullUnavailable:'Full screen is not available here. You can keep playing on this page.'},
 ko:{start:'고양이 만나기',loading:'고양이를 불러오고 있어요…',retry:'다시 불러오기',greet:'눈인사',treat:'간식 주기',company:'같이 쉬기',tower:'캣타워',wheel:'캣휠',pause:'잠깐 쉬기',resume:'다시 놀기',fullscreen:'전체 화면',exit:'전체 화면 닫기',scene:'캣타워와 캣휠이 있는 치즈 고양이 실시간 체험',controls:'고양이와 함께하기',initial:'설치 없이 여기서 만나보세요.',running:'간식을 주거나 눈인사해 보세요. 그냥 지켜봐도 좋아요.',paused:'잠깐 쉬고 있어요. 다시 놀기를 누르면 이어집니다.',failed:'고양이를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',unsupported:'이 체험은 DecompressionStream을 지원하는 브라우저가 필요해요. 최신 Chrome, Edge, Firefox 또는 Safari로 열어주세요.',fullUnavailable:'여기서는 전체 화면을 사용할 수 없어요. 이 페이지에서 계속 놀 수 있어요.'}};
 const bits=[[1,8],[2,16],[4,32],[64,128]];
 Object.assign(words.en,{meetCatLink:'There is a cat here, too.',catTitle:'I made a cat, too.',catIntro:'A slow blink, a little kneading. Then off to the cat tower or exercise wheel.',catNote:'Browser preview · Cat artwork loads when you start (about0.6MB). On desktop: retrieviewer desktop --pet cat.',catTerms:'Cat demo credits & artwork terms'});
 Object.assign(words.ko,{meetCatLink:'고양이 친구도 만나보기',catTitle:'고양이도 만들었습니다.',catIntro:'느리게 눈인사하고, 꾹꾹이하다가. 캣타워에 올라가 쉬거나 캣휠에서 달립니다.',catNote:'브라우저 체험 · 시작할 때 고양이 그림 약0.6MB를 불러와요. 데스크톱에서는 retrieviewer desktop --pet cat으로 실행하세요.',catTerms:'고양이 체험 크레딧 · 그림 이용 조건'});
 let cat=null,playing=false,loading=false,closed=false,timer=null,last=0,visible=true,columns=160,rows=90,painted='',statusKey='initial',failed=false;
 const t=key=>words[document.documentElement.lang==='ko'?'ko':'en'][key];
 function localize(){
  for(const el of document.querySelectorAll('[data-cat-copy]'))el.textContent=t(el.dataset.catCopy);
  for(const el of root.querySelectorAll('[data-cat-label]'))el.setAttribute('aria-label',t(el.dataset.catLabel));
  start.textContent=t(loading?'loading':failed?'retry':'start');pause.textContent=t(!cat||playing?'pause':'resume');
  full.textContent=t(document.fullscreenElement===root?'exit':'fullscreen');status.textContent=t(statusKey);
 }
 function setStatus(key){statusKey=key;localize();}
 function sync(){start.hidden=!!cat;start.disabled=loading;pause.disabled=!cat;for(const button of actions)button.disabled=!cat||!playing;localize();}
 function cancel(){clearTimeout(timer);timer=null;last=0;}
 function inView(){const r=stage.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}
 function paint(){
  if(!cat)return;const f=cat.frame({columns,rows});stage.dataset.clip=f.state.clip;
  if(painted===f.text)return;
  ctx.fillStyle='#080a09';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=f.color;
  let cell=0;for(let i=0;i<f.text.length;i++){
   const mask=f.text.charCodeAt(i)-0x2800;if(mask<0)continue;
   if(mask){const x=(cell%columns)*4,y=Math.floor(cell/columns)*8;
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<2;dx++)if(mask&bits[dy][dx])ctx.fillRect(x+dx*2,y+dy*2,1.2,1.2);}
   cell++;
  }painted=f.text;
 }
 function fit(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  const scale=Math.min(1,Math.sqrt(1_000_000/(w*h)));columns=Math.max(8,Math.floor(w*scale/4));rows=Math.max(4,Math.floor(h*scale/8));
  canvas.width=columns*4;canvas.height=rows*8;canvas.style.width=canvas.width/scale+'px';canvas.style.height=canvas.height/scale+'px';painted='';paint();if(cat)schedule();
 }
 function tick(){
  timer=null;if(closed||!playing||!visible||document.hidden)return;
  const now=performance.now();cat.step(last?Math.min(.25,(now-last)/1000):0);last=now;paint();
  const interval=1000/(cat.report.resting?8:30);timer=setTimeout(tick,Math.max(0,interval-(performance.now()-now)));
 }
 function schedule(){cancel();visible=inView();if(cat&&playing&&visible&&!document.hidden&&!closed)tick();}
 async function load(){
  if(loading||closed)return;
  if(typeof DecompressionStream==='undefined'){setStatus('unsupported');return;}
  loading=true;failed=false;setStatus('loading');sync();
  try{
   const {createCat}=await import('./runtime/3e2531d/src/purrviewer.mjs');
   const loaded=await createCat({seed:731});if(closed){loaded.dispose();return;}
   cat=loaded;playing=true;poster.hidden=true;canvas.hidden=false;root.dataset.ready='true';fit();setStatus('running');schedule();
  }catch{if(!closed){failed=true;setStatus('failed');}}
  finally{loading=false;if(!closed)sync();}
 }
 start.addEventListener('click',load);
 for(const button of actions)button.addEventListener('click',()=>{if(cat&&playing){cat.interact(button.dataset.catAction);setStatus('running');schedule();}});
 pause.addEventListener('click',()=>{if(!cat)return;playing=!playing;setStatus(playing?'running':'paused');sync();schedule();});
 full.addEventListener('click',async()=>{try{if(document.fullscreenElement===root)await document.exitFullscreen();else await root.requestFullscreen();}catch{setStatus('fullUnavailable');}});
 if(!root.requestFullscreen)full.hidden=true;
 const resize=new ResizeObserver(fit);resize.observe(stage);
 const language=new MutationObserver(localize);language.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 const intersection=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:0}):null;intersection?.observe(stage);
 const visibility=()=>schedule(),fullscreen=()=>{localize();fit();};
 // IO notifications can lag a resize/scroll. Reconcile real geometry on input
 // and only reschedule on scroll when the stage crosses the viewport boundary.
 const scroll=()=>{if(inView()!==visible)schedule();};
 document.addEventListener('visibilitychange',visibility);document.addEventListener('fullscreenchange',fullscreen);
 window.addEventListener('scroll',scroll,{passive:true});
 window.addEventListener('pagehide',event=>{
  cancel();if(event.persisted)return;closed=true;playing=false;cat?.dispose();cat=null;
  resize.disconnect();language.disconnect();intersection?.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',fullscreen);window.removeEventListener('scroll',scroll);
 });
 window.addEventListener('pageshow',()=>{if(!closed)schedule();});sync();fit();
}
