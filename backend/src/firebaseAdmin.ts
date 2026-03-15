import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import { getAuth } from "firebase-admin/auth";

interface ServiceAccountEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getServiceAccountFromEnv(): ServiceAccountEnv | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  } catch {
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(getServiceAccountFromEnv()) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function assertFirebaseAdminConfiguredInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required in production. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }
}

export function initializeFirebaseAdminIfNeeded(): boolean {
  if (!isFirebaseAdminConfigured()) return false;

  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv();

    if (serviceAccount) {
      initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
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
