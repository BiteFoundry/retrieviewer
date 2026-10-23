"""Whole-pose format conversion/registration; no anatomical masks or warps."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, sys
from collections import deque
stage=Path(sys.argv[1])
base={name:Image.frombytes('L',(320,320),(stage/(name+'.gray')).read_bytes()) for name in ['plant','stand','rear']}
for name,image in base.items():image.save(stage/(name+'-reference.png'))
if '--references' in sys.argv:sys.exit(0)
bounds=lambda im:im.point(lambda v:255 if v>16 else 0).getbbox()
resample=getattr(Image,'Resampling',Image).LANCZOS
def cells(name):
    sheet=Image.open(stage/(name+'-source.png')).convert('L')
    return [subject(sheet.crop((round(i%4*sheet.width/4),round(i//4*sheet.height/3),round((i%4+1)*sheet.width/4),round((i//4+1)*sheet.height/3)))) for i in range(12)]
def subject(cell):
    # Same largest-subject crop as prepare-scramble-art.py: only discard isolated
    # neighbor-cell wisps outside the subject bounding box, not anatomical parts.
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
def register(frames,reference):
    # One scale for the complete clip; never fit each individual pose's box.
    a,b=bounds(reference),bounds(frames[0]);scale=(a[2]-a[0])/(b[2]-b[0])
    dx=(a[0]+a[2])/2-(b[0]+b[2])/2*scale
    out=[]
    for frame in frames:
        box=bounds(frame);dy=300-box[3]*scale
        image=Image.new('L',(320,320));image.paste(frame.resize((round(frame.width*scale),round(frame.height*scale)),resample),(round(dx),round(dy)));out.append(image)
    return out,{'commonScale':scale,'dx':dx,'wholeFrameFloorTranslation':True,'perPoseScale':False,'bodyCompositing':False}
scramble,reg=register(cells('scramble'),base['plant'])
scramble[0]=base['plant'];scramble[-1]=base['stand']
pickup=cells('pickup')
rear,reg_rear=register(pickup[:6],base['rear']);rear[0]=rear[-1]=base['rear']
side,reg_side=register(pickup[6:],base['stand']);side[0]=side[-1]=base['stand']
keys=[*scramble,*rear,*side]
(stage/'keys.gray').write_bytes(b''.join(k.tobytes() for k in keys))
floor=lambda im:300-(bounds(im)[3]-1)
def motion(start,frames,times):return {'frames':list(range(start,start+len(frames))),'times':times,'duration':times[-1],'floorOffsets':[floor(f) for f in frames]}
motion_scramble=motion(13,scramble,[0,.045,.09,.135,.19,.25,.32,.39,.46,.54,.63,.72])
motion_scramble.update({'entryPhase':12.820930480957031/20,'brakeSeconds':.32,'registration':reg,'method':'forepaw-contact-entry, continuing root momentum, authored whole-body breakdowns'})
motion_scramble['recovery']={'start':.39,'end':.54,'distance':.06,'height':.025}
motions={'scramble':motion_scramble,'pickups':{'rear':motion(25,rear,[0,.09,.18,.28,.4,.52]),'front':motion(31,side,[0,.09,.18,.28,.4,.52])},'registration':{'scramble':reg,'pickupRear':reg_rear,'pickupSide':reg_side}}
# Exact canonical side endpoints use cleanGroundOffset's original calibration,
# not an envelope threshold inferred from fuzzy fur tips.
motions['scramble']['floorOffsets'][-1]=-4
motions['pickups']['front']['floorOffsets'][0]=motions['pickups']['front']['floorOffsets'][-1]=-4
motions['pickups']['front']['mouth']=[[255,151],[250,225],[280,275],[274,287],[268,238],[255,151]]
(stage/'motions.json').write_text(json.dumps(motions,indent=2),encoding='utf8')
contact=Image.new('RGB',(4*320,6*345),'#151515');draw=ImageDraw.Draw(contact)
for i,key in enumerate(keys):
    key.save(stage/('key-'+str(i+13)+'.png'))
    contact.paste(key,(i%4*320,i//4*345+25));draw.text((i%4*320+8,i//4*345+5),str(i+13),fill='white')
contact.save(stage/'registered-keys.png')
