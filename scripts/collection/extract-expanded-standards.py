"""Reproduce reviewed standards captures. Uses source-specific layouts, never converts cuts.
Run with the bundled Python (pdfplumber). Outputs records + evidence, never publishes.
"""
from pathlib import Path
import json,re,hashlib
from decimal import Decimal

ROOT=Path('research/expanded-standards-2026-10-13')
SOURCES={s['id']:s for s in json.loads((ROOT/'sources.json').read_text())}
for source in SOURCES.values():
 assert hashlib.sha256((ROOT/(source['id']+'.pdf')).read_bytes()).hexdigest()==source['sha256'],source['id']
OUT=ROOT/'prepared';OUT.mkdir(exist_ok=True)
REPORT=[]
TIERS=['B','BB','A','AA','AAA','AAAA']
TIME=r'(?:\d+:)?\d+[.,]\d{2}'

def time_ms(t):
 t=t.replace(',','.')
 assert re.fullmatch(r'(?:\d+:)?\d+\.\d{2}',t),t
 parts=t.split(':');assert len(parts)==1 or Decimal(parts[-1])<60,t
 return int(sum(Decimal(p)*60**i for i,p in enumerate(reversed(parts)))*1000)

def new(source,id,name,start,end,category='championship',kind=None):
 s=SOURCES[source]
 record=dict(id=id,name=name,category=category,governingBody='USA_Swimming' if source.startswith('usas') else 'Western_Zone',seasonYears='2024–2028' if category=='motivational' else ('2025–2028' if '2025-2028' in source else re.search(r'20\d{2}',name)[0]),effectiveDate=start,expirationDate=end,sourceUrl=s['url'],cuts={})
 if kind:record['standardType']=kind
 evidence=dict(sourceSha256=s['sha256'],capturedAt=s['capturedAt'],sourceUrl=s['url'],method='Source-specific row extraction with course/gender headers checked against PDF rendering; no time conversions.',rows=[],notes=[],datePolicy='Library availability starts at the published qualifying start where supplied, otherwise the verification date; ends on final meet day (not the entry deadline). Multi-year editions use the stated edition period. Actual entry rules and qualifying windows remain in the source.')
 return record,evidence

def add(pair,course,gender,age,event,tier,t,page):
 if t.lower() in ['x','n/a']:return
 record,evidence=pair
 matrix=record['cuts'].setdefault(course,{}).setdefault(gender,{}).setdefault(age,{})
 key=event+'_'+course;cuts=matrix.setdefault(key,dict(cutsByTier=[]))['cutsByTier']
 assert not any(c['tierName']==tier for c in cuts),(record['id'],key,age,tier)
 ms=time_ms(t);cuts.append(dict(tierName=tier,timeMs=ms,timeDisplay=t.replace(',','.')))
 evidence['rows'].append(dict(page=page,course=course,gender=gender,ageGroup=age,eventCode=key,tier=tier,sourceTime=t,timeMs=ms))

def save(pair,expected=None):
 record,evidence=pair;count=len(evidence['rows'])
 if expected is not None:assert count==expected,(record['id'],count,expected)
 assert count>0
 for genders in record['cuts'].values():
  for ages in genders.values():
   for events in ages.values():
    for value in events.values():value['cutsByTier'].sort(key=lambda c:c['timeMs'])
 evidence['cutCount']=count
 for suffix,data in [('.json',record),('.evidence.json',evidence)]: (OUT/(record['id']+suffix)).write_text(json.dumps(data,indent=2)+'\n')
 REPORT.append(dict(id=record['id'],name=record['name'],cuts=count,status='prepared',sourceUrl=record['sourceUrl']))
 print(record['id'],count)

def distance(label,course):
 if 'x' in label.lower():return str(4*int(label.lower().split('x')[1]))
 if '/' in label:
  left,right=label.split('/');return right if course=='SCY' else str(int(left)*100 if len(left)==1 else int(left))
 return label

