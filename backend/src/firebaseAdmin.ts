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

function parseServiceAccount(raw: string): ServiceAccountEnv | null {
  try {
    const parsed = JSON.parse(raw) as {
      projectId?: string;
      clientEmail?: string;
      privateKey?: string;
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    const projectId = parsed.projectId ?? parsed.project_id;
    const clientEmail = parsed.clientEmail ?? parsed.client_email;
    const privateKey = parsed.privateKey ?? parsed.private_key;

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    return {
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    };
  } catch {
    return null;
  }
}

function getServiceAccountFromEnv(): ServiceAccountEnv | null {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().startsWith("{")
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : undefined);

  if (!raw) {
    return null;
  }

  return parseServiceAccount(raw);
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(getServiceAccountFromEnv()) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function assertFirebaseAdminConfiguredInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required in production. Set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT, or FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }
}

export function initializeFirebaseAdminIfNeeded(): boolean {
  if (!isFirebaseAdminConfigured()) return false;

  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv();

    if (serviceAccount) {
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
