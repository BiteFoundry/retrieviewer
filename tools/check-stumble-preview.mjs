// Screenshot-only fallback after Aside's viewport capture timed out. Uses the
// installed Edge, an isolated profile, no downloads, and always closes its process.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.argv[2]??'http://127.0.0.1:54400/fetch-preview.html?data=fetch-preview.json&pattern=tumble&motion=5';
const browser=await chromium.launch({channel:'msedge',headless:true});
mkdirSync('dist/stumble-qa',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#again').disabled);await page.evaluate(()=>document.fonts.ready);
 const captures=[];
 for(const frame of [28,31,35]){
  await page.locator('#seek').fill(String(frame));assert.match(await page.locator('#status').textContent(),/우당탕/);
  const file=`dist/stumble-qa/frame-${frame}.png`;await page.screenshot({path:file});captures.push(file);
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'dist/stumble-qa/mobile.png'});assert.deepEqual(errors,[]);
 writeFileSync('dist/stumble-qa/receipt.json',JSON.stringify({url,captures,errors,closedOwnedBrowser:true},null,2));console.log(JSON.stringify({captures,errors}));
}finally{await browser.close();}
