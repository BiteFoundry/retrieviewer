# Cat art and motion review

Current default: the owner-approved ginger identity and65-key ginger motion
atlas described below. The tuxedo material is retained as historical source
and is not fetched by the default renderer.

## Initial tuxedo prototype

The owner selected a playful, expressive shorthair tuxedo. These are generated
whole-body raster drawings, not dog sprites with different ears or a 3D skin.
The visual medium is stable monochrome Braille. No downloaded cat photographs,
YouTube frames, model weights or paid runtime inference are included.

Built-in imagegen produced these project-local sources under `art/source/`:

| Sheet | Role | SHA-256 |
|---|---|---|
| identity-v1.png | Six representative views/poses; identity input only | 821b762f32a8bf8646323ebaa37ef4b22949b623c5ebe32de801728ac50dd79e |
| rest-v1.png | Neutral, blink, turn/rise, stretch, loaf, sleep, grooming and bat | e06e3a330e8ff7afa308caa2f9945224c26899a23cc9535fa81da4d9aec63883 |
| walk-v1.png | Front/rear steps; side cycle rejected as too similar | aff316580fd24823ef891fe9ccc821484d3e45d85efcce55ed5dd8da81ebd8ee |
| walk-v2.png | Four distinct side-walk candidates | f07f7e02e7bbf26abe26b5ac9a61206d8d1604f655598f9a92b2365a5f65a1ce |
| pounce-v1.png | Hind-leg loading, launch, flight, forepaw landing, gathering | 9c3fac49b0428f2f7722338007e2cc6229ab8d2e222b3a8a285043b344c341b2 |

Prompt set: the same natural young-adult tuxedo, white chin/bib/four socks,
triangular ears, slender connected feline torso and long tail; readable black
fur highlights, closed mouth, no bandana/collar/human smile/dog body. Fixed
camera and world scale per batch, full animal inside cell, black background,
no props/text. Separate side/front/rear walking phases; rest/groom/sleep studies;
eight force-bearing pounce poses. The side-walk retry explicitly asks for a
forward-contact, vertical-support, backward-push and lifted-swing near forepaw.
Exact sheets remain local; this private repo ships their compact runtime atlas.

The source models did not honor square cells on every sheet. The offline
preparer records actual source boxes, one common scale per batch, connected
foreground selection, torso proxy translation and a 290px ground proxy.
It never bbox-fits each pose or warps anatomical parts. A monotone luminance
curve (gamma0.62) keeps black fur readable on black, followed by the reused
32-level cropped/predictive Q5 codec. Bright/dark composites are QA, not alpha
changes in the runtime. One 36-key archive is 273,993 bytes (about268KiB).

## Known visual limits

This is the first integrated cat, not yet the final Retrieviewer motion standard.
Side walking still has only four authored keys; support ownership and stroke
length need a denser measured gait before claiming rendered no-slip contact.
Directional pose connections and independent sheet proportions need visual
refinement. The front/rear step material is present, not a rotating camera.
Groom raster audit is structurally valid but flags entry/exit center changes;
those are review points, not automatically approved anatomy. Pounce physics is
one ballistic clock; instantaneous horizontal takeoff/landing speeds are a
documented kinematic approximation, not force simulation or motion capture.

The owner selected CC BY-SA 4.0 for the cat artwork on 2026-10-25.
See ASSETS-LICENSE.md. Code remains MIT. Generation does not itself establish
exclusive rights; this grants only rights the maintainer can license.

## Ginger identity candidate · 2026-10-25

The owner requested a single-color ginger coat after the tuxedo dots failed to
separate dark-fur highlights from white patches. Built-in imagegen generated
`art/source/ginger-identity-v1.png` (1942x809), SHA-256
`af4322edb7d1f001d002b55535369f8dd067cd4621ddd453318251b0caa1d559`.
No reference images were supplied. The complete prompt is recorded in
[research/ginger-art-prompt.md](research/ginger-art-prompt.md).

Front sit, side stand and curled sleep were extracted at a shared uniform0.30
scale, translated as whole poses to ground290 on320-square canvases. Actual
nonuniform source boxes are recorded in `art/ginger-candidate.json`. The source
has subtle natural coat shading; these are not white bib/sock regions. No body
parts are warped or recolored from the old tuxedo.

