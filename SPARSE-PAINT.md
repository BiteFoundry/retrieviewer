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
