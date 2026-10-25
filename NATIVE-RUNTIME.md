# Lightweight desktop runtime · 0.0.20

Windows x64 basic desktop mode runs the existing JavaScript pet behavior in
QuickJS-NG, inside the same native process that paints the transparent window.
Node/npm launches it and exits. There is no persistent Node worker, CLR runtime,
browser, Electron, extra npm dependency or install-time compiler in this mode.

```sh
retrieviewer desktop
retrieviewer desktop --pet cat
retrieviewer desktop-status --json
retrieviewer desktop-stop
```

Choose Retriever or Ginger cat in the picker/control strip, or run the second
command to switch a running native companion. Only the selected pet is loaded.
Switching disposes its assets before creating the other one. No startup service,
agent patch or wrapper is installed. Removal is `retrieviewer desktop-remove --yes`
followed by `npm uninstall -g @bitefoundry/retrieviewer`.

## Artwork and behavior

The same pure dog/cat factories own motion, perspective, contacts, actions and
autonomy. The native host supplies gzip, Q5 reconstruction, grayscale raster and
stable Braille kernels. Individually compressed crops are read from indexed
files, with two borrowed decoded frames per store. The 256 Braille-mask stamp
atlas replaces thousands of GDI+ ellipse calls and preserves the original dots.

The actual native kernels were compared to portable Node across 64 dog and 128
cat output frames at 160×72 and 480×135 cells, including movement, eating,
attention, stretching, greeting, company, tower and wheel. All 234,455,040 RGBA
bytes matched. Tests retain SHA-256 results; no resampling or lossier art was
introduced. Code is MIT. Dog and cat artwork is CC BY-SA 4.0.

## Measured memory

On this Windows10/11 x64 host, one native process rendered an owned off-screen
3840×2160 window for150seconds per species, sampled twice per second. The
ordinary runtime used its diagnostic target, real GDI+ painter and scheduled
play/treat/attention or tower/wheel actions. No forced GC or working-set trimming.

| Pet | Median RSS | Sampled maximum | OS lifetime peak |
|---|---:|---:|---:|
| Retriever |22.9MiB|37.9MiB|38.7MiB|
| Ginger cat with tower/wheel |44.4MiB|64.6MiB|65.5MiB|

Version 0.0.20 uses one cropped layered window for the complete scene. This
fixes flicker from the 0.0.19 multi-window painter; its lower memory figures are
superseded. Buffer shrinking and hidden-state cleanup remain. See the
[presentation fix](SPARSE-PAINT.md). These finite measurements do not establish
a universal 50 MiB memory cap. Raw evidence: dist/coherent-paint-memory/.

## Scope

This default native runtime is **Windows x64**. `--watch stackbite` and
`--brain openrouter` retain the Node/.NET compatibility path on Windows;
`--engine node` explicitly selects it. Their memory use is higher. Linux X11
keeps Node + system Python; macOS keeps its experimental Node/JXA path. Both
species work through those adapters, with the existing three controls mapped
to toy/greeting, treat and company for the cat. Tower/wheel controls are in the
Windows native bar and website. Browser previews keep their portable loader.
The native memory figures do not describe optional watching, other operating
systems or browser tabs. No blanket memory ceiling is promised for every window.

## Build and lifecycle

Maintainers run `npm run build:native` on Windows x64 with Visual Studio 2022 C++
Build Tools, CMake and Bun. It bundles the ordinary factories without source
rewriting, verifies pinned QuickJS/zlib commits, statically links the CRT, and
writes a size/SHA-256 manifest for the shipped binary and bundle. Only Windows
system DLLs are required. Sources, source pins and upstream license texts ship
with the package. End users receive the prebuilt executable.

The short-lived launcher sends configuration over stdin, waits for readiness,
then acknowledges detach. EOF before detach stops the native process. A local
owner-only named pipe with a per-launch random token supports status, species
switching and stop; remote pipe clients are rejected. The process removes only
its own session file on exit. The picker follows one explicitly selected app;
it hides and freezes when that app is not foreground. It reads window geometry
and titles, not screen content or keyboard input. Watch/brain remain opt-in.

QA: `node --test native-desktop.test.mjs`, `npm run check:native-pixels`, and
`node tools/measure-native-pet.mjs 150`. These use isolated state and owned
off-screen diagnostic windows, preserving an already-running user companion.

The executable embeds the Windows UTF-8 process code-page manifest (Windows10
1903+ /11) so QuickJS stdio also reads Korean/non-ASCII installation paths.
A regression test launches both species from Korean bundle, art and state paths.

## Coherent scene presentation

[One complete-scene upload](SPARSE-PAINT.md) keeps the final pet, props and
furniture in the same HWND. That window stays click-through and non-activating.
The 128-frame presentation regression checks window identity, full-frame pixel
parity and hidden-resource release separately from pet-core pixel parity.
