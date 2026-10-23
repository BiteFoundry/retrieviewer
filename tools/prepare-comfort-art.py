"""Project asset preparation only. Built-in imagegen supplies the authored PNG.

No ML libraries, downloads, optical-flow model or runtime Python dependency.
Extract eight equal sheet cells at one fixed scale; register ground/center using
translation only. Quantization/packing is performed by prepare-comfort-art.mjs.
"""
import json
import sys
from pathlib import Path
from PIL import Image

sheet_path, neutral_path, raw_path, receipt_path = map(Path, sys.argv[1:5])
sheet = Image.open(sheet_path).convert('L')
neutral_bytes = neutral_path.read_bytes()
neutral = Image.frombytes('L', (320, 320), neutral_bytes)
target = neutral.point(lambda v: 255 if v > 12 else 0).getbbox()
cw, ch = sheet.width // 4, sheet.height // 2
cells = [sheet.crop((i % 4 * cw, i // 4 * ch, (i % 4 + 1) * cw, (i // 4 + 1) * ch)) for i in range(8)]
boxes = [im.point(lambda v: 255 if v > 12 else 0).getbbox() for im in cells]
# Ignore the rope on the right when locating the body center, not for rendering.
body_boxes = [im.crop((0, 0, round(cw * .77), ch)).point(lambda v: 255 if v > 12 else 0).getbbox() for im in cells]
scale = (target[3] - target[1]) / (boxes[0][3] - boxes[0][1])
resampling = getattr(Image, 'Resampling', Image).LANCZOS
target_center = (target[0] + target[2]) / 2
raw = bytearray(neutral_bytes)
registration = []
for i, (im, box, body) in enumerate(zip(cells, boxes, body_boxes)):
    sized = im.resize((round(cw * scale), round(ch * scale)), resampling)
    dx = round(target_center - (body[0] + body[2]) / 2 * scale)
    dy = round(target[3] - box[3] * scale)
    out = Image.new('L', (320, 320))
    out.paste(sized, (dx, dy))
    # Black-source compression and renderer crop thresholds agree; retain fur.
    out = out.point(lambda v: 0 if v < 3 else v)
    raw.extend(out.tobytes())
    registration.append({'cell': i, 'scale': scale, 'dx': dx, 'dy': dy})
raw_path.write_bytes(raw)
receipt_path.write_text(json.dumps({'sheetSize': sheet.size, 'targetBounds': target, 'registration': registration}, indent=2), encoding='utf-8')
