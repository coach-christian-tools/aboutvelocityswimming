import { factFields } from '../../../src/features/swim-resources/lib/domain/evidence.ts';
import { matchImportAthlete } from '../../../src/features/swim-resources/lib/domain/athlete-match.ts';
import { isCalendarDate } from '../../../src/features/swim-resources/lib/domain/date.ts';

/** Stage observations only. Absent or ambiguous swimmers never become inactive. */
export function rosterBatch(rows, athletes, source, batchId, idColumns = {}) {
  const unresolved = [], proposals = [], matched = new Set();
  let historicalRows = 0;
  for (const [index, row] of rows.entries()) {
    const id = 'roster_' + (index + 1), sourceIds = [source.id];
    const first = String(row['Memb. First Name'] ?? '').trim(), last = String(row['Memb. Last Name'] ?? '').trim();
    const data = { name: { first, last } };
    for (const [field, column] of Object.entries(idColumns)) if (String(row[column] ?? '').trim()) data[field] = String(row[column]).trim();
    if (row.Birthday) {
      const birthday = String(row.Birthday).trim();
      if (/^\d{4}-\d{2}-\d{2}(?:\s|T|$)/.test(birthday)) data.dob = birthday.slice(0, 10);
      else {
        const [month, day, year] = birthday.split('/').map(value => value.trim());
        data.dob = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }
    if (row.Gender) { const gender = String(row.Gender).trim(); data.gender = ({ Male: 'M', Female: 'F', Other: 'X' })[gender] ?? gender; }
    const group = String(row.Roster || row['Billing Group'] || '').trim();
    if (group && group !== 'Not Assigned' && !group.includes('Deleted')) data.currentGroup = { name: group === 'Coaches' ? 'Board Members & Coaches' : group };
    const location = String(row.Location ?? '').trim();
    if (['In Water', 'Velocity Swimming'].includes(location)) data.status = 'active';
    else if (location === 'Not Registered') data.status = 'inactive';
    else if (location === 'Leave of Absence') data.status = 'taking_break';
    const match = matchImportAthlete(data, athletes);
    // Complete membership exports include years of cancelled accounts. Keep those
    // captures, but do not propose creating unrelated historical athletes.
    const sourceStatus = String(row['Member Status'] ?? '').trim();
    if (!match.id && sourceStatus && sourceStatus !== 'Active' && !match.conflict?.startsWith('Ambiguous')) { historicalRows++; continue; }
    let holdReason = !first || !last ? 'Incomplete source name.' : match.conflict;
    if (data.dob && !isCalendarDate(data.dob)) holdReason = 'Invalid source birthday.';
    if (data.gender && !['M', 'F', 'X'].includes(data.gender)) holdReason = 'Unknown source gender.';
    if (!data.status) unresolved.push({ id: id + '_status', sourceIds, message: 'Row ' + (index + 1) + ' has blank or unrecognized membership status; current status is preserved.' });
    if (match.id && !holdReason) {
      const previous = athletes.find(athlete => athlete.id === match.id);
      data.id = match.id;
      // Preserve the coach's spelling; verified external IDs can match changed names.
      if (previous?.name) delete data.name;
      if (previous?.status === 'alumni' && data.status !== 'active') delete data.status;
      matched.add(match.id);
    }
    proposals.push({ id, kind: 'athlete', sourceIds, verified: !holdReason, data, ...(holdReason ? { holdReason } : {}) });
  }
  if (historicalRows) unresolved.push({ id: 'historical_members', sourceIds: [source.id], message: historicalRows + ' unmatched non-active memberships were retained in the source capture; no historical athletes are proposed for creation.' });
  for (const athlete of athletes) if (!matched.has(athlete.id) && athlete.status !== 'alumni') {
    unresolved.push({ id: 'absent_' + athlete.id, sourceIds: [source.id], message: 'Athlete ' + athlete.id + ' was not matched in this export. Review source coverage; no status change proposed.' });
  }
  return { version: 2, target: source.target, id: batchId, collectedAt: source.collectedAt, sources: [source], rows: proposals.map(row => ({ ...row, evidence: [{ sourceId: source.id, revisionId: source.revisionId, checkId: source.checkId, checkedAt: source.collectedAt, fields: factFields(row.data), context: source.scope, excerpt: 'Matched roster export row; original capture retained.' }] })), unresolved };
}
