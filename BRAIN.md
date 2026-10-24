# Optional DeepSeek brain

The selected backend is OpenRouter's paid `deepseek/deepseek-v4.1-flash-1017`.
No local model, SDK, renderer, dependency, image asset, or permanent watcher is added.
The existing offline pet and rules remain the default.

## Install and run

Update once: `npm install -g @bitefoundry/retrieviewer@latest`.
Then use the installed `retrieviewer` command from any directory; no checkout or
`cd` is required. Node's `node retrieviewer-cli.mjs` instead looks in the current
directory and fails with `MODULE_NOT_FOUND` outside the source repository.

Set `OPENROUTER_API_KEY` in the launching terminal's environment using your secret
manager or a hidden terminal prompt. Do not paste it in chat, command arguments,
source files, screenshots, `.env` files or the repository. Nothing saves the key.

```sh
retrieviewer brain-check --json
retrieviewer desktop --watch stackbite --brain openrouter
```

The first command sends one **synthetic** approval event, never a real Room,
and incurs API usage charges.
The second must run inside a live StackBite Seat on the display computer. Stop an
existing companion explicitly with `desktop-stop` first; it is never replaced
automatically. `desktop-status --json` exposes sanitized `brain` diagnostics and
`watch.lastJudgment`. Restart without `--brain` to disable the backend. No key is
required for help/status, offline mode, or metadata-only watching.

For source development only, first change to your Retrieviewer checkout directory
and substitute `node retrieviewer-cli.mjs` for `retrieviewer`. Do not copy that
relative source command into an unrelated directory. The installed command does
not require this machine-specific path.

## What leaves the PC

Only fixed system instructions and this allowlisted anonymous state:

```json
{"event":"pending_input","kind":"approval","pending_count":1}
```

No Room/Seat/request identifiers, labels, task text, terminal output, screenshots,
clipboard or credentials appear in prompts. The key goes only in the Authorization
header to the fixed HTTPS OpenRouter URL, never to helper or StackBite child
processes. Redirects are refused. Provider data collection is denied; if that
policy leaves no eligible route, it falls back rather than weakening the policy.

## Judgment and fallback

The model may return only `{"decision":"notify"}`, `ignore`, or `uncertain`.
JSON mode is not a correctness guarantee: code rejects extra keys, malformed/
truncated output, tool calls and responses over 32 KiB. No returned text is run,
typed, used as a coordinate, or displayed as a factual summary.

This first connection is **advisory on known pending-input facts**, not screen
understanding. Since 0.0.15, a confirmed approval/question is
delivered by the rule first; optional model work starts only after the pet accepts
the cue. It cannot delay, suppress, repeat or retract the cue. Diagnostics show
`rule_first` while advice is pending, then `model_notify` for agreement,
`rule_override` for disagreement, or `rule_fallback` for uncertain/errors.
The 0.0.14 baseline waited for advice. With only kind/count facts, the model adds little semantic value;
this slice establishes a bounded backend before optional richer perception.

Each accepted exact pending item is judged once while fresh; rejected cues during
direct play do not spend requests. Seat display names stay local. Resolution, generation
replacement, stale source, pause, hide and shutdown cancel its request; late
answers cannot resurrect a notice. Direct ball/treat/tug still wins. Animation
ticks never await HTTP. Network timeout is 3 seconds; a host-tick guard discards
hung advice within 3.5 seconds of active time, without delaying the already-issued
rule alert. `brain-check`
allows 8 seconds for diagnosis, not for normal pet reactions.

## Resource and request limits

- One inference at a time. No automatic network retries or alternate-model fallback.
- Fixed paid model with provider price ceilings of $0.30 per million input tokens
  and $1.20 per million output tokens, with per-request fees disallowed. These are
  unit-price limits, not an account spending cap. Thinking disabled,
  temperature 0, maximum 96 output tokens; no tools or plugins.
- Up to 16 anonymous successful judgments cached for 60 seconds. Same state can
  reuse an answer without another request; source identity/freshness stays local.
- Default 40 HTTP attempts per UTC day **per process lifetime**. Restarts reset
  this guard, and other apps share account limits; it is not a global quota meter.
- A 429 backs off for 60 seconds. Other request failures back off for 10 seconds.
  No new calls while the pet is hidden/paused or the source has no fresh events.
- Requests use bounded transient buffers; the API adds network/HTTP runtime costs.
  No claim of zero RAM overhead or guaranteed endpoint latency is made.

The catalog price on 2026-10-24 was $0.15 input / $0.60 output per million tokens,
with scheduled peak pricing at $0.30 / $1.20. Provider prices vary; the request
ceilings fail closed if no compatible route remains. Check the
[model and provider prices](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017/providers)
before budgeting. Even an aborted/timed-out request can incur provider usage.

Reference contracts: [OpenRouter parameters](https://openrouter.ai/docs/api-reference/parameters),
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection),
[reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
The state/closed-choice design follows the TypeSafe skill's guidance, but no
TypeSafe service or SDK is installed; the user-selected OpenRouter backend is retained.

## Verification — 2026-10-24

The user-selected paid DeepSeek endpoint returned a valid `notify` in 1,608 ms
through `brain-check`. A second real request through the owned Windows worker
returned `notify` in 1,113 ms, within the normal 3-second deadline. Both requests
used synthetic anonymous approval facts; no real approval was created or answered.

The native test used a disposable Room fixture and reached `model_notify`.
Ball interaction kept priority, the pet kept rendering, resolution cleared the
pending event, and worker/painter both exited. Node RSS was about 128 MiB in that
short run, excluding helper/CLI memory. This is not an incremental or steady-state
RAM measurement. Existing live companion state was not changed.

For the 0.0.14 baseline, all 217 applicable tests passed (two macOS-only checks skipped), including mocked
JSON validation, price ceilings, timeout, cache, budget, cancellation and stale
results. The earlier free Gemma attempt returned 429 and never produced a verified
live decision; it is no longer the selected backend. Privacy restrictions remain.

The 0.0.15 rule-first candidate passed 223 applicable tests (two macOS-only checks
skipped), fresh installed-consumer checks and an owned Windows fixture run with
actual native target-label renaming/clearing. Hung/disagreeing advice is tested
with mock judges: those tests do not make paid requests. The model request body
and privacy/price restrictions are unchanged.
