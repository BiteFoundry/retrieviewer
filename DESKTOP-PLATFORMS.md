# Native desktop adapters — 0.0.4

Version0.0.3 includes Windows, Linux X11 and experimental macOS adapters. Windows
and the AlmaLinux8 X11 baseline have live verification; macOS has no runtime verification.
Installation takes two steps: `npm install -g @bitefoundry/retrieviewer`,
then `retrieviewer desktop`. No app patch, wrapper, shell profile or auto-start entry.

Version0.0.4 adds compact comfort behaviors and the tug control. Windows native
checks were repeated. New Linux/macOS control changes have grammar/protocol
checks, not new live GUI verification; the Linux live evidence below is the
earlier0.0.3 baseline. macOS remains experimental.

## Design and status

| Platform | Adapter | Current verification boundary |
| --- | --- | --- |
| Windows10/11 | QuickJS/Win32 basic; Node/.NET optional watching | Live verified; shared-adapter regression checks passed on this host |
| macOS | Built-in osascript/JXA AppKit, no Python/Xcode/browser runtime | Experimental; no macOS runtime available on this Windows host |
| Linux X11 | Python3.6+ stdlib ctypes + X11/Xrender/Xext | AlmaLinux8 GLIBC2.28/Python3.6.8/Node22.23.4 live checks passed on owned Xvfb + Openbox + xcompmgr |
| Linux native Wayland | No arbitrary-window tracking adapter | Refused, including sessions exposing an Xwayland DISPLAY; no insecure compositor workaround |

Linux needs a running Xorg/X11 desktop with an ARGB visual, SHAPE input extension
and a compositing window manager. A headless/server-only AlmaLinux installation
cannot display desktop windows. System Python3.6+ is used; AlmaLinux8's
`/usr/libexec/platform-python` is a fallback. No pip packages, GTK, Qt, Electron,
native npm addons or on-machine C/C++ compilation are required on Linux. Missing
capabilities cause a clear error rather than silently installing packages or
changing a login/session/privacy setting. The source must not require a newer
GLIBC just because the development workstation has one.

AlmaLinux8 users should use an officially maintained Node22 build compatible
with their GLIBC2.28 system. The package's Node>=20 range is not a promise that
every future upstream Node binary will run on an old OS. The baseline test uses
official Node22.23.4 linux-x64, SHA256
`1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`.

## Low-resource behavior

Linux/macOS worker loops default to15fps, Windows retains30fps. Real elapsed time
drives the existing fixed-step animation: fewer drawn frames do not deliberately
speed the dog up. There is at most one frame in flight. Only the cropped, nonblank
Braille rectangle crosses the pipe and is painted. Hidden/inactive/minimized
time is paused and never replayed on reveal. Native adapters should default to
coarser cells/bounded grids on large displays instead of rendering a4K framebuffer.
This is a design target, not a claim of zero CPU use or a measured memory minimum.

In the owned1280×800 Alma8 test the Node engine RSS was about179MiB, plus the
Python helper. This is not a minimum-memory requirement or proof of4K performance.

All adapters reuse the same Q5 art and behavior engine. POSIX control sockets use
short `/tmp/retrieviewer-overlay-<uid>-<uuid>.sock` addresses with0600 permissions,
an independently random token in the0600 session record, and conservative cleanup.
Windows named pipes remain compatible with the previous launcher. No token is
printed in status or sent over a network. Same-user hostile software remains
outside the security boundary. Stop/remove must not kill or modify the target app.

## Evidence

Keep actual checks, failures, skips and the tested OS separate. Static macOS source
tests cannot establish AppKit/JXA behavior or privacy permissions. An Ubuntu test
with a newer libc is not AlmaLinux8/GLIBC2.28 certification. A fake window manager
is not proof of composited visual quality. Test containers may install their own
QA tools, but product launch never installs OS packages or changes the user's OS.

Recorded Linux checks: real ARGB painting, empty input shape, moved target geometry,
stale-frame discard, hide on unmap, target disappearance, foreground retention,
actual Node-to-Python worker painting, accepted ball interaction,0600 UNIX socket,
rejected wrong token, clean worker/helper exit, and remove lifecycle. This covers
an isolated desktop, not every GNOME/KDE theme, compositor or physical monitor.
Evidence: `dist/alma8-qa/posix-worker.json` and source QA script output.

- [Node build platform requirements](https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md)
- [X11 Shape protocol](https://xorg.freedesktop.org/archive/X11R7.7/doc/xextproto/shape.html)
- [Wayland client surface isolation](https://wayland.pages.freedesktop.org/wayland.freedesktop.org/docs/book/Protocol.html)
- [Apple NSWindow](https://developer.apple.com/documentation/appkit/nswindow)
