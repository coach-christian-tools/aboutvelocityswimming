import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateStandard } from '../../src/components/collection/validate-standard.ts';

const directory = new URL('./', import.meta.url);
const reportOnly = process.argv.includes('--report-only');
const read = async (name) => JSON.parse(await readFile(new URL(name, directory), 'utf8'));
const save = async (name, value) => writeFile(new URL(name, directory), JSON.stringify(value, null, 2) + '\n');
const standard = await read('../expanded-standards-2026-10-13/prepared/western_spring_sectionals_2027.json');
const comparison = await read('comparison.json');
const relays = await read('relays.json');
const sourceText = await read('source-text.json');
const packetUrl = 'https://www.gomotionapp.com/hikona/UserFiles/Image/QuickUpload/sanctioned-2027-nw-speedo-sectionals---kona_021627.pdf';
const hostUrl = 'https://www.gomotionapp.com/team/hikona/page/kona-hawaii-sectionals-327';
const entryFileUrl = 'https://www.gomotionapp.com/hikona/UserFiles/Image/QuickUpload/meet-events-202-7-nw-spring-speedo-sectionals---kona-18mar2027-001_045651.zip';
const publishedAt = new Date().toISOString();
const packetSha256 = createHash('sha256').update(await readFile(new URL('official-meet-announcement.pdf',directory))).digest('hex');
const parseTime = (value) => {
  const parts = value.split(':').map(Number);
  return Math.round((parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0]) * 1000);
};
const formatTime = (ms) => ms >= 60000
  ? `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`
  : (ms / 1000).toFixed(2);
