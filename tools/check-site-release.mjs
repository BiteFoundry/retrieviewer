// Use when Aside cannot perform viewport/screenshot QA. Installed Edge only.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
const url=process.argv[2]??'http://127.0.0.1:63745/';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
mkdirSync('dist/site-qa',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],bad=[],runtime=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()]);if(r.url().includes('/runtime/'))runtime.push(r.url());});
 await page.goto(url+'?lang=ko');
 await page.waitForFunction(()=>document.documentElement.lang==='ko');
 assert.match(await page.locator('[data-i18n=lifeBody]').textContent(),/나비/);
 assert.match(await page.locator('[data-i18n=intro]').textContent(),/터미널 화면만 보고 있기 지루해서/);
 assert.match(await page.locator('[data-i18n=resource]').textContent(),/16px.*15fps/);
 assert.match(await page.locator('[data-i18n=latestUpdate]').textContent(),new RegExp(version.replaceAll('.','\\.')));
 assert.match(await page.locator('[data-i18n=runStep]').textContent(),/Attach/);
 assert.equal(await page.locator('.commands > li').count(),2);
 assert.equal(runtime.length,0,'preview must not load the pet engine before Play');
 await page.evaluate(()=>document.fonts.ready);
 for(const lang of ['ko','en']){
  await page.locator(`[data-language=${lang}]`).click();
  for(const [name,width,height] of [['desktop',1440,1100],['tablet',768,1024],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${lang}/${name} overflow`);
   if(name!=='tablet')await page.screenshot({path:`dist/site-qa/${lang}-${name}.png`,fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1100});
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.locator('[data-copy]').first().click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'npm install -g @bitefoundry/retrieviewer@latest');
 await page.locator('[data-language=ko]').click();
 await page.locator('#play').click();
 await page.waitForFunction(()=>Number(document.querySelector('.dog-stage').dataset.frames)>4,{},{timeout:45000});
 assert.ok(runtime.length>10&&runtime.every(u=>u.includes(`/runtime/${version}/`)));
 await page.locator('#ball').click();
 await page.waitForFunction(()=>document.querySelector('#ball').disabled);
 await page.locator('#pause').click();
 await page.locator('#sleep-pose').selectOption('right');
 await page.waitForFunction(()=>document.querySelector('#demo-status').textContent.includes('수면'));
 await page.screenshot({path:'dist/site-qa/right-sleep.png'});
 await page.locator('#ink').selectOption('gold');
 assert.equal(await page.locator('#ink-command').textContent(),'retrieviewer desktop --ink gold');
 await page.locator('#ink').selectOption('dark');
 assert.equal(await page.locator('.dog-stage').getAttribute('data-ink'),'dark');
 await page.locator('[data-language=en]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.match(await page.locator('[data-i18n=lifeBody]').textContent(),/butterfly/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log(JSON.stringify({url,english:true,korean:true,play:true,ball:true,rightSleep:true,palettes:true,copy:true,lazy:true,desktop:true,tablet:true,mobile:true,runtimeVersion:version,pageErrors:errors}));
}finally{await browser.close();}
