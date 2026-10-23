# Windows companion — 0.0.2

This is a separate transparent desktop window, not a Codex plugin or a terminal
wrapper. Version0.0.2 includes it; version0.0.1 does not. Setup is two steps:

1. `npm install -g @bitefoundry/retrieviewer`
2. `retrieviewer desktop` — choose the app window in the picker.

Choose a supported ordinary Windows app window (including a terminal containing
Codex). Then use your app normally, without a
wrapper, shell alias, patched binary, changed credentials, or agent configuration.
The helper uses native Windows/.NET Framework facilities and the existing Node
pet engine. No Electron, Chromium, downloaded helper binary or new npm dependency.
Windows10/11 x64 with Node20+ and the .NET Framework4 compiler is required. Other
desktop platforms and exclusive fullscreen/security surfaces are not certified.
Launch reports
that the picker is ready, **not** that the user has selected a window or visually
approved the pet.

## Interaction and window scope

- The original Q5 Braille artwork/behavior engine is reused without new sprites.
- The pet is click-through and non-activating. It does not read keyboard input.
- A small separate, non-activating control strip offers ball, treat, choose window,
  pause and exit. These buttons consume their own clicks, not terminal typing.
- Ball/treat use the existing engine interactions, including busy/cooldown rules.
  Ball currently uses its existing preset destination, **not free mouse aiming**.
- The overlay follows the selected window's client rectangle. It hides and stops
  simulation when another app is foreground, the target is minimized, or paused.
  The control strip remains available while paused in the selected window.
- It binds a whole top-level window, **not a terminal tab/pane**. Switching tabs
  inside that window does not automatically rebind or identify the running agent.
- Selection is per launch. There is no process scanning to infer Codex sessions,
  screen scraping/OCR, chat capture, global keyboard hook or input injection.
  The picker locally reads window titles/process names; tracking reads window
  geometry, foreground state, visibility and owning process ID.
- No automatic startup, background scheduled task, registry entry or MCP is added.
  Exit stops both the painter and engine. If either process closes, its counterpart
  exits too. Losing the target hides the pet; tray selection can attach another.

## Stop, remove, and recover

```powershell
retrieviewer desktop-status --json
retrieviewer desktop-stop
retrieviewer desktop-clean --yes
```

One-command companion removal (stop, wait for exit, remove only its cache):

```powershell
retrieviewer desktop-remove --yes
```

The tray icon also provides window selection, hide/resume and exit. `desktop-stop`
asks the companion to exit through an authenticated local named pipe; it never
kills a PID from a stale file. The worker may terminate only its own stuck child
painter after a graceful timeout. Cache cleanup refuses a live/unreachable worker,
symlinks/junctions and unrecognized session records. It removes only recognized
helper cache filenames; unrelated files and agent/pet settings remain untouched.

Own files are under `~/.config/retrieviewer/desktop` (or RETRIEVIEWER_HOME/desktop):
one hash-named compiled helper and a transient local session capability record.
The token is not printed by status and is never sent over a network. Same-user
local software is not treated as an adversarial security boundary. No screenshot,
terminal content or window title is persisted by this companion.

For a globally installed copy, stop/remove the companion before
`npm uninstall -g @bitefoundry/retrieviewer`. Other native OpenCode registrations,
if any, must first be disconnected with the existing explicit disconnect command.
This companion does not change or remove a pre-existing Codex `/pets` pack.

## Rendering and bounded work

Native pixels are dots decoded from the engine's existing Braille cells, on an
alpha-transparent bitmap. Every frame starts clear, avoiding previous-frame paw
trails. Only the nonblank bounding rectangle crosses IPC and is painted; the
native window does not allocate a full-screen transparent bitmap. A request/ack
bridge permits only one frame in flight. Viewport revisions discard frames from
an old size/position; discarded frames are acknowledged to avoid deadlock. Hidden
time is not replayed when the pet becomes visible. The engine targets30fps, but
the actual frame rate depends on CPU, window resolution and Windows scheduling.

## Search-first decision and evidence

Reused `createPet` and its side-effect-free host API. A small native Win32 painter
was selected for Windows instead of adding an Electron runtime or a PTY wrapper.
The former adds another browser runtime; the latter changes how Codex is launched
and was explicitly rejected. This is not a claim of cross-platform support or a
benchmarked memory advantage; measurements belong to the local validation.

- [Layered windows and mouse passthrough](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#layered-windows)
- [UpdateLayeredWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow)
- [No-activate extended window style](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles)
- [SetWindowPos without activation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
- [Electron alternative](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)

`node --test retrieviewer-desktop.test.mjs` covers transport/cropping/backpressure,
hidden-time resets, CLI isolation, authenticated control transport and conservative
cleanup. Native validation must additionally test layered window rendering, focus,
geometry, minimize/restore, controls and lifecycle on an actual Windows desktop.
Do not equate style checks or a rendered PNG with end-user visual approval.

Local validation on2026-10-23:281 automated tests passed, real packaged offline
consumer passed, and the real native worker painted frames with the actual pet
engine. The native ball button reached the engine and was accepted; an incorrect
control token was rejected. Owned off-screen native-window checks passed position
tracking, minimize/restore, passthrough/no-activate styles and foreground retention.
The worker and painter both exited. Node RSS was about157MiB in that small-window
check (not total app memory or a4K performance claim). A Windows GUI startup bug
was fixed by building a GUI-subsystem helper and not applying SW_HIDE to it; the
real user picker was verified in Windows' visible main-window list. User visual
approval after selecting a terminal remains separate.
