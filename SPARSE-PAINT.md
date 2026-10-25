# Coherent native painting · 0.0.20

The 0.0.19 sparse-window optimization is superseded. Per-frame pixel comparison
passed, but a moving scene could change its partition and destroy/reposition
multiple HWNDs at different compositor moments. The owner reported visible
flicker. Preparing all DIBs first did not make those window updates atomic.

Version 0.0.20 paints the complete final mask into one cropped layered window.
`UpdateLayeredWindow` uploads all pixels, position and size together. The same
HWND survives movement and crop changes. Visibility is changed only when first
shown; there is no extra per-frame `SetWindowPos` after upload. No animal assets,
anatomy, motion, Braille masks or optional integrations changed.

The 256-mask stamp atlas and one-process QuickJS host remain. Capacity still
shrinks when it exceeds twice the rounded target area; hidden/minimized scenes
release their surface and window. The tradeoff is one bounding bitmap spanning
distant furniture: memory can exceed the regressed split-painter measurements.
Those old numbers below must not be presented as current measurements.

## Verification

- Real Win32 presentation regression: 128 changing/disjoint scenes retain one
  visible HWND, with exact full-scene BGRA pixels; hidden resources release.
- Native mask/capacity tests: 56 grids across seven cell sizes.
- Real moving dog/cream, cat/gold and cat/dark: 301 exact paint comparisons.
- Owned 4K -> small -> 4K, minimize/restore and same-process species switching.
  DIB capacity shrank from 12.22 to 1.50 MiB and reached zero when minimized.

Reproduce with `node --test native-desktop.test.mjs`,
`node tools/check-native-paint.mjs` and `node tools/check-native-resources.mjs`.
This checks actual window lifetime and upload coherence as well as image bytes;
finite pixel/lifetime checks are not a claim that every display was observed.

## Current memory measurement

Same Windows x64 host, owned off-screen 3840x2160 target, real native painter,
seed731 and 150s action schedule, 300 roughly half-second samples per pet
(157.5/156.9s wall time). Watch/brain off; no forced GC or working-set trim.
Harness and external DWM/GPU allocations are excluded.

| Pet | Median RSS | Sampled maximum | OS lifetime peak |
|---|---:|---:|---:|
| Retriever |22.9MiB|37.9MiB|38.7MiB|
| Cat with tower/wheel |44.4MiB|64.6MiB|65.5MiB|

Cat furniture spans a large bounding bitmap again. This restores coherent
presentation at a higher RAM cost than 0.0.19; it is not a universal 50MiB cap.
Both owned processes stopped and removed their sessions. Raw local evidence:
`dist/coherent-paint-memory/{dog,cat,report}.json`. Full suite:244 passed,
two macOS-only tests skipped on Windows. No artwork or motion change.

## Superseded 0.0.19 experiment (historical)

# Sparse Windows paint surfaces · 0.0.19

Version0.0.19 builds on0.0.18. JavaScript behavior, Q5 art, world/contact math, colors and
Braille masks are unchanged; the native painter allocates less empty space.

## Change

The old painter kept one bitmap spanning every nonempty cell. The cat, tower
and wheel therefore retained a large transparent rectangle between objects.
Its width and height only grew until species switch/exit. A held-pose ablation
at3840×2160 measured cat+furniture38.6MiB versus cat alone17.6MiB; the equivalent
single DIB capacities were12.22MiB and1.63MiB respectively.

The new painter partitions the FINAL cell mask into up to8 disjoint cropped
regions. Greedy splits account for64px allocation rounding and must save at
least256KiB of bitmap space. No glyph is resampled, dropped, drawn twice or
recolored; geometry and palette still share the original stamp atlas. A dense
scene can remain a single region. This is a bounded native composition change,
not extra animal simulations or one process per region.

Each surface reuses capacity while it is within2× its current rounded target
area. Oversized capacity is reclaimed on repaint; unused regions are destroyed.
Hidden/minimized/retargeted scenes release their surfaces and overlay windows.
Resume repaints from the current simulation state. Windows system/compositor
allocations remain separate from the reported `paintSurfaceBytes` DIB counter.

## Measurement

Same Windows11 x64 host, real native painter and an owned off-screen physical
3840×2160 scene. Seed731; the existing150s diagnostic action schedule and300
roughly0.5s samples per pet. No forced GC/working-set trimming. Watch/brain off;
harness and external DWM/GPU memory excluded. Baseline is the tested0.0.18
installed-artifact run. These finite runs do not establish a universal RAM cap.

| Scene |0.0.18 median RSS|0.0.19 median RSS|0.0.18 OS peak|0.0.19 OS peak|
|---|---:|---:|---:|---:|
|Dog|29.35MiB|22.63MiB|40.34MiB|36.45MiB|
|Cat with tower/wheel|44.22MiB|29.46MiB|65.45MiB|39.13MiB|

The short fixed-pose cat+furniture comparison fell from38.6 to27.3MiB. This is
a different workload from the moving150s runs above, not a replacement for them.
Actual resize testing reduced allocated DIBs from6.52 to1.66MiB. Minimizing
reported0 DIB bytes and0 overlay HWNDs; restore and dog/cat switching recovered.

A paired16s cat timing check had92 paints/340 rendered calls in both variants.
Mean render time changed3.06→3.94ms, P95 12.42→16.68ms. Partitioning trades some
CPU for memory; these timings are not a constant-FPS guarantee.

## Verification

- Native self-test:56 grids across7 cell sizes. Occupied masks covered once,
  all regions disjoint/in bounds, partition plans no larger than one crop,
  at most8 regions, and real DIB shrink/release verified.
- Real painter:300 moving frames across dog/cream and cat/gold/dark compared
  against the old monolithic GDI+ ellipse output, byte-for-byte including alpha.
  This tests per-frame paint pixels, not atomicity of compositor presentation.
- Real owned windows: pick/reselect,4K→small→4K, minimize/restore, species
  switching, bootstrap detach, startup EOF, stop and Korean paths passed.
- Local full suite:243 passed,2 macOS-only tests skipped on this Windows host.

Reproduce with `node --test native-desktop.test.mjs`,
`node tools/check-native-paint.mjs`, `node tools/check-native-resources.mjs`,
and `node tools/measure-native-pet.mjs 150` after `npm run build:native`.
Local evidence is under dist/sparse-paint-memory, dist/paint-parity-HlzSTl,
dist/paint-resource-m3dMB1 and dist/sparse-timing-REFNLe. QA output is not
packaged. Linux/macOS/browser and optional Node/CLR watching paths are unchanged.
