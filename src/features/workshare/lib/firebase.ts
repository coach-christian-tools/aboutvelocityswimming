import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAuth, getAuth, connectAuthEmulator, browserLocalPersistence,
  browserPopupRedirectResolver, indexedDBLocalPersistence,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { workshareFirebaseConfig, useWorkshareEmulators } from "./config";

// Imported only below the browser-only Workshare entry point.
const APP_NAME = "velocity-workshare";
export const app = getApps().find(candidate => candidate.name === APP_NAME)
  ?? initializeApp(workshareFirebaseConfig, APP_NAME);
function workshareAuth() {
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/already-initialized") return getAuth(app);
    throw error;
  }
}
export const auth = workshareAuth();
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (useWorkshareEmulators) {
  if (process.env.NODE_ENV === "production" || !workshareFirebaseConfig.projectId?.startsWith("demo-")
    || typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    throw new Error("Workshare emulators require a demo Firebase project on localhost in development.");
  }
  const state = globalThis as typeof globalThis & { workshareEmulatorApps?: WeakSet<FirebaseApp> };
  state.workshareEmulatorApps ??= new WeakSet();
  if (!state.workshareEmulatorApps.has(app)) {
    connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8089);
    connectFunctionsEmulator(functions, "127.0.0.1", 5002);
    state.workshareEmulatorApps.add(app);
  }
}
