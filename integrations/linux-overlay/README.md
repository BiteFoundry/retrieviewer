# Linux X11 companion painter (implementation-ready, not release-certified)

`overlay.py` is the Linux counterpart of `../windows-overlay/Overlay.cs`: a
native transparent painter driven over the same NDJSON stdin/stdout bridge by the
Node pet engine. It draws only the Braille frames it receives; it adds no art.

## Why Python + ctypes

- Python 3.6+ **standard library only**. `ctypes` binds the X client libraries
  the desktop already ships: `libX11.so.6`, `libXrender.so.1`, `libXext.so.6`.
- No compiler, PyPI package, GTK/Qt/gi/Tk, Electron or npm native addon, so there
  is no GLIBC/Node ABI coupling. Target baseline: AlmaLinux 8 (GLIBC 2.28,
  platform Python 3.6) on old hardware.
- Struct layouts and constants were checked against the official X.org headers
  (libX11 1.8.13, libXrender 0.9.12, libXext 1.3.4, xorgproto 2025.1) with a
  compiled `offsetof`/`sizeof` probe on x86_64. 32-bit layouts were not
  compiled; every field uses `c_long`/`c_ulong`/pointers so they follow the C ABI.

## Requirements and refusals (fail closed, one JSON `error` line, exit 2)

| Condition | Result |
|---|---|
| `WAYLAND_DISPLAY` set or `XDG_SESSION_TYPE=wayland` (even with `DISPLAY`/XWayland) | Refused: log in to an Xorg session. Wayland cannot safely follow/stack over another app. |
| `DISPLAY` unset / display cannot be opened | Refused with the display name. |
| No SHAPE ≥ 1.1 (input shapes), no RENDER, no XRender ARGB32 32-bit visual | Refused. |
| No compositing manager (`_NET_WM_CM_Sn` unowned) | Refused instead of painting an opaque black box. |
| WM without EWMH `_NET_CLIENT_LIST` / `_NET_ACTIVE_WINDOW` | Refused. |
| Missing X client library | Refused; it never installs packages. |

## Bridge (same as Windows)

stdin: `frame{revision,x,y,columns,rows,text}`, `loaded`, `interaction`, `error`, `quit`.
stdout: `ready{pickerVisible}`, `picker{visible}`,
`viewport{revision,visible,selected,columns,rows,cellWidth,cellHeight=2*cellWidth}`,
`ack{painted}`, `interact{kind:ball|treat}`, `pause{paused}`, `quit`.

- One outstanding frame; discarded, hidden and stale-revision frames are still ACKed.
- Only U+2800..U+28FF cells; ≤ 125000 cells per frame. Default cell is 16 px and the
  viewport grid is capped at 20000 cells (`--cell 6|8|10|12|16` to change the cell).
- Only the cropped bounding box is rasterized; the pet window is resized to it and
  fully overwritten, and is unmapped on every viewport change, so no stale trails.
- stdin EOF quits; every owned window, GC and colormap is released and the display
  connection closed. The single-instance lock is an abstract Unix socket (no file).

## Window behavior

- Explicit picker lists EWMH client windows (title and `/proc/PID/comm` only,
  terminals first). Titles are drawn ASCII-only (`?` for other characters).
  The picker sets `WM_HINTS.input=False` so the WM should not move keyboard focus.
- Tracking is read-only polling (~30 Hz) of the target's attributes, root-relative
  position, `_NET_WM_STATE_HIDDEN`, `_NET_WM_PID` and `_NET_ACTIVE_WINDOW`. The pet
  shows only while the target is the active window, viewable, not minimized and at
  least 160×120. A vanished target (BadWindow is trapped) or reused PID hides it.
- Pet: override-redirect ARGB32 window with an **empty ShapeInput region**, so all
  pointer input passes through; no keyboard selection, grabs or hotkeys.
- Controls: a separate override-redirect strip (Ball, Treat, Window, Pause, Quit)
  consumes only its own clicks and is never focused.
- Target windows and global focus are never modified. No capture, injection,
  network, root access or Wayland compositor changes.

## Commands

```sh
python3 overlay.py                  # bridge mode (spawned by the Node worker)
python3 overlay.py --ipc-test       # bridge mode with an owned off-screen stand-in target
python3 overlay.py --check-json     # environment diagnostics, creates no windows
python3 overlay.py --self-test :99  # owned windows on an explicitly named isolated display (e.g. Xvfb)
```

`--self-test` refuses an implicit display; it does not require a compositor and
checks painting, input-shape emptiness, geometry following, stale-frame discard,
hide on unmap, target loss, focus preservation and teardown on owned windows only.

## Known limits

- Parent verification after the worker report: AlmaLinux8/GLIBC2.28, Python3.6.8,
  Node22.23.4, owned Xvfb + Openbox + xcompmgr passed native painting, empty input
  shape, focus/geometry/hide/stale-frame checks and real Node worker ball/exit
  lifecycle. This is not certification of every physical desktop/compositor.
- Compositors may draw a shadow around override-redirect windows; the pet window
  declares `_NET_WM_WINDOW_TYPE_DND`, which most compositors leave unshadowed.
- The overlay is raised every 250 ms while visible because a WM restacks the active
  target above override-redirect windows when it is clicked.
