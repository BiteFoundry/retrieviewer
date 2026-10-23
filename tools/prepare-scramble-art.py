"""Uniform-scale whole-pose registration. No anatomical masks or warps."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
import sys
from collections import deque
stage=Path(sys.argv[1])
sheet=Image.open(stage/'sheet-source.png').convert('L')
base=Image.frombytes('L',(320,320),(stage/'stand.gray').read_bytes())
cells=[sheet.crop((round(i%4*sheet.width/4),round(i//4*sheet.height/2),round((i%4+1)*sheet.width/4),round((i//4+1)*sheet.height/2))) for i in range(8)]
# Equal grid cuts can include an isolated wisp from the neighboring drawing.
# Keep the bounding box of the largest connected subject, with a fur margin.
def subject(cell):
    w,h=cell.size;pixels=cell.tobytes();seen=bytearray(w*h);best=[]
    for start,value in enumerate(pixels):
        if value<=8 or seen[start]:continue
        queue=deque([start]);seen[start]=1;component=[]
        while queue:
            k=queue.popleft();component.append(k);x,y=k%w,k//w
            for yy in range(max(0,y-1),min(h,y+2)):
                for xx in range(max(0,x-1),min(w,x+2)):
                    j=yy*w+xx
                    if not seen[j] and pixels[j]>8:seen[j]=1;queue.append(j)
        if len(component)>len(best):best=component
    box=(max(0,min(k%w for k in best)-2),max(0,min(k//w for k in best)-2),min(w,max(k%w for k in best)+3),min(h,max(k//w for k in best)+3))
    out=Image.new('L',(w,h));out.paste(cell.crop(box),box[:2]);return out
cells=[subject(cell) for cell in cells]
bounds=lambda image:image.point(lambda v:255 if v>12 else 0).getbbox()
target=bounds(base);first=bounds(cells[0]);scale=(target[2]-target[0])/(first[2]-first[0])
dx=(target[0]+target[2])/2-(first[0]+first[2])/2*scale
resample=getattr(Image,'Resampling',Image).LANCZOS
keys=[];records=[]
# Omit the belly-up drawing: this is a short shoulder flop, not a somersault.
for i in [1,2,3,5,6]:
    cell=cells[i];box=bounds(cell);dy=target[3]-box[3]*scale
    frame=Image.new('L',(320,320));frame.paste(cell.resize((round(cell.width*scale),round(cell.height*scale)),resample),(round(dx),round(dy)))
    keys.append(frame);records.append({'cell':i,'scale':scale,'dx':round(dx),'dy':round(dy)})
(stage/'keys.gray').write_bytes(b''.join(k.tobytes() for k in keys)+base.tobytes())
contact=Image.new('RGB',(3*320,2*345),'#171717');draw=ImageDraw.Draw(contact)
for i,key in enumerate([base,*keys]):
    contact.paste(key,(i%3*320,i//3*345+25));draw.text((i%3*320+8,i//3*345+5),str(i),fill='white')
contact.save(stage/'registered-keys.png')
(stage/'registration.json').write_text(json.dumps({'wholeBodyArt':True,'nonlinearWarp':False,'bodyCompositing':False,'commonScale':scale,'keys':records},indent=2),encoding='utf8')
