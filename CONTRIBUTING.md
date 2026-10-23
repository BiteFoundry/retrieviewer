# Contributing

Bring an observation, a small fix, or a compatibility report. Screenshots are
welcome only after removing credentials, work content and private paths.

Use Node22 (the tested Linux baseline) or another compatible maintained version:

```sh
npm ci
npm test
npm run build:site
npm start
```

The preview prints its local URL and binds only to127.0.0.1. The site uses the
same runtime and Q5 art as the desktop companion, with assets loaded only when
the visitor asks to play. No hosted model or analytics service is involved.

Native checks are opt-in: `node tools/check-windows-overlay.mjs` on Windows;
`tools/check-posix-overlay.mjs` needs an explicitly owned isolated X11 test display.
Do not point native QA at somebody else's active app or settings. macOS-only
tests skip off macOS; a skip does not certify the Mac adapter.

Keep patches bounded, preserve existing artwork/proportions and use meters/time
for movement, not independent zoom hacks. Do not add accounts, telemetry, install
scripts, auto-start or host-app patches as incidental improvements.
Include relevant tests and say what you could not verify.

Code contributions follow MIT. Artwork changes need compatible provenance,
attribution and CC BY-SA4.0 distribution. Third-party files retain their licenses.
