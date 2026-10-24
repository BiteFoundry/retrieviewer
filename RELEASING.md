# Retrieviewer 0.0.13 release process

Current target: `@bitefoundry/retrieviewer@0.0.13`, public `latest`.
The owner authorized npm publication and website deployment on2026-10-24.
This release contains the reviewed reliability fixes, with unchanged art/motion:

- Canonical LF text/hash checks and CRLF regression coverage; binary art stays
  byte-for-byte unchanged. Git attributes and existing JSON text use LF.
- Exclusive settings locks record the owner PID/host/time/token. Busy errors
  identify the lock and link to the offline manual recovery in INSTALLING.md.
  There is no automatic removal of possibly live locks.
- Workers require ready plus an acknowledged detach to survive launcher loss.
  Startup disconnect/launcher-death tests cover worker, painter and session cleanup.
- Oversized Windows grids hide until they fit again; plugin timer delays cannot
  overflow Node's signed32-bit timeout bound into a1ms loop.
- Windows20 / Linux22 Node CI on push and PR, including installed-consumer checks
  and an owned Windows native diagnostic. Website copy discloses page visit and
  performance analytics separately from the desktop pet.

Build and install a fresh exact tarball outside the source tree, compare installed
bytes and test its native/browser runtimes. Publish that same artifact after the
new remote CI succeeds; verify registry integrity and matching Pages runtime.
No new runtime dependency, process, background timer or art cache. No claim of
new macOS/Linux GUI certification or a material RAM reduction. Preserve all
earlier npm artifacts, MIT code / CC BY-SA4.0 art and the user's running pet.

## Previous 0.0.12 scope (historical)

Current target: `@bitefoundry/retrieviewer@0.0.12`, public `latest`.
On2026-10-24 the owner authorized npm publication and website deployment of the
reviewed precomputed motion tables. Support episodes, action addressing and
bounded preparation routes are compiled offline; live travel, perspective and
paw correction remain dynamic. Default Q5 uses the tables; custom loaders and
optional original art retain their metadata-driven path. See MOTION-TABLES.md.
No new artwork, runtime dependency, process or timer. This removes repeated
CPU/allocation work, not the retained image payload or Node/native baseline.
Do not claim a large RAM reduction or new Linux/macOS live GUI certification.

Build and verify a fresh exact0.0.12 tarball outside the source tree, including
its owned Windows native lifecycle and bilingual browser runtime. Publish that
same tarball, verify registry integrity and matching GitHub Pages runtime bytes.
Do not restart the user's live pet or change host/agent configuration. Earlier
npm artifacts remain immutable; MIT code / CC BY-SA4.0 artwork stay unchanged.

## Previous 0.0.11 scope (historical)

Current target: `@bitefoundry/retrieviewer@0.0.11`, public `latest`.
On2026-10-24 the owner accepted the reviewed candidate and authorized immediate
release. This scope removes blended watch contours while retaining all15 approved
whole-body keys, interrupts treat/tug journeys with velocity-continuous braking,
and checks held-pose dirtiness before rasterization. Existing fetch patterns and
all three return choices remain. No new runtime dependency, timer or process.
RAM is effectively unchanged; this pass reduces repeated CPU/allocation work.

Build a fresh exact tarball, install outside the source tree, compare every
installed byte, check its owned Windows native lifecycle and bilingual browser
runtime, then publish that exact tarball. Verify registry integrity and GitHub
Pages runtime bytes afterwards. Do not restart the user's existing companion.
Earlier npm artifacts remain immutable. MIT code / CC BY-SA4.0 artwork and
experimental macOS / X11-only Linux boundaries remain unchanged.

## Previous 0.0.10 scope (historical)

The owner explicitly requested publication and website deployment after reviewing
the repaired watch/fetch motion and restoring the original braking return as an
option. The publication gate is approved for this0.0.10 scope. The earlier hold
and old local candidate tarballs are superseded; build and verify a fresh exact
artifact before upload. This authorization does not cover rejected art/motion.

