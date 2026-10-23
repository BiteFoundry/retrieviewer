# Watch/fetch artwork review for0.0.10

The owner accepted the second whole-body watch candidate and new momentum
drawings, then reviewed v6 and requested retaining the original braking return
alongside the new trot choices. The subsequent explicit request to publish and
update the website authorizes this0.0.10 candidate. Earlier holds and rejected
motion candidates below are historical, not the current publication policy.

## Watch candidates

The0.0.9 row-dependent torso-envelope warp can satisfy width/area/paw tests while
still looking lens-distorted. Numerical bounds are not a human visual approval.
A first redraw experiment used a fixed torso and an authored head/neck layer;
the owner rejected the disconnected upper/lower motion. Do not publish that rig.

The second candidate uses newly authored **whole-body** keys. Head yaw is coupled
to shoulder/chest/foreleg weight transfer in the drawing. Preparation applies one
common uniform scale and whole-frame floor translation. No collar matte,
anatomical masks, per-row scaling, optical flow or runtime body deformation.
The owner accepted this candidate after rejecting the disconnected first study.
Existing seated endpoints are exact; the same36 logical watch frames replace the
old ones. Whole adjacent pose keys are sampled at the existing cadence.

Built-in imagegen inputs were the existing approved seated puppy and the first
generated study, never a newly downloaded photo. The final prompt asked for a
5×3 grid of15 full-body yaw keys, a fixed camera and body mass, a connected neck
and shoulders, planted paws and subtle foreleg weight transfer. Source and full
preparation records remain locally in `dist/watch-redraw-v2/`; the source PNG's
SHA-256 is in its candidate.json. The first draft is retained separately for
comparison, not composited into the second candidate.

## Current fetch motion: brisk single pursuit and carry-trot

The owner found v5 more natural but asked for a more dynamic impact and a small
trotting return instead of repeated braking. V6 preserves every one of its37
art samples. Impact timing changes from .82s to .65s: fore-brace .19s, residual
catch .29s, recovery .17s. The physical entry solver uses the same new durations
and residual-speed ratio .24; the source extremes are not spatially warped.

Eight added keys provide four distinct diagonal trotting phases and four small
gathering poses. Repeated source-study poses are omitted. The final key is the
exact existing arrival-seat frame0, not a new approximation of the sit handoff.
Gait phase uses traveled distance / fitted trot stride; cadence never exceeds
the calibrated trot frequency. Visible forepaw support proxies use the existing
ground lock and separate swing/support strips. The head/body are not warped.
Mouth anchors are per-key in the same registered source coordinates.

The owner requested retaining the old braking return as a selectable alternative,
not replacing it. An independent return-choice stream now mixes brake, trot and
run-then-trot without adjacent repeats. `returnStyle` fixes one style or selects
auto; the public setter affects the next throw only. Desktop startup accepts
`--return-style`; an already-running companion is not silently restarted or
changed. It does not consume the fetch-pattern or ordinary autonomy RNG. The two
new return types use small gathering steps: the last gathering keys move through at
most8.8cm and finish at zero velocity before the shared sitting source. Existing
non-fetch approaches are unchanged. Source/prompt: `dist/carry-trot-v1/NOTES.md`;
preparation: `tools/prepare-carry-trot.*`, from the hash-checked v5 stage. Raw study
is not shipped. Additional gzip81,084bytes; portable retained pixel increment
259,057bytes versus v5; Node retained compressed pixels +90,697bytes in the same
default-loader comparison. These are pixel payloads, not a promise about RSS.

`puppy-carry-trot.test.mjs` covers distance/speed continuity, short and200m paths,
cyclic support/phase, controller return variety, exact sit handoff, mouth anchor,
old37-frame digest, bounded retention and disposal. Full suite:167 passed, two
live-macOS checks skipped on Windows, zero failures. Native Windows owned-window
overlay check passed and both owned worker/painter processes exited. Aside
screenshots checked impact and new carry poses. The owner subsequently requested
publication; numerical tests alone did not supply that authorization.

### Preserved v5 basis

The owner rejected v4's lateral routing even after timing improved: it still
made a shallow detour, ran sideways, overshot the ball, reversed, and chased again.
Do not reinstate that choreography or its rejected side-on stumble art.

The v5 comfort family now replaces only the new stumble portion. It preserves
the13 original tug/sleep frames and12 standing pickup frames exactly. Twelve
rear stumble samples include four direct registrations from the owner's approved
rear-quarter original study; intermediate poses were generated with built-in
imagegen using those originals and existing rear endpoints only. The first/last
keys are exact existing run/rear-stand sources. One common scale per authored
batch, whole-frame registration, no body compositing or nonlinear warp.

`planPaperStumble` solves entry arc length, speed and stride together. The dog
enters the authored contact phase with positive velocity, brakes to a residual
speed, then decelerates to rest through its catch step at the pickup root. No
stop/relaunch between bracing and catching. The single depth pursuit never uses
an x-axis showcase detour or second reChase. The dog picks up facing away before
its normal unarmed return. Camera/projection and other fetch patterns are retained.

