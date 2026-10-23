# 32-level predictive art (default since v0.1)

Q5 is now the default after user visual comparison and approval. No original
artwork/cache was overwritten, no poses removed, and movement timing is unchanged.
Q5 is a **lossy** palette reduction, not a lossless replacement.

## Try it

- Synchronized comparison: `http://127.0.0.1:60668/puppy-q5-compare.html`
- Normal companion screen: `http://127.0.0.1:60668/puppy-paper.html?palette=q5`
- Terminal candidate: `npm run pet:companion -- --q5`
- JS host: `await createPet()`. Original: `artProfile:'original'` with original files.
- Local original screen: `http://127.0.0.1:60668/puppy-paper.html?palette=original`

The comparison gives both pets the same seed, elapsed time, steps, interactions,
camera and grid. It checks both state and life-report equality. Ball/treat affect
both; pause freezes both. Reduced motion starts paused; hidden tabs stop stepping.
Changed-dot percentage is a diagnostic, not a perceptual quality score. Examine
eyes, mouth, fur tips and temporal sparkle. The comparison loads **both** art sets;
its memory is not the standalone candidate's memory.

## Codec

Source pixel v becomes q=round(v*31/255), displayed as round(q*255/31). Maximum
source-pixel error is4. The original unique-frame map, crop rectangles and logical
indices stay unchanged. Crops use adaptive PNG-style row prediction (None/Sub/Up/
Average/Paeth), then deterministic gzip. RVQ5 validation rejects malformed shapes,
maps, offsets, row filters and decoded indices outside0..31.

At load, prediction is reversed once and indices are repacked to **5 bits/pixel**.
The expanded filtered input is not retained. A two-frame LRU expands selected
frames to the existing 8-bit sampler interface. Original and Q5 caches have separate
sharing/refcount entries; pets' actors, needs, clocks and buffers remain independent.

## Local measurements

Fresh Node v24.19.0 processes on this Windows host, explicit GC, seed731,
sixty frames at160×50 cells. These are samples, not platform-wide limits.

| Metric | Original | Q5 candidate |
| --- | ---: | ---: |
| Compressed art | 54.2 MB | 18.7 MB |
| Resident cropped pixel payload | 106.4 MB | 66.5 MB |
| RSS after rendering | 211.8 MB | 172.0 MB |
| Load time | 270 ms | 737 ms |
| Mean sampled frame time | 2.66 ms | 2.61 ms |

Startup is slower due to prediction reversal/packing. Q5 peak RSS varied from200
to228 MB in two samples. After disposal + an event-loop turn + explicit GC,
ArrayBuffers returned to about0.15 MB. Browser decoding is synchronous CPU work
between loads. Desktop Aside was exercised; physical mobile and every terminal
font were not tested. See `pet-q5-comparison-report.json`.

## Verification / status

- All2,341 logical frames match the specified quantized source; artifact and
  original-source hashes are separate in `pet-q5-manifest.json`.
- Prediction, bit packing, partial bytes, malformed input, LRU bounds and input
  detachment are tested. Generator checks original-file hashes remain unchanged.
- A160-frame fetch/treat simulation keeps state, reports, mouth and projection
  equal. Changed dots / union of lit dots was0.3431% at160×50; not visual approval.
- Aside: fetch/pickup/carry/drop/offer, treat and frozen pause stay synchronized.
  Desktop side and frontal-chewing screenshots inspected. User reported no visible
  difference, possibly preferring32 levels; default switch was then authorized.
- Initial codec handoff:230 tests passed. Current product checks: npm test and
  npm run test:package (see dist/package-check.json after packaging).

Build: `node prepare-pet-q5.mjs`. Memory: `node --expose-gc measure-pet-memory.mjs --q5`.

The package now includes Q5 binaries/manifest only; comparison UI and original
caches remain in the source workspace. Original hosts must separately copy the
files from getPetAssetFiles('original') and supply loadAsset. This prevents
shipping both art sets. See PLUGIN.md for portable tarball installation.
