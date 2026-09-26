export const privacyEmail =
  import.meta.env.PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@anchor.com';

export const dataRegion = import.meta.env.PUBLIC_DATA_REGION?.trim() || 'eu-central-1';

/**
 * Absolute API origin. Prefer `PUBLIC_API_URL`. In production builds, fall back to the Nest host so
 * multipart uploads are not forwarded through the static site rewrite (which can drop or truncate bodies).
 */
export const apiOrigin = (
  import.meta.env.PUBLIC_API_URL?.trim() ||
  (import.meta.env.PROD ? 'https://anchor-api-teal.vercel.app' : '')
).replace(/\/$/, '');

/** Build an API URL. Prefer a direct API origin for uploads and auth. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiOrigin ? `${apiOrigin}${normalized}` : normalized;
}
