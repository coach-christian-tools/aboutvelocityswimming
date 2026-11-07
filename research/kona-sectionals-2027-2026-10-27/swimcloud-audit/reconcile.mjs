import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const save = async (name, value) => writeFile(new URL(name, root), JSON.stringify(value, null, 2) + '\n');
const standard = await read('standards.json');
const roster = await read('swimcloud-audit/roster.json');
const db = await read('swimcloud-audit/database-roster.json');
const comparison = await read('comparison.json');
await writeFile(new URL('swimcloud-audit/comparison-before-audit.json',root),JSON.stringify(comparison,null,2)+'\n',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
const parseTime = value => Math.round(value.split(':').map(Number).reduce((sum,part)=>sum*60+part,0)*1000);
const timeText = ms => ms>=60000 ? `${Math.floor(ms/60000)}:${((ms%60000)/1000).toFixed(2).padStart(5,'0')}` : (ms/1000).toFixed(2);
// Captured from the user's normal Swimcloud browser view, October 27, 2026.
// All-course personal bests were checked for every listed profile. A PB above
// the cut rules out every slower swim in that event/course. For PBs before the
// window that beat a cut, the full event history was checked for eligible times.
const coverageCounts = `3335149:27 3076542:19 3178541:6 3374242:27 2957451:27 1506235:33 3076575:7 2823857:9 3030295:24 3076549:19 3309855:28 3307667:18 3549829:2 3206746:6 2800516:10 3076550:11 1773637:14 2800534:17 2867460:29 2681680:10 1773529:19 2556190:27 3076576:14 2415217:25 2556198:10 2415226:22 2548442:21 3178542:11 3622814:30 3391951:25 3076551:12 2556401:15 2814558:23 1491194:35 2556196:11 2415485:9 2415481:13 3307666:18 3076544:23 2879750:30 3634257:5 3398708:30 3549821:12 2415480:14 2294585:36 2415482:12 1506248:28 3206749:10 1773534:28 3090407:29 2823858:8 1040656:24 3307668:17 3076568:19 3784024:21 3178559:18 2415494:19 2556192:16 1773487:26 3307671:19 2800521:22 3521769:16 2556202:23 1773635:26 1773443:8 2556204:16 3307669:3 2415487:20 3462530:5 3030301:20 3462534:2 2548436:25 2548437:26 3650436:33 2800313:35 1491175:30 3307670:3 3224579:35 2535322:32 2697483:39 3549824:4 1506252:30 2556194:8 3657478:2 3455293:3`.split(' ').map(token=>token.split(':')).map(([id,rows])=>({id,rows:Number(rows)}));
assert.equal(coverageCounts.length,85);
assert.equal(coverageCounts.reduce((sum,item)=>sum+item.rows,0),1593);
const extras = [
 {profileId:'3657478',name:'Annaleah Castro Lopez',gender:'F'},
 {profileId:'3455293',name:'Sam Parrish',gender:'M'},
];
const coverage = [...roster,...extras].map(person=>{
 const match=coverageCounts.find(entry=>entry.id===person.profileId);
 return {...person,sourceUrl:`https://www.swimcloud.com/swimmer/${person.profileId}/times/`,status:match?'all-course-personal-bests-checked':'no-times-available',rowsChecked:match?.rows??0};
});
assert.equal(coverage.length,87);
const meets = {
 '377326':'Speedo Sectionals - Boise',
 '392871':'Inland Empire Championships (50m)',
 '380762':'IES Short Course Championships',
 '377350':'Western Zone Senior Championship',
 '365629':'PN VAST 49th Annual Washington Open',
 '358314':'Washington State Senior SCY Championships',
 '402194':'Mukilteo Invitational',
};
// profile | event | source time | exact race date | meet | event number | result ID
const observed = `2867460|50_FR_SCY|20.44|2026-03-15|377326|36|173751512
2867460|50_FR_LCM|23.91|2026-07-24|392871|14|182802322
2867460|100_FR_SCY|46.27|2026-03-01|380762|64|172552579
2867460|100_FR_LCM|54.10|2026-07-29|377350|12|183095198
2867460|100_BK_SCY|52.72|2026-02-28|380762|32|172553270
2867460|100_FL_SCY|53.16|2026-02-28|380762|40|172552413
2879750|50_FR_LCM|25.30|2026-07-24|392871|14|182801739
2879750|200_BK_SCY|1:56.95|2026-03-01|380762|56|172554861
2879750|200_BK_LCM|2:16.71|2026-07-30|377350|24|183094605
3398708|50_FR_LCM|25.47|2026-07-24|392871|14|182802326
2294585|500_FR_SCY|4:48.05|2026-01-16|365629|16|168356917
2294585|800_FR_LCM|9:03.11|2026-08-01|377350|40|183097682
2294585|1000_FR_SCY|10:05.01|2025-12-21|358314|102|166141750
2294585|1650_FR_SCY|16:43.24|2025-12-21|358314|102|166141750
2294585|100_FL_LCM|59.98|2026-07-30|377350|22|183094934
3090407|100_BR_LCM|1:18.16|2026-07-28|377350|5|183097330
3090407|100_BR_SCY|1:08.40|2026-03-14|377326|25|173751178
2800313|100_BR_SCY|1:06.88|2025-12-19|358314|9|166141248
2800313|100_BR_LCM|1:19.40|2026-07-28|377350|5|183097333
3224579|200_FR_SCY|1:55.36|2026-10-10|402194|2|189510665
3224579|400_FR_LCM|4:40.69|2026-07-30|377350|19|183092735
3224579|1500_FR_LCM|18:44.66|2026-07-28|377350|7|183096503
3224579|1650_FR_SCY|18:18.90|2026-01-18|365629|43|168355920
2535322|100_BR_LCM|1:16.44|2026-07-28|377350|5|183097336
2535322|100_BR_SCY|1:05.92|2025-12-19|358314|9|166141250
2535322|200_BR_SCY|2:25.76|2026-01-18|365629|37|168352642
2535322|200_BR_LCM|2:46.00|2026-07-31|377350|33|183097461
2697483|100_BK_LCM|1:09.43|2026-07-31|377350|31|183096117`.split('\n').map(line=>line.split('|'));
const rows = observed.map(([profileId,event_code,time,date,meetId,eventNumber,resultId])=>{
 const person=roster.find(item=>item.profileId===profileId);
 assert(person,profileId);
 const athlete = db.find(item=>item.id===person.databaseId);
 assert(athlete,person.name);
 const course=event_code.split('_').at(-1);
 const cut=standard.cuts[course][person.gender].Open[event_code].cutsByTier[0];
 const time_ms=parseTime(time);
 assert(time_ms<=cut.timeMs,person.name+' '+event_code);
 assert(date>=comparison.qualifyingStart && date<=comparison.asOf);
 const previous=comparison.rows.find(row=>row.athlete_id===athlete.id&&row.event_code===event_code);
 const split=event_code==='1000_FR_SCY'&&profileId==='2294585';
 return {athlete_id:athlete.id,first_name:athlete.first,last_name:athlete.last,event_code,course,time_ms,cut_ms:cut.timeMs,cut_display:timeText(cut.timeMs),date,meet:meets[meetId],source_url:`https://www.swimcloud.com/results/${meetId}/event/${eventNumber}/?id=${resultId}#time${resultId}`,profile_id:profileId,external_result_id:resultId,source_status:'verified-swimcloud-audit',database_swim_id:previous?.swim_id??null,source_note:split?'Intermediate 1000-yard split extracted from the 1650. Both distance entries are independently supported by full 1650 SCY and 800 LCM qualifying performances.':'Exact date and time read from Swimcloud’s all-course personal-bests table or full event history.',is_intermediate_split:split,history_checked:['173751178','183097333','166141250'].includes(resultId)};
});
assert.equal(rows.length,28);
assert.equal(new Set(rows.map(row=>row.athlete_id)).size,9);
const audit = {
 checkedAt:'2026-10-27T15:56:13.624Z',source:'Swimcloud normal signed-in browser; public swimmer best-times and event-history tables',
 rosterSources:['https://www.swimcloud.com/team/10002750/roster/?gender=M&season_id=30','https://www.swimcloud.com/team/10002750/roster/?gender=F&season_id=30','https://www.swimcloud.com/team/10002750/roster/?gender=M&season_id=29','https://www.swimcloud.com/team/10002750/roster/?gender=F&season_id=29'],
 currentRosterProfiles:85,currentRosterPeople:84,extraProfilesChecked:2,profileTablesRead:85,totalBestTimeRows:1593,
 eventHistoryChecks:[{profileId:'3090407',event:'100_BR_SCY',rows:22},{profileId:'2800313',event:'100_BR_LCM',rows:35},{profileId:'2535322',event:'100_BR_SCY',rows:36}],
 method:'Check every event/course all-time personal best. If above the cut, every slower recorded swim is also above it. If at or faster than the cut, verify the date. For qualifying-level PBs before December 1, 2025, check the full event history and choose the best eligible swim. Include all recorded affiliations. Link both Ole Stiles profiles for this report and count him once. Do not infer missing times or treat intermediate splits as independent full-race proof.',
 unavailableProfiles:[{profileId:'3590649',name:'Sam Anger',reason:'No times available'},{profileId:'3549833',name:'Sawyer Smith',reason:'No times available'}],
 unmatchedDatabaseNames:['Bella Castro Lopez','Ignacio Harrison'],
 scopeLimit:'No matching Swimcloud profile was located for Bella Castro Lopez or Ignacio Harrison. No published time table was available for Sam Anger or Sawyer Smith. No qualifying claim is made for those four swimmers. The roster comparison does not independently verify current USA Swimming registration or sanction eligibility of each school result.',
 newlyIdentifiedQualifiers:['Marieka Campbell','Aurelia Ribellia','Caroline Sullivan','Lindsay Sutton'],
 coverage,qualifyingRows:rows,
};
await save('swimcloud-audit/results.json',audit);
comparison.rows=rows.sort((a,b)=>a.last_name.localeCompare(b.last_name)||a.first_name.localeCompare(b.first_name)||a.event_code.localeCompare(b.event_code));
comparison.swimcloudAudit={...audit,coverage:undefined,qualifyingRows:undefined};
comparison.externalSupplement={verifiedAt:audit.checkedAt,scope:'Roster-wide Swimcloud verification',sources:'swimcloud-audit/results.json',note:'Updates this report with verified source times; no canonical athlete, swim or meet records were changed by this audit.'};
await save('comparison.json',comparison);
console.log('Reconciled 85 all-course best-time tables (1,593 rows), 93 event-history rows, and 28 matching event/course times for 9 swimmers.');
