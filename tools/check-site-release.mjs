// Use only after Aside is unavailable. Installed Edge; no browser download.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const url=process.argv[2]??'http://127.0.0.1:63745/';
mkdirSync('dist/site-qa',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],bad=[],runtime=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()]);if(r.url().includes('/runtime/'))runtime.push(r.url());});
 await page.goto(url+'?lang=ko');
 await page.waitForFunction(()=>document.documentElement.lang==='ko');
 assert.match(await page.locator('[data-i18n=lifeBody]').textContent(),/나비/);
 assert.match(await page.locator('[data-i18n=resource]').textContent(),/96~106MiB/);
 await page.locator('#play').click();
 await page.waitForFunction(()=>Number(document.querySelector('.dog-stage').dataset.frames)>4,{},{timeout:45000});
 assert.ok(runtime.length>10&&runtime.every(u=>u.includes('/runtime/0.0.7/')));
 await page.locator('#ball').click();
 await page.waitForFunction(()=>document.querySelector('#ball').disabled);
 await page.locator('#pause').click();
 await page.locator('#sleep-pose').selectOption('right');
 await page.waitForFunction(()=>document.querySelector('#demo-status').textContent.includes('수면'));
 await page.screenshot({path:'dist/site-qa/ko-desktop.png'});
 await page.locator('[data-language=en]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.match(await page.locator('[data-i18n=lifeBody]').textContent(),/butterfly/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'dist/site-qa/en-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log(JSON.stringify({url,english:true,korean:true,play:true,ball:true,rightSleep:true,mobile:true,runtimeVersion:'0.0.7',pageErrors:errors}));
}finally{await browser.close();}
