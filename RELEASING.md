# Retrieviewer 0.0.9 release process

Current target: `@bitefoundry/retrieviewer@0.0.9`, public `latest`, continuing the
approved npm release workflow. The owner requested correction of the watch
torso's swelling on2026-10-23. Offline single-source registration now constrains
chest width/area/center and whole torso area, keeping the four paw anchors and
floor. Face pixels through y179 stay exact; neck coordinates can join the fixed
torso without image compositing. No new frames, dependencies, runtime work or
buffers. English desktop UI remains. MIT/CC BY-SA4.0 unchanged. Preserve0.0.8
and earlier registry bytes; publish only the exact tested0.0.9 tarball.
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
