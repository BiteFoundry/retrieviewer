# Purrviewer web demo

The homepage's #purrviewer section embeds the reviewed ginger-cat core3e2531d.
Desktop cat: retrieviewer desktop --pet cat (same npm package).
The owner authorized CC BY-SA4.0 for cat artwork; code is MIT. See NOTICE.txt. No raw sheets/research media are included.

The shared page's EN/KO control also translates this section. Start imports
only the pinned eight core modules, five reused Braille/Q5 modules and two art
files (571,507bytes of compressed artwork). The static poster is a capture of
the actual reviewed cat core, not an illustration or a research photograph.

Offscreen/hidden views stop presentation and simulated time; still rest uses
8fps, action uses30fps. Resize caps the canvas backing store to1M pixels.
There is one borrowed core output and two decoded-frame cache slots. Pause,
full screen, bfcache return and final disposal are handled by the host adapter.
No new runtime dependency or additional analytics configuration is introduced.

To update deliberately, review a new cat source commit, adjust the pinned
export in tools/sync-cat-demo.mjs and demo.mjs, export only the allowlist, and
update the manifest test. Public site building remains npm run build:site.
