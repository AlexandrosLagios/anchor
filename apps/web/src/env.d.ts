/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PRIVACY_EMAIL?: string;
  readonly PUBLIC_REQUIRE_AUTH?: string;
  readonly PUBLIC_DATA_REGION?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_AUTH_ENABLED?: string;
  readonly PUBLIC_FIREBASE_API_KEY?: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID?: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly PUBLIC_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
