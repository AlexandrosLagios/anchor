import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { firebaseConfigured } from '../lib/firebase';
import { watchAuth, type AuthUser } from '../lib/auth';
import './Dashboard.css';

type Role = 'sofia' | 'maria' | 'athina' | 'anchor';

type ChatLine = {
  id: string;
  from: Role;
  text: string;
  mediaUrl?: string;
  at: string;
};

type Moment = {
  id: string;
  who: string;
  what: string;
  when: string;
  question?: string;
  gapDays: number;
  nextDue: string;
  rating?: 'free' | 'cued' | 'struggled';
  phase: 'idle' | 'awaiting' | 'hinted';
};

type State = {
  chat: ChatLine[];
  moments: Moment[];
  activeId?: string;
  due: Moment[];
  whatsapp: boolean;
  person?: { name?: string; context?: string };
};

const names: Record<string, string> = {
  sofia: 'Sofia',
  maria: 'Maria',
  athina: 'Athina',
  anchor: 'Anchor',
};

const ratings: Record<string, string> = {
  free: 'Remembered on her own',
  cued: 'Remembered with a cue',
  struggled: 'Needed a gentle reveal',
};

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const { getIdToken } = await import('../lib/auth');
  const token = await getIdToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  return undefined as T;
}

function mediaSrc(url?: string) {
  if (!url) return undefined;
  if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/')) return url;
  return `/api/${url}`;
}

