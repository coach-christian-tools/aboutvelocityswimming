export const SWIM_RESOURCES_PATH = '/tools/swim-resources';
export const PREPARED_IMPORTS_PATH = '/api/swim-resources/admin/imports/prepared';

/** App-relative paths; callers keep their existing encoding and query strings. */
export function swimResourcesPath(path = '/'): string {
  return SWIM_RESOURCES_PATH + (path === '/' ? '' : path.startsWith('/') ? path : '/' + path);
}

export function swimResourcesAsset(path: string): string {
  return '/swim-resources/' + path.replace(/^\//, '');
}
