import { describe, expect, it } from 'vitest';
import { originalSource, reviewedDate, type WikiEntry } from '@/components/collection/wiki';
const entry: WikiEntry = {id:'test',title:'Test team',parent_id:null,starts_on:null,ends_on:null,effective_from:null,effective_until:null,updated_at:'2026-10-10T06:30:00Z',kind:'team',source_url:'https://directory.example/team',data:{website:'https://team.example/'}};
describe('Wiki source links', () => {
  it('prefers the official team website', () => expect(originalSource(entry)).toBe('https://team.example/'));
  it('falls back to evidence when no usable team website exists', () => expect(originalSource({...entry,data:{website:'javascript:alert(1)'}})).toBe(entry.source_url));
  it('keeps the original source for documents', () => expect(originalSource({...entry,kind:'document'})).toBe(entry.source_url));
  it('never renders unsafe source protocols', () => expect(originalSource({...entry,source_url:'data:text/html,bad',data:{}})).toBeUndefined());
  it('formats review dates consistently in Pacific time', () => expect(reviewedDate('2026-10-10T06:30:00Z')).toBe('Oct 9, 2026'));
});
