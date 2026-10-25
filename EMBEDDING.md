# Embedding Retrieviewer

See [PLUGIN.md](./PLUGIN.md) for the convenience plugin. The headless core has no
timers, DOM, keyboard, output or process listeners. The host owns time/rendering.
createPet reads bundled art; import alone does not. Node >=20, or browser ES modules
with Three resolution and DecompressionStream. No native Python/Rust binding.

```js
import {createPet} from '@bitefoundry/retrieviewer';
const pet = await createPet(); // Q5, 32 levels, all 2,341 source poses retained
// Keep this instance for the whole pane lifetime, not one per frame.
pet.step(elapsedSeconds);
const {text} = pet.frame({columns, rows});
pane.setContent(text);
pet.interact('ball'); // or 'treat'; false when busy/cooling down
// on unmount:
pet.dispose();
```

## Core contract

- createPet({loadAsset?,seed?,energy?,pawTransport?,artProfile?}): default q5.
  Seed uint32, energy 0..1; keep pawTransport enabled.
- step(dt): finite nonnegative seconds, fixed 1/60s simulation. Each call admits
  at most 0.1s to avoid unbounded stalled-host catch-up. Returns step count.
- frame({columns,rows,cellAspect=.5,camera?,poseFps=24,contactEnabled=true}):
  exactly rows lines of columns Unicode Braille characters, no ANSI or trailing
  newline. Positive integer dimensions, at most125,000 cells. Pose cadence12/24/30.
  cellAspect = character width / line height, positive finite.
- Frame contains text,columns,rows,artProfile,pixels,state,report,placement,
  projection,mouth,contacts. pixels is a **borrowed** RGBA buffer: valid only until
  next frame/dispose; copy if retaining. The wrapper also retains no frame.
- needsFrame(frameOptions): optional pre-render check for a host that only needs
  changed pictures. False means a known held pose and all visible objects match
  the last frame. Always keep calling step(dt); needs/cooldowns/autonomy continue.
  Moving poses, gestures, visitors and sleep cues conservatively return true.
  frame() itself never skips or returns stale metadata. Force a frame when the
  host loses its display contents (for example after hiding or reconnecting).
- camera:{viewportWidth,viewportHeight,rect:{left,top,width,height}} places a pane
  within a larger viewport. Keep it consistent across time for metric perspective.
- interact('ball'|'treat'): false while busy/cooling down; unknown kind throws.
- dispose(): idempotent. Every other core method afterwards throws.

Default-loader pets share immutable art, not behavior/clocks/output buffers; last
dispose releases shared assets. Custom loaders are isolated. Initialization is async
I/O with synchronous CPU decode between loads; avoid repeated creation on render.
node examples/embed.mjs [columns] [rows] prints one frame.
npm run pet:companion (installed retrieviewer preview) is the opt-in fullscreen host:
B ball, T treat, Space pause, Q quit. Only that executable owns input/screen.
Redirected stdout prints one plain frame and exits.

## Assets / original option

Default files resolve against the module URL, never cwd (lazy Node fs or browser
HTTP fetch). getPetAssetFiles(profile?) returns 19 filenames: nine art archives
plus ten metadata files. Copy these unchanged for bundlers. The default Q5 files
use `.rvz`, an index followed by individually gzip-compressed crops. A custom
loader returns the original ArrayBuffer/typed bytes, without unpacking the archive.

Local Node hosts using the default loader read only the indices at creation and
read/decode requested crops synchronously into a two-frame cache per family.
There is no background loader or extra process. The final pet's `dispose()` closes
the shared files. Custom loaders and browsers use the portable memory-backed
store; they do not receive the local file-backed memory reduction.

```js
import {createPet,getPetAssetFiles} from '@bitefoundry/retrieviewer';
const files = getPetAssetFiles(); // deploy these files unchanged
const base = new URL('/pets/retrieviewer/', location.origin);
const pet = await createPet({loadAsset: async name => {
  const r = await fetch(new URL(name, base));
  if (!r.ok) throw Error(name + ': HTTP ' + r.status);
  return r.arrayBuffer();
}});
```

Original256-level caches remain in the source workspace. Use
createPet({artProfile:'original'}) there, or ?palette=original in the preview.
They are **not bundled** in the small distribution. For external original art,
copy getPetAssetFiles('original') from the workspace and supply loadAsset. Missing
originals fail clearly, never silently fall back.

Q5 is lossy quantization (max original-source pixel error 4/255). The indexed
repack is lossless relative to the approved Q5 art: all 2,401 logical frames and
their timing remain unchanged. The nine indexed archives total 19,326,068 bytes;
their indices total 54,040 bytes. No Three.js dependency runs in the pet core.
See [PUPPY-MEMORY.md](./PUPPY-MEMORY.md) for measured costs and host limitations.

## JSONL bridge (Python/Rust/other process hosts)

Spawn installed retrieviewer-stdio or node /path/to/retrieviewer-stdio.mjs.
Wait for {"event":"ready","protocol":1}. Send JSON objects one per line; replies echo
optional string/number/null id. Stdout contains only JSONL, never ANSI.
No autonomous clock: your app sends tick at its own cadence.

```json
{"id":1,"op":"tick","dt":0.03333333333333333,"columns":80,"rows":24}
{"id":2,"op":"interact","kind":"ball"}
{"id":3,"op":"dispose"}
```

tick combines step+frame in one round trip; separate step/frame remain supported.
Frame/tick replies: {id,ok:true,text,columns,rows,report,artProfile}; step replies have
steps, interaction replies accepted. Errors: {id,ok:false,error}. A failed tick may
advance time before frame validation; requests are not transactions.
Dispose acknowledges and exits; stdin EOF also disposes. Node remains required.
examples/bridge.py uses only Python's standard library. Each process loads its own
art; reuse one per host, not per frame.
