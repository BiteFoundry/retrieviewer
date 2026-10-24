# Attention paw gesture

The notification sequence now approaches the user when necessary, sits facing
them, makes two gentle air scrapes with the viewer-left forepaw, lowers it, and
looks toward the pending item. This is one 1.88-second episode per accepted
notice. It does not add autonomous reminders or change which events qualify.

The viewer-right forepaw remains planted. Six whole-body grayscale keys share
one uniform scale and are translated to that support point. There are no
independently warped heads, legs, or body parts. The original seated frame is
reused exactly at both ends. Resolution, ball, treat, and tug interrupt through
an authored lowering path of at most 0.3 seconds from the last displayed key.

## Art and provenance

Generated with the built-in imagegen tool, using the existing canonical seated
puppy and an earlier generated paw study as references. No new photographs were
used. Existing art attribution and CC BY-SA 4.0 terms continue to apply; see
ASSET-PROVENANCE.md and ASSETS-LICENSE.md.

Final source: `dist/attention-paw-v2/source.png`.
SHA-256: `0c3b01952378cd7c0fd941f53e1c43ca5de73c63b3875e58d035b009508d693a`.

Prompt specification: a wide 3-by-2 sheet of six square, black-background cells;
the same fluffy golden-retriever puppy, face, bandana, seated proportions and
complete tail in every cell; one forepaw gently lifts, bends, reaches forward,
scrapes down through the air, retracts, and lowers; the opposite forepaw stays
planted; consistent fixed camera, floor, body scale, monochrome tonal fur and
clean empty margins. Earlier alternating-paw and tail-clipped studies were
rejected and are not runtime assets.

`tools/prepare-attention-art.mjs` and its Python companion extract and register
the six keys offline. They append to the existing comfort archive and verify
all 45 previous frames byte-for-byte. The source sheet and QA files are excluded
from the npm package. No generation service is used at runtime.

## Cost and verification

The compressed archive grows by 55,386 bytes (about 54 KiB). Node's compressed
pixel storage grows by 63,912 bytes (about 62 KiB), compared with the same codec
over the preserved 45-frame baseline. Selectively retaining the new keys in the
portable store costs about 137 KiB; this is different from the net archive
repacking delta. These are pixel-storage measurements, not total process RSS.

The sampler borrows the existing RGBA scratch and two-frame reconstruction
cache. No new runtime dependency, asset family, timer, or permanent decoded
animation cache is added. Dedicated tests check exact old pixels, planted root,
neutral bookends, bounded recovery, direct interactions and the public renderer.

The owner accepted this motion on2026-10-24 for release0.0.16, alongside the
standing wall variant. Windows npm-shim support is a separate compatibility fix
in that release. Completed-work alerts remain unsupported. The local preview
uses simulated pending items. Live companion restart remains user-controlled.
