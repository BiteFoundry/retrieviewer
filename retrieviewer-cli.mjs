#!/usr/bin/env node
// Installer entrypoint. Never imports art for help/status/doctor or config planning.
import {createInstaller,AGENTS} from './retrieviewer-install.mjs';
import {createInterface} from 'node:readline/promises';

const HELP=`Retrieviewer — autonomous Braille companion

Usage:
  retrieviewer enable [--agent ID] [--yes] [--dry-run]
  retrieviewer disable --agent ID
  retrieviewer disconnect --agent ID [--yes] [--dry-run]
  retrieviewer status [--agent ID] [--json]
  retrieviewer doctor [--agent ID] [--json]
  retrieviewer agents [--json]
  retrieviewer preview [--original]
  retrieviewer desktop [--ink cream|gold|dark] [--return-style auto|brake|trot|run-trot]
  retrieviewer desktop-status [--json]
  retrieviewer desktop-stop
  retrieviewer desktop-clean --yes
  retrieviewer desktop-remove --yes

Enable opens a first-run selection/confirmation wizard on a real terminal.
Non-interactive changes require --agent and --yes. Unsupported native renderers
are refused: MCP connectivity alone is never treated as in-screen rendering.
No command changes credentials, shell profiles or agent executables.
Desktop is a separate native overlay, NOT a Codex plugin. Choose a window once;
use Codex normally. Exit from its tray icon or desktop-stop. No auto-start is added.
Windows is verified; macOS and Linux X11 adapters are experimental. Native Wayland
app tracking is not supported. Linux targets AlmaLinux8/GLIBC2.28, system Python3.6+.
Return style defaults to auto (mix all three). Restart the companion to change it.
`;
export function parseArguments(args){
 const [command='help',...rest]=args,options={};
 for(let i=0;i<rest.length;i++){
  const token=rest[i];
  if(token==='--agent'||token==='--ink'||token==='--return-style'){
   const key=token.slice(2);
   if(options[key]||!rest[i+1]||rest[i+1].startsWith('-'))throw Error(token+' requires one value');
   options[key]=rest[++i];
  }else if(['--yes','--json','--dry-run','--original'].includes(token))options[token.slice(2)]=true;
  else throw Error('Unknown argument: '+token);
 }
 if(options.agent&&!AGENTS.some(a=>a.id===options.agent))throw Error('Unknown agent: '+options.agent);
 if(options.ink&&!['cream','gold','dark'].includes(options.ink))throw Error('--ink must be cream, gold or dark');
 if(options['return-style']&&!['auto','brake','trot','run-trot'].includes(options['return-style']))throw Error('--return-style must be auto, brake, trot or run-trot');
 if(!['help','--help','-h','enable','disable','disconnect','status','doctor','agents','preview','desktop','desktop-status','desktop-stop','desktop-clean','desktop-remove'].includes(command))throw Error('Unknown command: '+command);
 const allowed={desktop:['ink','return-style'],enable:['agent','yes','json','dry-run'],disconnect:['agent','yes','json','dry-run'],disable:['agent','json'],status:['agent','json'],doctor:['agent','json'],agents:['json'],preview:['original'],'desktop-status':['json'],'desktop-clean':['yes'],'desktop-remove':['yes']};
 for(const key of Object.keys(options))if(!(allowed[command]??[]).includes(key))throw Error(`--${key} is not supported by ${command}`);
 return {command,options};
}
export async function runCli(args,{input=process.stdin,output=process.stdout,error=process.stderr,installer=createInstaller(),desktop}={}){
 const {command,options}=parseArguments(args),emit=value=>output.write(JSON.stringify(value,null,2)+'\n');
 if(['help','--help','-h'].includes(command)){output.write(HELP);return 0;}
 if(command.startsWith('desktop')){
  if(['desktop-clean','desktop-remove'].includes(command)&&!options.yes)throw Error('Use '+command+' --yes to remove only the companion cache.');
  const api=desktop??await import('./integrations/windows-overlay/desktop.mjs');
  const action={'desktop':'startDesktop','desktop-status':'desktopStatus','desktop-stop':'stopDesktop','desktop-clean':'cleanDesktop','desktop-remove':'removeDesktop'}[command];
  emit(await api[action]({...options.ink?{ink:options.ink}:{},...options['return-style']?{returnStyle:options['return-style']}:{} }));return 0;
 }
 if(command==='preview'){await import('./examples/live.mjs');return 0;}
 if(['status','doctor','agents'].includes(command)){
  const result=command==='agents'?await installer.list():await installer[command](options.agent);
  if(options.json||command==='doctor')emit(result);
  else for(const row of Array.isArray(result)?result:[result])output.write(`${row.id}: ${row.detected?'detected '+(row.version??'unknown version'):'not installed'} | ${row.enabled?'enabled':'disabled'} | ${row.connected?'registered':'not registered'} | renderer ${row.renderer?.status??'unknown'}${row.renderer?.reason?' — '+row.renderer.reason:''}\n`);
  return 0;
 }
 let agent=options.agent,rl;
 const interactive=!!input.isTTY&&!!output.isTTY;
 try{
  if(!agent){
   if(!interactive)throw Error('Specify --agent ID. Run retrieviewer agents to list targets.');
   if(command!=='enable')throw Error('--agent is required');
   const list=await installer.list();
   output.write('Choose an agent (unavailable renderers cannot be enabled):\n');
   list.forEach((row,i)=>output.write(`  ${i+1}. ${row.label} — ${row.detected?'detected':'not installed'} / ${row.renderer.status}\n`));
   rl=createInterface({input,output});const selected=await rl.question('Number or agent ID (Enter cancels): ');
   if(!selected.trim()){output.write('Cancelled; no settings changed.\n');return 0;}
   agent=list[Number(selected)-1]?.id??selected.trim();
   if(!list.some(row=>row.id===agent))throw Error('Unknown selection');
  }
  if(command==='disable'){emit(await installer.disable(agent));return 0;}
  const plan=await installer.plan(agent);
  if(command==='enable'&&!plan.supported){emit(plan);error.write('Native in-screen renderer is not available for this target; nothing changed.\n');return 2;}
  output.write(`${command==='enable'?'Enable':'Disconnect'} Retrieviewer for ${agent}\n`);
  for(const change of plan.changes??[])output.write(`  ${change.path}: ${command==='disconnect'?'remove only the Retrieviewer-owned registration; preserve other settings':change.description}\n`);
  if(options['dry-run']){emit({...plan,dryRun:true,operation:command});return 0;}
  let confirmed=options.yes===true;
  if(!confirmed&&interactive){rl??=createInterface({input,output});confirmed=/^y(?:es)?$/i.test((await rl.question('Back up and apply these changes? [y/N] ')).trim());}
  if(!confirmed){if(!interactive)throw Error('No settings changed. Review --dry-run, then use --yes to confirm.');output.write('Cancelled; no settings changed.\n');return 0;}
  emit(await installer[command](agent,{confirm:true}));
  if(command==='enable')output.write('Registration complete; restart the agent. Rendering is checked separately by doctor.\n');
  return 0;
 }finally{rl?.close();}
}

// CLI is deliberately a separate module from the side-effect-free library.
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
// npm global bins are symlinks on Unix. import.meta resolves the real module,
// whereas argv[1] keeps the bin link; comparing those raw URLs silently did nothing.
let main=false;
try{main=!!process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{}
if(main){
 try{process.exitCode=await runCli(process.argv.slice(2));}catch(e){process.stderr.write('Retrieviewer: '+e.message+'\n');process.exitCode=1;}
}
