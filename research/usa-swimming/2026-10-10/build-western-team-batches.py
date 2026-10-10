import json,re,html,unicodedata
from pathlib import Path
from collections import Counter,defaultdict
from datetime import datetime,timezone
ROOT=Path(__file__).parent
ts=json.loads((ROOT/'western-teams-prepared.json').read_text())
base=json.loads((ROOT/'western-team-sources.json').read_text())
national=json.load(open('/private/tmp/usa-clubs.json'))
checks={r['requestedUrl']:r for r in json.loads((ROOT/'western-team-website-checks.json').read_text())}
fixed=json.loads((ROOT/'western-team-fixed-sites.json').read_text())
supp=json.loads((ROOT/'western-team-alaska-supplement.json').read_text())
names={r['code']:r['name'] for r in base['lscs'] if 'name' in r}
date='2026-10-10'; nationalUrl='https://www.usaswimming.org/find-a-team'
aksrc='https://www.gomotionapp.com/wzaslsc/UserFiles/Image/QuickUpload/january-2026-club-list_098713.pdf'
akrows=json.load(open('/private/tmp/ak-rows.json'))
oldak={t['code']:t for t in ts if t['lsc']=='AK'}
ts=[t for t in ts if t['lsc']!='AK']
for code,r in akrows.items():
 t=oldak.get(code,oldak.get('KFK')if code=='KKF' else None)
 if t is None:t=dict(lsc='AK',code=code,name=r['name'],text=r['text'],source=aksrc,website=None,geo=None,status=None,area=None)
 else:t.update(code=code,name=r['name'],text='Email: '+r['email']+' Phone: '+r['phone']);t.pop('nameConflict',None)
 rows=[x for x in national if x['clubName']==r['name'] or (code=='KKF' and x['clubName']=='Kodiak Kingfishers')]
 if rows:t['nationalMatch']=dict(key=rows[0]['orgUnitKey'],score=1,name=rows[0]['clubName'],rows=rows)
 ts.append(t)
for name,code,web,source,area in [
 ('Nome Northstar Swim Team','NNST','https://www.gomotionapp.com/team/aknnst/page/home','https://www.gomotionapp.com/team/aknaac/page/teams','Northern Area'),
 ('Valdez Torpedoes Swim Club',None,'https://www.gomotionapp.com/team/akvtsc/page/home','https://www.gomotionapp.com/team/akcas/page/central-area-teams','Central Area')]:
 rows=[r for r in national if r['clubName']==name]
 t=dict(lsc='AK',code=code,name=name,text='',source=source,website=web,geo=None,status=None,area=area,nationalMatch=dict(key=rows[0]['orgUnitKey'],score=1,name=name,rows=rows))
 ts.append(t)
# Public team sources replace directory domains that now contain unrelated content.
corrections={
 ('HI','AUL'):('https://www.gomotionapp.com/team/hiasc/page/club-info','Aulea Swim Club is a USA Swimming club based in Kailua, on Oahu’s Windward side. It offers introductory and competitive groups.'),
 ('OR','GCST'):('https://www.gomotionapp.com/team/orgcst/page/home',None),
 ('PC','YPAC'):('https://www.ymcasf.org/program/swim-team/','YMCA Pacific Aquatic Club is a year-round USA Swimming youth team at the Presidio YMCA in San Francisco, serving swimmers ages 6–18.'),
 ('OR','APEX'):('https://www.apexaquatics.captynsites.com/','APEX Aquatics is an Oregon swimming network that brings together Canby Swim Club, Chehalem Swim Team, and Tigard Tualatin Swim Club.')
}
for t in ts:
 if t['lsc']=='CA':
  redirects=json.loads((ROOT/'western-team-sources-regional.json').read_text())
  t['source']=next((r['metadata']['url']for k,r in redirects.items()if k.startswith('CA')and r['metadata']['sourceURL']==t['source']),t['source'])
 rows=t.get('nationalMatch',{}).get('rows',[])
 if not t['website']:t['website']=next((r['websiteAddress']for r in rows if r.get('websiteAddress')),None)
 if not t['geo'] and rows:t['geo']='; '.join(sorted(set(r['city']+', '+r['stateCode']for r in rows if r['city'])))
 if (t['lsc'],t['code'])in corrections:
  t['oldWebsite']=t['website'];t['website'],t['customSummary']=corrections[(t['lsc'],t['code'])]
 if t['website'] and ('@'in t['website'] or t['website'].rstrip('/')=='https://www.gomotionapp.com'):
  t['invalidWebsite']=t['website'];t['website']=None
 if t['lsc']=='AK' and t['code']=='CWSC':
  t['name']='Craig Waverunners Swim Club';t['website']='https://www.gomotionapp.com/team/akcwsc/page/home'
 if t['lsc']=='SN' and t['code']=='TAC':t['name']='Turlock Aquatic Club'
 if t['lsc']=='SN' and t['code']=='SSST':t['name']='South Siskiyou Swim Team'
 if t['lsc']=='SN' and t['code']=='WINN':t['name']='Winnemucca Whitewater Swim Team'
 if t['lsc']=='CC' and t['code']=='FDST':t['name']='Fresno Dolphins Swim Team'
