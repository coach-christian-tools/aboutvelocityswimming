export type LocationValue = 'Active' | 'Taking Break' | 'Inactive' | 'Alumni' | string;

export const locationToStatus = (location: LocationValue | undefined): 'active' | 'taking_break' | 'alumni' | 'inactive' => {
  switch (location) {
    case 'Active':
      return 'active';
    case 'Taking Break':
      return 'taking_break';
    case 'Alumni':
      return 'alumni';
    default:
      return 'inactive';
  }
};

export const statusToLocation = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'taking_break':
      return 'Taking Break';
    case 'alumni':
      return 'Alumni';
    default:
      return 'Inactive';
  }
};

export const buildAthleteSlug = (first: string, last: string): string => {
  const f = first.toLowerCase().replace(/[^a-z0-9]/g, '');
  const l = last.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `ath_${f}_${l}_${crypto.randomUUID()}`;
};

export const buildAliases = (first: string, last: string, preferred?: string): string[] => {
  const f = first.trim();
  const l = last.trim();
  const p = preferred?.trim();
  return Array.from(new Set([
    `${f} ${l}`,
    `${l}, ${f}`,
    ...(p ? [`${p} ${l}`, `${l}, ${p}`] : [])
  ]));
};
