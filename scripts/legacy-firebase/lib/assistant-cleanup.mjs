// Ptolemy replaced the import assistant; both collection names hold retired AI history.
const ASSISTANT_COLLECTIONS = ['chatbot_conversations', 'import_conversations'];

export async function inspectAssistantHistory(db) {
  const [parentLists, messages] = await Promise.all([
    Promise.all(ASSISTANT_COLLECTIONS.map(name => db.collection(name).listDocuments())),
    db.collectionGroup('messages').select().get(),
  ]);
  const owned = messages.docs.filter(message => ASSISTANT_COLLECTIONS.some(name => message.ref.path.startsWith(name + '/')));
  const collections = Object.fromEntries(ASSISTANT_COLLECTIONS.map((name, index) => [name, {
    conversationPaths: parentLists[index].length,
    messageDocuments: owned.filter(message => message.ref.path.startsWith(name + '/')).length,
  }]));
  return { parents: parentLists.flat(), owned, collections };
}
export async function deleteAssistantHistory(db) {
  for (const name of ASSISTANT_COLLECTIONS) await db.recursiveDelete(db.collection(name));
  const remaining = await inspectAssistantHistory(db);
  if (remaining.parents.length || remaining.owned.length) throw new Error('History cleanup incomplete; remaining parent paths or orphan messages found. Re-run safely.');
}
