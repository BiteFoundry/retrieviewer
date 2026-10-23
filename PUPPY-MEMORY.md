# Runtime weight and performance

## Fixed-volume watch torso (0.0.9)

Paw registration alone in0.0.8 left the upper torso unconstrained. In the36
watch samples, chest-region (source rows205..230, ink threshold>24) area/mean
silhouette width grew up to28.9% compared with the seated key. Offline torso
envelope calibration brings both below1.2%, with centroid movement below0.52
source pixels. Regression limits are2% chest area/width,1px centroid,3% whole
torso area (rows205..270), plus the existing four-paw and common-floor tests.

The same single-source inverse coordinate field now eases from y180 to205,
matches the seated torso envelope through y265 and joins the paw field by y275.
Only the silhouette calibration curves are smoothed, not fur pixels. Face rows
0..179 remain byte-exact; the connected neck/bandana can move spatially to join
the stable chest, instead of freezing the inflated source torso or compositing
two pictures. The previous y230 pixel digest is superseded deliberately by a
face-only digest plus explicit body-volume tests. No new frames, runtime work,
buffer, dependency or process. The archive is3,118 bytes smaller than0.0.8.
Earlier release sections below are historical, not current registration rules.

## Single-source watch registration and English desktop UI (0.0.8)

The0.0.7 neck fix still joined a different torso to the lower legs. This pass
removes that compositing entirely. Each watch sample uses one original drawing,
with a smooth inverse-coordinate field below y230 registering four paw patches
and the ground plane. Resampling always reads the original, never a previously
warped image. Head/jaw/neck/bandana pixels through y229 remain exact; endpoints
share the seated key. All36 watch samples have four-paw residual checks (<=2
source pixels) and a common floor test, in addition to the original neck digest.
Pillow/NumPy are offline authoring tools only. The shipped runtime has no new
dependency, warp pass, image buffer, frame count or process. The behavior archive
is9,369 compressed bytes smaller than0.0.7.

Desktop picker, controls, tray/menu and statuses use English. Windows/macOS
toolbars have64px buttons for English labels; existing Linux labels remain.
Windows native IPC/lifecycle tests and source-label WinForms layout checks at
100%/200% cover this change. macOS has syntax/core/layout checks, not a real Mac
GUI test. Website EN/KO selection and user-supplied window titles are unchanged.

## Watch neck seam repair (0.0.7)

The0.0.6 watch registration moved the entire head/neck8px and dissolved it into
the seated torso across y180..210. That crossed the bandana and produced a
second collar/jaw silhouette. Preparation now preserves the original head,
jaw, neck and bandana through y229. The join is below them in chest fur, with
source/target chest contours registered before blending; lower legs/paws from
y250 stay exactly seated. Endpoints and non-watch frames remain unchanged.
The32 turned samples' protected regions have an independent original-source
digest regression test. All changes are baked offline: no new frame, runtime
dependency, live compositing buffer or per-frame computation. Published0.0.6
bytes remain unchanged; this repair ships as0.0.7.

## Node compressed crops (0.0.6)

Node now stores each validated Q5 crop as a small DEFLATE block, using built-in
`node:zlib`; only the existing two-frame LRU is expanded. The original archive
buffer is released. Browser hosts keep the portable bit-packed implementation.
No added runtime dependency, process, timer, lower resolution or lost pose.

Same Windows host, fresh processes, same450-frame ball sequence:

| Metric | 0.0.5 | 0.0.6 |
| --- | ---: | ---: |
| Loaded ArrayBuffers, after native close callbacks + diagnostic GC | 59.7 MiB | 21.4 MiB |
| Rendered ArrayBuffers | 67.3 MiB | 29.0 MiB |
| Mean frame time | 3.39 ms | 3.39 ms |
| P95 frame time | 6.11 ms | 6.27 ms |
| Initial load | 653 ms | 910 ms |
| Actual Windows overlay worker RSS, short owned-window checks | 130 MiB | 96–106 MiB |

