import concurrent.futures, datetime, hashlib, html, json, pathlib, re, subprocess, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
LINKS = json.loads((ROOT/'links.json').read_text())
HUBS = {'rules':'https://www.usaswimming.org/about-usas/governance/rules-policies', 'safety':'https://www.usaswimming.org/safe-sport/minor-athlete-abuse-prevention-policy', 'times':'https://www.usaswimming.org/Times/time-standards'}
RULES = {
 '2026 Rulebook':'Full national rules and regulations. Read together with the online amendments, which supersede corresponding text in this PDF.',
 '2026 Mini Rulebook':'Compact poolside rules reference; consult the full rulebook and online amendments for updates.',
 '2026 Actions Taken by the House of Delegates – Summary':'Summary of 2026 adopted legislative actions. Check each action’s effective date before applying it.',
 '2026 Actions Taken by the House of Delegates':'Detailed 2026 legislative actions; individual effective dates govern application.',
 'Board Governing Policies Manual':'National board governance policies, including ethics and whistleblower provisions.',
 'Operating Policy Manual':'National operating policies reference for club and LSC administrators.',
 'Sanction Appeal Process Handbook':'Reference for the sanction appeal process.',
 'Procedures For Applying For Suit Exemptions':'Application procedures for swimsuit exemptions.',
 'Tech Suit Information':'Technical-suit reference for officials and coaches.',
 '12 & Under Approved Suits':'Official approved-suit reference for younger swimmers.'
}
SAFETY = {
 'MAAPP':'2025 Minor Athlete Abuse Prevention Policy, linked by the current official policy hub. Covers interactions, communication, travel, changing areas and related athlete safeguards.',
 'MAAPP Customizable':'Editable 2025 MAAPP template for club adoption and administration.',
 'Personal Assistant Policy':'Official personal-assistant policy linked from the MAAPP hub.',
 'Sample Acknowledgement of Policy':'Editable MAAPP policy acknowledgement form.',
 'Required Language Components for Sanctioned Events':'Required Safe Sport language for sanctioned events.',
 'LSC Sanctioned Meet 360':'Safe Sport reference for planning and reviewing sanctioned meets.',
 'Highlighted Changes in new 2025 MAAPP':'Companion document identifying changes in the 2025 MAAPP.',
 'Webinar Slides':'USA Swimming’s 2025 MAAPP training webinar slides.'
}
items=[]
for group in HUBS:
    for item in LINKS[group]:
        title=item['title']; url=item['url']; summary=''
        if group=='rules':
            if title not in RULES: continue
            summary=RULES[title]
        elif group=='safety':
            if title not in SAFETY: continue
            summary=SAFETY[title]
            title='2025 Minor Athlete Abuse Prevention Policy (MAAPP)' if title=='MAAPP' else 'MAAPP — '+title
        else:
            if '/2025/' in url and not any(x in title for x in ['2028','Parallel']): continue
            if '/2027/' in url: title='2027 '+title+' — Time Standards'
            elif '/2026/' in url: title='2026 '+title+' — Time Standards'
            summary='Official USA Swimming qualifying-time reference for the named event and edition. Refer to the document for eligibility and qualifying periods.'
            if 'Motivational' in title: summary='National motivational benchmarks for swimmer goal setting through 2028; this is a benchmark table, not an event qualification guarantee.'
            if 'Parallel' in title: summary='Official disability parallel time standards for the stated 2024–2028 category.'
            if 'Calendar' in title: summary='USA Swimming’s published domestic event planning calendar for 2025–2028.'
        slug='usas-'+re.sub('[^a-z0-9]+','-',title.lower()).strip('-')
        items.append(dict(id=slug,group=group,title='USA Swimming — '+title,url=url,summary=summary))

