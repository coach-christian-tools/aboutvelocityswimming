import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { collection, connectFirestoreEmulator, DocumentData, getFirestore, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import { databaseId } from './domain/database-target';
import { connectStorageEmulator, getStorage } from "firebase/storage";
import type { Athlete, AttendanceEntry, Meet, StandardSet, Swim } from "../types/schema";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_API_KEY || 'dummy_api_key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_MEASUREMENT_ID,
};

// Other tools in this repository can use a different Firebase project.
const appName = 'velocity-swim-resources';
const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp(firebaseConfig, appName);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const FIRESTORE_DATABASE_ID = databaseId(process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID);
const FIREBASE_PROJECT_ID = firebaseConfig.projectId ?? '';
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
const storage = getStorage(app);

// Explicit local opt-in; a demo project keeps emulator development isolated.
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && typeof window !== 'undefined') {
  if (!firebaseConfig.projectId?.startsWith('demo-') || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('Firebase emulators require a demo project on localhost.');
  }
  const local = globalThis as typeof globalThis & { cutterEmulatorsConnected?: boolean };
  if (!local.cutterEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8088);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    local.cutterEmulatorsConnected = true;
  }
}


// Generic converter
const createConverter = <T extends DocumentData>() => ({
  toFirestore: (data: T): DocumentData => data,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): T => {
    return snapshot.data(options) as T;
  }
});

// Typed Collections
const athletesCol = collection(db, 'athletes').withConverter(createConverter<Athlete>());
const swimsCol = collection(db, 'swims').withConverter(createConverter<Swim>());
const attendanceCol = collection(db, 'attendance').withConverter(createConverter<AttendanceEntry>());
const standardsCol = collection(db, 'standards').withConverter(createConverter<StandardSet>());
const meetsCol = collection(db, 'meets').withConverter(createConverter<Meet>());

export {
FIRESTORE_DATABASE_ID,FIREBASE_PROJECT_ID,app,athletesCol,attendanceCol,auth,db,googleProvider,meetsCol,standardsCol,storage,swimsCol
};
