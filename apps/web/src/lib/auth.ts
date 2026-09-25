import { apiUrl } from './config';

const TOKEN_KEY = 'anchor_auth_token';
const USER_KEY = 'anchor_auth_user';

export type AuthUser = {
  uid: string;
  email?: string;
  displayName?: string;
  region?: string;
};

type AuthResponse = {
  user: AuthUser;
  token: string;
};

type Listener = (user: AuthUser | null) => void;

const listeners = new Set<Listener>();

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistSession(user: AuthUser | null, token: string | null) {
  if (typeof window === 'undefined') return;
  if (user && token) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
  for (const listener of listeners) listener(user);
}

export async function parseApiError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  const raw = await response.text();
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as {
      message?: string | string[];
      error?: string | { message?: string; code?: string };
      code?: string;
    };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    if (body.error && typeof body.error === 'object') {
      const nested = [body.error.code, body.error.message].filter(Boolean).join(': ');
      if (nested) return nested;
    }
    if (typeof body.code === 'string' && body.code.trim()) return body.code;
  } catch {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed) return trimmed.slice(0, 240);
  }
  return fallback;
}

export async function getIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function watchAuth(callback: Listener): () => void {
  listeners.add(callback);
  callback(readStoredUser());
  return () => {
    listeners.delete(callback);
  };
}

export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  consents: { terms: boolean; privacy: boolean; marketing: boolean };
}): Promise<AuthUser> {
  if (!input.consents.terms || !input.consents.privacy) {
    throw new Error('You must accept the Terms and Privacy Policy.');
  }
  const response = await fetch(apiUrl('/api/auth/signup'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = (await response.json()) as AuthResponse;
  persistSession(data.user, data.token);
  return data.user;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = (await response.json()) as AuthResponse;
  persistSession(data.user, data.token);
  return data.user;
}

export async function logOut(): Promise<void> {
  persistSession(null, null);
}

export async function refreshMe(): Promise<AuthUser | null> {
  const token = await getIdToken();
  if (!token) {
    persistSession(null, null);
    return null;
  }
  const response = await fetch(apiUrl('/api/auth/me'), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    persistSession(null, null);
    return null;
  }
  const user = (await response.json()) as AuthUser;
  const existingToken = await getIdToken();
  persistSession(user, existingToken);
  return user;
}
