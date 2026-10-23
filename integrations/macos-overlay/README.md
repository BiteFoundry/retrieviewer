# macOS transparent companion helper (JXA)

`overlay.jxa` is the macOS painter for the existing Node Braille pet engine. It is
the macOS counterpart of `integrations/windows-overlay/Overlay.cs` and speaks the
same NDJSON protocol (`integrations/windows-overlay/protocol.mjs`).

It runs with the interpreter that ships with macOS:

```sh
/usr/bin/osascript -l JavaScript integrations/macos-overlay/overlay.jxa            # companion
/usr/bin/osascript -l JavaScript integrations/macos-overlay/overlay.jxa --ipc-test # owned off-screen target
/usr/bin/osascript -l JavaScript integrations/macos-overlay/overlay.jxa --self-test [proof.tiff]
```

No Xcode, Swift compiler, Homebrew, Python, Electron or downloaded binary is
needed. The helper uses JavaScript for Automation's ObjC bridge to AppKit,
Foundation and CoreGraphics only. The Node launcher (owned by the main package)
spawns it with an argv array (never a shell string). Setup is still two steps:
`npm install -g @bitefoundry/retrieviewer` and then `retrieviewer desktop`.

## What it does and does not touch

- **Reads only window metadata**: `CGWindowListCopyWindowInfo` (id, owner PID/name,
  bounds, layer, on-screen flag and the title when macOS allows it) plus
  `NSWorkspace.frontmostApplication`. It never captures screen pixels. It does not
  use the Accessibility API, event taps, global monitors, AppleScript/System Events,
  injection or terminal/chat content.
- **Never requests or changes privacy settings.** Without Screen Recording
  permission macOS withholds other apps' window titles, so the picker shows
  `App · 창 #<windowID>`. No permission prompt is triggered.
- **Pet**: a borderless `NSPanel` with the `nonactivatingPanel` style. It is clear,
  shadowless and `ignoresMouseEvents = true` (click-through), and it can never become
  key or main. Dots use the Overlay.cs geometry: Braille bit order, half-cell pitch
  and a 0.48 diameter. They are rasterized in JS into one premultiplied RGBA TIFF per
  frame (Retina 2x when it costs no more than ~2M pixels), so each frame needs only
  a few bridge calls.
- **Controls**: a separate non-activating strip with 공 / 간식 / 창 / 쉼 / 종료
  buttons. These buttons accept the first click, so using them does not take focus
  from the terminal. A menu bar item, the counterpart of the Windows tray, offers
  choose window / hide-show / quit.
- **Window scope**: it follows the whole selected window's bounds, including its
  title bar, because the content rect of another app needs Accessibility. It does
  not track tabs. It is shown only while the target app is frontmost **and** the
  target is that app's front window. It hides when the window is minimized, the
  app is hidden, the window is on another Space or the picker is open. It drops the
  target when the window closes.
- **Grid**: 12pt cells, or 16pt when a 12pt grid would exceed 20000 cells.
  `cellHeight = 2 × cellWidth` (0.5 aspect). Hard cap 125000 cells.
- **Coordinates**: CG global space (top-left of the primary display, y down) is
  converted to Cocoa (bottom-left, y up) with `y' = H(primary) − (y + h)`. Both
  spaces are in points, so Retina scale and secondary displays with negative
  origins need no special case.

## Runloop and I/O

- stdin: `NSFileHandle readInBackgroundAndNotifyForModes:` reads on Foundation's
  background thread. A registered `NSObject` subclass receives the completion
  notification on the main runloop. Bytes are split on `\n` at the `NSData` level
  before UTF-8 decoding, so multi-byte Braille characters never split. A line is
  capped at 800000 bytes. EOF quits.
- A 50ms `NSTimer` in common modes tracks geometry and focus. Frames paint as soon
  as they arrive. Every frame is acknowledged (`painted:false` when stale or
  hidden).
- `NSApplication run` (accessory policy, no Dock icon) runs the real Cocoa event
  loop. Quitting hides all windows, removes the menu bar item, emits `quit` and
  calls `exit(0)`, so osascript never prints a script result on stdout.
- stdout carries only `JSON.stringify(...) + "\n"` written through
  `NSFileHandle`. There is no `console.log`.

## Verification status

`macos-overlay-helper.test.mjs` runs under Node on any OS. It checks the source
contract: ASCII/ES5-only, no forbidden APIs, wiring of the runloop, stdin and timer,
and panel flags. It also checks the pure code paths, which run unmodified under
Node: grid choice against `protocol.mjs`, coordinate conversion, frame validation,
the rasterizer, the TIFF container, base64, the picker list and the protocol state
machine. These tests **do not** exercise the ObjC bridge or AppKit.

The two live tests (`--self-test`, `--ipc-test`) run only on macOS with
`/usr/bin/osascript`. They were **not** run during development, which happened on a
Windows host. Bridge behaviour is unverified until those tests pass on a Mac:
subclass registration, selector strings, CF array ownership, `isNil()`, first-click
on non-activating panels and TIFF decoding.
