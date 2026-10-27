# Attention preview

Opt-in, metadata-only StackBite notifications. This integration does **not** see
screens, click controls, answer questions, or approve anything. LLM use is OFF by
default; see the separate [opt-in paid DeepSeek backend](BRAIN.md).
The existing puppy art, rendering and physics stay in place.

For a local browser motion review with explicitly simulated events:

```sh
node tools/preview-attention.mjs
```

Open its loopback URL. This page does not connect to StackBite or inspect any
screen; its pending items are fixtures. The preview server exits after ten minutes;
the loaded page can keep animating locally. Relaunch the command to reload later.

## Run the installed package

After `npm install -g @bitefoundry/retrieviewer@latest`, run from a live StackBite
Seat on the same computer as the desktop overlay, from any directory:

```sh
retrieviewer attention --json
retrieviewer desktop --watch stackbite
```

Choose the StackBite window. If a companion is already running, stop it explicitly
with `retrieviewer desktop-stop`, then start the watcher. An existing
companion is never silently replaced. Check `desktop-status --json` for
`watch.source`, `watch.state` and `watch.pendingCount`.

Source development commands such as `node retrieviewer-cli.mjs` require the
repository root as the current directory; installed commands do not.
Ordinary `desktop` leaves watching OFF. Stop with
`desktop-stop`; restart without `--watch` to remove observation. No persistent
watch setting, host patch, hook, auto-start, account, model or new dependency is added.

## What it reads

Only the fixed read-only command `stackbite agent seats --output json`, at most
once every five seconds after the previous read finishes. StackBite revalidates
the inherited caller Seat/generation. The source requires a live Room binding;
launching from an unrelated terminal is refused rather than guessing credentials.

On Windows, a native executable or npm PowerShell launcher is resolved on PATH.
The launcher uses literal `-File` argv with closed stdin, without a shell command
string or execution-policy change. Unix retains the direct command.
No raw database, credential file, terminal transcript, screenshot, microphone,
clipboard, provider hook or browser session is read by Retrieviewer.

The current `seat_status` v1 projection supplies `needs_input`, generation,
turn/request identity and typed approval/question facts. It outranks legacy
fields, including when unknown/resolved. Only live, generation-matched Seats
with a positive turn ID or stable input request ID qualify. Older explicit
`awaiting_user`/`blocked` lifecycle facts require a positive turn ID. Generic input
is **not proof of a particular question**; unknown states are never inferred from
prose. Onboarding and questions attached to stopped Seats are excluded. Other
Rooms, exact sidebar item positions and pixel detection are not supported yet.
SSH: install/run the overlay where the visible desktop lives. A Room binding on
a remote server does not automatically give a local Windows pet remote access.

## Behavior and limits

Attention now has two authored gestures: a seated gentle paw and a standing
two-hind-foot glass scrabble. Automatic cues alternate; hosts can pass
`gesture:'paw'` or `gesture:'wall'` to `pet.notify`. See [wall motion](ATTENTION-WALL.md)
for support, recovery and measured costs. The preview's wall button forces that
variant using simulated input; it does not request a real approval.

The ginger cat uses a finite eye greeting for passive alerts. Its current direct
interaction or feeding finishes before the monitor can deliver the greeting.

- A new exact Room/Seat/generation/turn/request cues one connected attention episode:
  brake/recover and face the user, approach using the existing world path if more
  than 0.8 m from the near check-in point, then sit, gently paw the air twice,
  lower the paw and look left. See [paw motion and cost](ATTENTION-PAW.md). Near pets stay
  in place. Resolution during approach brakes the obsolete journey naturally.
  Left means the sidebar direction, not a detected button coordinate.
- The rule cue is accepted before optional inference starts. LLM latency, failure
  or disagreement never delays, repeats or retracts a confirmed pending alert.
  This does not remove the existing five-second source polling interval.
- Explicit ball/treat/tug interactions win. A rejected cue retries only while
  its source fact is fresh. Distinct cues are at least 20 seconds apart.
- Resolved/disconnected/stale facts clear the cue. Source errors are unavailable,
  not “zero pending.” A hidden/paused pet aborts observation and refreshes on resume.
- At most 32 pending items and 128 dedupe identities are retained, in memory only.
  Excess/malformed snapshots fail closed. No unlimited history or recording.
- Each read has a 4-second timeout and 256 KiB output cap. No overlapping reads,
  separate resident watcher, additional timer or shell command interpreter.
  The CLI briefly runs a child process; it is not free in CPU/peak RAM.

The first Windows 1280x800 off-screen startup probes measured Node RSS of about
106 MiB with watch off and 107 MiB after one live metadata read with watch on.
These are separate short runs, not a steady-state/peak comparison or a guarantee
of 1 MiB overhead. Native-helper and transient StackBite CLI memory are additional.
No new image payload, model or runtime package dependency was added.

Windows displays the pending Seat's bounded `role_title` and approval/input kind
in the existing control bar, with ellipsis and a full-text hover tooltip. The
local `watch.target` and `attentionLabel` diagnostics expose that same target.
Names are at most 64 UTF-16 code units, control/directional characters are removed,
and no task text is retained. Labels never enter model input or saved settings.
Renaming/replacing a target refreshes the label even if the count is unchanged;
renaming alone is not a new alert. Missing names use the Seat ID as a fallback.
Non-Windows helpers do not yet display that label; their live StackBite
integration remains unverified. Capture/overlay support is a separate platform
question. No new Wayland or AlmaLinux compatibility claim is made here.

Version 0.0.15 includes these rule-first/target/approach improvements after the
0.0.14 baseline. A simulated frozen
LLM and a time-skipped distant notification are available in the local preview.
They never write StackBite state or make model requests. Real provider events
still depend on StackBite publishing trustworthy `needs_input` metadata.

Working-copy verification on 2026-10-24: focused tests cover immediate delivery
with hung/disagreeing advice, local-only bounded labels, same-count renaming,
late-result cancellation, far-to-near motion, and resolution during approach.
An owned Windows worker/native-helper run displayed and renamed the actual label,
cleared it to `Watching`, preserved direct ball priority and exited both children.
The fixture run used about 112 MiB Node RSS (no LLM), excluding the helper/CLI.
Matched short watch-off native startup probes of published 0.0.14 and the working
copy both rounded to 106 MiB Node RSS. These are not steady-state or peak-memory
guarantees. All nine packaged art archives are byte-identical; no dependency,
additional resident process or observer timer was added. Labels are bounded
metadata, not a promise of literally zero additional bytes or allocations.

## Reuse decision

The first source already exists in StackBite, so a fixed-argv adapter is smaller
than importing an agent desktop app. No external source was copied in this patch.
Future capture permissions can follow
[AI-Desktop-Pet](https://github.com/AkshitIreddy/AI-Desktop-Pet); pointing/coordinate
mapping can draw from [Blepper](https://github.com/Ruthheasman/Blepper). Neither
capture nor a permissive model action parser belongs in this metadata-only slice.
Observer is AGPL and current Screenpipe is source-available, not an MIT dependency.