The450-frame output hash is unchanged. `puppy-node-cache.test.mjs` compares every
packaged source frame in both stores, including the separately repaired watch
art. These samples are not a RAM ceiling: V8, allocator retention, viewport and
activity change RSS. The helper is separate. The large off-screen benchmark
peaked at267/238 MiB; do not substitute the short96–106 MiB samples for that peak.
Evidence: tools/benchmark-pet.mjs, local dist/006-paired-{before,after}.json and
dist/006-native-{before,source}.log. Diagnostic GC is never enabled in the pet.
Shrinking V8's young generation was tested but increased rendering cost, so no
global or embedded-host V8 flags are imposed.

Watch repair adds no frame count; its archive is15,422 bytes smaller. Butterfly
chasing adds no dog images or persistent image buffer; see BUTTERFLY.md. Existing
sleep, colors, wake-on-interaction and5fps sleeping repaint remain unchanged.

## Comfort behaviors (0.0.4)

Belly-up flopping and eyes-closed sleeping reuse the existing action/rest art.
Tug adds eight authored keys and the exact existing seat endpoint, not a dense
tween film:103,549 compressed bytes and291,337 resident Q5 pixel bytes. The sampler
allocates its single RGBA output only on first use; source reconstruction remains
a two-frame LRU. No new runtime dependency, background process or timer is added.

The legacy interaction sheet contains101 unique frames that no active clip can
reach. The Q5 loader now retains only the23 unique frames used by treat/pickup/drop.
All active samples compare byte-for-byte against the full store. Normal codec
loading still retains every frame unless explicitly supplied a validated index
list; requesting an excluded frame fails rather than displaying a substitute.

| Resident cropped pixel payload | Bytes |
| --- | ---: |
| Before comfort extension | 66,515,834 |
| Remove unreachable interaction pixels | −4,444,163 |
| Add tug keys | +291,337 |
| Current total | 62,363,008 |

Thus new poses use about4.15 MB less resident art than the previous source version.
This is an art-payload measurement, not a guarantee that OS-reported RSS falls by
the same amount. In three fresh Windows benchmark samples, mean frame time median
was3.22 ms versus3.29 ms previously; peak process RSS median was262.3 versus263.3
MiB (small differences, not a meaningful promised performance improvement).
The same450-frame ball hash still matches exactly. Source measurements live in
`dist/performance/comfort-{1,2,3}.json` locally.

`puppy-comfort-runtime.test.mjs` checks repeated load/render/tug/dispose, allowing
native gzip callbacks and GC to finish before checking retained arrays. No pet
buffers or timer handles remain after this bounded test. RSS reclamation remains
allocator/GC-dependent; dispose is not advertised as an immediate RSS reduction.

`node tools/check-comfort.mjs` produces deterministic off-screen dot snapshots
for all three behaviors under `dist/comfort-qa/`. Snoring is a silent rising dot
cue, not audio playback. Ball/treat/tug wake a sleeping pet through the existing
recovery instead of waiting out the long sleep hold. Belly also shortens its hold
on interaction and finishes the authored roll safely.

## Earlier runtime optimization (also included in0.0.4)

The dot-art actor already integrates its own travel, stride and perspective. Its
former Three.js animal only supplied a position copied from that actor's target;
mesh deformation and inverse kinematics were not used by the dot renderer. The
runtime now uses a small position adapter instead. The original 3D implementation
remains in the working tree for comparison, but is excluded from the npm package;
Three.js is a development dependency only.

Stable Braille conversion skips black/transparent background pixels and packs cell
masks directly, preserving the original Float32 luminance rounding and thresholds.
The native frame pump also skips identical output frames while continuing the
simulation clock. Art, palette, camera and frame rate are unchanged.

Median of three paired fresh-process measurements on Windows, Node24.19.0:

| Metric | Before | After |
| --- | ---: | ---: |
| Asset load | 706.4 ms | 667.8 ms |
| 1,800 simulation steps | 114.3 ms | 3.2 ms |
| Mean render time per frame | 7.13 ms | 3.29 ms |
| Render time p95 | 9.93 ms | 5.77 ms |
| Peak benchmark-process RSS | 304.8 MiB | 263.3 MiB |

The rendering workload is450 frames at480×135 Braille cells (native4K output
with8px cells), seed731 and the same ball interaction. All six runs produced the
same SHA-256 text-frame hash:
`3a296d0a737eaa1d9a5923e3496e8c62b2d5e99fbe871806b907429515597a3d`.
The independent original-3D/body comparison also matches4,000 actor steps exactly.
Additional autonomous episodes reuse existing art: scanning, a same-depth patrol,
rolling, returning to the viewer and occasional playful turning. They are not part
of the fixed interactive benchmark trajectory.

