import { readFileSync } from 'node:fs';
import { adminDatabase } from './lib/admin.mjs';
import { parseSwimTime, formatSwimTime } from '../../src/features/swim-resources/lib/domain/swim-time.ts';
if (process.argv.includes('--help')) {
  console.log('node scripts/swim-resources/import-standards.mjs --project <id> --database "(default)" [--key <key.json>] [--apply --confirm-project <id> --confirm-database "(default)"]');
  process.exit(0);
}
const { db, project, database, apply } = adminDatabase();
if (database === 'velocity-v2') throw new Error('Legacy maintenance is disabled for velocity-v2. Use evidence-backed Import.');
const parseStandardTimeToMs = value => {
  const time = parseSwimTime(value);
  if (!time || time <= 0) throw new Error('Invalid standard time; no writes applied.');
  return time;
};
const formatStandardMsToTime = formatSwimTime;

function mapAgeRangeToGroup(minAge, maxAge) {
  if (minAge == null && maxAge === 10) return '10&U';
  if (minAge === 11 && maxAge === 12) return '11-12';
  if (minAge === 13 && maxAge === 14) return '13-14';
  if (minAge === 15 && maxAge === 16) return '15-16';
  if (minAge === 17 && maxAge === 18) return '17-18';
  if (minAge == null && maxAge === 18) return '18&U';
  if (minAge === 19 && maxAge == null) return '19&O';
  if (minAge == null && maxAge == null) return 'Open';
  if (minAge != null && maxAge == null) return `${minAge}&O`;
  if (minAge == null && maxAge != null) return `${maxAge}&U`;
  return `${minAge}-${maxAge}`;
}

function parseStandardEvent(eventStr) {
  const clean = eventStr.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(\d+)\s+([A-Za-z]+)\s+([A-Za-z]+)$/i);
  if (m) {
    const dist = parseInt(m[1], 10);
    const stRaw = m[2].toUpperCase();
    const crRaw = m[3].toUpperCase();
    if (!['FR','FREE','BK','BACK','BR','BREAST','FL','FLY','IM'].includes(stRaw) || !['SCY','SCM','LCM'].includes(crRaw)) throw new Error(`Invalid standards event: ${clean}`);
    let stroke = 'FR';
    if (stRaw === 'BK' || stRaw === 'BACK') stroke = 'BK';
    else if (stRaw === 'BR' || stRaw === 'BREAST') stroke = 'BR';
    else if (stRaw === 'FL' || stRaw === 'FLY') stroke = 'FL';
    else if (stRaw === 'IM') stroke = 'IM';
    let course = 'SCY';
    if (crRaw === 'LCM') course = 'LCM';
    else if (crRaw === 'SCM') course = 'SCM';
    return { eventCode: `${dist}_${stroke}_${course}`, distance: dist, stroke, course };
  }
  throw new Error(`Invalid standards event: ${clean}`);
}

function cleanFirestoreData(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.filter(item => item !== undefined).map(cleanFirestoreData);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) cleaned[key] = cleanFirestoreData(value);
    }
    return cleaned;
  }
  return obj;
}

async function runImport() {
  console.log(JSON.stringify({ project, mode: apply ? 'apply' : 'dry-run' }));

  const raw = JSON.parse(readFileSync(new URL('../../src/features/swim-resources/lib/data/raw-standards.json', import.meta.url), 'utf8'));
  console.log(`Loaded ${raw.length} raw standard slices from src/features/swim-resources/lib/data/raw-standards.json`);

  const motivationalSet = {
    id: 'usas_motivational_2024_2028',
    name: '2024-2028 USA Swimming Motivational Standards',
    governingBody: 'USA_Swimming',
    seasonYears: '2024-2028',
    effectiveDate: '2024-01-01',
    expirationDate: '2028-12-31',
    cuts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const championshipSet = {
    id: 'championship_cuts_2025_2026',
    name: '2025-2026 Championship Qualifying Standards',
    governingBody: 'USA_Swimming',
    seasonYears: '2025-2026',
    effectiveDate: '2025-01-01',
    expirationDate: '2026-12-31',
    cuts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  for (const entry of raw) {
    const targetSet = entry.isStandard ? motivationalSet : championshipSet;
    const genderKey = entry.gender === 'Female' ? 'F' : 'M';
    const ageGroup = mapAgeRangeToGroup(entry.minAge, entry.maxAge);
    const tierName = entry.cut;

    for (const [rawEventName, timeStr] of Object.entries(entry.times || {})) {
      if (!timeStr) continue;
      const { course, eventCode } = parseStandardEvent(rawEventName);
      const timeMs = parseStandardTimeToMs(timeStr);
      const timeDisplay = formatStandardMsToTime(timeMs);

      if (!targetSet.cuts[course]) targetSet.cuts[course] = {};
      if (!targetSet.cuts[course][genderKey]) targetSet.cuts[course][genderKey] = {};
      if (!targetSet.cuts[course][genderKey][ageGroup]) targetSet.cuts[course][genderKey][ageGroup] = {};
      if (!targetSet.cuts[course][genderKey][ageGroup][eventCode]) {
        targetSet.cuts[course][genderKey][ageGroup][eventCode] = { cutsByTier: [] };
      }

      const existingIdx = targetSet.cuts[course][genderKey][ageGroup][eventCode].cutsByTier.findIndex(
        c => c.tierName === tierName
      );
      const cutObj = { tierName, timeMs, timeDisplay };

      if (existingIdx >= 0) {
        targetSet.cuts[course][genderKey][ageGroup][eventCode].cutsByTier[existingIdx] = cutObj;
      } else {
        targetSet.cuts[course][genderKey][ageGroup][eventCode].cutsByTier.push(cutObj);
      }
    }
  }

  // Sort cuts by timeMs ascending (fastest first)
  for (const set of [motivationalSet, championshipSet]) {
    for (const course of Object.keys(set.cuts)) {
      for (const gender of Object.keys(set.cuts[course] || {})) {
        for (const ageGroup of Object.keys(set.cuts[course][gender] || {})) {
          for (const eventCode of Object.keys(set.cuts[course][gender][ageGroup] || {})) {
            set.cuts[course][gender][ageGroup][eventCode].cutsByTier.sort((a, b) => a.timeMs - b.timeMs);
          }
        }
      }
    }
  }

  console.log(`Prepared motivationalSet with courses: ${Object.keys(motivationalSet.cuts).join(', ')}`);
  console.log(`Prepared championshipSet with courses: ${Object.keys(championshipSet.cuts).join(', ')}`);

  if (!apply) { console.log('Validation complete; dry run only.'); return; }
  const batch = db.batch();
  batch.set(db.collection('standards').doc(motivationalSet.id), cleanFirestoreData(motivationalSet));
  batch.set(db.collection('standards').doc(championshipSet.id), cleanFirestoreData(championshipSet));
  await batch.commit();

  console.log('SUCCESS! Successfully committed both standard sets:');
  console.log(`- standards/${motivationalSet.id}`);
  console.log(`- standards/${championshipSet.id}`);
  process.exit(0);
}

runImport().catch(err => {
  console.error('Import failed with error:', err);
  process.exit(1);
});
