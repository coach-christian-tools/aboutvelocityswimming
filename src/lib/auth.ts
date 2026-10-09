import type { User as SupabaseUser } from "@supabase/supabase-js";
import { browserClient, hasBackendConfiguration } from "./supabase/client";
export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  staff: boolean;
  getIdToken(): Promise<string>;
}
export const auth: { currentUser: User | null } = { currentUser: null };
let generation = 0;
async function currentUser(user: SupabaseUser | null): Promise<User | null> {
  if (!user) return null;
  const { data: staff } = await browserClient().rpc("is_staff");
  return {
    uid: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    staff: staff === true,
    getIdToken: async () => {
      const { data } = await browserClient().auth.getSession();
      return data.session?.access_token ?? "";
    },
  };
}
const listeners = new Set<(user: User | null) => void>();
let initialized = false;
export function onAuthStateChanged(
  _auth: typeof auth,
  callback: (user: User | null) => void,
) {
  listeners.add(callback);
  const publish = async (user: SupabaseUser | null) => {
    const version = ++generation;
    const result = await currentUser(user);
    if (version !== generation) return;
    auth.currentUser = result;
    listeners.forEach((fn) => fn(result));
    window.dispatchEvent(new Event("velocity-auth"));
  };
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    if (hasBackendConfiguration) {
      const client = browserClient();
      client.auth.getUser().then(({ data }) => publish(data.user));
      client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => void publish(session?.user ?? null), 0);
      });
    } else queueMicrotask(() => listeners.forEach((fn) => fn(null)));
  } else
    queueMicrotask(() => {
      if (listeners.has(callback)) callback(auth.currentUser);
    });
  return () => {
    listeners.delete(callback);
  };
}

export async function signOut(_auth = auth) {
  const { error } = await browserClient().auth.signOut();
  if (error) throw error;
  auth.currentUser = null;
}
export async function signInWithEmailAndPassword(
  _auth: typeof auth,
  email: string,
  password: string,
) {
  const { data, error } = await browserClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return { user: await currentUser(data.user) };
}
export async function signInWithGoogle() {
 const {error}=await browserClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+'/auth/callback?next='+encodeURIComponent('/tools'),queryParams:{prompt:'select_account'}}});
 if(error)throw error;
}
