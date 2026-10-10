import concurrent.futures,hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
m=json.loads((ROOT/'manifest.json').read_text())
def retry(d):
    if 'error' not in d:return d
    url=d['url'].replace('https://www.usaswimming.org/docs/','https://websiteprodcoresa.blob.core.windows.net/sitefinity/docs/')
    out=ROOT/'files'/(d['id']+'.pdf')
    r=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','55','--output',str(out),url],capture_output=True,text=True)
    if r.returncode: return d
    raw=out.read_bytes();assert raw.startswith(b'%PDF-')
    d.update(file=str(out.relative_to(ROOT)),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),retrieval='HTTP 200 from '+url)
    d.pop('error');return d
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:m['documents']=list(pool.map(retry,m['documents']))
(ROOT/'manifest.json').write_text(json.dumps(m,indent=2))
print(json.dumps({'remainingFailed':[d['title'] for d in m['documents'] if 'error' in d]}))