The separate candidate uses the existing Q5 codec and stable dot converter.
Its single archive is21,694bytes. The orange color #f1b66b is applied at paint
time, so it does not require RGB sprites. A fixed640-square canvas and one
320-square RGBA scratch buffer are used only when this page is open, with no
animation timer or runtime model. Aside inspection covered all three buttons
and real dot output. The existing tuxedo archive and motion are unchanged.
These are static identity candidates, not a completed ginger animation set or
an owner-approved final design. Generated-pose proportions still need review
before authoring the new motion keys. The same CC BY-SA 4.0 artwork terms apply.

## Approved ginger motion integration · 2026-10-25

The owner approved the ginger identity before generation of these three sheets:

| Sheet | Role | SHA-256 |
|---|---|---|
| ginger-rest-v1.png | Blink, rise/turn, loaf/curl, stretch, grooming and paw taps | 881152ceae13de8a02a4f05a19f1867f87adf77ca173f77c13467b8f0f74c41a |
| ginger-walk-v1.png | Eight side phases and four each front/rear | 5355ea0a0320eb42a6fee96d285c5d064dc64b8bc23cdb697271d2814fff578c |
| ginger-pounce-v1.png | Low stalk/load, launch/flight/reach, fore/hind landing and recovery | ec412d407b13b0a740ac2d9645c00096951f397e8734ed31723219123b3d645e |

These use the approved identity sheet as input. Actual dimensions are1254-square
for rest and1536x1024 for walk/pounce, not an assumed uniform requested grid.
The offline preparer uses measured source rows/windows, removes isolated neighbor
components and registers whole poses with common scales per sheet (rest.68,
walk.80, pounce.64). No torso/head warps or independent per-frame bbox scaling.
The original sit/stand/curl candidate keys are byte-identical after Q5 decoding,
covered by an exact regression test. One unused rest stand is excluded.

The active archive `art/ginger.bin.gz` has42 reachable keys and322,500bytes.
It replaces the old atlas at load time, not by retaining both. Color #f1b66b
is a paint hint on `frame().color`; the RGBA sampling buffer stays grayscale.
Launch/flight retain8/34px of authored paw clearance in addition to the world
trajectory. This registration is an authored approximation, not measured COM
or sole-lock contact. No new motion model, runtime dependency or per-action
process is introduced. The invisible-toy limitation remains from the prototype.

Walk/groom/pounce/land raster audits pass structure. Walk has no numerical review
warning; the others flag expected pose/center changes and require visual review.
Their contact sheets and actual Aside toy replay were inspected. Eight side
keys give more visible limb variety but do not prove exact four-beat feline
contact or eliminate all view/pose size differences. Those remain prototype
review items. New action poses have not yet received owner visual acceptance.

## Body-size and transition repair · 2026-10-25

The oversized sheet-based blink/groom and loaf poses were replaced with
whole-body edits of approved references. A second multi-pose sheet and a
narrow sit-based loaf were rejected; neither is in the runtime atlas.
Selected source files in `art/source/`:

| Source | SHA-256 |
|---|---|
| ginger-blink-v2.png | 424deac664b4edd7066ad47d1141c8c417c6836c03d64c4b99df8665d7e006c2 |
| ginger-groom-lift-v2.png | 58c424e1baf5d963c4ab01d106ea742f439b88dc82bfc68975cadf5626685a85 |
| ginger-groom-lick-v2.png | 7aa83ee99214ba7e51acb713866642b308f85011d9c44e38e8392a6d2f5630c6 |
| ginger-groom-cheek-v2.png | ce5387af35043cb8507983b9531c5177e9374f45e599c36e374aacf81307caed |
| ginger-loaf-v3.png | 4808798471951dc664da2a168d31e1dcfa0abbba500fe594dfa8af01fa2dcd11 |

Blink/groom output is normalized to the known462x750 seated input canvas,
not to the changing silhouette. The final loaf edits the registered320-square
approved curl, with the identity sheet as color reference. Only uniform scaling
and whole-image translation are applied. Profile stand and turn/stretch use a
0.88 calibration; lowering0.85, curled entry0.83 and paw-taps0.78 relative to
their original registration. These are offline authored corrections, not live
scaling pulses or anatomical warps. Source transforms remain in metadata.

