import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { MAX_CAPTURE_BYTES, hashBytes } from './evidence-archive.mjs';
export function publicAddress(address) {
  if (address.includes(':')) return !(/^(::|fc|fd|fe80|ff)/i.test(address) || address.includes('.') || address.startsWith('::ffff:'));
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}
export async function collectHttp(reference, fetcher = fetch, resolver = lookup) {
  let url = new URL(reference);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP sources are supported.');
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await resolver(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Source resolves to a private network.');
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'VelocityEvidenceCollector/2' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw new Error('Missing redirect location.'); url = new URL(location, url); continue; }
    if (!response.ok) throw new Error('Source HTTP status ' + response.status);
    if (Number(response.headers.get('content-length')) > MAX_CAPTURE_BYTES) throw new Error('Source exceeds capture size limit.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body ?? []) { size += chunk.length; if (size > MAX_CAPTURE_BYTES) throw new Error('Source exceeds capture size limit.'); chunks.push(Buffer.from(chunk)); }
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) throw new Error('Source returned an empty capture.');
    return { bytes, hash: hashBytes(bytes), contentType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream', finalUrl: url.href };
  }
  throw new Error('Source exceeded redirect limit.');
}
