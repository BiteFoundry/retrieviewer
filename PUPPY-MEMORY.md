# Lossless runtime cache reduction

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