export function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState<'sofia' | 'maria'>('sofia');
  const [news, setNews] = useState('');
  const [reply, setReply] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const chatRef = useRef<HTMLUListElement>(null);
  const lastSnapshot = useRef('');
  const announce = useRef('');
  const requireAuth = import.meta.env.PUBLIC_REQUIRE_AUTH === 'true' || import.meta.env.PUBLIC_REQUIRE_AUTH === '1';
  const writesLocked = requireAuth && firebaseConfigured() && !user;

  useEffect(() => {
    if (!firebaseConfigured()) return;
    return watchAuth(setUser);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api<State>('/state');
      const snapshot = JSON.stringify(next);
      if (snapshot === lastSnapshot.current) return;
      lastSnapshot.current = snapshot;
      setState(next);
    } catch {
      setStatus('Cannot reach the Anchor API. Start it with pnpm dev:api.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [state?.chat]);

  useEffect(() => {
    if (!state) return;
    const waiting = state.moments.some((m) => m.phase === 'awaiting' || m.phase === 'hinted');
    const nextAnnounce = waiting
      ? `Waiting for Athina. ${state.due.length} moments due.`
      : `${state.moments.length} moments saved. ${state.due.length} due now.`;
    if (nextAnnounce !== announce.current) {
      announce.current = nextAnnounce;
      setStatus(nextAnnounce);
    }
  }, [state]);

  const waiting = state?.moments.some((m) => m.phase === 'awaiting' || m.phase === 'hinted') ?? false;
  const active = state?.moments.find((m) => m.id === state.activeId);

  async function onCompose(event: FormEvent) {
    event.preventDefault();
    if (writesLocked) {
      setStatus('Sign in required to save moments.');
      return;
    }
    const text =
      news.trim() ||
      "Maria's first day of school — she didn't want to let go of my hand";
    setNews('');
    setStatus('Saving moment…');
    await api('/moment', { method: 'POST', body: JSON.stringify({ text, from }) });
    lastSnapshot.current = '';
    await refresh();
    setStatus('Moment saved. Anchor confirmed in the chat.');
  }

  async function bringBack(momentId?: string) {
    if (writesLocked) {
      setStatus('Sign in required to practise moments.');
      return;
    }
    setStatus(momentId ? 'Starting practice for the next moment…' : 'Bringing a moment back…');
    await api('/bring-back', {
      method: 'POST',
      body: JSON.stringify(momentId ? { momentId } : {}),
    });
    lastSnapshot.current = '';
    await refresh();
    setStatus('Anchor asked Athina a question in the chat.');
  }

  async function sendReply(text: string) {
    if (writesLocked) {
      setStatus('Sign in required to reply.');
      return;
    }
    setStatus("Sending Athina's reply…");
    await api('/reply', { method: 'POST', body: JSON.stringify({ text }) });
    setReply('');
    lastSnapshot.current = '';
    await refresh();
  }

  if (!state) {
    return (
      <section className="panel hood" aria-busy="true" aria-labelledby="loading-heading">
        <h2 id="loading-heading">Loading demo…</h2>
        <p className="lede">Connecting to the Anchor API.</p>
        <p className="status-line" role="status" aria-live="polite">
          {status}
        </p>
      </section>
    );
  }

  return (
    <div className="dashboard">
      {!user ? (
        <p className="auth-callout" role="status">
          {requireAuth
            ? 'Sign in to save moments to your EU account.'
            : 'Optional: create an account so moments persist in EU Postgres.'}{' '}
          <a href="/signup">Create account</a> or <a href="/login">sign in</a>.
        </p>
      ) : null}
      <section className="panel chat-shell" aria-labelledby="chat-heading">
        <h2 className="panel-heading" id="chat-heading">
          Family group chat
        </h2>
        <div className="chat-meta">
          <h3>Athina's family</h3>
          <p>
            {state.whatsapp
              ? 'Connected to WhatsApp'
              : 'Simulated group · connect Twilio for live WhatsApp'}
          </p>
        </div>

        <ul className="chat-log" ref={chatRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
          {state.chat.map((line) => {
            const when = line.at ? new Date(line.at) : null;
            const stamp =
              when && !Number.isNaN(when.valueOf())
                ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
            const src = mediaSrc(line.mediaUrl);
            return (
              <li key={line.id} className={`bubble ${line.from}`}>
                <span className="who">{names[line.from] || line.from}</span>
                <span className="text">{line.text}</span>
                {src ? <img src={src} alt="Photo shared with this moment" /> : null}
                {stamp ? (
                  <time dateTime={when && !Number.isNaN(when.valueOf()) ? when.toISOString() : undefined}>
                    {stamp}
                  </time>
                ) : null}
              </li>
            );
          })}
        </ul>

        <form className="compose" onSubmit={onCompose} aria-describedby="compose-help">
          <p id="compose-help" className="sr-only">
            Share a family moment as Sofia or Maria. Anchor will save it for later.
          </p>
          <div className="field field-from">
            <label htmlFor="from">From</label>
            <select id="from" name="from" value={from} onChange={(e) => setFrom(e.target.value as 'sofia' | 'maria')}>
              <option value="sofia">Sofia</option>
              <option value="maria">Maria</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="news">Moment</label>
            <input
              id="news"
              name="news"
              type="text"
              maxLength={500}
              autoComplete="off"
              value={news}
              onChange={(e) => setNews(e.target.value)}
              placeholder="Maria's first day of school — she didn't want to let go of my hand"
              enterKeyHint="send"
            />
          </div>
          <button className="btn btn-primary btn-send" type="submit" disabled={writesLocked}>
            Send
          </button>
        </form>
      </section>

      <section className="panel hood" aria-labelledby="hood-heading" aria-busy="false">
        <h2 id="hood-heading">For {state.person?.name || 'Athina'}</h2>
        <p className="lede">{state.person?.context || ''}</p>

        <h2>Spaced retrieval</h2>
        <p className="stat">{state.due.length} due now</p>
        <p className="lede">Free recall doubles the wait. A cue holds it. A struggle resets to tomorrow.</p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!state.moments.length || waiting || writesLocked}
            onClick={() => void bringBack()}
          >
            Bring a moment back
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!state.moments.length || waiting || writesLocked}
            onClick={() => {
              const first = state.moments.find((m) => m.phase === 'idle');
              if (first) void bringBack(first.id);
            }}
          >
            Practise next moment now
          </button>
        </div>

        {waiting ? (
          <form
            className="reply-form"
            aria-labelledby="reply-heading"
            onSubmit={(event) => {
              event.preventDefault();
              void sendReply(reply);
            }}
          >
            <h2 id="reply-heading">Athina's reply</h2>
            <p className="prompt">{active?.question || 'Answer the question in the chat.'}</p>
            <div className="field">
              <label htmlFor="reply">Your reply</label>
              <input
                id="reply"
                name="reply"
                type="text"
                autoComplete="off"
                enterKeyHint="send"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Maria… she held Sofia's hand"
              />
            </div>
            <div className="reply-actions">
              <button className="btn btn-primary" type="submit">
                Send reply
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => void sendReply("I'm not sure…")}>
                I'm not sure
              </button>
            </div>
          </form>
        ) : null}

        <h2>Saved moments</h2>
        {state.moments.length ? (
          <ul className="moments">
            {state.moments.map((m) => (
              <li key={m.id} className="moment">
                <h3>
                  {m.who} · {m.what}
                </h3>
                <p className="lede">{m.when}</p>
                <p className="lede">
                  Next in {m.gapDays} day{m.gapDays === 1 ? '' : 's'} · {new Date(m.nextDue).toLocaleString()}
                </p>
                {m.rating ? <span className={`chip ${m.rating}`}>{ratings[m.rating]}</span> : <p className="lede">Not practised yet</p>}
                {m.phase !== 'idle' ? <p className="lede">Currently: {m.phase}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lede">Waiting for the family to share a moment…</p>
        )}

        {state.moments.length ? (
          <>
            <h2>Share</h2>
            <p>
              <a className="btn btn-secondary" href="/api/demo.html" download="anchor-demo.html">
                Download offline demo
              </a>
            </p>
          </>
        ) : null}
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
