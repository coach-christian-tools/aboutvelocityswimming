import urllib.request, urllib.parse, html.parser, json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parent
class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.href=None; self.text=''
    def handle_starttag(self, tag, attrs):
        if tag == 'a': self.href=dict(attrs).get('href'); self.text=''
    def handle_data(self, data):
        if self.href: self.text+=data
    def handle_endtag(self, tag):
        if tag == 'a' and self.href:
            self.links.append({'title':self.text.strip(), 'url':self.href}); self.href=None

hubs = {'rules':'https://www.usaswimming.org/about-usas/governance/rules-policies', 'safety':'https://www.usaswimming.org/safe-sport/minor-athlete-abuse-prevention-policy', 'times':'https://www.usaswimming.org/Times/time-standards'}
result={}
for key,url in hubs.items():
    raw=subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','40',url])
    (ROOT/(key+'.html')).write_bytes(raw)
    parser=Links(); parser.feed(raw.decode())
    result[key]=[dict(item,url=urllib.parse.urljoin(url,item['url'])) for item in parser.links if any(ext in item['url'].lower() for ext in ['.pdf','.docx'])]
    print(key,json.dumps(result[key]))
(ROOT/'links.json').write_text(json.dumps(result,indent=2))
