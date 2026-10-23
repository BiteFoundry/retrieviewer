"""Offline whole-pose registration only. One common scale; no body warping."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,sys
stage=Path(sys.argv[1]);stand=Image.frombytes('L',(320,320),(stage/'stand.gray').read_bytes())
stand.save(stage/'stand-reference.png')
arrive=Image.frombytes('L',(320,320),(stage/'arrive.gray').read_bytes());arrive.save(stage/'arrive-reference.png')
if '--references' in sys.argv:sys.exit(0)
sheet=Image.open(stage/'trot-source.png').convert('L')
bounds=lambda im:im.point(lambda v:255 if v>16 else 0).getbbox()
cells=[sheet.crop((round(i%4*sheet.width/4),round(i//4*sheet.height/3),round((i%4+1)*sheet.width/4),round((i//4+1)*sheet.height/3))) for i in range(12)]
a,b=bounds(arrive),bounds(cells[-1]);scale=(a[3]-a[1])/(b[3]-b[1]);dx=(a[0]+a[2])/2-(b[0]+b[2])/2*scale
frames=[];mouth=[]
for i,cell in enumerate(cells):
    box=bounds(cell);out=Image.new('L',(320,320));dy=300-box[3]*scale
    out.paste(cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.LANCZOS),(round(dx),round(dy)))
    if bounds(out)[0]<4 or bounds(out)[2]>316 or bounds(out)[1]<4:raise RuntimeError('Clipped trot key')
    if i==11:out=arrive
    frames.append(out);out.save(stage/('key-'+str(i)+'.png'))
# Four distinct diagonal phases; the sheet's second row repeats those phases.
# Do not replay that duplicate row as a double step or keep redundant art in RAM.
selected=[0,1,2,6,8,9,10,11]
(stage/'keys.gray').write_bytes(b''.join(frames[i].tobytes() for i in selected))
# Mouth points are measured in the registered image after visual inspection.
motion={'frames':list(range(37,41)),'times':[0,.25,.5,.75],'duration':1,'cyclic':True,'floorOffsets':[0]*4,'mouth':[[198,177],[197,179],[189,178],[190,179]],'registration':{'commonScale':scale,'commonDx':dx,'perPoseScale':False,'bodyCompositing':False,'wholeFrameFloorTranslation':True,'selectedSourceKeys':selected}}
motion['settle']={'frames':list(range(41,45)),'times':[0,.07,.14,.22],'duration':.22,'floorOffsets':[0]*4,'mouth':[[203,179],[194,180],[191,180],[195,183]]}
motion['feet']=[[
    {'id':'fore-left','x':lx,'y':ly,'stance':left},
    {'id':'fore-right','x':rx,'y':ry,'stance':not left}
] for lx,ly,rx,ry,left in [(168,260,220,298,False),(174,267,210,298,False),(164,298,217,260,True),(160,298,216,270,True)]]
(stage/'motion.json').write_text(json.dumps(motion,indent=2),encoding='utf8')
contact=Image.new('RGB',(1280,1035),'#151515');draw=ImageDraw.Draw(contact)
for i,f in enumerate(frames):contact.paste(f,(i%4*320,i//4*345+25));draw.text((i%4*320+8,i//4*345+5),str(i),fill='white')
contact.save(stage/'registered-keys.png')
