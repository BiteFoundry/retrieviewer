"""Offline extraction/registration of built-in imagegen's authored cells.

No drawing, body compositing, per-frame scale fitting or runtime Python dependency.
"""
import json
import sys
import math
from pathlib import Path
from PIL import Image

sheet_path, neutral_path, stage_path = map(Path, sys.argv[1:4])
wall = '--wall' in sys.argv[4:]
sheet = Image.open(sheet_path).convert('L')
if sheet.width < 512 or sheet.height < 512:
    raise ValueError('Authored sheet is too small')
neutral = Image.frombytes('L', (320, 320), neutral_path.read_bytes())
columns, rows = 3, 3 if wall else 2
cw, ch = math.ceil(sheet.width / columns), math.ceil(sheet.height / rows)
cells = []
for i in range(columns * rows):
    # Round real sheet boundaries explicitly, padding fractional pixel differences.
    # Never assume a requested grid is an integer atlas or bbox-fit each puppy.
    box = (round(i % columns * sheet.width / columns), round(i // columns * sheet.height / rows), round((i % columns + 1) * sheet.width / columns), round((i // columns + 1) * sheet.height / rows))
    cell = Image.new('L', (cw, ch))
    cell.paste(sheet.crop(box), (0, 0))
    cells.append(cell)

def bounds(im):
    return im.point(lambda v: 255 if v > 16 else 0).getbbox()

def support(im):
    box = bounds(im)
    y = box[3] - 4
    xs = [x for x in range(im.width) if (any(im.getpixel((x, yy)) > 32 for yy in range(max(0,box[3]-14),box[3]-2)) if wall else im.getpixel((x, y)) > 32)]
    runs = []
    for x in xs:
        if not runs or x > runs[-1][-1] + 1:
            runs.append([])
        runs[-1].append(x)
    if wall:
        # Both rear soles carry the raised puppy. Ignore tiny fur runs.
        soles = [r for r in runs if len(r) >= 3]
        if len(soles) < 2:
            raise ValueError('Expected two separate planted paw runs')
        soles = sorted(sorted(soles, key=len, reverse=True)[:2], key=lambda r: r[0])
        return (sum((r[0] + r[-1]) / 2 for r in soles) / 2, box[3])
    # The viewer-right forepaw remains down. Rear toes are above this row.
    run = next(r for r in reversed(runs) if len(r) >= 3)
    return ((run[0] + run[-1]) / 2, box[3])

target = bounds(neutral)
source = bounds(cells[0])
scale = (target[3] - target[1]) / (source[3] - source[1])
anchor = support(neutral)
resample = getattr(Image, 'Resampling', Image).LANCZOS
raw, records = bytearray(), []
stage_path.mkdir(parents=True, exist_ok=True)
for i in range(columns * rows):
    # One common scale for the entire batch, with whole-frame translation only.
    sized = cells[i].resize((round(cw * scale), round(ch * scale)), resample)
    planted = support(sized)
    dx, dy = round(anchor[0] - planted[0]), round(anchor[1] - planted[1])
    out = Image.new('L', (320, 320))
    out.paste(sized, (dx, dy))
    out = out.point(lambda v: 0 if v < 3 else v)
    out.save(stage_path / ('key-%02d.png' % i))
    raw.extend(out.tobytes())
    records.append({'cell': i, 'scale': scale, 'dx': dx, 'dy': dy, 'planted': support(out), 'bounds': bounds(out)})
(stage_path / 'keys.gray').write_bytes(raw)
(stage_path / 'registration.json').write_text(json.dumps({'sheetSize': sheet.size, 'columns': columns, 'rows': rows, 'scale': scale, 'plantedTarget': anchor, 'keys': records}, indent=2) + '\n', encoding='utf-8')