def slug(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).lower()).strip('-')
def sid(t):return 'usa-team-'+t['lsc'].lower()+'-'+slug(t['code']or t['name'])
def emails(text):
 text=html.unescape(text.replace('\\_','_'))
 return sorted(set(e.lower()for e in re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',text)))
def phone(text):
 p=re.search(r'(?<!\d)(?:\+?1[- .]?)?\(?\d{3}\)?[- .]\d{3}[- .]\d{4}(?!\d)',text)
 return p[0] if p else None
def source(url,title,note=None):
 r=dict(url=url,title=title,checkedAt=date)
 if note:r['note']=note
 return r
records=[]; seen=set()
for t in ts:
 id=sid(t); assert id not in seen,id;seen.add(id)
 gaps=[]
 srcs=[source(t['source'],names[t['lsc']]+' — official club directory / roster')]
 rows=t.get('nationalMatch',{}).get('rows',[])
 contacts=[]
 text=t['text']
 # Avoid following roster blocks leaking into the next club's contacts.
 if t['lsc']=='NM':
  text=re.split(r'\n\n(?:\[\*\*|\*\*)',text)[0]
 for email in emails(text):
  contacts.append(dict(role='Public LSC-directory contact',email=email,url=t['source']))
 p=phone(text)
 if p:contacts.append(dict(role='Public LSC-directory contact',phone=p,url=t['source']))
 if rows:
  srcs.append(source(nationalUrl,'USA Swimming — Find a Team','Public club-map data; facilities consolidated by USA Swimming organization key. The map does not expose LSC or club code. LSC relationship comes from the LSC/team source.'))
  if t.get('nationalMatch',{}).get('score',1)<1 and t['name']!=t['nationalMatch']['name']:
   gaps.append('Name variation: LSC lists '+t['name']+'; USA Swimming lists '+t['nationalMatch']['name']+'.')
  for r in rows:
   c=dict(role='Public USA Swimming directory contact',url=nationalUrl)
   if r.get('contactName'):c['name']=r['contactName']
   if r.get('contactEmailAddress') and re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',r['contactEmailAddress']):c['email']=r['contactEmailAddress']
   if r.get('contactPhoneNumber') and re.fullmatch(r'\d{10,11}',r['contactPhoneNumber']):c['phone']=r['contactPhoneNumber']
   if len(c)>2 and c not in contacts:contacts.append(c)
 website=t['website']
 if website and not website.startswith('http'):website='https://'+website
 if website:
  check=checks.get(website,{})
  if website in fixed:
   d=fixed[website]; srcs.append(source(website,d['metadata'].get('title')or t['name']+' — official team page'))
   for email in emails(d['markdown']):
    # Only the team-specific visiting contact in the mixed YMCA page.
    if t['code']=='YPAC':continue
    if email not in [c.get('email')for c in contacts]:contacts.append(dict(role='Public team website contact',email=email,url=website))
  elif check.get('status')==200 and check.get('title') and len(check.get('text',''))>200:
   srcs.append(source(website,check['title'],('Redirects to '+check['url'])if check.get('url')!=website else None))
   # Capture public mailto contacts only on team pages with a readable identity.
   for email in check.get('emails',[]):
    if re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',email) and not any(x in email.lower()for x in ['support@sportsengine','privacy','webmaster','adobe','info@teamunify','support@captyn']):
     if email.lower()not in [c.get('email')for c in contacts]:contacts.append(dict(role='Public team website contact',email=email.lower(),url=website))
  else:gaps.append('Website is linked by an official directory, but readable team content could not be independently verified on '+date+'.')
 else:gaps.append('Official team website not established from available sources.')
 if not t['code']:gaps.append('USA Swimming club code / official abbreviation not established; none inferred.')
 if t.get('invalidWebsite'):gaps.append('Directory website value is malformed or points only to a platform homepage; it was not used as the official website.')
 if t.get('oldWebsite') and t['oldWebsite']!=website and t['code']in ['AUL','GCST','YPAC']:
  gaps.append('The LSC directory’s former website now serves unrelated content; replaced with a verified official team/parent page.')
 if t.get('matchConflict'):gaps.append(t['matchConflict'])
 if not t['geo']:gaps.append('Club-specific service area / location not established from available sources.')
 if not contacts:gaps.append('No public organizational contact established from available sources.')
 if t['lsc']=='SN':
  gaps.append('The 2026 HOD page includes 2025 membership data and a historical roll call. Listing alone does not confirm current registration.')
 if t.get('status')=='No renewal':gaps.append('Hawaiian Swimming marks this club “no renewal”; current active status is unconfirmed.')
 if t['lsc']=='SN' and t['code']=='NSS':gaps.append('Northern Sierra Swimming’s linked website now identifies Roseville CCA. Its relationship to California Capital Aquatics and current standalone status need confirmation.')
 if t['lsc']=='CO' and t['code']=='EVER':gaps.append('Colorado lists Evergreen separately but links to Elevation Athletics. Any merger or distinct registration status remains unconfirmed.')
 if t['lsc']=='OR' and t['code']=='RR':gaps.append('Oregon’s Rogue Rapid listing links to River Road Swim Team’s page. The website assignment is conflicting and must be confirmed.')
 if t['lsc']=='PC' and t['code']=='SSF':gaps.append('Pacific directory phone display and tel link disagree; contact details should be confirmed.')
 if t['lsc']=='NM' and t['code']=='FCAT':gaps.append('The LSC representative’s displayed email and mailto target differ; preserved as separate source-listed contacts.')
 if t['lsc']=='UT' and t['code']in ['CSC','SSC','UVA']:gaps.append('The LSC directory has inconsistent email text and mailto targets; confirmation is needed.')
 if t['lsc']=='AZ' and t['code']=='GM':gaps.append('The LSC email includes an internal space and was not treated as a valid email address.')
 if t['lsc']=='CC' and t['code']=='SOVA':gaps.append('The LSC displays gmail.com but its mailto link uses gmail.con for one contact; both source values are preserved pending confirmation.')
 if t['code'] and '(' in t['code']:gaps.append('The official directory uses a combined club/network code label. A standalone current USA Swimming registration code is not established.')
 rel=[dict(type='member_of_lsc',label='Local Swimming Committee',name=names[t['lsc']],targetId='usa-lsc-'+t['lsc'].lower()),
      dict(type='within_zone',label='National zone through the LSC',name='Western Zone',targetId='usa-zone-western',note='LSC membership in the Western Zone is established by USA Swimming’s national structure.')]
 if t.get('area'):
  area=t['area']
  label='Internal LSC area'
  if t['lsc']=='PC':area='Pacific Swimming Zone '+area;label='Internal Pacific Swimming zone'
  if t['lsc']=='CO':area='Colorado Swimming internal zone '+area;label='Internal Colorado Swimming zone'
  if t['lsc']=='CA':area='Southern California Swimming '+area.title()+' Committee';label='LSC committee'
  rel.append(dict(type='internal_lsc_area',label=label,name=area,note='An internal LSC subdivision; not an additional national zone or an assumed region.'))
 if t['lsc']=='OR':
  code=t['code']
  if code in ['CB(APEX)','CST(APEX)','TTSC']:
   rel.append(dict(type='part_of_network',label='Club network',name='APEX Aquatics',targetId='usa-team-or-apex',note='APEX’s official website names Canby, Chehalem and Tigard Tualatin as its three teams.'))
   srcs.append(source('https://www.apexaquatics.captynsites.com/','APEX Aquatics — Three Teams. One Apex.'))
  if code=='APEX':
   for n,c in [('Canby Swim Club','cb-apex'),('Chehalem Swim Team','cst-apex'),('Tigard Tualatin Swim Club','ttsc')]:
    rel.append(dict(type='contains_team',label='Network team',name=n,targetId='usa-team-or-'+c))
 geo=t['geo']or 'Club-specific coverage not established; listed within '+names[t['lsc']]+'.'
 summary=t.get('customSummary')or (t['name']+' is a swim team/program listed by '+names[t['lsc']]+', a USA Swimming LSC in the Western Zone.'+((' The official directory identifies '+t['status'].lower()+' participation.')if t.get('status')in ['Year round','Seasonal','Collegiate only']else''))
 note='Collected from official LSC/team sources checked '+date+'. Public directory enumeration is distinct from confirmation of current registration.'
 if t['lsc']=='PC':note+=' LSC-listed cities can be mailing addresses rather than pool locations.'
 if t['lsc']=='SN':note+=' Historical membership evidence is explicitly flagged.'
 record=dict(kind='team',title=t['name'],officialName=t['name'],abbreviation=t['code'],abbreviationType='USA Swimming club code'if t['code']else None,organizationType='LSC-listed swim team/program',parentId='usa-lsc-'+t['lsc'].lower(),lscId='usa-lsc-'+t['lsc'].lower(),zoneId='usa-zone-western',website=website,sourceUrl=t['source'],summary=summary,geographicCoverage=geo,coverageNote=note,relationships=rel,contacts=contacts,sources=srcs,gaps=gaps)
 records.append(dict(id=id,lsc=t['lsc'],data=record))
 if t['code'] and '(' in t['code']:record['abbreviationType']='Official LSC directory code label'
# Collapse punctuation/spacing variants within the same LSC.
unique={}
for r in records:
 key=(r['lsc'],re.sub(r'[^a-z0-9]','',r['data']['title'].lower()))
 if key not in unique:unique[key]=r;continue
 old=unique[key]
 for field in ['contacts','sources','gaps']:
  for value in r['data'][field]:
   if value not in old['data'][field]:old['data'][field].append(value)
 old['data']['coverageNote']+=' Duplicate directory name variant consolidated: '+r['data']['title']+'.'
records=list(unique.values())
# Existing Inland Empire records match all 19 directory entries and remain unchanged.
bylsc=defaultdict(list)
for r in records:bylsc[r['lsc']].append(r)
batchdir=ROOT/'western-team-batches';batchdir.mkdir(exist_ok=True)
for lsc,rs in sorted(bylsc.items()):
 rs.sort(key=lambda r:r['data']['title'].lower())
 for start in range(0,len(rs),90):
  portion=rs[start:start+90];part=start//90+1
  b=dict(division='knowledge',scope='Western Zone swim teams — '+names[lsc]+(' — part '+str(part)if len(rs)>90 else''),sourceUrl=portion[0]['data']['sourceUrl'],capturedAt=datetime.now(timezone.utc).isoformat(),coverage='partial',evidence=dict(checkedAt=date,lscCode=lsc,directoryRowsCollected=len(rs),batchRows=len(portion),enumeration='All named rows in the retrieved official directory/roster sources; independent current registration is not guaranteed.',deduplication='Compared against 84 published knowledge records and an empty pending queue; facilities combined by organization key; Inland Empire’s 19 existing teams were retained without duplicates.',remaining='Missing codes, unreachable websites, registration status, and conflicting sources are visible in each record. Sierra Nevada BBST remains name/code unresolved from official evidence.'),writes=[dict(path='knowledge_entries/'+r['id'],after=r['data'])for r in portion])
  (batchdir/(lsc.lower()+'-'+str(part)+'.json')).write_text(json.dumps(b,indent=2))
(ROOT/'western-team-review-data.json').write_text(json.dumps(records,indent=2))
report=dict(checkedAt=date,newTeams=len(records),existingInlandEmpireTeams=19,totalRepresented=len(records)+19,lscs=[dict(code=c,name=names[c],collected=len(rs))for c,rs in sorted(bylsc.items())],batchCount=len(list(batchdir.glob('*.json'))),missingWebsites=sum(not r['data']['website']for r in records),missingCodes=sum(not r['data']['abbreviation']for r in records),missingContacts=sum(not r['data']['contacts']for r in records),sourceCoverage='Partial current coverage; complete enumeration of retrieved named directory rows.',remaining=['Sierra Nevada: BBST appears in the official membership table, but its expanded name/code association is not established by official sources.','National-map-only candidates: Tucson Country Club, Race Pace Club AZ, American Renaissance Academy and MA Swim Academy need direct LSC affiliation verification.','Pacific says more than 120 clubs; its five published internal-zone lists contain 107 unique named clubs. Difference remains unresolved.','Alaska Northern Area lists Delta Greely Tide and Galena White Cap without current registration/contact evidence; not included as current registered clubs.','Sierra Nevada historical roll call does not prove current status. Northern Sierra Swimming’s site now identifies Roseville CCA.','Hawaiian Swimming labels Schofield Sharks no renewal; it remains flagged rather than active.'],decisions=['Decide whether to include expressly inactive or historical-only clubs in the directory. Montana’s eight inactive clubs and Alaska Central Area’s eight past member teams were excluded.','Review whether Northern Sierra Swimming should remain a separate record after confirming its relationship to Roseville CCA.'])
(ROOT/'western-team-coverage.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