def national(source,name,start,end,default_age='Open',text=None,expected=None):
 pair=new(source,source.replace('-','_'),name,start,end)
 text=text if text is not None else (ROOT/(source+'.txt')).read_text()
 for page,block in enumerate(text.split('\f'),1):
  age='19&O' if re.search(r'19\s*&\s*OVER',block) else '18&U' if re.search(r'18\s*&\s*(UNDER|U)',block) else default_age
  tier='Bonus' if 'BONUS STANDARDS' in block else 'Qualifying'
  for line in block.splitlines():
   line=re.sub(r':\s+',':',line).replace('2001M','200 IM').replace('4001M','400 IM')
   m=re.fullmatch(r'('+TIME+r'|x) ('+TIME+r'|x) (\d+(?:/\d+)?|4x\d+) (FR-R|MED-R|FR|BK|BR|FL|IM) ('+TIME+r'|x) ('+TIME+r'|x)',line,re.I)
   if not m:
    if re.match(TIME+r' ',line):raise ValueError(('Unparsed national row',source,page,line))
    continue
   fs,fl,dist,stroke,ml,ms=m.groups();stroke=stroke.upper()
   special=tier+' (400 relay time)' if dist=='4x50' and (fl!='x' or ml!='x') else tier
   for course,gender,t in [('SCY','F',fs),('LCM','F',fl),('LCM','M',ml),('SCY','M',ms)]:add(pair,course,gender,age,distance(dist,course)+'_'+stroke,special,t,page)
  pair[1]['notes'].extend(l for l in block.splitlines() if l.startswith('*'))
 if 'winter' in source:
  pair[0]['gaps']=['Official PDF page 2 prints men’s 400m freestyle Bonus as 4:37.09, equal to the SCY 500 cut and slower than the qualifying 4:04.99. Preserved exactly; verify with USA Swimming before relying on this value.']
  pair[1]['notes']+=pair[0]['gaps']
 pair[1]['calendarSource']='https://www.usaswimming.org/events'
 save(pair,expected)

# National editions: published qualifiers remain distinct from edition availability.
national('usas-2026-toyota-national-championships-time-standards','2026 Toyota National Championships','2025-06-01','2026-08-01',expected=136)
national('usas-2026-tyr-futures-championships-time-standards','2026 TYR Futures Championships','2025-06-01','2026-08-01',expected=142)
national('usas-2026-speedo-junior-national-championships-time-standards','2026 Speedo Junior National Championships','2025-06-01','2026-08-07',default_age='18&U',expected=152)
national('usas-2027-tyr-pro-swim-series-nashville-westmont-time-standards','2027 TYR Pro Swim Series — Nashville & Westmont','2026-10-13','2027-03-06',expected=136)
national('usas-2027-tyr-pro-swim-series-fort-lauderdale-time-standards','2027 TYR Pro Swim Series — Fort Lauderdale','2026-10-13','2027-04-24',expected=136)
national('usas-2026-speedo-winter-junior-championships-time-standards','2026 Speedo Winter Junior Championships','2025-11-01','2026-12-12',default_age='18&U',text=(ROOT/'winter-juniors-transcription.txt').read_text(),expected=124)
usopen=(ROOT/'us-open-page1-transcription.txt').read_text()+'\f'+(ROOT/'usas-2026-toyota-u-s-open-championships-time-standards.txt').read_text().split('\f')[1]
national('usas-2026-toyota-u-s-open-championships-time-standards','2026 Toyota U.S. Open Championships','2025-11-01','2026-12-05',text=usopen,expected=136)
# National maximums are not the specific Western Sectional cuts.
national('usas-2026-speedo-sectionals-time-standards','2026 Speedo Sectionals — National Maximum Standards','2025-06-01','2026-12-31',expected=74)

# Single-age and disability parallel tables have independent identities and benchmark scope.
source='usas-2028-motivational-standards-single-age'
pair=new(source,'usas_motivational_single_age_2024_2028','2024–2028 USA Swimming Single-Age Motivational Standards','2024-09-01','2028-08-31','motivational','single-age')
for page,block in enumerate((ROOT/(source+'.txt')).read_text().split('\f'),1):
 age=None
 for line in block.splitlines():
  h=re.fullmatch(r'(\d+) Girls Event \1 Boys',line)
  if h:age=h[1];continue
  m=re.search(r'\b(\d+) (FR|BK|BR|FL|IM) (SCY|SCM|LCM)\b',line)
  if not m:
   if re.match(TIME+r' ',line):raise ValueError(('unparsed single age',line))
   continue
  assert age
  ft=re.findall(TIME,line[:m.start()]);mt=re.findall(TIME,line[m.end():]);assert len(ft)==len(mt)==6,line
  for gender,values,tiers in [('F',ft,TIERS),('M',mt,list(reversed(TIERS)))]:
   for tier,t in zip(tiers,values):add(pair,m[3],gender,age,m[1]+'_'+m[2],tier,t,page)
