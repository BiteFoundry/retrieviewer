# Lightweight desktop runtime · 0.0.18

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
| Retriever |29.4MiB|39.3MiB|39.9MiB|
| Ginger cat |44.2MiB|61.8MiB|65.3MiB|

The cat's scene also includes the tower and wheel. It is typically below50MiB
in this measurement, but its peaks exceed50MiB; this is not a strict50MiB cap.
The preceding Node/CLR dog had a sampled maximum170.7MiB on the same host.
Raw evidence: dist/native-product-memory/{dog,cat,report}.json (local QA output).
Reproduce with the measurement command below. Package/website figures are
rounded; memory remains dependent on scene, window dimensions and OS behavior.

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