The active atlas has40 reachable keys and283,201bytes,39,299 fewer than before.
Sit/curl and26 other unaffected named keys stay exactly unchanged; an immutable
decoded hash fixture from113947e verifies this. The overgrown grooming exit and
redundant closed-loaf key are excluded. Loaded crouch stays grounded; the
airborne sequence starts at launch. Front rise/sit reuses its own view's keys.

Simulation now selects orientation/settlement independently of render frequency.
Bat/stretch already finish seated and no longer replay stand-to-sit. A front
arrival uses front sitting keys. Physics units, paths, camera calibration and
walking/leap/landing drawings remain unchanged. Aside review covered grooming
and the full toy loop. Raster walk/groom audits pass without review warnings;
pounce/land retain pose-center warnings. These are not proofs of3D volume or
sole locking. Hard direction changes remain a prototype review item.

## Hind-leg walk and stance repair · 2026-10-25

The owner correctly identified nearly static hind legs in the original walk
sheet. Eight single-pose edits of the approved profile replace only the eight
side-walk keys. Files `art/source/ginger-step-v2-00.png` through `-07.png` retain
the original drawings; dimensions/hashes and the shared padded1066x850 canvas
are recorded per key in runtime metadata. Full prompts and the rejected v3-06
correction are in research/ginger-walk-prompts.md. Only v2 keys are packed.

All keys use the same whole-canvas registration, including a common vertical
offset. They are NOT grounded by each frame's lowest paw, which would erase
swing lift. Visual inspection chooses source order0,1,2,7,3,4,5,6. Toe proxies
are manually identified and snapped to nearby visible source ink. Planned
prompt coordinates alone are not treated as measured contact evidence.

Near-hind support retreats about60.47 source pixels over5/8 cycle. The .60m
canvas yields stride0.18141m. Ground cruise speeds remain0.525m/s walking and
0.156m/s creeping; ds/stride changes pose cadence instead of slowing the root.
The exact stride is generated once into src/walk-cycle.mjs from annotations.

Bounded contact rendering adapts the existing MIT Retrieviewer foot-lock idea,
not its dog anatomy. Simulation owns stance episodes/world anchors, including
the cyclic seam and left/right mirror. The same fixed camera inverts a visible
toe onto the ground plane and reprojects that anchor. A local inverse lower-leg
warp preserves its planted position while authored hips/knees continue moving.
Pixels at/above y225 remain unchanged. Incompatible supports release at image
strain1.35 or displacement beyond48px horizontal/18px vertical instead of
stretching indefinitely. Swing feet are not pinned. One scalar scratch object
is reused by raster sampling; no extra image buffers or runtime engine added.

All32 non-target keys are byte-identical after decoding to the00ba0a0 baseline.
The archive remains40 keys, now267,251bytes. Walking raster audit passes without
warnings; actual Aside canvas output was inspected in a paused walking pose
because full-viewport CDP capture timed out. Support proxies/ink tests and
world-anchor invariants are stronger than the previous numeric gait-only check,
but this remains a2.5D raster approximation. Exact contact is not claimed for
every occluded toe, source transition or front/rear view. Discrete authored-key
changes and bounded release can still need visual refinement.

## Visible feeding and tucked-loaf repair · 2026-10-25

Six new single-pose edits add high/mid/lowered feeding, a tongue-contact key,
a genuine low paws-tucked loaf and its folded-leg transition. Exact prompt set
and input roles: [ginger-feeding-prompts.md](research/ginger-feeding-prompts.md).
Source originals stay under ignored art/source; their hashes/transforms are
recorded in art/ginger.json. Research photos are observation only, not inputs.

Feeding uses one family-wide profile-canvas scale and translation; no changing
silhouette fit. The generated tongue edit contributes only its registered mouth
rectangle to the closed-mouth drawing, so every non-mouth body/foot pixel is
identical during licking. Dish/paste are small grayscale shapes painted directly
into the existing borrowed output; no extra texture or RGB frame family exists.
The head now has high/mid/low lowering keys and reverses them on recovery.
The compact loaf uses the approved portrait canvas and a fixed anatomical scale;
the previous curl-alert key and sleep variants are preserved.

The active archive has46 reachable keys and298,245bytes,30,994 more than before.
All earlier keys remain byte-identical against their existing immutable fixture.
This is a deliberately small new behavior set, not a claim that every species
action, camera direction or continuous joint motion has been completed.

## Quiet stretch and tail extension · 2026-10-25

