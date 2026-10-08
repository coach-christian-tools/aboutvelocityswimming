export interface FirestoreAthlete {
  teamId?: string;
  personId?: string;
  documentIds?: string[];
  id: string;
  name?: {
    first: string;
    last: string;
    preferred?: string;
    middle?: string;
  };
  firstName?: string;
  lastName?: string;
  gender?: 'M' | 'F' | 'X' | string;
  dob?: string;
  graduatingYear?: number;
  swimsId?: string;
  swimcloudId?: string;
  teamUnifyId?: string;
  status?: 'active' | 'taking_break' | 'alumni' | 'inactive';
  location?: string;
  currentGroup?: {
    id: string;
    name: string;
    rosterTier?: string;
    assignedAt?: string;
  };
  group?: string;
  rosterGroup?: string;
  _formattedGroup?: string;
  resultCount?: number;
  contact?: {
    email?: string;
    phone?: string;
    parents?: {
      name: string;
      email: string;
      phone: string;
      relationship: 'Mother' | 'Father' | 'Guardian';
    }[];
  };
  styling?: {
    badgeColor?: string;
    notes?: string;
    tags?: string[];
  };
  aliases?: string[];
  notes?: string;
  email?: string;
  phone?: string;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    syncedAt?: string;
  };
  
}


export const normalizeAthleteStatus = (status?: string, location?: string): 'active' | 'taking_break' | 'alumni' | 'inactive' => {
  const raw = (status || location || 'active').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (raw === 'active') return 'active';
  if (raw === 'alumni') return 'alumni';
  if (raw === 'taking_break' || raw === 'break') return 'taking_break';
  if (raw === 'inactive' || raw === 'quit' || raw === 'past') return 'inactive';
  return 'active';
};

export function formatGroup(rawGroup?: string): string {
  const group = (rawGroup || '').replace(/\s*\(.*?\)\s*/g, '').trim();
  return group.toLowerCase() === 'littles' ? 'Littles' : group || 'Unassigned';
}

export interface PublicAthlete {
  id: string;
  name: { first: string; last: string; preferred?: string };
  aliases: string[];
  swimcloudId?: string;
}

// Explicit allowlist: no DOB, contact, identifiers, status, group or coach notes.
export function publicAthlete(id: string, athlete: FirestoreAthlete): PublicAthlete {
  const first = athlete.name?.first || athlete.firstName || '';
  const last = athlete.name?.last || athlete.lastName || '';
  return {
    id,
    name: { first, last, ...(athlete.name?.preferred ? { preferred: athlete.name.preferred } : {}) },
    aliases: [...new Set([`${first} ${last}`.trim(), `${last}, ${first}`.trim(), ...(athlete.aliases || [])])],
    ...(athlete.swimcloudId ? { swimcloudId: athlete.swimcloudId } : {}),
  };
}
