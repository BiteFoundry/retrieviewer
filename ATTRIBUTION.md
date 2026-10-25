# Retrieviewer artwork credits

Retrieviewer artwork and animation assembly: BiteFoundry project maintainer
(`shinick-han` on GitHub, `shinick` on npm), 2026, with AI image generation and
programmatic pose registration, interpolation, grounding and quantization.
Project contact: https://github.com/BiteFoundry

Release artwork: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [ASSETS-LICENSE.md](./ASSETS-LICENSE.md) for covered files and the legal text.

## Photographic references and retained notices

The original puppy-generation record identifies these two photographic inputs.
The release retains their attribution and treats the resulting artwork
conservatively as an adaptation for licensing, without claiming a court has
determined derivative-work status. The original photographs are NOT bundled.

### Golden Retriever puppy standing.jpg

- Creator: Scott — https://www.flickr.com/photos/29949904@N00
- Original source: https://www.flickr.com/photos/29949904@N00/481813401
- File/license record:
  https://commons.wikimedia.org/wiki/File:Golden_Retriever_puppy_standing.jpg
- Original license: [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/).
- Use/changes: a reference input for puppy anatomy and proportions; AI-generated
  grayscale puppy artwork with a different face, fur, bandana and background,
  subsequently extended into poses and processed into animation frame data.

### Golden Retriever 10weeks.jpg

- Creator: Stefan Bauer — http://www.ferras.at
- Original file/license record:
  https://commons.wikimedia.org/wiki/File:Golden_Retriever_10weeks.jpg
- Original license: [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/).
- Use/changes: a reference input for puppy face/fur; synthetic standing artwork
  and subsequent pose extensions, not a bundled copy of the photograph.
- CC BY-SA 2.5 section 4(b) permits distributing an adaptation under a later
  version with the same license elements. This release uses CC BY-SA 4.0 for
  the artwork, retaining this original credit and license information.

Neither photographer endorses Retrieviewer or BiteFoundry. Original rights and
license warranty disclaimers remain applicable. Keep these supplied credits,
license links and change descriptions with redistributed artwork; add your own
change description if you modify it, in a manner reasonable to the medium.

## Processing and exclusions

AI-generated pose sheets were extracted, aligned, interpolated, contact-corrected
and encoded as 32-level Q5 frame stores. These are modifications, not unaltered
photographs or motion capture. The package contains nine generated-art archives.
The comfort extension reuses the existing roll/rest poses and adds eight
AI-generated tug keys, registered at one scale with the existing seat as its
animation endpoint. No additional photographic or video inputs were used for
this extension. Its source hash and preparation are recorded in COMFORT-ART.md
and puppy-companion-comfort.json; the same artwork license applies.
Reference photo collections, YouTube footage, experimental Meshy models,
noncommercial motion research/datasets, interpolation tools/model weights and
worker logs are not distributed in this package. No exclusive copyright in
otherwise unprotected AI output is claimed. Code has its own MIT license.

## Purrviewer ginger cat

Ginger-cat artwork and motion assembly: BiteFoundry project maintainer, 2026.
AI-generated poses, registered and quantized into grayscale Q5 crops.
CC BY-SA 4.0; attribution and creation record in
[integrations/purrviewer/ASSETS-LICENSE.md](integrations/purrviewer/ASSETS-LICENSE.md)
and [ART.md](integrations/purrviewer/ART.md).