Source and exact generation prompt: `dist/stumble-runtime-v3/NOTES.md`.
Runtime metadata carries source hashes and transforms. The generator pins the
unmodified comfort prefix to commit9fc9628 so --apply remains reproducible after
integration. `node tools/check-fetch.mjs --default` verifies actual default assets
and all four seeded patterns; `puppy-stumble-path.test.mjs` freezes original13-key
pixels, shared endpoints, byte budgets, velocity/phase/arrival and no detour.

Measured additions over the original13-key family: gzip246,820bytes, portable
retained pixels702,249bytes, Node compressed pixels277,204bytes. No additional
runtime dependency/process/timer or raster buffer; these are not desktop RSS.
This does not substitute numerical tests for the owner's animation review.

## Superseded fetch candidates (history, not current motion)

Clean fetch, rolling chase, a missed landing followed by re-chase, and a rare
shallow-side overrun use separate seeded choices with no immediate repetition.
The tumble is asset-gated and separated by at least four throws. Ball ground
travel reuses the existing analytic travel planner with constant deceleration;
stripe rotation follows traveled distance / radius. A dropped ball rolls a short
distance before settling. Accepted interactions retain the prompt chase response.

The owner rejected the first fetch timing replay as sluggish. Urgent preparation
now covers each fetch leg and pickup/drop facing/sitting, not just the initial
launch. A deferred belly/trick finishes its recovery at the urgent cadence. Root
travel, physical speed and distance-driven strides are unchanged; urgency resets
at idle so ordinary watching does not inherit fast timing. Pickup/drop source
clips take0.65s each. The updated four-pattern replay remains under visual review.

The stationary six-key stumble candidate in `dist/scramble-art-v1/` was rejected
as awkward and is excluded from the current preview. The owner also rejected
turning front/seated before picking up a ball that was reached facing away.

The new **staged v4** candidate is in `dist/fetch-art-v2/`. It has12 authored
whole-body stumble breakdowns and6 keys each for standing rear/side pickups,
plus the original13 tug/sleep frames preserved byte-exact. The first stumble
key is EXACTLY the old run pair5/blend0 forepaw-contact frame; the last is the
old standing frame. Runtime hands off at that actual stride phase while speed
is positive, carrying the same root velocity into analytic braking. The existing
camera never turns. A short recovery bound advances6cm and rises2.5cm in world
space; the same pinhole projection handles its height/depth/scale. There is no
stationary idle/settle between running and stumbling. The direction/flip remains
unchanged through the impact and recovery.

Rear and side pickups keep their approach heading and standing root, lower the
connected head/neck/shoulders, and only turn AFTER pickup. The root stops17cm
short of the ball rather than over it. The rear muzzle/ball is occluded behind
the body; the visible side pickup uses authored mouth locations, not screen-center
coordinates. Legacy clips remain a fallback when optional new art is absent.

Key poses and momentum/spacing/overlap were chosen before breakdowns, following
[Microsoft's character-animation principles](https://learn.microsoft.com/en-us/windows/win32/lwef/animation-principles)
and the [Blender keyframe/breakdown distinction](https://docs.blender.org/manual/en/2.90/animation/keyframes/introduction.html).
This is not a claim that extra pictures or mathematical checks guarantee appealing
motion. The complete replay still needs the owner's visual acceptance.

The built-in imagegen inputs were only existing approved run/standing/rear frames,
not new photos/video. Exact prompt text, source PNGs, registered keys and candidate
metadata remain in `dist/fetch-art-v2/`. No optical flow/model/runtime warp,
expanded tween film, extra raster scratch, archive family, dependency, timer or
process. Relative to the current13-frame family, measured additions are252,774
gzip bytes,766,040 portable retained pixel bytes and286,718 Node compressed crop
bytes. These are NOT measurements of whole-desktop RSS. See
`dist/fetch-qa/receipt.json` for the actual-engine four-pattern verification.

Terms for accepted
derivatives remain CC BY-SA4.0 with the existing attribution chain; generated
source sheets are not included in npm. Update provenance and integration tests
after accepting candidates; the pending package tarball is obsolete.

## Local review

- `node tools/prepare-watch-redraw.mjs` writes a candidate, not shipped assets.
- `node tools/check-watch-redraw.mjs` makes a same-state old/new text replay.
- `node tools/prepare-scramble-art.mjs` writes a candidate, not shipped assets.
- `node tools/prepare-fetch-art.mjs` prepares the current pose-first candidate.
- `node tools/prepare-stumble-v3.mjs --apply` builds/integrates the current v5
  momentum family; old v4 tooling/material above is historical.
- `node tools/check-fetch.mjs` collects four real seeded fetches, without a
  runtime pattern-forcing/debug API.
- `node tools/preview-site.mjs` serves the existing site-dist locally. Review
  watch-redraw-preview.html and
  fetch-preview.html?data=fetch-preview.json&pattern=tumble.

The local replay uses plain text frames; it does not run another pet core in the
browser. Native live user windows and the already installed pet remain untouched.
