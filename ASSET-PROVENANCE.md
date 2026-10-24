# 0.0.1 asset provenance review

Reviewed locally on 2026-10-23 for the first public npm release. This is a bounded
engineering/provenance review, not a lawyer's clearance opinion or a guarantee
of exclusive ownership of AI output.

## Evidence checked

- Unreleased comfort v6 adds a front-facing carry-trot study generated using
  built-in imagegen with only the existing approach and arrival-seat puppy as
  references. No new photograph/video input. Eight whole-pose keys (four unique
  trot phases, four gathering steps) are appended; accepted v5's37 frames remain
  pixel-exact. One common scale, whole-image floor translation, per-key measured
  mouth/support anchors, no anatomical compositing. Last gathering key is exact
  arrival-seat source0. Full prompt/source hash and size evidence live in
  dist/carry-trot-v1/NOTES.md and puppy-companion-comfort.json. Existing artwork
  attribution and CC BY-SA4.0 remain. The owner subsequently requested publishing
  the reviewed candidate with the original braking return preserved as an option.

- PUPPY-STUDY.md identifies the initial built-in image-generation output and
  the two photographic inputs. The generated source and both local reference
  images were visually inspected. Their stored Commons metadata was checked
  against the creators, titles and licenses recorded in ATTRIBUTION.md.
- ZOOMIES30.md, SITTING.md, PUPPY-PAPER.md, PUPPY-ACTIONS-V4.md,
  PUPPY-ACTIONS-V9.md and the interaction-art records document generated pose
  extensions and subsequent registration/interpolation. Q5 source and artifact
  hashes are recorded in pet-q5-manifest.json and checked by the test suite.
- The project owner explicitly selected code MIT + artwork CC BY-SA 4.0 and
  authorized public npm publication on 2026-10-23. The public account identifiers
  identify the project maintainer; BiteFoundry is not asserted to be a separate
  incorporated rightsholder. No third-party ownership transfer is invented.
- The earlier unpublished restrictive artwork draft is replaced rather than
  combined with the CC grant. Reference attribution is retained, including the
  CC BY-SA 2.5 reference and its later-version mechanism.
- Vendored procedural-animals retains its MIT notice. three and jsonc-parser
  remain separate pinned npm dependencies with their notices. The analytic
  locomotion route does not bundle AI4Animation code or noncommercial datasets.

## Release boundary

Only the eight Q5 artwork archives, runtime metadata, allowlisted code/docs and
retained notices are packaged. Original photos, generated source PNG sheets,
Meshy GLBs, video references, preparation/model weights, local settings and QA or
worker histories stay outside the public package. Tests and the packed file list
must be checked again for the final release bytes.

## Remaining limits

Unreleased0.0.10 replaces the36 watch samples with an owner-approved whole-body
redraw (head, neck, shoulders and foreleg weight transfer together). Built-in
imagegen referenced only the existing approved puppy and its generated study,
not new photographs. One common uniform scale and whole-frame floor translation
replace the earlier row-dependent warps; no anatomical masks or body compositing.
WATCH-REDRAW.md and the manifest retain preparation/source digests. Other behavior
frames remain byte-identical. Existing CC BY-SA4.0 attribution remains in place.
The owner then approved the new momentum-pose studies on2026-10-23 and requested
implementation. The working tree now includes a v5 comfort family: the original13
tug/sleep frames remain byte-exact,12 standing pickup keys are retained, and12
rear stumble samples replace the rejected lateral choreography. Four samples
are registered directly from the approved rear-quarter study; the others use a
built-in imagegen breakdown sheet referenced only from that approved art and the
existing puppy. Exact existing run/rear pickup endpoints remain shared. Uniform
batch scales and whole-frame translations only, no anatomical compositing or live
image deformation. Source digests, timings and transforms are in the comfort
metadata; prompts/raw originals remain local, outside npm. Visual acceptance of
the completed animation was followed by the owner's explicit publication request.

0.0.9 adds offline torso-envelope constraints to the same single-source watch
coordinate field, using only the existing seated key as a volume reference.
Face pixels remain exact; the connected neck/body is spatially registered, not
composited with another illustration. No new visual input or asset family;
existing CC BY-SA4.0 attribution and licenses remain.

0.0.8 replaces the watch-body joins with offline coordinate registration of
the same single source drawing per sample. Four paw patches and a shared ground
plane constrain the lower-body warp; original head/neck pixels remain exact.
No new image, photograph or video reference is introduced; CC BY-SA4.0 and
existing attribution remain unchanged.

0.0.6 re-registers only the36 watch samples of the existing behavior archive.
The existing seated body/paws stay fixed while the authored head turns; no new
image/photo/video reference is introduced. The offline preparation and source
digest are in tools/prepare-watch-art.* and pet-q5-manifest.json. Butterfly wings
are small geometric marks, using the same existing output buffer; dog poses
reuse licensed gallop art. Existing attribution and CC BY-SA4.0 terms remain.

0.0.5 extends that ninth licensed archive with four sleeping studies generated
from the same existing puppy identity/pose references, approved by the owner in
this conversation. COMFORT-ART.md and the comfort metadata record preparation,
source hashes and size changes. No new downloaded photo/video input is introduced.

Later source candidate: belly/sleep reuse existing licensed roll/rest frames.
Tug adds eight built-in imagegen keys referenced only from the existing generated
puppy sheet, not new photographs. COMFORT-ART.md records the prompt, source hash
and fixed-scale preparation. The ninth archive is covered explicitly by
ASSETS-LICENSE.md and ATTRIBUTION.md. Original sheet PNGs remain outside npm.

Local candidate2026-10-24 changes only offline watch-frame selection: the same
15 approved whole-body drawings are held, not crossfaded into double contours.
Source sheet SHA256 and registration stay unchanged; `watchRegistration` now
records the exact36 source-key indices and `pixelBlending:false`. No new generated
or photographic input, asset family or attribution is added. Existing CC BY-SA4.0
terms and all non-watch pixels remain unchanged. See WATCH-REDRAW.md for the A/B.

Local attention-paw candidate2026-10-24 appends six built-in imagegen whole-body
keys to the existing comfort archive. Inputs were the existing licensed seated
puppy and a generated paw study; no new photographs were introduced. All45 old
comfort frames remain exact. ATTENTION-PAW.md records the source-sheet hash,
prompt specification, registration and byte costs. Existing attribution and
CC BY-SA4.0 terms apply; source sheets are excluded from npm.

Local standing-wall candidate2026-10-24 appends nine generated whole-body keys,
referenced only from the existing canonical puppy. All51 accepted comfort frames
remain exact. Source hash, prompt specification, common-scale registration and
costs are in ATTENTION-WALL.md. No new photo/video inputs or raw npm sheets;
existing attribution and CC BY-SA4.0 terms continue to apply.

Copyrightability of AI-generated expression, the precise derivative-work analysis,
and worldwide name clearance are not conclusively determined here. Existing
domestic trademark research records possible similar marks; owning an npm scope
does not resolve them. No trademark filing or legal service is part of this
release. The review records provenance, compatible release terms and exclusions;
it must not be advertised as comprehensive IP clearance.
