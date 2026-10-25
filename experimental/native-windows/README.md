# Historical memory experiment

This is the research prototype, not the shipped entry point. Production uses
[integrations/native-windows](../../integrations/native-windows/) and the pure
shared factories; no source rewriting is used there. See
[NATIVE-RUNTIME.md](../../NATIVE-RUNTIME.md) for the supported build and checks.
The following notes describe the earlier experiment.

# Low-memory Windows host experiment

This is a working research prototype, not the published `retrieviewer desktop`
backend. It runs the approved dog core in QuickJS-NG and draws the Braille dots
through Win32/GDI+ in the same process. Node is used by the measurement launcher,
then excluded from the pet-process metrics. There is no Node or CLR inside the
pet process. No artwork is regenerated, decimated, resized or quantized again.

The published 0.0.17 runtime is unchanged. The experiment has its own owned demo
window, not a connection to a user's selected app. Its visible demo has ball,
treat, tug, pause, paw, wall and quit controls. The real StackBite watcher,
OpenRouter connection, existing desktop-control pipe/installer lifecycle and
other platforms are **not integrated here**. The measurement's timed notification
is an explicit local fixture, not an observed real approval.

## Architecture

- Reuse the existing JS simulation, projection, support, autonomy and action
  selection. Keep the approved indexed Q5 archives and two-frame caches.
- Native functions perform crop gzip decoding, Q5 reconstruction, grayscale
  expansion, interpolation, projected sampling/paw transport and stable dithering.
- Generate a tiny atlas of 256 Braille masks with the same GDI+ circles. Copy the
  resulting premultiplied pixels into a reusable DIB instead of drawing every
  ellipse for every frame. A reference drawing check compares exact pixels.
- Run the UI, JS update and drawing on one Win32 message thread. No CLR, V8,
  Electron, webview or background worker is started by the host.

`build-probe.mjs` applies strict, isolated source adapters during bundling. These
adapters do not edit the main JS files. This is useful for validating the design,
but a production integration should replace the source substitutions with a
versioned frame-kernel/asset-provider interface and add lifetime/API tests.

## Reproduce from the repository root

Development tools: Visual Studio 2022 C++ Build Tools, its CMake, Node and Bun.
Bun is a **build tool only**; it is not the pet's runtime. No WSL is used.
The Windows binary currently uses the development machine's MSVC runtime;
fresh-machine packaging/static-runtime work remains to be done.

Read `sources.json` and `THIRD-PARTY-LICENSES.txt`. Source caches live only under
ignored `dist/native-memory/`:

```powershell
git clone --depth 1 --branch v0.17.0 https://github.com/quickjs-ng/quickjs.git dist/native-memory/quickjs-src
git clone --depth 1 --branch v1.3.2 https://github.com/madler/zlib.git dist/native-memory/zlib-src
npm pack fflate@0.8.3 --ignore-scripts --pack-destination dist/native-memory
tar -xf dist/native-memory/fflate-0.8.3.tgz -C dist/native-memory
bun experimental/native-windows/build-probe.mjs
cmake -S experimental/native-windows -B dist/native-memory/build-experimental -G "Visual Studio 17 2022" -A x64
cmake --build dist/native-memory/build-experimental --config Release --target pet-probe --parallel 4
```

The exact upstream commits are recorded in `sources.json`; verify those after
checkout rather than trusting a future tag change. Existing caches need no new
checkout. Build output and compiler concurrency are bounded and owned by this
experiment. No global configuration or trust setting is changed.

Owned visible preview (close its window or press Quit):

```powershell
& ./dist/native-memory/build-experimental/Release/pet-probe.exe experimental/native-windows/run-qjs.mjs $PWD --desktop --show
```

The default non-visible test target is 3840×2160 physical pixels and exits after
150 seconds. It exercises two fetches, treat, tug and a local wall cue. Use
`--duration=5 --verify-atlas --proof` for the brief reference-raster/PNG check.

```powershell
node experimental/native-windows/measure-native.mjs
```

The process meter is `experimental/native-windows/measure-processes.ps1`, adapted
from the preceding release's diagnostic file and not part of the package. It samples
Windows working set, lifetime peak working set and private committed bytes.
It touches only the explicit owned process/window. For a clean checkout, retain
that meter or supply an equivalent process-only observer before running the test.
Do not substitute forced GC or working-set trimming for a resource measurement.

## Evidence and current limits

Results and original samples are kept locally under `dist/native-memory/`.
`native-window-proof.png` is the real native framebuffer on black, not a mockup.
The paired Node/native probe replays 30 frames at 160×72 and 480×135. All
36,633,600 output RGBA bytes agree, SHA256
`9434a78bc037eba872c7988d0d2b74b9e457fdbd484790838639ca8917047c9f`.
This is a bounded comparison, not an exhaustive guarantee across every possible
pose. Atlas verification compares the native dot raster against the original
per-ellipse drawing. Both the scratch and checked-in-source builds pass it.

The first 150-second pre-atlas native run had 140 samples: 27.4MiB median working
set and 38.6MiB process lifetime peak. Its P95 complete render cost was 46.7ms;
the atlas pass targets that remaining drawing cost.

The final atlas-enabled 150-second 4K run has 139 samples:

| Metric | Result |
|---|---:|
| Working set median | 28.4MiB |
| Working set P95 | 31.8MiB |
| Highest sampled working set | 33.4MiB |
| Windows process-lifetime peak working set | 39.9MiB |
| Private committed bytes median | 20.7MiB |
| Complete render mean / P95 | 10.0ms / 26.8ms |
| Complete render maximum | 130.7ms |

Two ball interactions, treat, tug and the local wall cue were accepted; 1,258
native paints were performed and the process exited cleanly. The maximum frame
cost is retained explicitly; the mean/P95 do not imply a constant frame rate or
no startup/transition stalls. No forced GC, working-set trimming, art reduction
or artificial memory cap was used. The tested scratch host executable is
1,128,960 bytes; required MSVC system-runtime libraries are outside that size.

Raw evidence: `dist/native-memory/native-window-memory.json`,
`pixel-comparison.json` and `native-window-proof.png`. The final JSON is the
atlas-enabled run; `native-window-memory-before-atlas.json` preserves the earlier
sample. The observer,
DWM/GPU and unrelated processes are excluded. A finite test is not a universal
memory ceiling or end-user visual acceptance. Linux/macOS are untested here.
