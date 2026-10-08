import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Firestore } from 'firebase-admin/firestore';
import { inspectAssistantHistory, deleteAssistantHistory } from '../../scripts/swim-resources/lib/assistant-cleanup.mjs';
import { backfillEntities } from '../../scripts/swim-resources/lib/entity-backfill.mjs';
import { VIEWER_COLLECTIONS } from '../../src/features/swim-resources/lib/domain/data-viewer';

let environment: RulesTestEnvironment;
const profile = { id: 'test', name: { first: 'Test', last: 'Swimmer' }, aliases: ['Test Swimmer'] };
const coach = () => environment.authenticatedContext('coach', { email: 'coach@velocity-swimming.com', email_verified: true }).firestore();
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-cutter-coach', firestore: { host: '127.0.0.1', port: 8088, rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await setDoc(doc(database, 'athletes/test'), { ...profile, dob: '2000-01-01', contact: { email: 'private' }, styling: { notes: 'private' } });
    await setDoc(doc(database, 'public_athletes/test'), profile);
    await setDoc(doc(database, 'athletes/test/bests/100_FR_SCY'), { eventCode: '100_FR_SCY', bestTimeMs: 54000 });
    await setDoc(doc(database, 'chatbot_conversations/test/messages/00000000'), { position: 0, message: { text: 'private' } });
  });
});
afterAll(async () => { await environment?.cleanup(); });

describe('athlete privacy rules', () => {
  it('allows registered viewer collections for coaches and protects private enumeration', async () => {
    const allowed = coach();
    const anonymous = environment.unauthenticatedContext().firestore();
    for (const item of VIEWER_COLLECTIONS) {
      await assertSucceeds(getDocs(collection(allowed, item.id)));
      if (!['public_athletes', 'standards'].includes(item.id)) await assertFails(getDocs(collection(anonymous, item.id)));
    }
    await assertSucceeds(getDocs(collection(allowed, 'athletes/test/bests')));
    await assertSucceeds(getDocs(collection(allowed, 'import_batches/test/changes')));
    await assertFails(getDocs(collection(anonymous, 'import_batches/test/changes')));
  });
  it('denies anonymous private reads and collection enumeration', async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(database, 'athletes/test')));
    await assertFails(getDocs(collection(database, 'athletes')));
    const result = await assertSucceeds(getDoc(doc(database, 'public_athletes/test')));
    expect(result.data()).toEqual(profile);
    await assertSucceeds(getDoc(doc(database, 'athletes/test/bests/100_FR_SCY')));
  });
  it('allows verified coaches to read and atomically publish valid profiles', async () => {
    const database = coach();
    await assertSucceeds(getDoc(doc(database, 'athletes/test')));
    const batch = writeBatch(database);
    batch.set(doc(database, 'athletes/test'), { ...profile, dob: '2000-01-01' });
    batch.set(doc(database, 'public_athletes/test'), profile);
    await assertSucceeds(batch.commit());
  });
  it('refuses private fields at the public projection boundary', async () => {
    const database = coach();
    for (const extra of [{ dob: '2000-01-01' }, { contact: { email: 'private' } }, { notes: 'private' }]) {
      await assertFails(setDoc(doc(database, 'public_athletes/test'), { ...profile, ...extra }));
    }
    await assertFails(setDoc(doc(database, 'public_athletes/test'), { ...profile, name: { ...profile.name, notes: 'private' } }));
    await assertFails(setDoc(doc(database, 'public_athletes/other'), profile));
  });
  it('denies unverified coaches and accounts outside the coach domain', async () => {
    for (const [email, verified] of [['coach@velocity-swimming.com', false], ['outsider@example.com', true]] as const) {
      const database = environment.authenticatedContext('outsider', { email, email_verified: verified }).firestore();
      await assertFails(getDoc(doc(database, 'athletes/test')));
      await assertFails(setDoc(doc(database, 'public_athletes/test'), profile));
    }
  });
  it('protects message descendants as well as conversation summaries', async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'chatbot_conversations/test/messages/00000000')));
    await assertSucceeds(getDoc(doc(coach(), 'chatbot_conversations/test/messages/00000000')));
  });
});


