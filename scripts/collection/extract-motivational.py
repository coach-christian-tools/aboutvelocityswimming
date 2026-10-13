"""Extract the official 2024–2028 age-group PDF, rejecting unexpected table shapes.
Usage: python extract-motivational.py official.pdf output.json
Requires pdfplumber. Retain the source PDF alongside the resulting record.
"""
import sys, re, json, hashlib
from decimal import Decimal
from pathlib import Path
import pdfplumber

source = Path(sys.argv[1])
tiers = ['B', 'BB', 'A', 'AA', 'AAA', 'AAAA']
set_ = dict(id='usas_motivational_2024_2028', name='2024–2028 USA Swimming Age Group Motivational Standards',
            category='motivational', governingBody='USA_Swimming', seasonYears='2024–2028',
            effectiveDate='2024-09-01', expirationDate='2028-08-31',
            sourceUrl='https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2025/2028-motivational-standards-age-group.pdf', cuts={})
rows = []
with pdfplumber.open(source) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        lines = page.extract_text().splitlines()
        age = None
        for i, line in enumerate(lines):
            heading = re.fullmatch(r'(10 & under|11-12|13-14|15-16|17-18) Girls Event \1 Boys', line)
            if heading:
                age = heading[1].replace('10 & under', '10&U')
                continue
            event = re.search(r'\b(\d+) (FR-R|MED-R|FR|BK|BR|FL|IM)(?: (SCY|SCM|LCM))?\b', line)
            if not event:
                # Every line containing times must be accounted for, never silently omitted.
                if re.search(r'\d+\.\d{2}', line): raise ValueError(f'Unparsed row on page {number}: {line}')
                continue
            assert age, (number, line)
            course = event[3] or lines[i+1]
            assert course in ['SCY', 'SCM', 'LCM'], (number, line)
            female = re.findall(r'(?:\d+:)?\d+\.\d{2}', line[:event.start()])
            male = re.findall(r'(?:\d+:)?\d+\.\d{2}', line[event.end():])
            assert len(female) == len(male) == 6, (number, line)
            key = f'{event[1]}_{event[2]}_{course}'
            for gender, times, labels in [('F', female, tiers), ('M', male, list(reversed(tiers)))]:
                cuts = []
                for tier, time in zip(labels, times):
                    parts = time.split(':')
                    ms = int(sum(Decimal(part) * (60 ** power) for power, part in enumerate(reversed(parts))) * 1000)
                    cuts.append(dict(tierName=tier, timeMs=ms, timeDisplay=time))
                matrix = set_['cuts'].setdefault(course, {}).setdefault(gender, {}).setdefault(age, {})
                assert key not in matrix, (number, age, key)
                matrix[key] = dict(cutsByTier=sorted(cuts, key=lambda c:c['timeMs']))
            rows.append(dict(page=number, ageGroup=age, eventCode=key))
assert len(rows) == 304, f'Unexpected row count: {len(rows)}; review source revision'
Path(sys.argv[2]).write_text(json.dumps(set_, indent=2)+'\n')
Path(sys.argv[2]+'.evidence.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    pages=12, eventRows=len(rows), cutCount=len(rows)*12, rows=rows,
    method='All PDF event rows parsed; six female B→AAAA and six male AAAA→B columns checked; wrapped medley relay course labels retained.',
    validityNote='2024–2028 quad: September 1, 2024 through August 31, 2028; PDF revision October 10, 2025.'),indent=2)+'\n')
print(f'Extracted {len(rows)} event rows / {len(rows)*12} cuts')