Installed production files, including dependencies, decreased from45,188,203 to
19,423,382 bytes. Tarball size decreased from20,615,763 to18,788,415 bytes. These
are different measures: installation shrank about57%, the tarball about9%.

These are local test-process samples, not desktop memory budgets or guarantees.
RSS includes loading transients, two sequential pet instances and allocator/GC
behavior. Browser, macOS and Linux performance were not measured in this pass.
The decoded Q5 art still occupies about66.5 MB; this change does not reduce that
resident art in that earlier pass; the comfort pass above reduces it further.

Reproduce from the development checkout:

```sh
node --expose-gc tools/benchmark-pet.mjs ./retrieviewer.mjs ./dist/performance/current.json
npm test
npm run test:package
```

The benchmark also accepts the absolute path to an installed older
`retrieviewer.mjs` as its first argument. It renders off-screen without changing
desktop settings. Paired results are retained under `dist/performance/` locally.

## Earlier lossless runtime cache reduction

The measurements below describe the earlier RVF1 lossless pass, before Q5 art
and the current optimization. They are retained as historical comparisons, not
current package or memory figures. See `PUPPY-Q5-COMPARISON.md` for the palette pass.

The weight came from 2,341 full-size grayscale frames stored as concatenated
320² or 480² rasters, including exact duplicates and black padding. These are
already one-byte grayscale, not RGBA files; converting to grayscale again would
not help. Actions alone occupied 136,857,600 decoded bytes. Loading all eight
gzip files concurrently through Blob/Response streams added transient copies.

## What changed

- RVF1 stores exact unique frames once and removes only zero-valued borders.
  Coordinates and the original canvas size are retained. A bounded two-frame
  LRU reconstructs full rasters only as the existing sampler needs them.
- No downsampling, palette reduction, pose removal, timing changes, or new art.
  Existing sampler APIs accept both the old flat arrays and the new stores.
- `createPet()` loads compact families sequentially, using native gzip in Node.
  Default-loader pets in one process share art but have independent actors,
  behavior, renderers and buffers. The last `dispose()` releases the shared lease.
  Custom loaders remain isolated (no cross-tenant or unexpected global sharing).
- Package contents use compact caches only. Original files remain in the source
  project for comparisons and rollback; this does not shrink that working folder.

## Measurements

Fresh Node process on this Windows host, `node --expose-gc measure-pet-memory.mjs`;
same seed and sixty 160×50 frames. MB below means 1,000,000 bytes.

| Metric | Before | After |
| --- | ---: | ---: |
| Art storage resident before selected-frame reconstruction | 315.8 MB | 106.5 MB |
| Compressed runtime art files | 69.9 MB | 54.2 MB |
| Process RSS after rendering | 498.4 MB | 211.8 MB |
| Peak process RSS during load + rendering | 1,014.3 MB | 233.1 MB |

These are local samples, not hard memory budgets. RSS includes Node, geometry,
temporary buffers and allocator retention. After last disposal, an event-loop
turn and explicit GC, the new run returned to about 94.9 MB RSS and 0.15 MB
ArrayBuffers. Actual reclamation in a host application is GC-dependent.
Browser loading uses DecompressionStream, so Node's RSS results are not browser
measurements. See `pet-memory-baseline.json` and `pet-memory-compact.json`.

## Reproduce / verify

`node audit-pet-frames.mjs` counts full, unique and cropped pixel bytes.
`node prepare-pet-frame-store.mjs` rebuilds the eight compact files from preserved
original caches, validating source hashes and every reconstructed frame before
writing the final manifest. `node --test puppy-frame-store.test.mjs
retrieviewer-lossless.test.mjs retrieviewer.test.mjs` verifies all 2,341 logical
frames, raw/packed sampler equality, 80 end-to-end renders at different views,
depths and mirrors, and shared-asset lifecycle. The import API is unchanged.

## Remaining weight

106.5 MB of decoded cropped pixels is still substantial. Delta-coded frames,
on-demand compressed blocks or optional art sets could reduce it further, but
need separate CPU/latency and portability validation. This pass deliberately
keeps the pixel output and synchronous `frame()` contract exact.
