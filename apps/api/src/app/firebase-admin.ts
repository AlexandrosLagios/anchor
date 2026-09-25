import { getApps, initializeApp, applicationDefault, type App as FirebaseApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let app: FirebaseApp | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Prefer Application Default Credentials (ADC) — required when the org blocks API keys.
 * Local: `gcloud auth application-default login`
 * Vercel / Cloud Run: service account via GOOGLE_APPLICATION_CREDENTIALS or runtime ADC.
 * Optional override: GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json (file path, not an API key).
 *
 * When Admin SDK credentials are unavailable (typical on Vercel without an SA JSON),
 * ID tokens are still verified via Google's public Firebase JWKS.
 */
export function firebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

function projectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    undefined
  );
}

export function getFirebaseAdminApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const id = projectId();

  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: id,
    });
  } catch (error) {
    // Local hackathon: allow boot without ADC when REQUIRE_AUTH is false
    if (process.env.REQUIRE_AUTH === 'true' || process.env.REQUIRE_AUTH === '1') {
      throw error;
    }
    app = initializeApp({ projectId: id || 'a11y-hack26ath-267' });
  }
  return app;
}

export function adminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export type AuthUser = { uid: string; email?: string; displayName?: string };

async function verifyWithJwks(token: string): Promise<AuthUser | null> {
  const id = projectId();
  if (!id) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
    );
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${id}`,
      audience: id,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      displayName: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export async function verifyIdToken(authorization?: string): Promise<AuthUser | null> {
  if (!authorization?.startsWith('Bearer ') || !firebaseAdminConfigured()) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;

  // Prefer Admin SDK when credentials are present; otherwise verify via public JWKS.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    try {
      const decoded = await adminAuth().verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email,
        displayName: typeof decoded.name === 'string' ? decoded.name : undefined,
      };
    } catch {
      /* fall through to JWKS */
    }
  }

  return verifyWithJwks(token);
}
