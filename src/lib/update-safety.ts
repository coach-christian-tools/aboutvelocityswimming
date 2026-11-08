// Shared only by the update notice and explicit client-side operations.
// Holds are reference-counted so one completed request cannot unlock another.
const holds = new Set<symbol>();
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function updatesBlocked(): boolean {
  return holds.size > 0;
}

export function subscribeUpdateSafety(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function holdUpdates(): () => void {
  const token = Symbol("update hold");
  holds.add(token);
  publish();
  return () => {
    if (holds.delete(token)) publish();
  };
}

export async function withUpdateHold<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const release = holdUpdates();
  try {
    return await operation();
  } finally {
    release();
  }
}
