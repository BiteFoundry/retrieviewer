# Install Retrieviewer

Desktop setup (Node20+; [OS requirements and verification](DESKTOP-PLATFORMS.md)):

1. `npm install -g @bitefoundry/retrieviewer`
2. `retrieviewer desktop` — select the app window in the picker.

No agent configuration is needed for this separate transparent companion.
Choose the dot ink at launch: `retrieviewer desktop --ink gold`, or
`retrieviewer desktop --ink dark` on light backgrounds. Default: `cream`.
Exit an existing companion before changing ink. Presets reuse the same Braille
mask and native painter, without new color sprites or screen capture.
Windows and AlmaLinux8/GLIBC2.28 X11 have live test evidence. macOS support is
experimental and not runtime verified; native Wayland is unsupported. Linux needs
system Python3.6+, X11/Xrender/Xext and a compositor; Windows needs the .NET
Framework4 compiler. See [Windows controls and removal](WINDOWS-COMPANION.md).

## Optional native OpenCode integration

0.0.3 also includes an installer CLI and a native OpenCode TUI adapter. It does **not** claim
that every MCP client can display animated UI. Native OpenCode rendering uses its
official TUI plugin slot, not another terminal, a wrapper, or a modified binary.
Other agent IDs are discoverable but refused until an adapter is implemented.

## Install

Node >=20, a Unicode Braille terminal font, and an independently installed supported
agent are required. Source code is MIT; bundled puppy artwork is CC BY-SA 4.0.
Keep the included ATTRIBUTION.md and asset license when redistributing artwork.

```sh
npm install -g @bitefoundry/retrieviewer
retrieviewer enable
```

On a terminal, enable offers a numbered agent selection, checks compatibility,
shows exact paths and asks before making changes. Cancel/Enter changes nothing.
For a non-interactive installation use an explicit agent and confirmation:

```sh
retrieviewer enable --agent opencode --dry-run
retrieviewer enable --agent opencode --yes
opencode
```

The native renderer is initially version-gated to OpenCode2.1.2. A different
version is **not automatically certified**. Existing project configuration can
override global settings; doctor checks registration, not arbitrary host precedence.
Do not put API keys in Retrieviewer settings. No credentials are needed by the pet.

The package also exports `./tui` for npm-aware OpenCode plugin
loaders; package-name discovery has not yet been live-tested against npm.
The verified installer continues using its local directory URL, not that new path.

## What changes

- Add the local TUI plugin **directory** URL to OpenCode's global `cli.json` plugins list.
  OpenCode2.1.2 skips file targets; the directory resolves its `tui.tsx` entry.
  Respect XDG_CONFIG_HOME; otherwise use ~/.config/opencode, including Windows.
- Preserve JSONC comments, unrelated settings and other plugins; back up before edits.
- Store enabled/ownership information in Retrieviewer's own settings directory.
- Do not edit shell profiles, replace agents, change permissions, or launch another
  terminal. This native path needs no MCP entry: registering MCP alone cannot insert
  a persistent widget into an arbitrary TUI.

Keep the installed package path available: the agent loads that exact plugin URL.
After changing the installed location, disconnect the old registration and enable
the new package. No automatic global install is done by the package itself.

## Commands

For the separate native overlay (Windows since0.0.2; Linux X11 and experimental macOS since0.0.3),
see [desktop platforms](DESKTOP-PLATFORMS.md). It does not register a Codex plugin
or change the way an agent is launched:

```powershell
retrieviewer desktop
retrieviewer desktop-status --json
retrieviewer desktop-stop
retrieviewer desktop-remove --yes
```

```sh
retrieviewer agents --json
retrieviewer status --agent opencode
retrieviewer doctor --agent opencode --json
retrieviewer disable --agent opencode
retrieviewer enable --agent opencode --yes
retrieviewer disconnect --agent opencode --dry-run
retrieviewer disconnect --agent opencode --yes
retrieviewer preview
```

Disable keeps the adapter installed; disconnect removes only the registration this
installer owns. It never restores a whole old config over later user changes.
Backups remain recoverable. An entry predating this installer remains user-owned.

Inside OpenCode, `/retrieviewer enable`, `/retrieviewer disable`,
`/retrieviewer ball`, `/retrieviewer treat`, `/retrieviewer status` control the native
pet. The adapter owns no raw keyboard or stdout; the host owns drawing and layout.

## Evidence, not a misleading green check

Registration means the config contains our plugin URL. A runtime receipt means
the adapter initialized and produced a frame; it is **not proof of human visual
approval**. A stale receipt from a closed process is not a live renderer.
There is no automatic approval of all MCPs or bypass of an agent's trust policy.

For tests/portable setups, `RETRIEVIEWER_HOME` selects the pet state directory.
Changing it does not move agent configuration; use XDG_CONFIG_HOME for that.
Never point tests at a real user's settings. The package smoke check uses an
isolated consumer home/config and an injected executable probe.

## Implementation sources

The native integration reuses [OpenCode's official CLI plugin API](https://dev.opencode.ai/v2/docs/build/plugins/cli)
and the existing host-driven Retrieviewer core. JSONC edits use Microsoft's
jsonc-parser3.3.1 instead of rewriting configuration as plain JSON. MCP Apps host
support is independent of basic MCP support; see the
[official extension overview](https://modelcontextprotocol.io/extensions/apps/overview).
Support of Codex, Claude Code, Cursor Agent, Grok and Antigravity **inside their
terminal UI remains unimplemented**, not inferred from their MCP commands.

## Local validation

The adapter was compiled and run by the real OpenCode2.1.2 Windows host with an
isolated XDG configuration/data/cache/state and pet directory. Animated Braille
appeared in its home-screen footer alongside its ordinary prompt. The native
`/retrieviewer` slash menu and status toast were observed. External disable/re-enable
and increasing frame receipts were checked without sending a model prompt.
The test terminal was80×24 cells, yielding a64×5 pet pane; larger physical terminal
visual quality and other OpenCode versions are not certified by this check.
Source QA evidence is in qa-opencode/native-ui-proof.json (not shipped in the pet).
