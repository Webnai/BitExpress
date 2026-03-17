import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import { getAuth } from "firebase-admin/auth";

interface ServiceAccountEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function assertFirebaseAdminConfiguredInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required in production. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT."
    );
  }
}

export function initializeFirebaseAdminIfNeeded(): boolean {
  if (!isFirebaseAdminConfigured()) return false;

  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!) as ServiceAccountEnv;
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  return true;
}

export function getFirebaseAdminAuth(): Auth {
  const initialized = initializeFirebaseAdminIfNeeded();
  if (!initialized) {
    throw new Error("Firebase Admin is not configured.");
  }
  return getAuth();
}
