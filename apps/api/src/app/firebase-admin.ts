import { getApps, initializeApp, applicationDefault, type App as FirebaseApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let app: FirebaseApp | undefined;

/**
 * Prefer Application Default Credentials (ADC) — required when the org blocks API keys.
 * Local: `gcloud auth application-default login`
 * Cloud Run / GCE: the runtime service account is ADC automatically.
 * Optional override: GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json (file path, not an API key).
 */
export function firebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

export function getFirebaseAdminApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  } catch (error) {
    // Local hackathon: allow boot without ADC when REQUIRE_AUTH is false
    if (process.env.REQUIRE_AUTH === 'true' || process.env.REQUIRE_AUTH === '1') {
      throw error;
    }
    app = initializeApp({ projectId: projectId || 'anchor-local' });
  }
  return app;
}

export function adminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function adminDb() {
  return getFirestore(getFirebaseAdminApp());
}

export async function verifyIdToken(authorization?: string): Promise<{ uid: string; email?: string } | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
