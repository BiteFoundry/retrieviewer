"""Register existing watch drawings; never scale the dog or invent new anatomy."""
from PIL import Image
from pathlib import Path
import math
p=Path('dist/watch-qa')
neutral=Image.frombytes('L',(320,320),(p/'seat-50.gray').read_bytes())
raw=(p/'behaviors-source.gray').read_bytes()
frames=[]
for i in range(162):
 im=Image.frombytes('L',(320,320),raw[i*102400:(i+1)*102400])
 if 90<=i<126:
  # Each 2-edge clip goes neutral -> turned -> neutral. Source shoulders and
  # paws drift; retain canonical pixels below the neck, not bounding-box fits.
  t=((i-90)%18)/17
  amount=math.sin(math.pi*t)**2
  # The source lifts the crown ~8px during yaw. A translation of the head,
  # NOT whole-body scaling, keeps its crown on the same seated eye-line.
  shift=round(8*amount)
  head=Image.new('L',(320,320));head.paste(im,(0,shift))
  mask=Image.new('L',(320,320))
  mask.putdata([round(255*max(0,min(1,(210-y)/30))) for y in range(320) for x in range(320)])
  im=Image.composite(head,neutral,mask)
  if i in (90,107,108,125):im=neutral.copy()
 frames.append(im.tobytes())
(p/'behaviors-registered.gray').write_bytes(b''.join(frames))
