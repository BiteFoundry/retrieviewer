import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./docs/analytics.mjs',import.meta.url),'utf8');
function load(url,{existing=false}={}) {
  const appended=[];
  const context=vm.createContext({
    location:new URL(url),
    document:{
      querySelector:()=>existing?{}:null,
      createElement(tag){assert.equal(tag,'script');return {dataset:{}};},
      body:{append(node){appended.push(node);}},
    },
  });
  vm.runInContext(source,context);
  return appended;
}

test('only the production website loads the official cookie-free beacon',()=>{
  for(const path of ['/retrieviewer','/retrieviewer/','/retrieviewer/?lang=ko']) {
    const nodes=load('https://bitefoundry.github.io'+path);
    assert.equal(nodes.length,1);
    assert.equal(nodes[0].type,'module');
    assert.equal(nodes[0].src,'https://static.cloudflareinsights.com/beacon.min.js');
    const config=JSON.parse(nodes[0].dataset.cfBeacon);
    assert.match(config.token,/^[a-f0-9]{32}$/);
    assert.equal(config.spa,false);
    assert.deepEqual(Object.keys(config).sort(),['spa','token']);
  }
});

test('local previews, other sites and unrelated org pages do not collect',()=>{
  for(const url of [
    'http://127.0.0.1:55146/','http://localhost:3000/retrieviewer/',
    'http://bitefoundry.github.io/retrieviewer/',
    'https://example.com/retrieviewer/','https://bitefoundry.github.io/',
    'https://bitefoundry.github.io/retrieviewer-copy/',
  ])assert.equal(load(url).length,0,url);
});

test('an existing beacon is not installed twice',()=>{
  assert.equal(load('https://bitefoundry.github.io/retrieviewer/',{existing:true}).length,0);
});

test('collection belongs to the website, not the npm runtime package',()=>{
  const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
  assert.ok(!pkg.files.some(p=>p==='docs'||p.startsWith('docs/')||p==='retrieviewer-site-analytics.test.mjs'));
  const html=readFileSync(new URL('./docs/index.html',import.meta.url),'utf8');
  assert.match(html,/src="\.\/analytics\.mjs\?v=1"/);
  assert.match(html,/data-i18n="webAnalytics"/);
  assert.doesNotMatch(html,/dash\.cloudflare\.com|api\.cloudflare\.com/);
});
