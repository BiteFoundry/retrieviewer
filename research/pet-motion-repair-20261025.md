# Pet motion repair candidate · 2026-10-25

Baseline: Retrieviewer `466554a7a6a0afd2fb88856b58fa69871a4ce3ed`,
Purrviewer `5452da3569623b26f1ea87f1097735a1606c5c67`.
The owner confirmed the six findings from the skill review. This is a local
implementation candidate; the drawings' final aesthetic acceptance is separate
from the structural checks below.

| Finding | Change | Verification |
|---|---|---|
| C1: another cat in the lowering pose | Replace only original key8 with one connected subject | All other64 original drawings retain their exact pixels; reproduced lower-left stray-head region is empty; real Windows capture |
| C2: side/rear swaps at departure and arrival | Seven registered whole-body yaw/rear-stand keys, reversible standing routes and a simulation-owned preparation queue | Grounded turns precede travel/crouch, mirror changes through the frontal endpoint, render cadence cannot change choreography |
| D1: standing-to-crouched pop while changing view | Use the existing standing bridges in both directions, playing them backwards on departure | Seed731 fetch exercises forward and reverse routes without changing the travel solver or slowing its eager preparation |
| D2: carried ball hidden on a visible muzzle | Hash-bound, manually inspected anchors on the exact standing-turn action samples | Canonical480→320 conversion, exact sampler indexing and mirrored projection; the hidden rear muzzle remains null |
| C3: three held drawings during flight | Three additional whole-body breakdowns, six ground-flight keys and seven tower-flight keys | Original world gravity/velocity/flight-time code unchanged; ordered launch/upward reach/extension/gather/descent, no frame dissolves |
| C4: static sleep | Two localized generated-fur/ear variants of the original curl | Original key2 exact, every thresholded silhouette pixel unchanged, low-frequency phase from simulation elapsed time and the same two-frame cache |

Private cat authoring tools: `tools/prepare-motion-repairs.py` and
`tools/rebuild-motion-repairs.mjs`. Source sheets stay in ignored `art/source`,
with source hashes, cell boxes, family-wide scale and rigid registration recorded
in the shipped metadata. Dog turn art is reused without new raster material;
`tools/update-turn-mouths.mjs --check` reproduces the new annotations.

## Evidence

- Public tests:246 passed,2 skipped; private cat tests:64 passed.
- Six shared-factory replays:8570 output frames, focal interactions at30fps,
  autonomy screening at8fps. No action captions are burned into those movies.
- Native/portable comparison:192 whole-frame pixel records at two viewport sizes.
- Actual composed Windows captures:4s at30fps each for dog/cat, both owned test
  processes exited. These complement pixel parity rather than replacing it.
- Package installation from an unrelated working directory and release preflight
  passed, including the new transitive `facing.mjs` module. No npm publication
  or public-site deployment is part of this candidate.

Local receipts/replays: `dist/pet-repair-20261025/`, native parity:
`dist/native-parity/report.json`. These temporary artifacts are not shipped.
The short captures do not prove every long-running combination, and numerical
tests do not certify anatomy or perceived naturalness. macOS/Linux presentation
has not been visually checked in this pass.

## Incremental cost

The cat atlas grows65→77 keys. The gzip asset grows391476→476953 bytes
(+85477); the indexed desktop asset grows424739→514585 (+89846).
Both formats ship for different hosts; together their file growth is175323 bytes.
The indexed directory grows only336 bytes; the borrowed two-frame raster cache
and one native painter remain unchanged. There is no new runtime dependency.

Same native executable,3840×2160, seed731,35s real-time first-ball/toy sequence,
four independent owned baseline/candidate processes measured concurrently at
0.5s intervals; startup's first3s excluded. Basic mode, no watcher or LLM:

| Pet | Previous median RSS | Candidate median RSS | Candidate lifetime peak |
|---|---:|---:|---:|
| Dog |20.96MiB |20.92MiB |37.42MiB |
| Cat with furniture |45.96MiB |45.95MiB |63.78MiB |

Candidate median private committed memory: dog12.71MiB, cat23.91MiB.
These short measurements show no meaningful median RSS increase; they are not
a50MiB hard ceiling or a long-run peak guarantee. Browser preview memory is
different because its compatible in-memory loader retains compressed art.
