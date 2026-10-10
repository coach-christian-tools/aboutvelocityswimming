import concurrent.futures,datetime,hashlib,html,json,pathlib,re,subprocess,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parent
events=json.loads((ROOT/'selected-events.json').read_text())
documents={x['id']:x['documents'] for x in json.loads((ROOT/'meet-documents.json').read_text())}
existing=json.loads((ROOT/'existing.json').read_text());known={x['id']:x for x in existing}
def plain(s):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s))).strip()
events=[e for e in events if 'cancel' not in plain(e['meetDescription']['value']).lower()]
events.sort(key=lambda e:e['startDate']['displayValueISO'])
(ROOT/'announcements').mkdir(exist_ok=True)
def capture(e):
    mid=e['id']['value'];files=documents[mid]
    candidates=[d for d in files if d['url'].lower().endswith('.pdf') and not any(s in d['name'].lower() for s in ['result','scores','high point','heat','timeline','psych','time standards'])]
    if not candidates:return dict(id=mid,error='No announcement PDF identified')
    doc=candidates[0];url=urllib.parse.urljoin('https://www.gomotionapp.com',doc['url']);path=ROOT/'announcements'/f'{mid}.pdf'
    result=subprocess.run(['curl','-fsSL','--max-time','45','-o',str(path),url],capture_output=True,text=True)
    if result.returncode:return dict(id=mid,url=url,error=result.stderr)
    data=path.read_bytes();assert data.startswith(b'%PDF-')
    return dict(id=mid,url=url,name=doc['name'],file=str(path.relative_to(ROOT)),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:captures=list(pool.map(capture,events))
(ROOT/'announcement-captures.json').write_text(json.dumps(captures,indent=2))
captured={x['id']:x for x in captures}
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
batch=dict(division='knowledge',scope='Inland Empire Swimming meets: October 10, 2025–October 10, 2026 (30 past meets plus today’s SWAT Fall Challenge)',sourceUrl='https://www.gomotionapp.com/team/wzielsc/page/events#/team-events/past',capturedAt=now,coverage='partial',evidence={'method':'Official Inland Empire Swimming public event archive and upcoming listings, filtered by date; event descriptions checked for cancellations and corrections. Official attachment lists retain announcement and result links.','dateWindow':{'from':'2025-10-10','through':'2026-10-10','timezone':'America/Los_Angeles'},'coverage':'31 meet records. Excludes governance meetings, three canceled meets, and meets beginning after October 10. Today’s October 10–11 meet is retained as a whole event, not marked completed.','limitations':'Covers the official LSC event listings; not an exhaustive search of separately observed school meets or every club time trial. Results links are attached, not individual swimmer results imported.','duplicateCheck':'Compared stable IDs and existing published meet records; no published meet records were present.','sources':['past-events.json','upcoming-events.json','meet-documents.json','announcement-captures.json'],'corrections':['TCCC Winter Invite: Jan 31–Feb 1, not Jan 24–25; corroborated by sanctioned announcement.','Junior Championships: Cougar Aquatics at WSU Gibb Pool after Moses Lake pool failure.','Pendleton Open: July 4–5 in event archive, not July 3–5 in master calendar.','Vandal Invitational Dec 5–7, 2025 canceled in event description although cancellation absent from title.'],'excluded':[{'id':1630930,'title':'2025 EAST Octoberfest','reason':'Canceled due to facility closure'},{'id':1630944,'title':'2025 Vandal Invitational','reason':'Canceled due to low entries'},{'id':1677357,'title':'2026 Tony St Onge Memorial','reason':'Canceled due to Moses Lake pool closure'}]},writes=[])
specialHosts={1761236:'sss',1677376:'tccc',1677356:'van',1677354:'coug'}
corrections={1677349:'The official event listing and sanctioned announcement place this meet on January 31–February 1; the master calendar lists earlier dates.',1677354:'Moved to WSU Gibb Pool with Cougar Aquatics as host after Moses Lake pool mechanical failure, per February 7 update.',1677372:'Uses July 4–5 from the official event listing; the master calendar begins this meet on July 3.'}
for e in events:
    mid=e['id']['value'];title=e['title']['value'];start=e['startDate']['displayValueISO'];end=e['endDate']['displayValueISO'];loc=e['location']['value'];desc=plain(e['meetDescription']['value']);today=start=='2026-10-10'
    eid=f'usa-meet-ie-{mid}';assert eid not in known
    assert '2025-10-10'<=start<='2026-10-10' and start<=end
    match=re.search(r'\bIE (VS|SWAT|TCCC|LCN|MRA|PSA|WWSC|COUG|VAN|SHRK|CAST|LGSC)\b',title)
    host=specialHosts.get(mid) or (match.group(1).lower() if match else None)
    hostid='velocity-swimming' if host=='vs' else 'usa-team-ie-'+host if host else None
    assert hostid in known
    hostName=known[hostid]['title']
    links=[dict(name=d['name'],url=urllib.parse.urljoin('https://www.gomotionapp.com',d['url']),type='results' if 'result' in d['name'].lower() else 'meet_document') for d in documents[mid]]
    results=[d for d in links if d['type']=='results']
    source=f'https://www.gomotionapp.com/team/wzielsc/page/events#/team-events/{"upcoming" if today else "past"}/{mid}'
    resultNote='Scheduled for October 10–11; results not yet posted.' if today else 'Results available from the host on request.' if mid==1761236 else 'Official results files posted.'
    cleanTitle=title.replace(' * NEW LOCATION & HOST *','')
    if mid==1677349:cleanTitle='2026 IE TCCC Winter Open'
    after=dict(kind='meet',title=cleanTitle,sourceUrl=source,startsOn=start,endsOn=end,lscId='usa-lsc-ie',zoneId='usa-zone-western',hostTeamId=hostid,hostTeamName=hostName,location=loc,summary=f'{hostName} meet at {loc}. {resultNote}',status='scheduled' if today else 'past',resultsStatus='not_yet_posted' if today else 'contact_host' if mid==1761236 else 'published',documents=links,checkedAt=now,sourceEventId=str(mid),coverageNote='Dates, host, location and attachment links verified against the official IES event listing. Individual swimmer results were not imported.',evidence={'sourceUrl':source,'eventListingTitle':title,'startDate':start,'endDate':end,'location':loc,'eventDescription':desc,'attachmentListUrl':f'https://www.gomotionapp.com/rest/ondeck/v2/meetfile/{mid}/teamEventFile/list?team=wzielsc','announcementCapture':captured[mid]})
    if mid in corrections:after['sourceCorrection']=corrections[mid];after['summary']+=' '+corrections[mid]
    if mid==1761236:after['discipline']='open_water'
    else:after['discipline']='pool'
    batch['writes'].append(dict(path='knowledge_entries/'+eid,after=after))
assert len(batch['writes'])==31
(ROOT/'meets-batch.json').write_text(json.dumps(batch,indent=2))
rows=[]
for w in batch['writes']:
    d=w['after'];rows.append('<tr><td>'+d['startsOn']+'<br>'+d['endsOn']+'</td><td><a href="'+html.escape(d['sourceUrl'],quote=True)+'">'+html.escape(d['title'])+'</a><br>'+html.escape(d['summary'])+'</td><td>'+html.escape(d['hostTeamName'])+'</td></tr>')
(ROOT/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Inland Empire meets — past year</title><style>body{font:16px/1.5 system-ui;max-width:1150px;margin:40px auto;padding:20px;color:#18324d}td,th{padding:14px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}a{color:#0864ab}td:first-child{white-space:nowrap}</style><h1>Inland Empire Swimming meets</h1><p>October 10, 2025–October 10, 2026. 30 past meets and one starting today, prepared for collection review. Three canceled meets and governance meetings excluded. Dates and host changes follow official event listings.</p><table><thead><tr><th>Dates</th><th>Meet / location</th><th>Host</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></html>')
print(json.dumps({'meets':len(batch['writes']),'announcementsDownloaded':sum('error' not in c for c in captures),'downloadFailures':[c for c in captures if 'error' in c],'resultLinks':sum(len([d for d in w['after']['documents'] if d['type']=='results']) for w in batch['writes']),'batchBytes':(ROOT/'meets-batch.json').stat().st_size}))
