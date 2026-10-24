# Precomputed motion tables (0.0.12)

`npm run bake:motion` compiles the current approved sources into
`puppy-motion-tables.generated.mjs`. It does not change a picture, camera,
trajectory, animation duration or source metadata. `npm run check:motion` checks
the exact deterministic output without writing. Tests and the publication guard
reject stale output after source metadata or witnessed art changes.

## What is precomputed

- Source support episodes, including continuous stance across a cycle seam and
  a complete swing skipped between rendered frames. No stance-history discovery
  occurs while building a default renderer, including after a resize.
- Clip lists, weights and totals used for action-pose addressing. The runtime no
  longer validates/rebuilds these same lists and totals for each default pose.
- A dense table of72 facing/seat preparation cases, sharing8 step descriptors.
  Lookup requires a stationary root; it does not insert a turn at running speed.
- Ten exact-pixel connection witnesses with view, speed and (where applicable)
  gait-phase/velocity-match requirements. These cover walk entry/exit, rear run
  into the authored impact, impact into rear pickup, carry-gather into arrival
  seat, tug into the canonical seat, and four watch endpoints into that seat.
- SHA256 of every input metadata/art file used by the bake. No source images,
  source hashes or graph search are computed by the running pet.

The generated routes preserve the existing approved preparation order. This is
a bounded compilation of existing paths, not unrestricted motion matching or a
new animation blend engine. Other actor-specific recovery rules stay in place.
Unregistered arbitrary-phase joins are not certified: in particular an urgently
interrupted walk may use its existing recovery rather than a proven phase0 join.

## What remains dynamic

World displacement, actual velocity, unwrapped gait phase, perspective and the
small paw-to-world anchor correction still depend on live state. Those cannot
be baked as fixed screen coordinates while allowing free travel and resizing.
Support tables address the original source coordinates; they do not stretch the
head/torso, replace drawings or cause a camera orbit.

Paw labels are visible image-space proxies, not anatomical motion capture. Some
resting endpoints have exact-pose evidence but no individually labeled paws.
The authored run-to-impact entry is **airborne**, not a planted-paw handoff:
its gate requires the correct phase, positive speed and matched velocity.
Neither exact pixels nor a green numerical test proves general animal realism.

## Compatibility and resource scope

The bundled Q5/default-loader path uses the compiled tables. Optional original
art and custom loaders retain the general metadata-driven implementation instead
of accidentally applying the bundled pet's bake to unrelated art. The general
helpers remain available for authoring and equivalence tests.

The generated module is about11KB source, shared between instances; there is no
extra image cache, dependency, timer, worker or asset-fetch round trip. It removes
repeat discovery/allocation work, not the roughly20MB retained image payload or
Node/native process baseline. It is not a large-RAM-reduction claim.

Verification compares every baked support sample and wrap, all action-addressing
boundaries, both actor paths through seeded fetches and rare impacts, and the
public renderer's text, contacts and mouth anchors. Use
`node --test puppy-motion-tables.test.mjs`. The owner authorized publication of
this work as0.0.12 on2026-10-24. Earlier published artifacts remain unchanged.
