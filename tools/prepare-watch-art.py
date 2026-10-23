"""Offline single-source paw registration; no torso/paw image compositing."""
from PIL import Image
from pathlib import Path
import numpy as np
import json
p=Path('dist/watch-qa')
neutral=np.frombuffer((p/'seat-50.gray').read_bytes(),dtype=np.uint8).reshape(320,320)
raw=(p/'behaviors-source.gray').read_bytes()
frames=[];records=[]
# Match each paw against its canonical seated patch. Registration moves source
# coordinates, never fades two anatomies together or stitches at a horizontal row.
patches=[(105,275,291),(138,278,301),(185,278,301),(218,275,291)]
xx=np.arange(320,dtype=float)
for i in range(162):
 source=np.frombuffer(raw[i*102400:(i+1)*102400],dtype=np.uint8).reshape(320,320)
 result=source.copy()
 if 90<=i<126:
  shifts=[]
  for cx,top,bottom in patches:
   template=neutral[top:bottom,cx-11:cx+12].astype(float)
   template-=template.mean();den=np.linalg.norm(template)
   scores=[]
   for dx in range(-24,25):
    patch=source[top:bottom,cx+dx-11:cx+dx+12].astype(float)
    patch-=patch.mean()
    score=float(np.sum(template*patch)/(den*np.linalg.norm(patch)+1e-9))
    scores.append((score,-abs(dx),dx))
   dx=max(scores)[2]
   k=dx+24
   if 0<k<len(scores)-1:
    a,b,c=[scores[j][0] for j in (k-1,k,k+1)]
    denominator=a-2*b+c
    if denominator< -1e-9:dx+=max(-.5,min(.5,.5*(a-c)/denominator))
   shifts.append(dx)
  knots=[0]+[a[0] for a in patches]+[319]
  locations=[0]+[a[0]+dx for a,dx in zip(patches,shifts)]+[319]
  assert all(a<b for a,b in zip(locations,locations[1:])), 'Crossed paw anchors'
  source_floor=int(np.where(np.any(source[:,90:251]>8,axis=1))[0][-1])
  target_floor=int(np.where(np.any(neutral[:,90:251]>8,axis=1))[0][-1])
  def render():
   result=source.copy();mapped=np.interp(xx,knots,locations)
   for y in range(230,320):
    t=min(1,(y-230)/40);t=t*t*(3-2*t)
    sx=xx+(mapped-xx)*t
    v=min(1,(y-230)/70);v=v*v*(3-2*v)
    sy=min(319,y+(source_floor-target_floor)*v)
    lo=int(sy);hi=min(319,lo+1)
    a=np.interp(sx,xx,source[lo]);b=np.interp(sx,xx,source[hi])
    result[y]=np.rint(a+(b-a)*(sy-lo)).astype(np.uint8)
   return result
  result=render()
  # Refine residual template offsets after the smooth coordinate warp. Always
  # resample the original source, never warp an already warped frame.
  for attempt in range(2):
   offsets=[]
   for cx,top,bottom in patches:
    template=neutral[top:bottom,cx-11:cx+12].astype(float);template-=template.mean()
    scores=[]
    for dx in range(-5,6):
     patch=result[top:bottom,cx+dx-11:cx+dx+12].astype(float);patch-=patch.mean()
     score=float(np.sum(template*patch)/(np.linalg.norm(template)*np.linalg.norm(patch)+1e-9))
     scores.append((score,-abs(dx),dx))
    offsets.append(max(scores)[2])
   if max(abs(dx) for dx in offsets)<=1:break
   for k,dx in enumerate(offsets):locations[k+1]+=dx
   assert all(a<b for a,b in zip(locations,locations[1:])), 'Crossed refined paw anchors'
   result=render()
  if i in (90,107,108,125):result=neutral.copy()
  applied=[locations[k+1]-patches[k][0] for k in range(4)]
  records.append({'frame':i,'pawSourceDx':applied,'sourceFloor':source_floor,'targetFloor':target_floor,'maxDisplacement':max(abs(x) for x in applied)})
 frames.append(result.tobytes())
(p/'behaviors-registered.gray').write_bytes(b''.join(frames))
(p/'paw-registration.json').write_text(json.dumps(records,indent=2)+'\n')