save(pair,5364)
for cls in ['p1','p2','p3']:
 source='usas-2024-2028-swimmers-with-disabilities-parallel-time-standards-'+cls
 pair=new(source,'usas_motivational_para_'+cls+'_2024_2028','2024–2028 USA Swimming Disability Parallel Standards — '+cls.upper(),'2024-10-29','2028-08-31','motivational','para')
 for page,block in enumerate((ROOT/(source+'.txt')).read_text().split('\f'),1):
  # Some age tables continue across page boundaries: retain age/course.
  for line in block.splitlines():
   h=re.search(r'(10&under|11-12|13-14|15-16|17-18) Girls (SCY|SCM|LCM)',line)
   if h:age=h[1].replace('10&under','10&U');course=h[2];continue
   m=re.search(r'\b(\d+)(FR|BK|BR|FL|IM)\b',line)
   if not m:
    if re.match(TIME+r' ',line):raise ValueError(('unparsed para',cls,line))
    if re.match(r'P[123] -',line):pair[1]['notes'].append(line)
    continue
   ft=re.findall(TIME,line[:m.start()]);mt=re.findall(TIME,line[m.end():])
   missing_b=cls=='p3' and page==5 and age=='11-12' and course=='LCM' and m[0]=='100FR'
   assert len(ft)==6 and len(mt)==(5 if missing_b else 6),(cls,line)
   if missing_b:
    pair[0]['gaps']=['Official PDF page 5 leaves boys 11–12 LCM 100 freestyle B blank. No cut is inferred; that selection displays —.']
    pair[1]['notes']+=pair[0]['gaps']
   for gender,values,tiers in [('F',ft,TIERS),('M',mt,list(reversed(TIERS)))]:
    for tier,t in zip(tiers,values):add(pair,course,gender,age,m[1]+'_'+m[2],tier,t,page)
 save(pair,{'p1':2040,'p2':2676,'p3':2963}[cls])

# Western Senior Zones: qualifying + bonus, mirrored male course columns.
source='western-senior-zones-2025-2028';pair=new(source,'western_senior_zones_2025_2028','2025–2028 Western Zone Senior Championships','2024-10-01','2028-08-31')
tier='Qualifying'
for line in (ROOT/(source+'.txt')).read_text().splitlines():
 if 'Bonus' in line: tier='Bonus'
 m=re.search(r'(?<![\d:])(\d+(?:\s*/\s*\d+)?) (FR|BK|BR|FL|IM)\b',line)
 if not m:continue
 left=re.findall(TIME+r'|N/A',line[:m.start()]);right=re.findall(TIME+r'|N/A',line[m.end():]);assert len(left)==len(right)==3,line
 for gender,values,courses in [('F',left,['SCY','SCM','LCM']),('M',right,['LCM','SCM','SCY'])]:
  for t,course in zip(values,courses):add(pair,course,gender,'Open',distance(m[1].replace(' ',''),course)+'_'+m[2],tier,t,1)
pair[1]['notes']=['Qualification period: October 1, 2024 through meet entry deadline. No de-qualification standards. Source decimal comma 34,29 normalized to 34.29.']
save(pair,180)

