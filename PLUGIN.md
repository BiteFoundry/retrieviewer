# Retrieviewer plugin

An autonomous Braille dog, embedded in **your pane**. Ball, treat and tug need user
input. The rest is its own seeded behavior. No screen, stdin or layout takeover.
No telemetry, keys, account signup or paid APIs in the runtime.

## Install

Install from npm:

```sh
npm install @bitefoundry/retrieviewer
```

Portable distribution (independent of the source directory):

```sh
npm install /path/to/bitefoundry-retrieviewer-VERSION.tgz
```

The generated tarball is in `dist/`. Node >=20, ESM and a monospaced Unicode
Braille font are required. The npm package name is `@bitefoundry/retrieviewer`;
imports from the old playground name must be updated.
The tarball carries Q5 art, runtime code, types and examples. npm installs the pinned
`jsonc-parser` dependency for configuration editing separately. The current source
runtime does not require Three.js; it remains a development-only comparison tool.
No install/build scripts. Offline install requires the production dependency cached.

For supported agent-native installation use `retrieviewer enable`; see
[INSTALLING.md](./INSTALLING.md). The library contract below remains unchanged.
Source code is MIT; artwork is CC BY-SA 4.0, allowing commercial reuse and
adaptations under its attribution/ShareAlike conditions. Vendored MIT notices
remain intact. See LICENSE, ASSETS-LICENSE.md, ATTRIBUTION.md and TRADEMARKS.md.

## Attach to any JavaScript text widget

```js
import {createPetPlugin} from '@bitefoundry/retrieviewer/plugin';

const puppy = await createPetPlugin({
  host: {
    // Return null while hidden. Use CONTENT size, excluding widget border/padding.
    getSize: () => visible ? {columns: contentWidth, rows: contentHeight} : null,
    render: ({text}) => { widget.setContent(text); screen.render(); },
    clear: () => widget.setContent(''), // optional
    onError: error => logToYourApp(error), // optional, don't log over terminal art
  },
  fps: 30,
});
puppy.start();
ballButton.on('click', () => puppy.interact('ball'));
treatButton.on('click', () => puppy.interact('treat'));
tugButton.on('click', () => puppy.interact('tug'));
// pane unmount / host shutdown:
puppy.dispose();
```

Identifiers like widget/screen/button are your host objects, not bundled adapters.
Treat text as literal text, not markup/terminal escapes. Disable wrapping, trim,
proportional fonts and line-height tricks. Use white-on-black for the approved look.
Small panes lose fur detail; prefer >=80×24, around160×50 for detailed art.
Multiple plugins have independent state and share default immutable assets.

## Own loop instead of plugin clock

```js
const puppy = await createPetPlugin({host}); // creation does not render/start timers
// existing host frame loop (do NOT also call start):
puppy.tick(elapsedSeconds);
// existing host interaction input:
puppy.interact('ball');
// teardown:
puppy.dispose();
```

`start()` is opt-in scheduling, `pause()` stops scheduling without unloading,
`render()` redraws without advancing, `tick(dt)` advances+draws. `start()` is
idempotent; resume ignores paused wall time. `running`/`disposed` are readable.
Host size is checked each frame; no resize listeners are installed. Hidden/null
or zero-sized panes neither advance nor draw. Disposal cancels scheduling, releases
pet and invokes optional clear once. Direct host errors throw; scheduled errors
pause and invoke onError if supplied (otherwise stay paused). Host callbacks are
synchronous; avoid retaining borrowed frame pixels. See types for custom scheduler.

## Host boundaries

| Host | Connection | Status |
| --- | --- | --- |
| JS/TS terminal widget | `/plugin` host callbacks, or core `step/frame` | Generic contract + installed consumer tested |
| Ink/React, Blessed | Lifecycle calls plugin, render text in widget | Contract fits; framework-specific mounts not tested |
| Python/Rust/Go TUI | JSONL subprocess, one `tick` request per frame | Bridge + Python sample; Node required |
| Browser | Core/plugin + deployed assets; no Three.js import map | Existing browser core preview checked; arbitrary bundlers untested |

Not a native binary, editor extension, MCP plugin, or automatic injection into
closed-source TUI apps. Such hosts need an extension hook to display a pane.
Never embed fullscreen `retrieviewer preview` inside another app; import the library or use
the JSONL bridge. [EMBEDDING.md](./EMBEDDING.md) has full core/asset/protocol details.

## Verification / rebuild

```sh
npm test
npm run test:package
```

The package check creates a tarball, installs it into a fresh temp consumer offline
with lifecycle scripts disabled, exercises exports, default art, interactions,
start/pause/dispose, all JS examples and JSONL. Evidence is retained in
`dist/package-check.json`. It does not publish. Art originals/references/workers
are excluded. Q5 art is about18.8 MB gzip; the0.0.4 tarball
is about18.9 MB. Installed production files total about19.5 MB in the local consumer
check, including dependencies. This is still a substantial pet, not a kilobyte icon;
see measurements and release distinctions in [PUPPY-MEMORY.md](./PUPPY-MEMORY.md).