const events = ['50_FR','100_FR','200_FR','500_FR','1000_FR','1650_FR','100_BK','200_BK','100_BR','200_BR','100_FL','200_FL','200_IM','400_IM','200_FR-R','400_FR-R','800_FR-R','200_MED-R','400_MED-R'];
// Independent transcription of all 114 cuts in the user's screenshot.
const screenshotRows = `24.99 27.76 28.44 22.41 24.72 25.79
53.71 59.04 1:01.26 48.46 53.27 55.89
1:56.22 2:07.92 2:12.75 1:45.84 1:56.48 2:02.20
5:13.17 4:29.34 4:43.21 4:49.98 4:10.18 4:23.21
10:52.09 9:27.35 9:48.19 10:10.58 8:53.74 9:19.51
18:19.78 18:07.11 18:54.49 17:13.16 16:53.43 17:45.59
59.50 1:06.33 1:09.54 54.42 1:00.66 1:04.26
2:07.80 2:22.78 2:29.20 1:58.45 2:12.65 2:20.40
1:08.46 1:15.15 1:20.46 1:01.53 1:07.35 1:13.70
2:29.07 2:43.68 2:54.86 2:15.19 2:27.80 2:40.88
58.86 1:04.55 1:06.87 53.46 59.43 1:00.97
2:12.26 2:26.43 2:32.74 2:00.94 2:14.37 2:20.25
2:11.81 2:25.85 2:32.19 1:59.85 2:12.30 2:19.28
4:39.34 5:07.75 5:21.68 4:18.37 4:45.76 5:00.19
1:44.69 1:56.89 1:59.29 1:32.99 1:43.78 1:46.89
3:49.09 4:12.14 4:17.29 3:25.49 3:46.85 3:54.59
8:14.49 9:10.46 9:21.69 7:38.69 8:26.70 8:43.99
1:56.29 2:10.99 2:13.39 1:44.69 1:55.50 1:59.69
4:09.49 4:44.93 4:48.39 3:47.49 4:15.75 4:23.39`.split('\n').map(row => row.split(' '));
validateStandard(standard, standard.id);
assert.equal(screenshotRows.length, 19);
for (const [index, row] of screenshotRows.entries()) {
  for (const [column, value] of row.entries()) {
    const course = ['SCY', 'SCM', 'LCM'][column % 3];
    const gender = column < 3 ? 'F' : 'M';
    const event = events[index].replace(course === 'SCY' ? /NEVER/ : /^500_/, '400_')
      .replace(course === 'SCY' ? /NEVER/ : /^1000_/, '800_')
      .replace(course === 'SCY' ? /NEVER/ : /^1650_/, '1500_') + '_' + course;
    assert.equal(standard.cuts[course][gender].Open[event].cutsByTier[0].timeMs, parseTime(value), `${gender} ${event}`);
  }
}
assert.match(sourceText.packet, /December 1, 2025/);
assert.match(sourceText.packet, /SCY Prelims/);
assert.match(sourceText.packet, /March 10, 2027/);
const labels = {FR:'Free', BK:'Back', BR:'Breast', FL:'Fly', IM:'IM', 'FR-R':'Free Relay', 'MED-R':'Medley Relay'};
const eventLabel = code => {
  const [distance, stroke] = code.split('_');
  return `${distance} ${labels[stroke]}`;
};
// Official event order, meet-announcement page 3. No inferred event numbers.
const order = [
  ['03-18','200_MED-R'],['03-18','100_FR'],['03-18','1000_FR'],['03-18','200_BR'],['03-18','200_BK'],['03-18','200_FR-R'],
  ['03-19','200_FR'],['03-19','100_BK'],['03-19','400_IM'],['03-19','400_FR-R'],
  ['03-20','100_FL'],['03-20','500_FR'],['03-20','100_BR'],['03-20','800_FR-R'],
  ['03-21','200_FL'],['03-21','50_FR'],['03-21','1650_FR'],['03-21','200_IM'],['03-21','400_MED-R'],
];
const meetEvents = order.flatMap(([day, event], index) => ['F','M'].map((gender, offset) => {
  const eventCode = `${event}_SCY`;
  const cut = standard.cuts.SCY[gender].Open[eventCode].cutsByTier[0];
  const field = gender === 'F' ? 'girls' : 'boys';
  const stroke = event.split('_')[1];
  return {
    id: `ev_${index * 2 + offset + 1}`, eventNumber: index * 2 + offset + 1,
    session: `2027-${day}`, eventCode, distance: Number(event.split('_')[0]),
    stroke: stroke === 'MED-R' ? 'IM' : stroke === 'FR-R' ? 'FR' : stroke,
    course:'SCY', gender, ageGroup:'Open', name:`${gender === 'F' ? 'Women' : 'Men'} Open ${eventLabel(eventCode)}`,
    isRelay: stroke.endsWith('-R'), [`${field}QualifyingTimeMs`]:cut.timeMs,
    [`${field}QualifyingTimeDisplay`]:cut.timeDisplay,
  };
}));
assert.equal(meetEvents.length, 38);
assert.equal(new Set(meetEvents.map(event => event.eventNumber)).size, 38);
const meet = {
  id:'meet_2027_nw_speedo_sectionals_kona', name:'2027 Northwest Speedo Sectionals – Kona, HI',
  teamId:'velocity-swimming', sanctionNumber:'HI20270318-SEN', host:'Kona Aquatics',
  location:'Kona Community Aquatic Center, Kailua-Kona, HI', type:'Zone',
  dates:{startDate:'2027-03-18',endDate:'2027-03-21',entryDeadline:'2027-03-10T23:59:00-08:00'},
  venue:{facilityName:'Kona Community Aquatic Center',city:'Kailua-Kona',state:'HI',course:'SCY',location:'75-5530 Kuakini Hwy, Kailua-Kona, HI 96740'},
  files:{meetInfoPdf:packetUrl,hytekMeetEventsZip:entryFileUrl},
  events:meetEvents, entryStatus:'entries_open', standardSetId:standard.id,
  qualification:{
    standardSetId:standard.id,acceptedCourses:['SCY','SCM','LCM'],
    periodStart:'2025-12-01',regularEntryDeadline:'2027-03-10T23:59:00-08:00',
    newQualifiersDeadline:'2027-03-14T23:59:00-07:00',conversionsAccepted:false,
    reciprocalDistanceEvents:['1000_FR_SCY','1650_FR_SCY'],
    reciprocalDistanceQualifyingEvents:['800_FR_LCM','800_FR_SCM','1000_FR_SCY','1500_FR_LCM','1500_FR_SCM','1650_FR_SCY'],
    individualEventLimit:6,dailyIndividualEventLimit:3,bonusEventLimit:2,
    relayOnlyEligibility:'Host decision due January 15, 2027; not yet confirmed.',
    sourceUrl:packetUrl,sourcePages:[2,4,5,6],
  },
  sourceObservation:{url:hostUrl,meetAnnouncementUrl:packetUrl,meetAnnouncementSha256:packetSha256,capturedAt:publishedAt,method:'Official host announcement; event order page 3 and exact qualifying matrix page 4. User selected the Kona meet.'},
  createdAt:publishedAt,updatedAt:publishedAt,
};
if (!reportOnly) {
  await save('meet.json',meet);
  await save('standards.json',standard);
}
const sqlLiteral = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
// A management publication records its actual operator channel, without impersonating an application reviewer.
const note = 'Published through the authorized Supabase management connection at the user’s explicit request on October 27, 2026. User selected Kona March 18–21, 2027. All 114 cuts independently checked against the supplied screenshot and official source. No application reviewer session was impersonated.';
const publication = {channel:'supabase-management',authorization:'Explicit user request in Codex; Kona selected in follow-up',verifiedAt:publishedAt,cutsVerified:114,meetId:meet.id,meetAnnouncementUrl:packetUrl};
const sql = `begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtext('velocity-records'));
do $publish$
declare b public.collection_batches; expected jsonb := ${sqlLiteral(standard)}; new_meet jsonb := ${sqlLiteral(meet)};
begin
 select * into strict b from public.collection_batches where id='aad67499-c188-4322-a1f6-455cd2f81b0e' for update;
 if b.status <> 'pending' or b.writes <> jsonb_build_array(jsonb_build_object('path','standards/'||(expected->>'id'),'after',expected)) then
  raise exception 'Standards proposal changed; re-read before publishing';
 end if;
 if b.reads <> '[{"path":"standards/western_spring_sectionals_2027","before":null}]'::jsonb
  or exists(select 1 from public.standards where id=expected->>'id') then
  raise exception 'Standards baseline changed; refusing replacement';
 end if;
 if exists(select 1 from public.meets where id=new_meet->>'id' or (data#>>'{dates,startDate}'='2027-03-18' and (data->>'name' ilike '%sectional%' or data#>>'{venue,city}' ilike '%kona%'))) then
  raise exception 'Kona meet already exists; refusing duplicate';
 end if;
 insert into public.standards(id,data) values(expected->>'id',expected);
 if (select count(*) from public.standard_cuts where standard_id=expected->>'id') <> 114 then
  raise exception 'Expected exactly 114 projected cuts';
 end if;
 insert into public.meets(id,data) values(new_meet->>'id',new_meet);
 update public.collection_batches set status='approved',reviewed_at=now(),reviewed_by=null,
  review_note=${"'" + note.replaceAll("'", "''") + "'"},
  evidence=evidence || jsonb_build_object('managementPublication',${sqlLiteral(publication)}) where id=b.id;
end; $publish$;
commit;
select jsonb_build_object('standardId','western_spring_sectionals_2027','cuts',(select count(*) from public.standard_cuts where standard_id='western_spring_sectionals_2027'),'meetId','meet_2027_nw_speedo_sectionals_kona','events',(select jsonb_array_length(data->'events') from public.meets where id='meet_2027_nw_speedo_sectionals_kona'),'batchStatus',(select status from public.collection_batches where id='aad67499-c188-4322-a1f6-455cd2f81b0e'));
`;
if (!reportOnly) await writeFile(new URL('publish.sql',directory),sql);
const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const grouped = Map.groupBy(comparison.rows, row => row.athlete_id);
const entryKey = row => row.event_code.replace(/_(SCY|LCM|SCM)$/, '').replace(/^800_FR$/, '1000_FR').replace(/^1500_FR$/, '1650_FR').replace(/^400_FR$/, '500_FR');
const entryKeys = rows => {
  const keys = new Set(rows.map(entryKey));
  if (keys.has('1000_FR') || keys.has('1650_FR')) {
    keys.add('1000_FR');
    keys.add('1650_FR');
  }
  return [...keys];
};
const entryCount = rows => entryKeys(rows).length;
const individualEntries = [...grouped.values()].reduce((total,rows)=>total+entryCount(rows),0);
const qualifierCards = [...grouped.values()].map(rows => `<article><h3>${escape(rows[0].first_name)} ${escape(rows[0].last_name)}</h3><p>${entryCount(rows)} individual event${entryCount(rows)===1?'':'s'} · ${entryKeys(rows).map(eventLabel).map(escape).join(', ')}</p><div class="scroll"><table><thead><tr><th>Event</th><th>Course</th><th>Swum</th><th>Cut</th><th>Under by</th><th>Date</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(eventLabel(row.event_code))}${row.is_intermediate_split ? ' (split)' : ''}</td><td>${row.course}</td><td><a href="${escape(row.source_url)}">${formatTime(row.time_ms)}</a></td><td>${row.cut_display}</td><td class="under">${((row.cut_ms-row.time_ms)/1000).toFixed(2)}s</td><td>${escape(row.date_display ?? row.date)}</td></tr>`).join('')}</tbody></table></div>${rows.some(row=>row.is_intermediate_split) ? '<p class="muted">The 1000 time is an intermediate split from the 1650. Both distance entries are independently supported by full-distance qualifying results.</p>' : ''}${entryKeys(rows).includes('1000_FR') ? '<p class="muted">The reciprocal distance rule permits entry in both the 1000 and 1650 freestyle.</p>' : ''}</article>`).join('');
const relayCuts = new Map(comparison.relayCuts.map(row=>[row.id,row.cut]));
const relayRows = relays.map(row=>`<tr><td>${row.gender==='F'?'Women':'Men'}</td><td>${escape(eventLabel(row.event))}</td><td>${row.event.split('_').at(-1)}</td><td>${row.time}</td><td>${relayCuts.get(row.id)}</td><td>${row.date}</td><td>${row.members.map(member=>escape(member.name)).join(', ')}</td></tr>`).join('');
const fullStandards = ['SCY','SCM','LCM'].map(course=>`<details><summary>${course} standards · 38 cuts</summary><div class="scroll"><table><thead><tr><th>Event</th><th>Women</th><th>Men</th></tr></thead><tbody>${Object.keys(standard.cuts[course].F.Open).map(event=>`<tr><td>${escape(eventLabel(event))}</td><td>${standard.cuts[course].F.Open[event].cutsByTier[0].timeDisplay}</td><td>${standard.cuts[course].M.Open[event].cutsByTier[0].timeDisplay}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velocity • 2027 Kona Sectionals cuts</title><style>
:root{font:16px/1.5 system-ui,sans-serif;color:#18303d;background:#f4f7f8}*{box-sizing:border-box}body{margin:0}main{max-width:1140px;margin:auto;padding:44px 24px 70px}header{border-top:6px solid #f15b40;padding:24px 0}h1{font-size:clamp(28px,5vw,46px);line-height:1.12;margin:12px 0}h2{font-size:25px;margin:38px 0 14px}h3{font-size:22px;margin:0}.eyebrow{font-weight:750;letter-spacing:.13em;text-transform:uppercase;color:#a63821;font-size:12px}.muted{color:#596c76}.stats{display:flex;gap:30px;flex-wrap:wrap;padding:18px 0}.stats strong{font-size:34px;display:block}.stats span{font-size:14px;color:#596c76}article,details,.notice{background:white;border:1px solid #dce4e8;border-radius:12px;padding:22px;margin:14px 0}article>p{margin:3px 0 15px;color:#596c76}.notice{border-left:4px solid #f15b40}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;font-variant-numeric:tabular-nums}th{font-size:12px;text-transform:uppercase;letter-spacing:.035em;color:#596c76}td,th{padding:11px 12px;border-bottom:1px solid #e5eaee;white-space:nowrap}td:first-child,th:first-child{padding-left:0}td:last-child{white-space:normal;min-width:120px}tr:last-child td{border:0}a{color:#075d83;text-underline-offset:3px}.under{color:#126846;font-weight:650}summary{cursor:pointer;font-weight:700}footer{font-size:13px;color:#596c76;margin-top:30px}.actions{display:flex;gap:20px;flex-wrap:wrap}button{border:1px solid #bacbd5;border-radius:7px;background:white;padding:9px 16px;font:inherit;cursor:pointer}@media print{body{background:white}main{padding:0}.actions{display:none}article,details{break-inside:avoid}a{color:inherit;text-decoration:none}}
</style></head><body><main><header><div class="eyebrow">Velocity Swimming · Qualification report</div><h1>2027 Northwest Speedo Sectionals</h1><p>Kona, Hawaii · March 18–21, 2027 · Short Course Yards</p><p class="muted">Swimcloud roster audit · October 27, 2026</p><div class="stats"><div><strong>${grouped.size}</strong><span>Swimmers with individual cuts</span></div><div><strong>${individualEntries}</strong><span>Individual swimmer/event entries</span></div><div><strong>4</strong><span>Team relay events with cuts</span></div><div><strong>114</strong><span>Published qualifying standards</span></div></div><nav class="actions"><a href="${packetUrl}">Official meet packet</a><a href="${standard.sourceUrl}">Official standards</a><a href="https://aboutvelocityswimming.com/tools/times?view=standards&standard=western_spring_sectionals_2027">View standards on Velocity</a><button onclick="window.print()">Print report</button></nav></header>
<div class="notice"><strong>Qualifying period: December 1, 2025 through close of entries.</strong> Regular entries close March 10, 2027 at 11:59 PM Pacific; the new qualifiers deadline is March 14. Each swim is compared with the published cut for its actual course. Faster times qualify, and a time exactly equal to the cut also qualifies.</div>
<h2>Individual cuts achieved</h2>${qualifierCards}
<h2>Team relay cuts achieved</h2><p>These are recorded team performances. Relay membership does not grant an individual cut. The host has not yet confirmed relay-only athlete eligibility; its decision is due January 15, 2027.</p><article><div class="scroll"><table><thead><tr><th>Gender</th><th>Relay</th><th>Course</th><th>Swum</th><th>Cut</th><th>Date</th><th>Recorded lineup</th></tr></thead><tbody>${relayRows}</tbody></table></div></article>
<h2>All qualifying standards</h2><p>Women and men · Open · 14 individual events and 5 relays per course.</p>${fullStandards}
<h2>Swimcloud audit coverage</h2><p>Checked all 85 profile links for 84 swimmers on Velocity’s 2026–2027 Swimcloud roster, including both Ole Stiles profiles, and reconciled the prior-season roster. Also checked Annaleah Castro Lopez and Sam Parrish, who appear in the Velocity database but not that Swimcloud roster. Read 85 all-course personal-best tables containing 1,593 event/course rows, plus 93 event-history rows for qualifying-level personal bests set before the window. School, club and Zone affiliations are included.</p><p><strong>Coverage gaps:</strong> Sam Anger and Sawyer Smith have no time table available on Swimcloud. No matching profile was located for Bella Castro Lopez or Ignacio Harrison. These four swimmers remain unresolved; an absent result is not a determination that they have no cut.</p><details><summary>View swimmer-by-swimmer audit coverage</summary><div class="scroll"><table><thead><tr><th>Swimmer</th><th>Profile</th><th>Rows checked</th><th>Status</th></tr></thead><tbody>${(comparison.swimcloudAudit ? (await read('swimcloud-audit/results.json')).coverage : []).map(person=>`<tr><td>${escape(person.name)}</td><td><a href="${escape(person.sourceUrl)}">${person.profileId}</a></td><td>${person.rowsChecked}</td><td>${person.status==='no-times-available'?'No times available':'All courses checked'}</td></tr>`).join('')}</tbody></table></div></details><h2>Entry rules</h2><p>The 800m/1000y and 1500m/1650y freestyle cuts qualify reciprocally for both distance events. Brian and Caroline each qualify for the 1000 and 1650 under that provision. Times are compared in the course actually swum, without conversions. Flying-start relay splits are excluded. The meet permits up to six individual events, three per day, and up to two bonus events for a swimmer with an individual qualifying event.</p><p>These are source-verified qualifying-time matches. This audit updates the report; it does not publish new race records to the live database. Current USA Swimming registration, team membership, proof of times and host acceptance remain entry checks.</p><footer>Sources: <a href="${hostUrl}">Kona Aquatics host page</a>, <a href="${packetUrl}">sanctioned meet announcement</a>, <a href="https://www.swimcloud.com/team/10002750/roster/">Velocity’s Swimcloud roster</a>, and each swimmer’s all-course time table and event history. Every qualifying time links to its source result. Snapshot: October 27, 2026.</footer></main></body></html>`;
await writeFile(new URL('velocity-kona-qualifiers.html',directory),html);
const previousVerification = await read('verification.json').catch(() => ({}));
await save('verification.json',{...previousVerification,reportUpdatedAt:publishedAt,externalSupplement:comparison.externalSupplement,swimcloudAudit:comparison.swimcloudAudit,asOf:comparison.asOf,screenshotCutsVerified:114,meetEventsVerified:38,qualifiers:grouped.size,individualEntries:[...grouped.values()].reduce((total,rows)=>total+entryCount(rows),0),qualifyingPerformances:comparison.rows.length,qualifyingRelayPerformances:comparison.relayCuts.length,rosterCount:comparison.rosterCount,withEligibleTimes:comparison.withEligibleTimes,preparedAt:previousVerification.preparedAt ?? publishedAt,standardSha256:createHash('sha256').update(JSON.stringify(standard)).digest('hex')});
console.log(`Verified 114 screenshot cuts; report includes ${grouped.size} swimmers / ${individualEntries} individual entries.`);
