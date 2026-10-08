// Explicit references allow Next.js to inline public configuration.
export const workshareFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_WORKSHARE_FIREBASE_MEASUREMENT_ID,
};
export const useWorkshareEmulators = process.env.NEXT_PUBLIC_WORKSHARE_USE_FIREBASE_EMULATORS === "true";
export const hasWorkshareConfiguration = Boolean(
  workshareFirebaseConfig.apiKey && workshareFirebaseConfig.authDomain
  && workshareFirebaseConfig.projectId && workshareFirebaseConfig.appId,
);
