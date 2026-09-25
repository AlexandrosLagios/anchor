export const privacyEmail =
  import.meta.env.PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@anchor.com';

export const dataRegion = import.meta.env.PUBLIC_DATA_REGION?.trim() || 'eu-central-1';

export function authConfigured(): boolean {
  // Nest + Neon auth is always available via /api/auth once the API is wired.
  // Optional override if the demo must stay open without accounts.
  return import.meta.env.PUBLIC_AUTH_ENABLED !== 'false';
}
