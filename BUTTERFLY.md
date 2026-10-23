# Rare butterfly encounter (0.0.6)

No additional dog artwork, sprite archive, dependency, background process or
timer. Existing short grounded gallops supply the bounding legs and ear motion;
the visitor is drawn directly into the existing grayscale buffer before Braille
conversion. Camera, stride-distance integration, contact correction and palette
are unchanged. This is not a new up-looking/pouncing source illustration.

The initial opportunity is scheduled after240–480 active simulation seconds.
Only an awake, energetic puppy near the viewer may participate; sleep pressure
takes priority. Subsequent opportunities are at least720 seconds apart, with
up to480 additional random seconds. Hidden/paused time does not accumulate.
An opportunity can be delayed by sleep or another coherent episode, rather than
forcing a timer callback that wakes or interrupts the puppy.

The puppy notices, makes three short alternating chases, watches the visitor fly
away, returns and rests. Each target keeps the butterfly ahead of the muzzle.
The visitor has an18-second visibility guard. Accepted ball/treat/tug clears the
encounter and its obsolete route immediately, using normal actor recovery.
A separate random stream leaves the existing ordinary episode/gait choices
unchanged before the encounter.

Checks: `node --test puppy-butterfly.test.mjs`, `npm test`.
Generate a lightweight real-engine replay: `node tools/check-butterfly.mjs`.
Its local `site-dist/butterfly-preview.html` loads prerecorded cropped Braille
frames, not another full pet asset set. The replay is a QA artifact, not an npm
asset or an alternate implementation. Serve only `site-dist` on a local address.

Version0.0.6 includes this behavior. Existing0.0.5 registry artifacts remain
unchanged. An already-running companion must be restarted after updating.
