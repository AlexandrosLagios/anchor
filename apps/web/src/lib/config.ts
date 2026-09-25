export const privacyEmail =
  import.meta.env.PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@anchor.com';

export const dataRegion = import.meta.env.PUBLIC_DATA_REGION?.trim() || 'eur3';

export function authConfigured(): boolean {
  return import.meta.env.PUBLIC_AUTH_ENABLED !== 'false';
}
