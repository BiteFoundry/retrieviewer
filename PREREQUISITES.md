# Node, npm and your desktop

[한국어 안내](README.ko.md#nodejs가-없다면) · [Install Retrieviewer](README.md#bring-one-home)

## Choose the computer first

Install where the app window is displayed. For Cursor/VS Code Remote SSH, this
usually means your local Windows/macOS computer, not the remote Linux terminal.
A Linux DISPLAY such as :1 may belong to a remote VNC desktop; it does not mean
the local Cursor window lives there. Desktop Linux needs X11 plus a compositor.

## Install Node/npm

Check `node --version` and `npm --version`. The package needs Node>=20; prefer a
maintained release. Node22.23.4 is our tested Alma8 baseline.

- **Windows:** use the official [Node.js download page](https://nodejs.org/en/download)
  and choose the Windows installer. Keep npm and Add to PATH enabled. Open a new
  PowerShell afterwards; do not run inside your SSH terminal.
- **macOS:** use the official macOS installer from the same page; reopen Terminal.
  Node installation does not mean our experimental Mac overlay has been verified.
- **AlmaLinux8:** an administrator can inspect `dnf module list nodejs`, then on
  a system with no conflicting Node stream install `sudo dnf module install nodejs:22`.
  See [RHEL8.10 stream instructions](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/8.10_release_notes/new-features)
  and [Alma8's Node22 packages](https://errata.almalinux.org/8/ALSA-2026-54530.html).
  Do not reset/switch a company-managed stream without your administrator.
- **Other Linux:** use your distribution's maintained Node22+ package or the
  official platform download; do not assume an old distribution's `nodejs` package
  meets Node>=20. The official [Node22 release](https://nodejs.org/en/blog/release/v22.23.4/)
  includes binaries and checksums. Avoid random install scripts and do not replace
  system GLIBC to make a newer binary start.

No administrator access? Use an approved per-user Node installation or ask the
machine administrator. Node/npm and desktop libraries are prerequisites, not
dependencies that Retrieviewer silently installs.

## Linux native prerequisites

System Python3.6+, libX11, libXrender and libXext, an ARGB32 visual, SHAPE input
extension, EWMH window manager and a compositor are required. No pip, GTK, Qt,
Electron, native npm build or C++ compiler is required by the Linux helper.
On AlmaLinux8, Python can fall back to `/usr/libexec/platform-python`.

On a managed machine, ask your administrator for missing desktop libraries;
don't change the login session, compositor or display permissions blindly.
Native Wayland is unsupported. Check session variables without shell-specific
unset-variable errors:

```sh
printenv XDG_SESSION_TYPE DISPLAY WAYLAND_DISPLAY
```

## Command not found

First check the install location:

```sh
npm ls -g @bitefoundry/retrieviewer --depth=0
npm prefix -g
```

On Linux/macOS the executable is under `<printed-prefix>/bin`. On Windows it is
directly under the printed prefix. Add the actual directory to your user's PATH.
Retrieviewer never edits a shell profile automatically.

For **bash/zsh**, this fixes the current shell:

```sh
export PATH="$(npm prefix -g)/bin:$PATH"
```

For **csh/tcsh**, if the printed prefix is `/home/you/.npm-global`, replace that
example with your actual result:

```csh
set path = ( /home/you/.npm-global/bin $path )
rehash
```

Persist the appropriate line manually in your shell's own startup file if needed.
For Windows, reopen PowerShell first; if necessary add the printed npm prefix in
Windows User Environment Variables → Path. Do not overwrite the entire PATH.
If PowerShell policy blocks npm.ps1 or retrieviewer.ps1, use `npm.cmd` and
`retrieviewer.cmd` instead. Do not weaken your execution policy just for this pet.

If global npm install reports EACCES, use a properly configured per-user npm
prefix/Node installation with your administrator's guidance—not blanket sudo npm.
Meanwhile the one-off command does not require global PATH setup:

```sh
npx --yes --package @bitefoundry/retrieviewer@latest retrieviewer desktop
```

`npx` still needs Node/npm and a compatible GUI desktop, and may download the
package into npm's cache. It does not create a permanent global command.
