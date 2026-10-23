// Dependency-free platform selection. Importing performs no probing or I/O.
import {posix} from 'node:path';
export function desktopPlatform({platform=process.platform,env=process.env,glibc}={}){
 if(platform==='win32')return {id:'windows-overlay',fps:30,helper:'windows',experimental:false};
 if(platform==='darwin')return {id:'macos-overlay',fps:15,helper:'macos',experimental:true};
 if(platform==='linux'){
  if(env.XDG_SESSION_TYPE?.trim().toLowerCase()==='wayland'||env.WAYLAND_DISPLAY)throw Error('Native Wayland cannot safely track arbitrary app windows. Log in to an Xorg/X11 session; no compositor or privacy settings will be changed.');
  if(!env.DISPLAY)throw Error('Linux desktop requires an X11 DISPLAY and a compositing window manager. Headless/SSH sessions are not a desktop.');
  if(glibc!==undefined){const parts=String(glibc).split('.').map(Number);if(!/^\d+\.\d+(?:\.\d+)?$/.test(String(glibc))||parts[0]<2||(parts[0]===2&&parts[1]<28))throw Error('Linux desktop requires GLIBC2.28 or later (AlmaLinux8 baseline).');}
  return {id:'linux-x11-overlay',fps:15,helper:'linux',experimental:true};
 }
 throw Error('Desktop companion supports Windows, macOS and Linux X11 only');
}
export function controlAddress({platform=process.platform,uuid,uid=process.getuid?.()??0}={}){
 if(!/^[a-f0-9-]{36}$/.test(uuid))throw Error('Invalid desktop control UUID');
 if(platform==='win32')return '\\\\.\\pipe\\retrieviewer-overlay-'+uuid;
 if(!Number.isSafeInteger(uid)||uid<0)throw Error('Invalid desktop user ID');
 // Short enough for macOS's104-byte sockaddr_un, regardless of HOME/TMPDIR length.
 return posix.join('/tmp',`retrieviewer-overlay-${uid}-${uuid}.sock`);
}
export function validControlAddress(value){return typeof value==='string'&&(/^\\\\\.\\pipe\\retrieviewer-overlay-[a-f0-9-]{36}$/.test(value)||/^\/tmp\/retrieviewer-overlay-\d+-[a-f0-9-]{36}\.sock$/.test(value));}
export function parseHelperSpec(argv){
 if(argv[0]!=='--helper-spec')return {command:argv[0],args:argv[1]==='--ipc-test'?['--ipc-test']:[],mode:'windows-overlay',fps:30};
 const value=JSON.parse(argv[1]);
 if(!value||typeof value.command!=='string'||!value.command||value.command.includes('\0')||!Array.isArray(value.args)||value.args.some(a=>typeof a!=='string'||a.includes('\0'))||!['windows-overlay','macos-overlay','linux-x11-overlay'].includes(value.mode)||!Number.isInteger(value.fps)||value.fps<5||value.fps>30)throw Error('Invalid desktop helper descriptor');
 return value;
}
