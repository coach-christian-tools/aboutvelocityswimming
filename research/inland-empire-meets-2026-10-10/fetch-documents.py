import concurrent.futures,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
events=json.loads((ROOT/'past-events.json').read_text())+json.loads((ROOT/'upcoming-events.json').read_text())
selected=[]
for e in events:
    start=e['startDate']['displayValueISO'];end=e['endDate']['displayValueISO'];title=e['title']['value']
    if start>'2026-10-10' or end<'2025-10-10':continue
    if any(x in title.lower() for x in ['cancel','hod','house of delegates']):continue
    selected.append(e)
def fetch(e):
    mid=e['id']['value'];url=f'https://www.gomotionapp.com/rest/ondeck/v2/meetfile/{mid}/teamEventFile/list?team=wzielsc'
    r=subprocess.run(['curl','-fsSL','--max-time','35','-X','POST',url],capture_output=True,text=True)
    return dict(id=mid,sourceUrl=url,documents=json.loads(r.stdout) if r.returncode==0 else [],error=r.stderr if r.returncode else None)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:files=list(pool.map(fetch,selected))
(ROOT/'meet-documents.json').write_text(json.dumps(files,indent=2))
(ROOT/'selected-events.json').write_text(json.dumps(selected,indent=2))
print(json.dumps({'meets':len(selected),'files':sum(len(x['documents']) for x in files),'failures':[x['id'] for x in files if x['error']]}))
