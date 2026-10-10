import json,re,time,urllib.request,urllib.error,html,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).parent
teams=json.loads((ROOT/'western-teams-prepared.json').read_text())
urls=sorted(set(t['website']for t in teams if t['website']))
def check(url):
 result={'requestedUrl':url,'checkedAt':'2026-10-10'}
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; public directory verification)'})
  with urllib.request.urlopen(req,timeout=12) as r:
   body=r.read(350000).decode('utf-8','replace')
   result.update(status=r.status,url=r.url)
  title=re.search(r'<title[^>]*>(.*?)</title>',body,re.S|re.I)
  result['title']=html.unescape(re.sub(r'\s+',' ',title[1])).strip() if title else None
  result['emails']=sorted(set(html.unescape(e)for e in re.findall(r'href=["\']mailto:([^"\'?#\s]+)',body,re.I)))[:15]
  text=re.sub(r'<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>','',body,flags=re.S|re.I)
  text=html.unescape(re.sub(r'<[^>]+>',' ',text))
  text=re.sub(r'\s+',' ',text)
  result['text']=text[-18000:]
 except Exception as e:result['error']=str(e)[:180]
 return result
out=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=18) as pool:
 for i,r in enumerate(pool.map(check,urls),1):
  out.append(r)
  if i%50==0:print('Checked',i,'of',len(urls),flush=True)
(ROOT/'western-team-website-checks.json').write_text(json.dumps(out,indent=2))
print('Finished',len(out),'HTTP successes',sum(r.get('status')==200 for r in out),flush=True)
