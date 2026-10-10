import json,re,html,difflib,unicodedata
from pathlib import Path
ROOT=Path(__file__).parent
base=json.loads((ROOT/'western-team-sources.json').read_text())
rosters=base['rosters']
for f in ['extra','last','regional']:
    rosters.update(json.loads((ROOT/f'western-team-sources-{f}.json').read_text()))
rosters['IE']=json.loads((ROOT/'western-team-sources-ie.json').read_text())
national=json.load(open('/private/tmp/usa-clubs.json'))
def clean(s):
    s=re.sub(r'!\[[^\]]*\]\([^\n]*?\)','',s)
    s=re.sub(r'\[([^\]]+)\]\([^\n]*?\)',r'\1',s)
    return html.unescape(re.sub(r'\s+',' ',s.replace('<br>',' ').replace('**','').replace('\\','').replace('*',''))).strip(' -»')
def links(s): return re.findall(r'\[([^\]]*)\]\(([^)\s]+)(?:[^)]*)\)',s)
def website(s):
    return next((u for t,u in links(s) if u.startswith('http') and '@' not in u and not any(x in u for x in ['spacer.gif','QuickUpload','contactdisplay.aspx'])),None)
teams=[]
def add(lsc,code,name,text,src,web=None,geo=None,status=None,area=None):
    name=clean(name)
    if not name or name in ['Club','CLUB','Team Name']: return
    if code in ['UN','UNATT']: return
    teams.append(dict(lsc=lsc,code=code or None,name=name,text=text,source=src,website=web,geo=geo,status=status,area=area))
def src(k): return rosters[k].get('metadata',{}).get('sourceURL') or rosters[k].get('metadata',{}).get('url')
# Tables with explicit names and codes.
for k in ['CC','CO-embed','MT','OR','WY','AKpdf']:
    md=rosters[k]['markdown']; inactive=False; status=None
    for line in md.splitlines():
        if 'Inactive Clubs' in line: inactive=True
        if line.startswith('## Seasonal'): status='Seasonal'
        if line.startswith('## Collegiate'): status='Collegiate only'
        if not line.startswith('|'): continue
        c=[x.strip() for x in line.strip('|').split('|')]
        if k=='CC':
            m=re.search(r'\\?\[([A-Z0-9]+)\\?\]',c[0])
            if m: add('CC',m[1],c[0][:m.start()],line,src(k),website(c[4]),clean(c[1]))
        elif k=='CO-embed' and len(c)>=5 and re.fullmatch('[A-Z0-9]+',c[1]) and c[1]!='Code':
            add('CO',c[1],c[0],line,src(k),website(c[0]),None,status or 'Year round',clean(c[3]))
        elif k=='MT' and len(c)>=5 and re.fullmatch('[A-Z0-9]+',clean(c[2])):
            if not inactive: add(k,clean(c[2]),c[1],line,src(k),website(c[3]),clean(c[0])+', Montana')
        elif k=='OR' and len(c)>=5 and re.fullmatch('[A-Z0-9]+(?:\\(APEX\\))?',c[1]):
            add(k,c[1],c[2],line,src(k),website(c[2]),clean(c[3])+', Oregon / southwest Washington')
        elif k=='WY':
            m=re.search(r'^(.*?)\(([A-Z0-9]+)\)',clean(c[0]))
            if m: add(k,m[2],m[1],line,src(k),website(c[0]))
        elif k=='AKpdf' and len(c)>=4 and re.fullmatch('[A-Z0-9]+',c[1]) and c[1] not in ['ASTS']:
            add('AK',c[1],c[0],line,src(k))
# PNS code-first links.
for m in re.finditer(r'\[\\\[([A-Z0-9]+)\\\]([^\]]+)\]\(([^)]+)\)',rosters['PN']['markdown']):
    add('PN',m[1],m[2],m[0],src('PN'),m[3] if m[3]!=src('PN') else None)
# Hawaiian island tables.
island=None
for line in rosters['HI']['markdown'].splitlines():
    if re.search(r'\*\*(Oahu|Maui|Big Island|Kauai) Clubs',line): island=clean(line.split('|')[1])
    if not island or not line.startswith('|'): continue
    c=line.strip('|').split('|'); name=clean(c[0]); m=re.match(r'(.*?)\(([A-Z0-9]+)\)',name)
    if m: add('HI',m[2],m[1],line,src('HI'),website(c[0]),island.replace(' Clubs','')+', Hawaii','No renewal' if 'no renewal' in line else None)
    elif name=='Waikoloa Swim Club': add('HI',None,name,line,src('HI'),None,'Big Island, Hawaii')
# Pacific's internal zone directories.
for k in ['PC1N','PC1S','PC2','PC3','PC4']:
    for line in rosters[k]['markdown'].splitlines():
        if '•' not in line: continue
        first=line.split('•')[0]; m=re.search(r'\(([A-Z0-9]+)\)',clean(first))
        if m: add('PC',m[1],clean(first)[:m.start()],line,src(k),website(first),clean(line.split('•')[1]) if len(line.split('•'))>1 else None,area=k[2:])
# Socal committee tables.
for k in ['CAcoastal','CAdesert','CAeastern','CAmetro','CAorange','CApacific']:
    for line in rosters[k]['markdown'].splitlines():
        if not line.startswith('| ['): continue
        c=line.strip('|').split('|')
        if len(c)==6: add('CA',None,c[0],line,src(k),website(c[2]),clean(c[5]),area=k[2:])
# Block club codes NM.
md=rosters['NM']['markdown']
for m in re.finditer(r'Club Code:\s*([A-Z0-9]+)',md):
    start=md.rfind('\n\n',0,m.start()-2); before=md[:m.start()].rstrip().split('\n\n')[-1]
    end=md.find('Club Code:',m.end()); block=md[m.start():end if end!=-1 else len(md)]
    add('NM',m[1],before,block,src('NM'),website(before),None,'Seasonal' if 'Seasonal' in before else None)
