# Comfort extension art record

Source code MIT; generated puppy art and frame data CC BY-SA4.0, retaining the
credits in ATTRIBUTION.md. This is a development-source record, not new legal
clearance. No external photograph, YouTube frame or downloaded rig was introduced.

## Assets and preparation

- Belly-up: existing v9 `roll-down`, eased to its measured `roll7` edge boundary,
  held without a new bitmap, then completed to the existing seat.
- Sleep: existing `rest` eyes-closed endpoint. The body does not zoom or squash.
  A small code-drawn rising z cue is silent; no audio engine is installed.
- Tug: built-in imagegen output from the existing generated
  `puppy-behaviors16-sheet.png` identity reference. Original PNG is preserved at
  `dist/comfort-art/tug-source-v1.png` locally and is not bundled in npm.
  SHA-256: `10fde9dacca5cb45acd68f387e7ed3bcf88cd72cf0f9c4220d31d819db91731e`.
  Eight keys plus the original seat are packed in
  `puppy-companion-comfort-q5.bin.gz`; registration/hash/byte counts are in
  `puppy-companion-comfort.json`. One scale is applied to all poses; only ground
  and body-center translation varies. Playback repeats discrete authored keys,
  not opacity crossfades, whole-body scale animation or a pre-expanded30fps film.

Rebuild (development only, Python Pillow plus existing Node codec):

```sh
node tools/prepare-comfort-art.mjs /absolute/path/to/tug-source-v1.png
node tools/check-comfort.mjs
```

Runtime does not use Python/Pillow or image-generation services for these poses.
The reference/output/preparation originals are preserved; existing runtime art
archives were not overwritten. Windows off-screen snapshots are diagnostic,
not final end-user approval. Other-platform live appearance remains unverified.

## Generation prompt (built-in tool)

Use case: stylized-concept. Project asset: Retrieviewer tiny tug-play sprite
sheet, faithful to the input reference puppy. The reference image is identity/style
reference, not an output to edit. Create ONE2048x1024 sprite sheet: exactly4 equal
columns and2 equal rows, eight separate full-body isolated sprites on absolutely
pure black, no borders, no lettering or grid. Every cell is exactly512x512. Same
adorable fluffy pale golden retriever puppy, realistic soft long fine fur, black
nose/eyes, small dark bandana as input. Grayscale only. Fixed frontal slightly
elevated viewpoint matching reference third row seated puppy. Fixed optical focal
length, same head/body proportions and puppy scale, identical grounded paw
baselines at y=456 inside every cell and centered body. Body silhouette about290px
wide. ALL eight cells show the puppy seated with front paws planted in exact same
place: no jumps, no camera moves, no size changes, no head squashing or body
inflation. A small pale braided rope tug toy runs horizontally through mouth and
extends to puppy's right, without human/hand. First cell: puppy curious, mouth just
about to grip rope. Second: gently closing jaws around rope, naturally opening
mouth. Third: firm grip, lower jaw and muzzle believable. Fourth: gently leaning
just the head back8px while rump and paws planted. Fifth: holding same toy, head
tugs8px left, both eyes focused on toy. Sixth: head tugs8px right (tiny sideways
pull), ears follow naturally. Seventh: eases back to center and loosens grip.
Eighth: lets go and faces viewer, happy soft closed mouth; toy end just below nose.
Make each cell an adjacent pose of the SAME animation with extremely small
differences. No dot dithering, no ASCII, no pixel blocks; preserve detailed soft
fur, runtime will convert to fine Braille. No extra limbs, no new collar, no
cartoony cylinders, no shadows or floor background. Full tail/body entirely inside
each cell, ample pure-black margin.

Observed output is1774×887 rather than the requested size; the preparation script
extracts equal cells from actual dimensions. The resulting authored keys still
need visual review for small body/face differences at transitions.
