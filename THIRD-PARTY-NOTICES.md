# Third-party notices

- **procedural-animals 0.1.0** — MIT, Copyright (c) 2026 Majid Manzarpour and
  procedural-animals contributors. The original development source is retained
  under `vendor/procedural-animals/src` for motion parity tests; it is no longer
  executed or shipped in the dot-art runtime. The full notice is retained at
  `vendor/procedural-animals/LICENSE`.
  Upstream: https://github.com/majidmanzarpour/threejs-procedural-animals
- **three 0.186.1** — MIT; development-only dependency for original 3D parity
  tests. Not installed by the production package. Its development distribution
  includes its own `LICENSE`. https://github.com/mrdoob/three.js
- **jsonc-parser 3.3.1** — MIT; installed as a pinned npm dependency. Its
  distribution includes `LICENSE.md`. https://github.com/microsoft/node-jsonc-parser

The generated puppy artwork is separately CC BY-SA 4.0, not MIT. Its reference
photographers (Scott, CC BY 2.0; Stefan Bauer, CC BY-SA 2.5) and adaptation history
are credited in ATTRIBUTION.md. Original photographs are not bundled. See LICENSE,
LICENSE-CODE, ASSETS-LICENSE.md and the bounded ASSET-PROVENANCE.md review. No
comprehensive legal-clearance or exclusive AI-output ownership claim is made.

## Native Windows runtime

The prebuilt Windows x64 engine includes QuickJS-NG 0.17.0 (MIT) and zlib
1.3.2 (Zlib). Exact source commits and complete license notices are in
`integrations/native-windows/sources.json` and `THIRD-PARTY-LICENSES.txt`.
The optimized kernels and host are MIT. No downloaded runtime is installed
at launch; no additional npm runtime dependency was added.
