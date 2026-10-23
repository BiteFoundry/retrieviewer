import test from 'node:test';import assert from 'node:assert/strict';
import {desktopPlatform,controlAddress,validControlAddress,parseHelperSpec} from './integrations/desktop/platform.mjs';
test('cross-platform backend selection retains Windows and low-resource defaults',()=>{
 assert.equal(desktopPlatform({platform:'win32'}).id,'windows-overlay');assert.equal(desktopPlatform({platform:'darwin'}).fps,15);
 const linux=desktopPlatform({platform:'linux',env:{DISPLAY:':99',XDG_SESSION_TYPE:'x11'},glibc:'2.28'});assert.equal(linux.id,'linux-x11-overlay');assert.equal(linux.fps,15);
 assert.throws(()=>desktopPlatform({platform:'linux',env:{DISPLAY:':0'},glibc:'2.27'}),/GLIBC2.28/);
 assert.throws(()=>desktopPlatform({platform:'linux',env:{}}),/DISPLAY/);
 for(const env of [{DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0'},{DISPLAY:':0',XDG_SESSION_TYPE:'wayland'}])assert.throws(()=>desktopPlatform({platform:'linux',env}),/Wayland/);
 assert.throws(()=>desktopPlatform({platform:'freebsd'}),/supports/);
});
test('control addresses are short, private-capability shaped, and platform-specific',()=>{
 const uuid='12345678-1234-1234-1234-123456789abc';
 for(const platform of ['win32','linux','darwin']){const address=controlAddress({platform,uuid,uid:1000});assert.ok(validControlAddress(address));if(platform!=='win32')assert.ok(Buffer.byteLength(address)<104);}
 for(const path of ['/tmp/anything.sock','/etc/passwd','relative','\\\\.\\pipe\\someone-else',null])assert.equal(validControlAddress(path),false);
 assert.throws(()=>controlAddress({uuid:'bad'}));assert.throws(()=>controlAddress({platform:'linux',uuid,uid:-1}));
});
test('native helpers use an argv descriptor, never a shell command',()=>{
 const spec={command:'/usr/bin/osascript',args:['-l','JavaScript','/some folder/overlay.jxa'],mode:'macos-overlay',fps:15};assert.deepEqual(parseHelperSpec(['--helper-spec',JSON.stringify(spec)]),spec);
 assert.deepEqual(parseHelperSpec(['C:/helper.exe','--ipc-test']).args,['--ipc-test']);
 for(const patch of [{args:'shell'},{command:'bad\0command'},{fps:100},{mode:'fake'}])assert.throws(()=>parseHelperSpec(['--helper-spec',JSON.stringify({...spec,...patch})]));
});