describe('retired assistant and import audit permissions', () => {
  it('denies retired collection reads, writes and descendants even for verified coaches', async () => {
    for (const name of ['goals', 'film_sessions', 'records']) {
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), name, 'legacy'), { legacy: true });
        await setDoc(doc(context.firestore(), name, 'legacy', 'nested', 'child'), { legacy: true });
      });
      for (const database of [coach(), environment.unauthenticatedContext().firestore()]) {
        await assertFails(getDocs(collection(database, name)));
        await assertFails(getDoc(doc(database, name, 'legacy')));
        await assertFails(setDoc(doc(database, name, 'new'), { legacy: false }));
        await assertFails(setDoc(doc(database, name, 'legacy'), { legacy: false }));
        await assertFails(deleteDoc(doc(database, name, 'legacy')));
        await assertFails(getDoc(doc(database, name, 'legacy', 'nested', 'child')));
        await assertFails(setDoc(doc(database, name, 'legacy', 'nested', 'new'), {}));
      }
    }
  });
  it('disables assistant writes and permits verified coach cleanup', async () => {
    const database = coach();
    await assertFails(setDoc(doc(database, 'chatbot_conversations/new'), { messages: ['legacy'] }));
    await assertFails(setDoc(doc(database, 'chatbot_conversations/test/messages/new'), { text: 'new' }));
    await assertFails(setDoc(doc(database, 'import_conversations/new'), { messages: ['legacy'] }));
    await assertFails(setDoc(doc(database, 'import_conversations/test/messages/new'), { text: 'new' }));
    await assertSucceeds(deleteDoc(doc(database, 'chatbot_conversations/test/messages/00000000')));
  });
  it('keeps import receipts and batch metadata coach-only', async () => {
    const database = coach();
    await assertSucceeds(setDoc(doc(database, 'import_batches/batch'), { sources: [], projectionState: 'pending' }));
    await assertSucceeds(setDoc(doc(database, 'import_batches/batch/changes/row'), { before: { contact: 'private' } }));
    await assertSucceeds(setDoc(doc(database, 'import_review_items/hash'), { decision: 'keep_current' }));
    await assertSucceeds(setDoc(doc(database, 'import_state/projections'), { state: 'pending' }));
    for (const other of [environment.unauthenticatedContext(), environment.authenticatedContext('other', { email: 'other@example.com', email_verified: true }), environment.authenticatedContext('unverified', { email: 'coach@velocity-swimming.com', email_verified: false })]) {
      await assertFails(getDoc(doc(other.firestore(), 'import_batches/batch')));
      await assertFails(getDoc(doc(other.firestore(), 'import_batches/batch/changes/row')));
      await assertFails(setDoc(doc(other.firestore(), 'import_batches/new'), {}));
      await assertFails(getDoc(doc(other.firestore(), 'import_review_items/hash')));
      await assertFails(setDoc(doc(other.firestore(), 'import_review_items/hash'), {}));
      await assertFails(getDoc(doc(other.firestore(), 'import_state/projections')));
    }
  });
  it('deletes legacy inline history and orphan descendants without affecting coaching data or other messages', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
    const database = new Firestore({ projectId: 'demo-cutter-coach' });
    try {
      await database.doc('chatbot_conversations/inline').set({ messages: [{ text: 'Synthetic inline history' }] });
      await database.doc('chatbot_conversations/orphan/messages/child').set({ text: 'Synthetic orphan' });
      await database.doc('chatbot_conversations/orphan/messages/child/nested/deeper').set({ text: 'Synthetic nested child' });
      await database.doc('import_conversations/inline').set({ messages: [{ text: 'Synthetic predecessor history' }] });
      await database.doc('import_conversations/orphan/messages/child/nested/deeper').set({ text: 'Synthetic predecessor orphan' });
      await database.doc('coaching_threads/other/messages/keep').set({ text: 'Keep unrelated data' });
      const before = await inspectAssistantHistory(database);
      expect(before.parents.length).toBe(5);
      expect(before.owned.length).toBe(2);
      expect(before.collections.import_conversations.conversationPaths).toBe(2);
      await deleteAssistantHistory(database);
      const after = await inspectAssistantHistory(database);
      expect(after.parents).toHaveLength(0);
      expect(after.owned).toHaveLength(0);
      expect((await database.doc('athletes/test').get()).exists).toBe(true);
      expect((await database.doc('coaching_threads/other/messages/keep').get()).exists).toBe(true);
      expect((await database.doc('chatbot_conversations/orphan/messages/child/nested/deeper').get()).exists).toBe(false);
      expect((await database.doc('import_conversations/inline').get()).exists).toBe(false);
      expect((await database.doc('import_conversations/orphan/messages/child/nested/deeper').get()).exists).toBe(false);
    } finally { await database.terminate(); }
  });
});