Current target: `@bitefoundry/retrieviewer@0.0.10`, public `latest`. The owner
explicitly requested npm publication and website deployment on2026-10-23.
Spatial autonomy no longer returns home after every outing; napping uses side
nooks, with occasional check-ins and ball returns kept. Existing calibrated
travel, English desktop UI and MIT/CC BY-SA4.0 licenses remain. Allocation
work uses flat Braille row joins, exact lazy integer minification tables and
Node DEFLATE level3. See PUPPY-MEMORY.md for measured memory/startup tradeoffs.
Watch art replaces36 frames. The stationary six-key stumble and v4 lateral
overshoot/reChase choreography were rejected. The37-key v5 comfort family is now
integrated (original13 +12 standing pickup +12 rear stumble); source/preparation
records are in dist/stumble-runtime-v3. Its entry-speed/stride/catch physics end
at the ball on one depth pursuit. No lateral detour or extra recovery hop. The
same default assets now include eight added carry-trot/gather keys (45-key comfort
family) with exact old37-frame preservation. Impact timing is .65s. Fetch returns
retain the original braking approach alongside trot and run-then-trot. The new
`returnStyle` option selects auto or one fixed style; auto mixes all three without
adjacent repeats. `setReturnStyle()` applies to the next throw. Desktop accepts
`--return-style`, reports its choice, and never restarts a running companion to
change it. No new artwork or extra raster buffer for restoring the old option.
Four style-specific seeded replays and fresh native checks pass; see
WATCH-REDRAW.md for current verification and additional pixel payloads.
No new runtime dependencies, processes or timers. Preserve0.0.9 and
earlier registry bytes; publish only the exact tested0.0.10 tarball.
Historical scope below is not current verification.

Target: `@bitefoundry/retrieviewer@0.0.4`, public npm registry, `latest` tag.
The npm organization `bitefoundry` uses the free public-packages plan; account
`shinick` owns the organization.

## Approval and licensing

The project owner explicitly authorized first publication on 2026-10-23 and
selected MIT code + CC BY-SA 4.0 artwork. The earlier unpublished restrictive
artwork draft is superseded. ATTRIBUTION.md retains the photographic references
and original license links. ASSET-PROVENANCE.md records the bounded review and
remaining limits; this is not comprehensive legal clearance.

The owner explicitly authorized GitHub push and npm publication of the reviewed
comfort extension and runtime optimizations on2026-10-23. Version0.0.4 removes
unused Three.js runtime work, retains only reachable interaction samples, and
adds belly-up/sleep behavior plus a tiny tug sprite family. Code/art licenses stay
MIT/CC BY-SA4.0, including the new covered archive. No Codex modification is made.
Windows live, installed-consumer and browser checks cover this release. Linux
retains the earlier AlmaLinux8/GLIBC2.28 X11 adapter baseline; new controls have
grammar/protocol checks, not a new Linux GUI test. macOS remains experimental.
Native Wayland is unsupported. Preserve all earlier registry artifacts.

`release-policy.json` has four independent approval gates and the CC artwork
license identifier. The guard still refuses false/missing approvals, private
packages, missing attribution/notices, install scripts and known leaked paths.
Passing tests does not itself provide a new publication authorization.

## Checks before publication

```sh
npm test
npm run test:package
npm run release:check
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
```

The package test packs the exact candidate, installs it in a fresh offline
consumer, byte-compares all installed files and checks exports, frames,
interactions, lifecycle, examples, JSONL and isolated installer settings.
Its report is in a fresh `dist/package-check-*/package-check.json`; it does not publish or edit live
agent configuration. Keep the final tarball hash and file inventory.

The original art playground was not a Git repository. The owner separately
authorized a curated public source tree at BiteFoundry/retrieviewer and its
GitHub Pages workflow. This is not an upload of the experimental workspace:
original photos, source image sheets, workers, QA receipts, credentials and local
settings remain local. See SOURCE-SCOPE.md. There is no npm trusted publisher or
automatic npm release workflow; the site workflow deploys the site only.

Immutable npm0.0.3 was already published and verified. Do not republish different
bytes as0.0.3. This release uses0.0.4 with fresh authorization, version/lock/test/
policy updates, exact-tarball checks and registry-install verification.

## Publish the tested tarball

Confirm `npm whoami` is the intended account. Publish only the tested candidate
with explicit public access; complete any npm browser/2FA verification through
the user's own verification flow. Never put credentials in files or chat.
After publication, verify registry name/version/license/integrity and exercise
a fresh registry installation. A prepared or uploaded candidate is not the same
as a verified live package.

For later CI releases, consider GitHub Actions OIDC trusted publishing after an
audited source repository and exact workflow exist:
https://docs.npmjs.com/trusted-publishers/

## Support boundaries

The approved existing Q5 frames are unchanged; the new tiny tug family uses the
same32-level pipeline. Belly/sleep reuse existing source frames. The OpenCode
2.1.2 Windows directory-based adapter has local host proof; npm `./tui`
discovery alone is not live-host certification. Other agent-native renderers
remain unimplemented. MCP alone cannot inject a pet into arbitrary agent UIs.
See INSTALLING.md for support and removal.

The separate transparent companion uses platform-native windows plus the same pet
engine. Test real installed copies with isolated state and owned diagnostic windows;
do not stop the user's live companion merely to run QA. See DESKTOP-PLATFORMS.md
for verified checks, experimental macOS status and unsupported environments.

Historical research notes remain local and are not current support promises.
