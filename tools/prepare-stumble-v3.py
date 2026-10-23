"""Offline registration of approved whole drawings, not anatomical compositing."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json,sys
from collections import deque
stage=Path(sys.argv[1])
entry=Image.frombytes('L',(320,320),(stage/'entry.gray').read_bytes())
exit=Image.frombytes('L',(320,320),(stage/'exit.gray').read_bytes())
entry.save(stage/'entry-reference.png');exit.save(stage/'exit-reference.png')
if '--references' in sys.argv:sys.exit(0)
bounds=lambda im:im.point(lambda v:255 if v>16 else 0).getbbox()
resample=getattr(Image,'Resampling',Image).LANCZOS
def split(file,columns,rows):
    sheet=Image.open(file).convert('L')
    return [subject(sheet.crop((round(i%columns*sheet.width/columns),round(i//columns*sheet.height/rows),round((i%columns+1)*sheet.width/columns),round((i//columns+1)*sheet.height/rows)))) for i in range(columns*rows)]
def subject(cell):
    # Reject only disconnected neighboring-cell wisps outside the subject box.
    w,h=cell.size;pixels=cell.tobytes();seen=bytearray(w*h);best=[];components=[]
    for start,value in enumerate(pixels):
        if value<=8 or seen[start]:continue
        todo=deque([start]);seen[start]=1;component=[]
        while todo:
            k=todo.popleft();component.append(k);x,y=k%w,k//w
            for yy in range(max(0,y-1),min(h,y+2)):
                for xx in range(max(0,x-1),min(w,x+2)):
                    j=yy*w+xx
                    if not seen[j] and pixels[j]>8:seen[j]=1;todo.append(j)
        components.append(component)
        if len(component)>len(best):best=component
    box=(max(0,min(k%w for k in best)-8),max(0,min(k//w for k in best)-8),min(w,max(k%w for k in best)+9),min(h,max(k//w for k in best)+9))
    near=Image.new('L',(w,h));mask=bytearray(w*h)
    for k in best:mask[k]=255
    near.frombytes(bytes(mask));near=near.filter(ImageFilter.MaxFilter(17));neighbors=near.tobytes();clean=bytearray(pixels)
    # Tiny isolated sheet artifacts, not body parts or nearby fine fur.
    for component in components:
        if len(component)<128 and not any(neighbors[k] for k in component):
            for k in component:clean[k]=0
    cleaned=Image.frombytes('L',(w,h),bytes(clean))
    out=Image.new('L',(w,h));out.paste(cleaned.crop(box),box[:2]);return out
generated=split(stage/'breakdowns-source.png',4,3)
approved=split(Path('dist/stumble-originals-v3/04-rear-three-quarter.png'),2,2)
a,b=bounds(entry),bounds(generated[0]);scale=(a[3]-a[1])/(b[3]-b[1])
dx=(a[0]+a[2])/2-(b[0]+b[2])/2*scale
def fit_x(batch,s,x):
    left=min(bounds(im)[0] for im in batch)*s;right=max(bounds(im)[2] for im in batch)*s
    if right-left>304:raise RuntimeError('Authored clip exceeds fixed source width')
    return max(8-left,min(312-right,x))
dx=fit_x(generated,scale,dx)
def place(im,s,x,y):
    out=Image.new('L',(320,320));out.paste(im.resize((round(im.width*s),round(im.height*s)),resample),(round(x),round(y)));return out
frames=[place(im,scale,dx,300-bounds(im)[3]*scale) for im in generated]
# Register the APPROVED original batch to its corresponding breakdown key ONCE.
# Do not refit each pose's silhouette or freeze/copy body parts.
c,d=bounds(generated[2]),bounds(approved[0]);approved_scale=scale*(c[3]-c[1])/(d[3]-d[1])
approved_dx=dx+(c[0]+c[2])/2*scale-(d[0]+d[2])/2*approved_scale
approved_dx=fit_x(approved,approved_scale,approved_dx)
for i,key in enumerate([2,4,6,8]):frames[key]=place(approved[i],approved_scale,approved_dx,300-bounds(approved[i])[3]*approved_scale)
frames[0]=entry;frames[-1]=exit
for i,frame in enumerate(frames):
    box=bounds(frame)
    if box[0]<4 or box[2]>316 or box[1]<4 or box[3]>305:raise RuntimeError('Clipped source pose '+str(i))
(stage/'keys.gray').write_bytes(b''.join(f.tobytes() for f in frames))
registration={'commonScale':scale,'commonDx':dx,'wholeFrameFloorTranslations':True,'approvedBatchScale':approved_scale,'approvedBatchDx':approved_dx,'approvedOriginalKeys':[2,4,6,8],'perPoseScale':False,'bodyCompositing':False,'nonlinearWarp':False,'exactSourceEndpoints':True}
motion={'frames':list(range(25,37)),'times':[0,.055,.11,.17,.23,.29,.36,.43,.50,.59,.70,.82],'duration':.82,'floorOffsets':[0]*12,'entryView':'rear','entryPhase':.25,'trajectory':'single-pass-target','brakeSeconds':.27,'catchSeconds':.36,'catchSpeedRatio':.18,'registration':registration}
(stage/'motion.json').write_text(json.dumps(motion,indent=2),encoding='utf8')
contact=Image.new('RGB',(4*320,3*345),'#151515');draw=ImageDraw.Draw(contact)
for i,f in enumerate(frames):
    f.save(stage/('key-'+str(i)+'.png'));contact.paste(f,(i%4*320,i//4*345+25));draw.text((i%4*320+8,i//4*345+5),str(i)+(' approved' if i in [2,4,6,8] else ''),fill='white')
contact.save(stage/'registered-keys.png')
