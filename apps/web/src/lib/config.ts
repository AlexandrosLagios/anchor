export const privacyEmail =
  import.meta.env.PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@anchor.com';

export const dataRegion = import.meta.env.PUBLIC_DATA_REGION?.trim() || 'eu-central-1';

/** Absolute API origin in production; empty uses same-origin `/api` (local Astro proxy / Vercel rewrite). */
export const apiOrigin = (import.meta.env.PUBLIC_API_URL?.trim() || '').replace(/\/$/, '');

/** Build an API URL. Prefer `PUBLIC_API_URL` so uploads are not proxied through the static site rewrite. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiOrigin ? `${apiOrigin}${normalized}` : normalized;
}
