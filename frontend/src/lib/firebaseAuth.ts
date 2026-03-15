import { FirebaseApp, getApp, getApps, initializeApp } from "@firebase/app";
import {
  Auth,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithCustomToken,
  signOut,
  updateProfile,
} from "@firebase/auth";

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function hasFirebaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
}

function getFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig()) return null;

  if (appInstance) return appInstance;

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };

  appInstance = getApps().length ? getApp() : initializeApp(config);
  return appInstance;
}

async function getFirebaseAuth(): Promise<Auth | null> {
  if (authInstance) return authInstance;

  const app = getFirebaseApp();
  if (!app) return null;

  authInstance = getAuth(app);
  await setPersistence(authInstance, browserLocalPersistence);
  return authInstance;
}

export async function signInWithFirebaseCustomToken(
  customToken: string,
  walletAddress: string,
): Promise<void> {
  const auth = await getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase is not configured on the frontend.");
  }

  await signInWithCustomToken(auth, customToken);

  if (auth.currentUser && auth.currentUser.displayName !== walletAddress) {
    await updateProfile(auth.currentUser, { displayName: walletAddress });
  }
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = await getFirebaseAuth();
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function signOutFirebaseSession(): Promise<void> {
  const auth = await getFirebaseAuth();
  if (!auth || !auth.currentUser) return;
  await signOut(auth);
}
