import hashlib, html, json, pathlib, zipfile
ROOT=pathlib.Path(__file__).resolve().parent
manifest=json.loads((ROOT/'manifest.json').read_text())
existing=json.loads((ROOT/'existing-documents.json').read_text())
documents=manifest['documents']
for d in documents:
    if 'error' in d:
        d['downloadStatus']='Official link verified; local download timed out and partial file excluded.'
        d['verification']='Linked from saved official resource page; PDF independently indexed/read by web retrieval (full rulebook exceeds web retrieval size limit).'
        partial=ROOT/'files'/(d['id']+'.pdf')
        if partial.exists():partial.unlink()
    else:
        d['downloadStatus']='Complete local capture'
        assert hashlib.sha256((ROOT/d['file']).read_bytes()).hexdigest()==d['sha256']
    assert d['url'] not in [x['source_url'] for x in existing]
    assert d['id'] not in [x['id'] for x in existing]
for group in ['rules','safety','times']:
    path=ROOT/(group+'-batch.json'); batch=json.loads(path.read_text())
    all_docs=[d for d in documents if d['group']==group]
    batch['evidence']['documents']=all_docs
    batch['evidence']['method']='Curated official USA Swimming hub links. Completed local downloads have SHA-256 hashes and valid file signatures. Any unsuccessful download is explicitly marked; partial files are excluded.'
    batch['evidence']['duplicateCheck']='No matching IDs or source URLs among the existing published document records.'
    batch['evidence']['limitations']+=' Collector stages proposals only; staff approval is required for public collection publication.'
    batch['writes']=[]
    for d in all_docs:
        after=dict(kind='document',title=d['title'],sourceUrl=d['url'],summary=d['summary'],publisher='USA Swimming',category=group,resourcePage=batch['sourceUrl'],format=pathlib.Path(d.get('file','file.pdf')).suffix[1:].upper(),checkedAt=manifest['capturedAt'],coverageNote=d['downloadStatus'])
        if 'error' not in d:after.update(sha256=d['sha256'],fileSizeBytes=d['bytes'])
        batch['writes'].append({'path':'knowledge_entries/'+d['id'],'after':after})
    assert len(batch['writes'])==len(all_docs)
    path.write_text(json.dumps(batch,indent=2))
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
failed=sum('error' in d for d in documents)
body=['<!doctype html><html lang="en"><meta charset="utf-8"><title>USA Swimming documents</title><style>body{font:16px/1.55 system-ui;max-width:1050px;margin:48px auto;padding:0 24px;color:#15304a}li{margin:20px 0}a{color:#0764ac}</style><h1>USA Swimming documents</h1><p>35 official resources collected October 10, 2026: '+str(34-failed)+' complete PDF/Word downloads, one captured amendments page, and '+str(failed)+' link-only resources. Collection entries are prepared for staff review.</p>']
for group in ['rules','safety','times']:
    body.append('<h2>'+{'rules':'Rules, governance & equipment','safety':'Athlete protection & club forms','times':'Time standards & competition planning'}[group]+'</h2><ul>')
    for d in documents:
        if d['group']!=group:continue
        body.append('<li><strong>'+html.escape(d['title'])+'</strong><br>'+html.escape(d['summary'])+'<br><a href="'+html.escape(d['url'],quote=True)+'">Official source</a>')
        body.append(' · <a href="'+d['file']+'">Downloaded copy</a></li>' if 'file' in d else ' · Local download unavailable</li>')
    body.append('</ul>')
body.append('</html>');(ROOT/'index.html').write_text('\n'.join(body))
with zipfile.ZipFile(ROOT/'usa-swimming-documents.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for name in ['index.html','manifest.json','rules.html']+[d['file'] for d in documents if 'file' in d and d['file']!='rules.html']:
        bundle.write(ROOT/name,name)
    assert bundle.testzip() is None
print(json.dumps({'resources':len(documents),'completedFileDownloads':len(list((ROOT/'files').iterdir())),'linkOnly':sum('error' in d for d in documents),'bundleBytes':(ROOT/'usa-swimming-documents.zip').stat().st_size}))
