type JsonRecord = Record<string, unknown>;
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function fold(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function matchImportAthlete(data: JsonRecord, athletes: JsonRecord[]): { id: string | null; conflict?: string } {
  const candidates = new Set<string>();
  for (const key of ['id', 'teamUnifyId', 'swimsId', 'swimcloudId']) {
    const value = data[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(value)) return { id: null, conflict: key + ' must be a string.' };
    const matches = athletes.filter(athlete => String(athlete[key] ?? '').trim().toLowerCase() === value.trim().toLowerCase());
    if (matches.length > 1) return { id: null, conflict: 'Multiple athletes share ' + key + '.' };
    matches.forEach(athlete => candidates.add(String(athlete.id)));
  }
  if (candidates.size > 1) return { id: null, conflict: 'External identifiers point to different athletes.' };
  if (candidates.size === 1) {
    const id = [...candidates][0], athlete = athletes.find(a => a.id === id)!;
    for (const key of ['teamUnifyId', 'swimsId', 'swimcloudId']) {
      if (data[key] && athlete[key] && String(data[key]).toLowerCase() !== String(athlete[key]).toLowerCase()) return { id: null, conflict: 'Existing ' + key + ' does not match the source.' };
    }
    if (data.id && data.id !== id) return { id: null, conflict: 'Supplied athlete id does not match the external identity.' };
    return { id };
  }
  const name = data.name as { first?: string; last?: string } | undefined;
  if (!name?.first || !name.last) return { id: null, conflict: 'An unmatched athlete needs a complete name.' };
  const names = [fold(name.first + ' ' + name.last), fold(name.last + ', ' + name.first)];
  const matches = athletes.filter(athlete => {
    const current = athlete.name as { first?: string; last?: string } | undefined;
    const aliases = Array.isArray(athlete.aliases) ? athlete.aliases.filter(alias => typeof alias === 'string') as string[] : [];
    return [String(current?.first ?? athlete.firstName ?? '') + ' ' + String(current?.last ?? athlete.lastName ?? ''), ...aliases].some(alias => names.includes(fold(alias)));
  });
  if (matches.length > 1) return { id: null, conflict: 'Ambiguous name or alias; provide a verified external identity.' };
  if (matches.length === 1) {
    const athlete = matches[0];
    if (!data.dob || !athlete.dob) return { id: null, conflict: 'Name-only matches require a verified date of birth or external identity.' };
    if (data.id && data.id !== athlete.id) return { id: null, conflict: 'Name belongs to a different athlete id.' };
    if (data.dob && athlete.dob && data.dob !== athlete.dob) return { id: null, conflict: 'Name matches but date of birth differs.' };
    for (const key of ['teamUnifyId', 'swimsId', 'swimcloudId']) {
      if (data[key] && athlete[key] && data[key] !== athlete[key]) return { id: null, conflict: 'Name matches but ' + key + ' differs.' };
    }
    return { id: String(athlete.id) };
  }
  if (!data.teamUnifyId && !data.swimsId && !data.swimcloudId) return { id: null, conflict: 'New athletes require a verified external ID to prevent duplicates.' };
  const key = ['teamUnifyId', 'swimsId', 'swimcloudId'].find(key => data[key])!;
  const id = 'ath_' + key.toLowerCase() + '_' + String(data[key]).toLowerCase();
  if (data.id && data.id !== id) return { id: null, conflict: 'New athletes use a deterministic external-id key: ' + id }; 
  return safeId(id) ? { id } : { id: null, conflict: 'Use a valid canonical athlete id.' };
}
