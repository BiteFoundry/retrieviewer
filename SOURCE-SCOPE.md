# Public source scope

This repository starts from the exact runtime/art inventory shipped on npm as
0.0.3 (2026-10-23), plus focused tests, development tooling and the bilingual site.
The former local art playground was not a Git repository; no Git history was
transferred or rewritten. The original local workspace is retained separately.

Original photographic references, YouTube material, experimental 3D models,
unshipped frame caches, generator/model weights, worker conversations, private
settings and detailed local QA receipts are not in this tree. Retained public
credits describe the relevant references without redistributing their photos.

The original local suite ran 305 tests:303 passed,2 Mac runtime tests skipped.
This public tree contains a focused runtime/adapter suite that runs without the
unshipped historical art. It does not claim to include or rerun all305 tests.
The same source runtime was exercised on Windows and an isolated AlmaLinux8
GLIBC2.28 composited X11 display. macOS still has no real-host verification.

The checked-in package version is now0.0.17, including indexed local art, attention gestures, spatial autonomy,
allocation improvements and the earlier comfort extension. The extra tug art uses the same declared
CC BY-SA4.0 terms; original generated sheet PNGs remain local. Nothing is
republished over immutable npm0.0.3. See RELEASING.md for the current checks,
authorization and platform verification limits.
