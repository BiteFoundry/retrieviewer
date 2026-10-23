# Runtime weight and performance

## Current source optimization (unpublished candidate)

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
resident art. The public npm release has not been updated with this candidate.

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
