# Standing wall scrabble

An additional attention variant: shift weight to the hindquarters, rise onto two
hind feet, brace both front paws against an implicit front glass plane, scrabble
quickly, then lower and sit. The complete authored episode lasts 2.2 seconds.
The glass is a visual metaphor, not detected window geometry or a new collision
system. No actual desktop content, wall or screen is inspected.

The gentle seated paw cue is preserved. Accepted notices alternate paw/wall
without consuming autonomy or fetch randomness. Hosts can request a fixed cue:

```js
pet.notify({kind:'input', gesture:'wall'}); // 'auto' (default), 'paw', 'wall'
```

Repeated or rejected notices do not start another episode. If wall art is absent,
automatic mode keeps the prior behavior; an explicit wall request returns false.
Resolution, ball, treat and tug lower from the exact displayed key via an authored
path of at most 0.4 seconds. There is no mid-gesture teleport to a sitting frame.

## Art source

Built-in imagegen, canonical existing licensed seated puppy as the sole image
reference. No new photographs or video frames were used. The artwork retains
the existing attribution and CC BY-SA 4.0 lineage. Raw sheets are excluded from
npm. Source: `dist/attention-wall-v1/source.png`, SHA-256:
`ea1a8f2f4d3f4b897bec95bcd06b8a4d6cd81d083713b67857efac469707e4af`.

Prompt specification: the exact reference puppy, muzzle/ears/bandana/fur and age;
one 3-by-3 sheet of complete whole-body keys on black, a fixed front/slight
three-quarter camera, same world scale and floor in every cell, no drawn wall,
props or labels. Keys: seated weight shift, half-rise, upright braced on two rear
soles with both forepaws high, alternating forepaw scrapes with coupled shoulder
weight transfer, both paws high, knees bending/lowering, and low seated recovery.
Preserve chest/skull volume, full tail and toes; standing must be naturally taller
than sitting rather than resized into the seated bounding box.

Actual sheet: 1254 by 1254, split into nine 418-square cells. Offline preparation
uses one common scale (0.7572463768115942), whole-frame translation to the measured
lower paw-pair proxy, and no anatomical compositing or nonlinear warp. Proxy
registration is not animal motion capture. The exact old neutral is reused at
both ends. Existing 51 comfort frames, including the gentle paw cue, stay exact.

## Resource cost and checks

Nine extra keys extend the same comfort archive from 51 to 60 frames. Compressed
download increases 104,865 bytes (102.4 KiB); Node compressed pixel storage grows
117,578 bytes (114.8 KiB) with the same codec/baseline. These are payload figures,
not total RSS. No new RGBA scratch, timer, asset family, process or dependency.

Tests cover old pixel hashes, shared neutral, malformed recovery metadata,
unchanged world/projection, sole-proxy registration, every recovery phase,
variant choice and resolution/direct-play priority. Real public Braille frames
and the Aside preview were inspected. Raster audit has no structural errors;
its center-shift warnings describe the deliberate rise/lower and stance transfer
and require visual review rather than a looser threshold. The owner visually
accepted this motion and authorized release0.0.16 on2026-10-24. The user's running
companion is not automatically replaced by publication.
