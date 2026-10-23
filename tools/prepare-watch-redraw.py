"""Offline preparation from a newly authored WHOLE-BODY head-turn sheet.

One common similarity transform for the entire sheet, never a row-dependent
coordinate warp. Whole drawings remain intact. No torso matte, anatomical
cut-and-paste, optical flow, per-pose zoom or runtime compositing.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

sheet_path, neutral_path, stage = map(Path, sys.argv[1:4])
stage.mkdir(parents=True, exist_ok=True)
sheet = Image.open(sheet_path).convert('L')
neutral = np.frombuffer(neutral_path.read_bytes(), dtype=np.uint8).reshape(320, 320)
cells = [sheet.crop((round(i % 5 * sheet.width / 5), round(i // 5 * sheet.height / 3),
                     round((i % 5 + 1) * sheet.width / 5), round((i // 5 + 1) * sheet.height / 3))) for i in range(15)]
boxes = [cell.point(lambda v: 255 if v > 16 else 0).getbbox() for cell in cells]
target_box = Image.fromarray(neutral).point(lambda v: 255 if v > 16 else 0).getbbox()
scale = (target_box[3] - target_box[1]) / (boxes[7][3] - boxes[7][1])
resample = getattr(Image, 'Resampling', Image).LANCZOS
# Body center is measured below the head, excluding the tail. All keys use this
# same offset. Per-key bbox normalization would pump skull/body volume again.
center = cells[7].crop((round(cells[7].width * .3), round(cells[7].height * .7),
                         round(cells[7].width * .8), cells[7].height)).point(lambda v: 255 if v > 16 else 0).getbbox()
cx = round(cells[7].width * .3) + (center[0] + center[2]) / 2
dx = 160 - cx * scale
dy = target_box[3] - boxes[7][3] * scale
keys = []
for cell, box in zip(cells, boxes):
    registered = Image.new('L', (320, 320))
    # Whole-frame vertical translation registers the actual paw floor. The
    # authored shoulder/chest/elbow weight transfer is never frozen or replaced.
    floor_dy = target_box[3] - box[3] * scale
    registered.paste(cell.resize((round(cell.width * scale), round(cell.height * scale)), resample), (round(dx), round(floor_dy)))
    keys.append(np.asarray(registered).copy())
keys[7] = neutral.copy()
frames = []
source_keys = []
for sign in (1, -1):  # watch-left is the dog's left: viewer right
    for returning in (False, True):
        for s in range(9):
            p = (8 - s if returning else s) / 8 * 7
            # A crossfade of different silhouettes draws two muzzles/shoulders.
            # Hold actual whole-body keys instead; registration and pose timing
            # stay unchanged and the return retraces the exact same drawings.
            source_key = 7 + sign * int(p + .5)
            source_keys.append(source_key)
            frames.append(keys[source_key])
raw = b''.join(frame.tobytes() for frame in frames)
(stage / 'watch-36.gray').write_bytes(raw)
contact = Image.new('RGB', (5 * 320, 3 * 345), '#171717')
draw = ImageDraw.Draw(contact)
for i, key in enumerate(keys):
    contact.paste(Image.fromarray(key), (i % 5 * 320, i // 5 * 345 + 25))
    draw.text((i % 5 * 320 + 8, i // 5 * 345 + 5), str((i - 7) * 4) + ' yaw', fill='white')
contact.save(stage / 'registered-keys.png')
Image.fromarray(keys[7]).save(stage / 'neutral.png')
receipt = {'sourceSize': sheet.size, 'scale': scale, 'dx': dx, 'dy': dy,
           'wholeBodyArt': True, 'bodyCompositing': False, 'collarMatte': False, 'nonlinearWarp': False,
           'perKeyScale': False, 'runtimeCompositing': False, 'pixelBlending': False,
           'sourceKeys': source_keys, 'keys': 15, 'frames': 36}
(stage / 'registration.json').write_text(json.dumps(receipt, indent=2), encoding='utf8')
print(json.dumps(receipt))
