import { setIdToken } from './telegram';

const TOKEN_KEY = 'anchor_account_token';
const PROGRESS_KEY = 'anchor_registration';

export type AccountUser = {
  uid: string;
  email?: string;
  displayName?: string;
};

export type AccountFamily = {
  id: string;
  name: string;
  role: string;
  members: { email: string; displayName: string | null }[];
};

export type AccountFile = {
  id: string;
  originalName: string | null;
  size: number;
  contentType: string;
  createdAt: string;
};

export type RegistrationProgress = {
  botAdded: boolean;
  complete: boolean;
};

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

export function getAccountToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccountToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('anchor-account-auth'));
}

export function readProgress(): RegistrationProgress {
  if (typeof window === 'undefined') return { botAdded: false, complete: false };
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return { botAdded: false, complete: false };
    const parsed = JSON.parse(raw) as Partial<RegistrationProgress>;
    return {
      botAdded: Boolean(parsed.botAdded),
      complete: Boolean(parsed.complete),
    };
  } catch {
    return { botAdded: false, complete: false };
  }
}

export function writeProgress(next: RegistrationProgress): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
}

export function isRegistrationComplete(): boolean {
  return Boolean(getAccountToken()) && readProgress().complete;
}

export function completeRegistration(): void {
  writeProgress({ botAdded: true, complete: true });
  window.dispatchEvent(new Event('anchor-account-auth'));
}

export function signOut(): void {
  setAccountToken(null);
  if (typeof window !== 'undefined') sessionStorage.removeItem(PROGRESS_KEY);
  setIdToken(null);
}

export function watchAccountAuth(listener: (token: string | null) => void): () => void {
  const notify = () => listener(getAccountToken());
  notify();
  window.addEventListener('anchor-account-auth', notify);
  return () => window.removeEventListener('anchor-account-auth', notify);
}

/** Read email or display name from the account JWT without verifying it (the API verifies). */
export function accountLabel(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      email?: unknown;
      displayName?: unknown;
    };
    if (typeof payload.displayName === 'string' && payload.displayName.trim()) return payload.displayName.trim();
    if (typeof payload.email === 'string' && payload.email.trim()) return payload.email.trim();
  } catch {
    /* ignore */
  }
  return null;
}

async function parseError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  const text = await response.text();
  if (!text) return fallback;
  try {
    const body = JSON.parse(text) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    const clipped = text.trim().replace(/\s+/g, ' ');
    if (clipped) return clipped.slice(0, 240);
  }
  return fallback;
}

async function accountFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccountToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new AccountError(await parseError(response), response.status);
  return response;
}

export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AccountUser> {
  const response = await accountFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      consents: { terms: true, privacy: true, marketing: false },
    }),
  });
  const body = (await response.json()) as { user: AccountUser; token: string };
  setAccountToken(body.token);
  writeProgress({ botAdded: false, complete: false });
  return body.user;
}

export async function signIn(email: string, password: string): Promise<AccountUser> {
  const response = await accountFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { user: AccountUser; token: string };
  setAccountToken(body.token);
  const progress = readProgress();
  writeProgress({ botAdded: progress.botAdded, complete: false });
  return body.user;
}

export async function listFamilies(): Promise<AccountFamily[]> {
  const response = await accountFetch('/api/families');
  const body = (await response.json()) as { families?: AccountFamily[] };
  return body.families ?? [];
}

export async function createFamily(name: string): Promise<AccountFamily> {
  const response = await accountFetch('/api/families', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return (await response.json()) as AccountFamily;
}

export async function listFiles(): Promise<AccountFile[]> {
  const response = await accountFetch('/api/files');
  const body = (await response.json()) as { files?: AccountFile[] };
  return body.files ?? [];
}

export async function uploadMemory(file: File): Promise<AccountFile> {
  const body = new FormData();
  body.append('file', file);
  const response = await accountFetch('/api/files', { method: 'POST', body });
  return (await response.json()) as AccountFile;
}
