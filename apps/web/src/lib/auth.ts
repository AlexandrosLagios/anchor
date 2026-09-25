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

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${response.status})`;
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
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as AuthResponse;
  persistSession(data.user, data.token);
  return data.user;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await parseError(response));
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
  const response = await fetch('/api/auth/me', {
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
