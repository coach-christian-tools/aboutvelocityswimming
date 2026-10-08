export const FRESH_DATABASE_ID = 'velocity-v2';
export function databaseId(value?: string): string {
  const id = value || '(default)';
  if (id !== '(default)' && !/^[a-z][a-z0-9-]{2,62}$/.test(id)) throw new Error('Invalid Firestore database ID.');
  return id;
}
export function importDirectory(project: string, database: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(project)) throw new Error('Invalid project ID.');
  return `backups/imports/${project}/${databaseId(database)}`;
}
