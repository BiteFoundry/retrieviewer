"""Offline registration of approved sleeping originals; never imported at runtime."""
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
stage = root / 'dist/sleep-studies-v1'
resample = getattr(Image, 'Resampling', Image).LANCZOS
records = []
raw = bytearray()
# Widths reflect posture, not camera zoom. Register every ground plane at y=300.
for key, width in [('side', 254), ('belly', 224), ('curl', 216), ('chin', 198)]:
    source = Image.open(stage / (key + '-source.png')).convert('L')
    box = source.point(lambda v: 255 if v > 12 else 0).getbbox()
    crop = source.crop(box)
    scale = width / crop.width
    sized = crop.resize((width, round(crop.height * scale)), resample)
    frame = Image.new('L', (320, 320))
    frame.paste(sized, ((320-width)//2, 300-sized.height))
    frame = frame.point(lambda v: 0 if v < 3 else v)
    raw.extend(frame.tobytes())
    records.append({'key': key, 'sourceBounds': box, 'width': width, 'scale': scale, 'ground': 300})
(stage / 'sleep-registered.gray').write_bytes(raw)
(stage / 'sleep-registration.json').write_text(json.dumps(records, indent=2), encoding='utf8')