# Spring Sectionals is a complete, distinct table. Summer remains blocked by malformed source value 58:61.
source='western-sectionals-2027';pair=new(source,'western_spring_sectionals_2027','2027 Spring Western Region Sectionals','2026-10-13','2027-03-21')
block=(ROOT/(source+'.txt')).read_text().split('2027 Summer')[0]
row=0
for line in block.splitlines():
 tokens=line.replace('#','').split()
 if len(tokens) not in (7,8) or not re.fullmatch(TIME,tokens[0]):continue
 row+=1
 left=tokens[:3];right=tokens[-3:];middle=tokens[3:-3];dist=middle[0];stroke=middle[1] if len(middle)>1 else 'Fr'
 relay=row>14;code={'Fr':'FR','FR':'FR-R','Bk':'BK','Br':'BR','Fly':'FL','IM':'IM','MR':'MED-R'}[stroke]
 assert relay == ('-R' in code),(row,line)
 for gender,values in [('F',left),('M',right)]:
  for course,t in zip(['SCY','SCM','LCM'],values):add(pair,course,gender,'Open',distance(dist,course)+'_'+code,'Qualifying',t,1)
pair[1]['notes']=['March 11–14 Four Corners; March 18–21 Pacific Northwest. 800/1000 and 1500/1650 times may be used reciprocally as specified in the source. Spring table only; Summer is a separate edition and is not silently substituted.']
save(pair,114)

# WZ age group 2026: direct published table (do not regenerate from motivational).
source='western-age-group-zones-2026';pair=new(source,'western_age_group_zones_2026','2026 Western Zone Age Group Championships','2025-08-06','2026-08-08')
for page,block in enumerate((ROOT/(source+'.txt')).read_text().split('\f'),1):
 age=['10&U','11-12','13-14'][page-1]
 for line in block.splitlines():
  m=re.search(r'\b(\d+(?:/\d+)?) (Free|Back|Breast|Fly|IM)\b',line)
  if not m:continue
  ft=re.findall(TIME,line[:m.start()]);mt=re.findall(TIME,line[m.end():]);assert len(ft)==len(mt)==3,line
  stroke={'Free':'FR','Back':'BK','Breast':'BR','Fly':'FL','IM':'IM'}[m[2]]
  for gender,values in [('F',ft),('M',mt)]:
   for course,t in zip(['LCM','SCM','SCY'],values):add(pair,course,gender,age,distance(m[1],course)+'_'+stroke,'Qualifying',t,page)
pair[1]['notes']=['2026 edition only. Qualifying August 6, 2025 through July 29, 2026 entry deadline; meet August 5–8, 2026. No de-qualification. Source says AAA standards, but printed table is retained exactly, including any differences from the newer motivational revision.']
save(pair,252)
# Open-water pool entry standards are pool swims, not inferred open-water times.
source='usas-2027-open-water-national-and-junior-national-championships-time-standards'
for page,block in enumerate((ROOT/(source+'.txt')).read_text().split('\f'),1):
 junior=page==2
 pair=new(source,'usas_open_water_'+('junior_' if junior else '')+'nationals_pool_2027','2027 Open Water '+('Junior ' if junior else '')+'Nationals — Pool Qualifying Times','2026-01-01','2027-04-04')
 rows=[re.fullmatch(r'(800|1500|1000|1650) (LCM|SCY) ('+TIME+r'(?: '+TIME+r')*)',line) for line in block.splitlines()]
 rows=[m for m in rows if m];assert len(rows)==8
 for n,m in enumerate(rows):
  times=m[3].split();assert len(times)==(1 if junior else 3)
  choices=[('16&U (AQUA age)','3K knockout / 5K')] if junior else [('Open','10K'),('19&U (AQUA age)','10K'),('Open','3K knockout / 5K')]
  for (age,tier),t in zip(choices,times):add(pair,m[2],'M' if n<4 else 'F',age,m[1]+'_FR',tier,t,page)
 pair[1]['notes']=['Pool qualifying performances for the open-water event named in the tier. AQUA age means age on December 31, 2027. The 19&U 10K is not a separate race.']
 save(pair,8 if junior else 24)
# Keep questionable or structurally unsupported editions local, out of staging.
for item in REPORT:
 if 'winter_junior' in item['id']:item.update(status='withheld',reason='Source Bonus men LCM 400FR is 4:37.09; requires clarification.')
 if 'speedo_junior_national' in item['id']:item.update(status='withheld',reason='200 relays qualify using 400 relay performances; current exact-event schema cannot represent that rule safely.')
(ROOT/'prepared-manifest.json').write_text(json.dumps(REPORT,indent=2)+'\n')
