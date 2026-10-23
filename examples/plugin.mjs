// Plugin embed with a host-owned loop: the host supplies the pane size, receives
// frames and drives time with tick(). No timers, raw mode or escape codes here.
// Run from an installed package: node examples/plugin.mjs [columns] [rows]
import {createPetPlugin} from '@bitefoundry/retrieviewer/plugin';

const columns=Number(process.argv[2]??48),rows=Number(process.argv[3]??14);
let latest='';
const plugin=await createPetPlugin({host:{
 getSize:()=>({columns,rows}),   // return null while the pane is hidden
 render:frame=>{latest=frame.text;}, // copy what you keep; pixels are borrowed
 clear:()=>{latest='';},
}});
try{
 // A real TUI calls tick(elapsedSeconds) from ITS OWN render loop. Here: 3 s of life.
 for(let i=0;i<90;i++)plugin.tick(1/30);
 const lines=latest.split('\n');
 if(lines.length!==rows||lines.some(l=>[...l].length!==columns||!/^[⠀-⣿]*$/u.test(l)))throw Error('frame is not exact plain Braille');
 process.stdout.write(latest+'\n');
}finally{
 plugin.dispose(); // stops the pet and calls clear() once
}