(ROOT/'files').mkdir(exist_ok=True)
def download(item):
    ext=pathlib.Path(urllib.parse.urlsplit(item['url']).path).suffix
    output=ROOT/'files'/(item['id']+ext)
    result=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','55','--output',str(output),'--write-out','%{http_code}|%{content_type}|%{url_effective}',item['url']],capture_output=True,text=True)
    if result.returncode: return dict(item,error=result.stderr.strip())
    raw=output.read_bytes()
    if not (raw.startswith(b'%PDF-') if ext=='.pdf' else raw.startswith(b'PK')): return dict(item,error='Unexpected file signature')
    return dict(item,file=str(output.relative_to(ROOT)),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),retrieval=result.stdout)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    results=list(pool.map(download,items))
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
results.append(dict(id='usas-2026-rulebook-online-amendments',group='rules',title='USA Swimming — 2026 Rulebook Online Amendments',url=HUBS['rules'],summary='Official online amendments supersede corresponding sections of the printed and PDF 2026 rulebook. Consult alongside the rulebook.',file='rules.html',sha256=hashlib.sha256((ROOT/'rules.html').read_bytes()).hexdigest(),bytes=(ROOT/'rules.html').stat().st_size,retrieval='200|text/html|'+HUBS['rules']))
(ROOT/'manifest.json').write_text(json.dumps({'capturedAt':now,'documents':results},indent=2))
for group,hub in HUBS.items():
    good=[x for x in results if x['group']==group and 'error' not in x]
    batch=dict(division='knowledge',scope='USA Swimming documents — '+{'rules':'rules, governance and equipment','safety':'athlete protection and club forms','times':'time standards and competition planning'}[group],sourceUrl=hub,capturedAt=now,coverage='partial',evidence={'method':'Selected documents linked from the current official USA Swimming resource hub; downloaded with HTTPS and verified file signatures. Local copies and SHA-256 hashes retained. Descriptions identify purpose, not legal interpretation.','hubUrl':hub,'limitations':'Curated important documents, not an exhaustive archive. Edition dates do not imply all provisions are currently effective. No numeric standards imported.','documents':good},writes=[])
    for d in good:
        batch['writes'].append({'path':'knowledge_entries/'+d['id'],'after':dict(kind='document',title=d['title'],sourceUrl=d['url'],summary=d['summary'],publisher='USA Swimming',category=group,resourcePage=hub,format=pathlib.Path(d['file']).suffix[1:].upper(),checkedAt=now,sha256=d['sha256'],fileSizeBytes=d['bytes'],coverageNote='Document link and file verified from the official resource hub; consult source for effective dates and later amendments.')})
    (ROOT/(group+'-batch.json')).write_text(json.dumps(batch,indent=2))
body=['<!doctype html><html lang="en"><meta charset="utf-8"><title>USA Swimming document collection</title><style>body{font:16px/1.55 system-ui;max-width:1050px;margin:48px auto;padding:0 24px;color:#15304a}h1{font-size:32px}li{margin:20px 0}small{color:#52667a}a{color:#0764ac}</style><h1>USA Swimming document collection</h1><p>Collected October 10, 2026. Official source links and downloaded copies. Collection entries are prepared for review.</p>']
for group in HUBS:
    body.append('<h2>'+{'rules':'Rules, governance & equipment','safety':'Athlete protection & club forms','times':'Time standards & competition planning'}[group]+'</h2><ul>')
    for d in results:
        if d['group']!=group:continue
        body.append('<li><strong>'+html.escape(d['title'])+'</strong><br>'+html.escape(d['summary'])+'<br><a href="'+html.escape(d['url'],quote=True)+'">Official source</a>')
        body.append(' · <a href="'+d['file']+'">Downloaded copy</a></li>' if 'file' in d else ' · Download unavailable</li>')
    body.append('</ul>')
body.append('</html>');(ROOT/'index.html').write_text('\n'.join(body))
print(json.dumps({'downloaded':sum('error' not in x for x in results),'failures':[x for x in results if 'error' in x],'groups':{g:sum(x['group']==g and 'error' not in x for x in results) for g in HUBS}},indent=2))
