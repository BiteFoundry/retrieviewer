from PIL import Image, ImageDraw
from pathlib import Path
p=Path('dist/watch-qa')
files=[f for f in p.glob('*.gray') if f.stem.split('-')[-1].isdigit()]
files.sort(key=lambda f:(f.stem.startswith('behaviors'),int(f.stem.split('-')[-1])))
out=Image.new('RGB',(5*320,3*350),'#171717')
d=ImageDraw.Draw(out)
for i,f in enumerate(files):
 im=Image.frombytes('L',(320,320),f.read_bytes())
 out.paste(im,(i%5*320,i//5*350+25));d.text((i%5*320+8,i//5*350+5),f.stem,fill='white')
out.save(p/'sources.png')
Image.frombytes('L',(320,320),(p/'seat-50.gray').read_bytes()).save(p/'seat-reference.png')
