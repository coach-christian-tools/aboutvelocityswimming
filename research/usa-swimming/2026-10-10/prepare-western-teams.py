import json,re,html,hashlib
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).parent
ts=json.loads((ROOT/'western-teams-extracted.json').read_text())
base=json.loads((ROOT/'western-team-sources.json').read_text())
national=json.load(open('/private/tmp/usa-clubs.json'))
snsource='https://www.gomotionapp.com/snslsc/UserFiles/Image/QuickUpload/2026-delegate-numbers_086269.pdf'
for code,name,web,source in [
 ('LIFE','Life Time Northern California','https://www.gomotionapp.com/team/snlftnc/page/home','https://www.gomotionapp.com/team/snslsc/page/safe-sport/sns-safe-sport-recognized-teams'),
 ('SACC','Sacramento Aquatics Club','https://sacramentoaquatics.com','https://sacramentoaquatics.com/resources-links/usa-swimming-registration/'),
 ('TTST','Truckee Tahoe Swim Team','https://www.truckeeswim.com/',snsource),
 ('USA1','TEAMGOLDUSA','https://www.teamgoldusa.com','https://www.gomotionapp.com/team/snslsc/page/safe-sport/sns-safe-sport-recognized-teams')]:
 rows=[r for r in national if r['clubName'].replace('-',' ').lower()==name.lower()]
 t=dict(lsc='SN',code=code,name=name,website=web,source=source,geo=None,text='',status=None,area=None)
 if rows:t['nationalMatch']=dict(score=1,key=rows[0]['orgUnitKey'],name=rows[0]['clubName'],rows=rows)
 ts.append(t)
# Remove suspect name-only matches; team websites remain authoritative for identity.
bad={('SN','LASS'),('SI','San Diego Seaport Aquatics')}
for t in ts:
 if (t['lsc'],t['code'])in bad or (t['lsc'],t['name'])in bad:t.pop('nationalMatch',None)
 if t['lsc']=='NM' and t['code']=='CAQ':t['name']='Charger Aquatics'
 if t['lsc']=='NM' and t['code']=='SCAT':t['name']='Silver City Swordfish Aquatic Team'
 if t['lsc']=='SI':t['name']=t['name'].replace('\u200b','').strip()
 if t['lsc']=='AK' and t['code']=='KFK':
  t['name']='Kodiak Kingfishers';t['nameConflict']='Alaska’s January roster misspells Kodiak as “Kodika”; the national directory names Kodiak Kingfishers.'
 if t['lsc']=='AK' and t['code']=='CWSC':t['nameConflict']='The LSC roster spells the name “Craig Waverrunners”; spelling on the official team site remains unconfirmed.'
 # National map aliases with distinctive identities.
 aliases={('AK','KFK'):'Kodiak Kingfishers',('AK','CI'):'Cordova Iceworms'}
 if (t['lsc'],t['code'])in aliases:
  rows=[r for r in national if r['clubName']==aliases[(t['lsc'],t['code'])]]
  if rows:t['nationalMatch']=dict(score=1,key=rows[0]['orgUnitKey'],name=rows[0]['clubName'],rows=rows)
# A shared facility/map identity must not imply the same club belongs to two LSCs.
bykey={}
for t in ts:
 if 'nationalMatch'in t:bykey.setdefault(t['nationalMatch']['key'],[]).append(t)
for arr in bykey.values():
 if len(set(t['lsc'] for t in arr))>1:
  for t in arr:t.pop('nationalMatch',None);t['matchConflict']='Similar names in different LSCs prevent a unique national-map match; only the LSC directory is used.'
for t in ts:
 rows=t.get('nationalMatch',{}).get('rows',[])
 if not t['website']:t['website']=next((r.get('websiteAddress')for r in rows if r.get('websiteAddress')),None)
 if t['website'] and not t['website'].startswith('http'):t['website']='https://'+t['website']
 if t['website'] and ('gomotionapp.com' in t['website']) and t['website'].rstrip('/')=='https://www.gomotionapp.com':t['website']=None
 t['website']=t['website'].replace(')**','').split(')[**')[0] if t['website']else None
 if t['geo'] in ['CA','NV']:t['geo']=None
 if not t['geo'] and rows:t['geo']='; '.join(sorted(set(r['city']+', '+r['stateCode'] for r in rows if r['city'])))
(ROOT/'western-teams-prepared.json').write_text(json.dumps(ts,indent=2))
print('Prepared',len(ts),dict(Counter(t['lsc']for t in ts)))
print('Websites',sum(bool(t['website'])for t in ts))
