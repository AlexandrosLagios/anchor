import { botUrl } from './config';

const TOKEN_KEY = 'anchor_telegram_id_token';

export type TelegramMember = { id: string; name: string };

export type JoinResult =
  | { status: 'joined'; family: { members: TelegramMember[] } }
  | { status: 'no-family'; addLink: string };

export type MeResult = {
  member: TelegramMember;
  family: { members: TelegramMember[] };
};

export type MomentStory = {
  id: string;
  by: TelegramMember;
  at: string;
  text: string;
  hasVoice: boolean;
};

export type FamilyMoment = {
  id: string;
  by: TelegramMember;
  savedAt: string;
  title: string;
  text: string;
  eventDate?: string;
  hasPhoto: boolean;
  hasVoice: boolean;
  stories: MomentStory[];
};

export class BotAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BotAuthError';
  }
}

export function getIdToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setIdToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('anchor-telegram-auth'));
}

export function watchTelegramAuth(listener: (token: string | null) => void): () => void {
  const notify = () => listener(getIdToken());
  notify();
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('anchor-telegram-auth', notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('anchor-telegram-auth', notify);
  };
}

/** Read display name from the id_token payload without verifying the signature (bot verifies). */
export function tokenDisplayName(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      name?: unknown;
      preferred_username?: unknown;
    };
    if (typeof payload.name === 'string' && payload.name.trim()) return payload.name.trim();
    if (typeof payload.preferred_username === 'string' && payload.preferred_username.trim()) {
      return payload.preferred_username.trim();
    }
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

export async function botFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getIdToken();
  if (!token) throw new BotAuthError('Connect a chat under Connections', 401);
  const response = await fetch(botUrl(path), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) setIdToken(null);
    throw new BotAuthError(await parseError(response), response.status);
  }
  if (!response.ok) throw new Error(await parseError(response));
  return response;
}

export async function joinFamily(): Promise<JoinResult> {
  const response = await botFetch('/web/join', { method: 'POST' });
  return (await response.json()) as JoinResult;
}

export async function fetchMe(): Promise<MeResult> {
  const response = await botFetch('/web/me');
  return (await response.json()) as MeResult;
}

export async function fetchMoments(): Promise<FamilyMoment[]> {
  const response = await botFetch('/web/moments');
  const body = (await response.json()) as { moments?: FamilyMoment[] } | FamilyMoment[];
  return Array.isArray(body) ? body : (body.moments ?? []);
}

export async function fetchMomentMedia(momentId: string, kind: 'photo' | 'voice'): Promise<string> {
  const response = await botFetch(`/web/moments/${encodeURIComponent(momentId)}/${kind}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function downloadMyData(): Promise<Blob> {
  const response = await botFetch('/web/my-data');
  return response.blob();
}

export async function deleteMyData(): Promise<void> {
  await botFetch('/web/my-data', { method: 'DELETE' });
  setIdToken(null);
}
