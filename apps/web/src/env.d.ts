/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PRIVACY_EMAIL?: string;
  readonly PUBLIC_REQUIRE_AUTH?: string;
  readonly PUBLIC_DATA_REGION?: string;
  readonly PUBLIC_SITE_URL?: string;
  /** e.g. https://anchor-api-teal.vercel.app — skips the website `/api` rewrite */
  readonly PUBLIC_API_URL?: string;
}


interface ImportMeta {
  readonly env: ImportMetaEnv;
}