# Snake River: strip markup then locate club headings.
md=rosters['SR']['markdown']; heads=[]
for i,line in enumerate(md.splitlines()):
    if re.search(r'\([A-Z0-9]+\)',clean(line)) and not line.startswith('-'):
        m=re.search(r'(.*?)\(([A-Z0-9]+)\)',clean(line))
        if m and len(m[1])>4: heads.append((i,m[2],m[1],website(line)))
lines=md.splitlines()
for n,(i,code,name,web) in enumerate(heads):
    block='\n'.join(lines[i:heads[n+1][0] if n+1<len(heads) else len(lines)])
    add('SR',code,name,block,src('SR'),web)
# Utah contact rows: code then following name row.
lines=rosters['UT']['markdown'].splitlines()
for i,line in enumerate(lines):
    if not line.startswith('|'): continue
    c=line.strip('|').split('|'); code=clean(c[0])
    if re.fullmatch('[A-Z0-9]{2,5}',code) and code not in ['CLUB','COACH','CONTACT']:
        name=clean(lines[i+1].strip('|').split('|')[0])
        block='\n'.join(lines[i:i+5])
        add('UT',code,name,block,src('UT'))
# SI teams at top-level bullet headings.
md=rosters['SI']['markdown']; part=md[md.find('FIND A CLUB NEAR YOU!'):md.find('YMCA Swim Teams Near You!')]; lines=part.splitlines()
heads=[i for i,l in enumerate(lines) if l.startswith('- ') and not any(l.startswith('- '+x) for x in ['Location:','Pool Location:'])]
for n,i in enumerate(heads):
    line=lines[i]; name=clean(line[2:])
    if 'Head Coach' in name or len(name)<4 or re.match(r'^[0-9]',name): continue
    block='\n'.join(lines[i:heads[n+1] if n+1<len(heads) else len(lines)])
    add('SI',None,name,block,src('SI'),website(line))
# Arizona's official embedded directory has explicit row/column indexes.
for r in json.load(open('/private/tmp/az-rows.json')).values():
    web=r.get('3','')
    if web and not web.startswith('http'): web='https://'+web
    add('AZ',r['0'],r['1'],'Contact: '+r.get('4','')+' Email: '+r.get('5','')+' Phone: '+r.get('6',''),src('AZ-embed'),web or None,r.get('2','')+', Arizona')
# Sierra Nevada's HOD packet includes a historical roll call with names and codes.
packet=json.loads((ROOT/'western-team-sources-sn-packet.json').read_text())
for line in packet['markdown'].splitlines():
    m=re.match(r'\| ([A-Z0-9]+) - ([^|]+)\|',line)
    if m: add('SN',m[1],m[2],line,packet['metadata']['sourceURL'],status='Listed in historical roll call')
add('SR','CSC','Caldwell Swim Club','Team contact: Aryn Davis; Caldwellstingrays@gmail.com; Caldwell, ID 83605',src('SR'),'https://www.caldwellswimclub.com/','Caldwell, Idaho')
add('SR','SAW','Sawtooth Aquatic Club','Head Coach: Nick Gaggiano nick@sawtoothaquatics.com; Owner/Coach Jeff Erwin jeff@sawtoothaquatics.com; 4488 N. Sandpoint Way, Boise, ID 83702',src('SR'),'https://www.sawtoothaquatics.com/','Boise, Idaho')
# IE preserve existing records; actual roster used only to audit separately.
seen={}; merged=[]
for t in teams:
    key=(t['lsc'],t['code'] or t['name'].lower())
    if key in seen:
        old=seen[key]
        if t['geo'] and t['geo']!=old['geo']: old['geo']='; '.join(dict.fromkeys([old['geo'] or '',t['geo']]))
        continue
    seen[key]=t; merged.append(t)
def norm(s): return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).lower().replace('inc','').replace('swimming','swim'))
groups={}
for r in national: groups.setdefault(r['orgUnitKey'],[]).append(r)
states={'AK':['AK'],'AZ':['AZ'],'CC':['CA'],'CO':['CO'],'HI':['HI'],'MT':['MT'],'NM':['NM'],'OR':['OR','WA'],'PN':['WA'],'PC':['CA','NV'],'CA':['CA','NV'],'SI':['CA'],'SN':['CA','NV'],'SR':['ID','NV','OR'],'UT':['UT'],'WY':['WY','NE']}
normalized={key:norm(rows[0]['clubName']) for key,rows in groups.items()}
for t in merged:
    target=norm(t['name']); scored=[]
    for key,rows in groups.items():
        if not any(r['stateCode'] in states[t['lsc']] for r in rows): continue
        name=normalized[key]; score=difflib.SequenceMatcher(None,target,name).ratio()
        if target==name: score=1
        if t['website'] and any(t['website'].rstrip('/').lower()==(r['websiteAddress'] or '').rstrip('/').lower() for r in rows): score=1
        if score>=.86: scored.append((score,key,rows))
    scored.sort(key=lambda x:x[0],reverse=True)
    if scored and (len(scored)==1 or scored[0][0]>scored[1][0]+.05):
        score,key,rows=scored[0]; t['nationalMatch']={'score':score,'key':key,'name':rows[0]['clubName'],'rows':rows}
(ROOT/'western-teams-extracted.json').write_text(json.dumps(merged,indent=2))
from collections import Counter
print('Extracted',len(merged),dict(Counter(t['lsc'] for t in merged)))
print('National matched',sum('nationalMatch'in t for t in merged))
print('Unmatched',[(t['lsc'],t['code'],t['name']) for t in merged if 'nationalMatch'not in t])