Six source edits add three connected stretch poses and three tail-tip poses.
The old faulty stretch extreme is replaced, so there are five net new packed
keys:51 total. All45 other old keys, including the entire walking/feeding art,
remain byte-identical to f2f6731, checked by a separate hash fixture with only
stretch allowlisted. Source prompts/input roles are in
[ginger-motion-prompts.md](research/ginger-motion-prompts.md). Research photos
were observation only and never entered the generation calls or runtime assets.

The stretch family uses one padded-profile scale and common deep-pose ground
registration. Beginning/reaching/holding/releasing are separate supported phases;
their live timing is not a uniformly accelerated movie. Tail sources contribute
only rectangle(90,248)–(145,291) to the canonical sit. Face, trunk, legs and paws
stay exact while its tip loosens/lifts/settles. Two finite tail patterns occur
during observation, with long quiet gaps and no constant dog-like wag loop.

Archive321,398bytes is23,153bytes larger than the preceding46-key archive.
The reconstruction cache still contains two grayscale keys; tint and one RGBA
output are reused. Walk exact-baseline and new tail raster audits pass without
warnings. Stretch reach has an expected center-shift review warning between
the upright stand and lowered-head beginning; its actual connected-body entry,
deep hold and seated recovery were inspected in the browser, not auto-approved.

## Quiet affiliation extension · 2026-10-25

Five new packed keys add half/closed eyelids and neutral/left/right whole-body
kneading poses. Exact prompts and input roles are in
[ginger-affection-prompts.md](research/ginger-affection-prompts.md). The ordinary
blink and every one of the51 preceding drawings remain byte-identical to298b7d8;
a dedicated immutable SHA-256 fixture checks them. Raw source files stay local.

Half/closed eyes share one portrait registration and contribute only rectangle
(133,136)–(190,159) to canonical sit. Other fur, head outline, trunk, tail and
support pixels cannot shimmer or inflate. Kneading uses one shared folded-body
registration (225px known canvas height, translation89/106), never separate fits
to raised paws. The torso/neck follows subtle reciprocal shoulder weight shifts;
both forepaws visibly release above the opposite pressed pose. Four pairs take
4.8s, then the supported fold leads directly to compact loaf. The small rounded
mat is a grayscale prop painted into the same borrowed output, without textures.

Archive339,630bytes adds18,232bytes. Eye/knead raster diagnostics pass without
review warnings; actual caption-free browser playback showed greeting, knead
entry, alternating forepaws and mat-supported loaf. The gestures are small at
the default dot scale, especially far away. These are local self-review results,
not a claim of continuous skeletal animation or owner aesthetic acceptance.

## Tower / wheel extension · 2026-10-25

Nine new packed keys: eight connected gallop extremes/breakdowns and one upward
reach. All56 earlier drawings stay exact to b422e7e, checked by a dedicated
immutable hash fixture. Prompts, selected inputs, the rejected initial trot and
measured source-box correction are in research/ginger-habitat-prompts.md.
Both gallop sheets share .337 scale and a nominal cell origin; raised legs and
suspension are preserved instead of ground-fitting every pose. Actual bottom
gutter800 replaces an assumed768 to retain extended toes without stray fragments.

Tower load/fore-land/gather/recovery reuse their existing force-bearing drawings.
A real elevated support remains under subsequent sit/greeting/loaf. Furniture
shares the fixed pinhole transform and paints into the borrowed grayscale buffer.
No furniture texture, RGB atlas, runtime dependency or additional worker exists.
Archive391,476bytes adds51,846bytes. Raster audits pass structure with retained
center/area review warnings from gathered/extended suspension and reach/landing;
these are explicitly not automatic anatomy approval. Local actual dot review
covered tower arrival/rest and wheel run/deceleration/departure. Curved tread
sole contact is an approximation and has not been numerically locked per toe.

## Lightweight runtime and public artwork terms · 2026-10-25

The unchanged simulation/render body now lives in src/purrviewer-core.mjs.
createCatFromAssets accepts a lifetime-owned store and optional raster kernel;
the existing browser/Node loader remains the default. Native Windows shares
this core and reads individually compressed Q5 crops from disk. No behavior
keys, timings, anatomy or source pixels were changed. The owner explicitly
chose CC BY-SA 4.0 for the bundled ginger artwork, including its metadata and
alternative encodings; code remains MIT. Research photographs and raw source
sheets are not included in the public package.
