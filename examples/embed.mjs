// Minimal embed: print one plain Braille frame and exit. No fullscreen, no ANSI.
// Run from anywhere: node examples/embed.mjs [columns] [rows]
import {createPet} from '../retrieviewer.mjs';

const columns=Number(process.argv[2]??48),rows=Number(process.argv[3]??14);
const pet=await createPet();
try{
 // A real TUI calls step(elapsedSeconds) from ITS OWN loop (timer, render tick,
 // input poll), then frame() with the current pane size. Here we fake 3 s of life.
 for(let i=0;i<90;i++)pet.step(1/30);
 const {text}=pet.frame({columns,rows});
 process.stdout.write(text+'\n');
}finally{
 pet.dispose(); // release caches/renderer when the pane closes
}
