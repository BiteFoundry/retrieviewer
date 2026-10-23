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
  # Keep the authored head, jaw, neck and bandana together. The former 8px
  # head translation + y180..210 dissolve crossed the bandana and made a
  # second collar/jaw silhouette. Join only below it, through chest fur.
  source=im;im=neutral.copy()
  im.paste(source.crop((0,0,320,230)),(0,0))
  # Match both chest contours BEFORE blending their fur. A flat alpha mask
  # fades fur into black at two different silhouettes, leaving a torn ledge.
  # This offline scanline registration uses one shared contour instead.
  def tone(pic,x,y):
   lo=max(0,min(319,math.floor(x)));hi=min(319,lo+1);t=x-lo
   return pic.getpixel((lo,y))*(1-t)+pic.getpixel((hi,y))*t
  for y in range(230,250):
   t=(y-230)/20;t=t*t*(3-2*t)
   spans=[]
   for pic in (source,neutral):
    xs=[x for x in range(90,251) if pic.getpixel((x,y))>8]
    spans.append((min(xs),max(xs)))
   (sl,sr),(nl,nr)=spans
   left=sl+(nl-sl)*t;right=sr+(nr-sr)*t
   for x in range(min(sl,nl)-2,max(sr,nr)+3):
    if x<left or x>right:im.putpixel((x,y),0);continue
    u=(x-left)/(right-left)
    a=tone(source,sl+u*(sr-sl),y);b=tone(neutral,nl+u*(nr-nl),y)
    im.putpixel((x,y),round(a*(1-t)+b*t))
  if i in (90,107,108,125):im=neutral.copy()
 frames.append(im.tobytes())
(p/'behaviors-registered.gray').write_bytes(b''.join(frames))
