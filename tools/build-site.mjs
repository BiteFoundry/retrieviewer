// Build only allowlisted public runtime assets. No credentials, experiments or
// workspace directory copies. Output stays ignored and is never an npm input.
import { cp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, relative } from "node:path";
import { createPet } from "../retrieviewer.mjs";
import {gunzipSync} from 'node:zlib';
import {readPackedFrames} from '../puppy-frame-store.mjs';
import {createComfortSpriteSampler} from '../puppy-comfort-sprites.mjs';
import {rgbaToBraille} from '../braille.mjs';
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "site-dist"),
  runtime = join(out, "runtime");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir(runtime, { recursive: true });
await cp(join(root, "docs"), out, { recursive: true });
for (const name of [...pkg.files, "package.json"]) {
  const target = resolve(runtime, name);
  if (!relative(runtime, target) || relative(runtime, target).startsWith(".."))
    throw Error("Invalid public asset path");
  await mkdir(resolve(target, ".."), { recursive: true });
  await cp(join(root, name), target, { recursive: true });
}
const puppy = await createPet({ seed: 731 });
try {
  await writeFile(
    join(out, "preview.txt"),
    puppy.frame({ columns: 144, rows: 60, poseFps: 24 }).text,
  );
} finally {
  puppy.dispose();
}
await writeFile(join(out, ".nojekyll"), "");
const sleepInfo=JSON.parse(await readFile(join(root,'puppy-companion-comfort.json'),'utf8'));
const sleepSample=createComfortSpriteSampler(readPackedFrames(gunzipSync(await readFile(join(root,'puppy-companion-comfort-q5.bin.gz')))),sleepInfo);
for(const key of ['side','right','belly','curl','chin']){
  const pixels=sleepSample({clip:'sleep',variant:key==='right'?'side':key,right:key==='right'});
  await writeFile(join(out,'sleep-'+key+'.txt'),rgbaToBraille(pixels,320,320,{method:'stable',brightness:1.18,contrast:1.1}).text);
}
for (const file of [
  "index.html",
  "style.css",
  "app.mjs",
  "preview.txt",
])
  if (!(await stat(join(out, file))).isFile())
    throw Error("Missing site file " + file);
console.log("Built public site: " + out + " (runtime art loads only on Play)");
