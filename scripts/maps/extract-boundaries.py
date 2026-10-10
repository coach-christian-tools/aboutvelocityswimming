"""Rebuild SVG geometry from USA Swimming's published LSC map PDF.
Usage: python extract-boundaries.py /tmp/lsc-map.pdf
Requires pymupdf. Source and retrieval date travel with generated assets.
"""
import sys, json, re
from pathlib import Path
import pymupdf
OUT = Path('public/maps/swimming')
SOURCE = 'https://www.usaswimming.org/docs/default-source/governance/lsc-maps/lsc-zone-map.pdf'
doc = pymupdf.open(sys.argv[1])
def path(d):
    out=[]; last=None
    def pt(p): return f'{p.x:.2f},{p.y:.2f}'
    for item in d['items']:
        op=item[0]
        if op in ['l','c']:
            if last != item[1]: out.append('M'+pt(item[1]))
            out.append(('L'+pt(item[2])) if op=='l' else 'C'+' '.join(pt(p) for p in item[2:]))
            last=item[-1]
        elif op=='re':
            r=item[1];out.append(f'M{r.x0:.2f},{r.y0:.2f}H{r.x1:.2f}V{r.y1:.2f}H{r.x0:.2f}Z');last=None
        elif op=='qu':
            q=item[1];out.append('M'+pt(q.ul)+'L'+pt(q.ur)+' '+pt(q.lr)+' '+pt(q.ll)+'Z');last=None
    if d['closePath']:out.append('Z')
    return ''.join(out)
def colored(d):
    f=d['fill']; return f and max(f)-min(f)>.1
national=doc[0]; ds=national.get_drawings()
zone_names=['western','eastern','southern','central']
# The first four large colored shapes are the four continental zones.
large=[d for d in ds if colored(d) and d['rect'].width>150 and d['rect'].height>200][:4]
zones=[]
for name,d in zip(zone_names,large):
    shapes=[path(d)]
    if name=='western': shapes += [path(x) for x in ds if colored(x) and x['rect'].x1<342 and x['rect'].y0>410 and x['rect'].width>1]
    zones.append({'id':f'usa-zone-{name}','name':name.title()+' Zone','paths':shapes})
lines=[path(d) for d in ds if not d['fill'] and d['dashes']=='[] 0' and d['width'] in [.5,1] and d['rect'].y0<410 and d['rect'].width+d['rect'].height>8]
labels=[]
for page in range(1,len(doc)):
    p=doc[page]; t=p.get_text(); code=({22:'ME',32:'NE'}.get(page) or re.findall(r'\(([A-Z]{2})\)',t)[0]).lower()
    shapes=[d for d in p.get_drawings() if colored(d) and d['rect'].width>2 and d['rect'].height>2]
    # Ignore colored city labels (text is not included in get_drawings).
    bounds=pymupdf.Rect()
    for d in shapes: bounds |= d['rect']
    detail={'source':SOURCE+f'#page={page+1}','retrieved':'2026-10-10','viewBox':[round(bounds.x0-15,2),round(bounds.y0-15,2),round(bounds.width+30,2),round(bounds.height+30,2)],'paths':[path(d) for d in shapes]}
    (OUT/'lsc'/f'{code}.json').write_text(json.dumps(detail,separators=(',',':')))
    words=[w for w in national.get_text('words') if w[4]==str(page+1)]
    if words:
        w=words[0]; labels.append({'id':f'usa-lsc-{code}','code':code.upper(),'page':page+1,'x':round((w[0]+w[2])/2,2),'y':round((w[1]+w[3])/2,2)})
(OUT/'national.json').write_text(json.dumps({'source':SOURCE,'retrieved':'2026-10-10','zones':zones,'lines':lines,'lscs':labels},separators=(',',':')))
print(len(zones),'zones;',len(labels),'LSC labels;',len(doc)-1,'detail maps')