describe('private connected entities and ownership backfill', () => {
  it('protects entity writes from anonymous, unverified and outside accounts', async () => {
    for (const collection of ['teams', 'people', 'venues', 'documents']) {
      await assertSucceeds(setDoc(doc(coach(), collection, 'synthetic'), { name: 'Synthetic' }));
      for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('unverified', { email: 'coach@velocity-swimming.com', email_verified: false }), environment.authenticatedContext('outside', { email: 'outside@example.test', email_verified: true })]) {
        await assertFails(getDoc(doc(context.firestore(), collection, 'synthetic')));
        await assertFails(setDoc(doc(context.firestore(), collection, 'synthetic'), {}));
      }
    }
  });
  it('backfills Velocity links without touching public profiles, coaching fields, explicit owners or hosts, and is repeatable', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
    const database = new Firestore({ projectId: 'demo-cutter-coach' });
    try {
      await database.doc('meets/legacy').set({ name: 'Legacy Meet', host: 'External Host', venue: { facilityName: 'Unlinked Pool' } });
      await database.doc('practice_sessions/other').set({ teamId: 'other-team', coachNotes: 'Keep' });
      for (const name of ['goals', 'film_sessions', 'records']) await database.doc(`${name}/retired`).set({ legacy: 'Keep' });
      const publicBefore = (await database.doc('public_athletes/test').get()).data();
      const dry = await backfillEntities(database);
      expect(dry.peopleCreated).toBe(1);
      expect((await database.doc('teams/velocity-swimming').get()).exists).toBe(false);
      expect((await database.doc('athletes/test').get()).data()).not.toHaveProperty('teamId');
      const backups: { path: string; before: unknown }[] = [];
      await backfillEntities(database, { apply: true, beforeWrite: (path: string, before: unknown) => backups.push({ path, before }) });
      const athlete = (await database.doc('athletes/test').get()).data()!;
      expect(athlete).toMatchObject({ teamId: 'velocity-swimming', dob: '2000-01-01', contact: { email: 'private' }, styling: { notes: 'private' } });
      const person = (await database.doc('people/' + athlete.personId).get()).data();
      expect(person).toMatchObject({ name: 'Test Swimmer', athleteId: 'test', role: 'Athlete', teamId: 'velocity-swimming' });
      expect(person).not.toHaveProperty('contact');
      expect((await database.doc('meets/legacy').get()).data()).toEqual({ name: 'Legacy Meet', host: 'External Host', venue: { facilityName: 'Unlinked Pool' }, teamId: 'velocity-swimming' });
      expect((await database.doc('practice_sessions/other').get()).data()).toEqual({ teamId: 'other-team', coachNotes: 'Keep' });
      for (const name of ['goals', 'film_sessions', 'records']) expect((await database.doc(`${name}/retired`).get()).data()).toEqual({ legacy: 'Keep' });
      expect((await database.doc('public_athletes/test').get()).data()).toEqual(publicBefore);
      expect((await backfillEntities(database, { apply: true })).ownership).toBe(0);
      expect((await backfillEntities(database)).peopleCreated).toBe(0);
      expect(backups.some(item => item.path === 'athletes/test')).toBe(true);
      const personRef = database.doc('people/' + athlete.personId);
      await personRef.update({ athleteId: 'someone-else' });
      await expect(backfillEntities(database, { apply: true })).rejects.toThrow('another identity');
    } finally { await database.terminate(); }
  });
});
