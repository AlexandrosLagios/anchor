import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getIdToken, parseApiError, watchAuth, type AuthUser } from '../lib/auth';
import { apiUrl } from '../lib/config';
import './AnchorChat.css';

type Memory = {
  id: string;
  who: string;
  what: string;
  when: string;
  memory: string;
  caption: string;
};

type ChatFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

type Bubble = {
  id: string;
  role: 'user' | 'anchor';
  text: string;
  moments?: Memory[];
  files?: ChatFile[];
};

const prompts = ['What memories do you have?', 'Which files can you open?'];

async function openFile(file: ChatFile) {
  const token = await getIdToken();
  if (!token) throw new Error('Sign in required');
  const response = await fetch(apiUrl(`/api/files/${file.id}/content`), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function AnchorChat() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => watchAuth(setUser), []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [bubbles, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError('');
    setDraft('');
    const next: Bubble[] = [...bubbles, { id: crypto.randomUUID(), role: 'user', text: trimmed }];
    setBubbles(next);
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign in required');
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: next.map((item) => ({ role: item.role, text: item.text })),
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const body = (await response.json()) as { reply: string; moments: Memory[]; files: ChatFile[] };
      setBubbles((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'anchor',
          text: body.reply,
          moments: body.moments,
          files: body.files,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Anchor.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  if (user === undefined) {
    return (
      <div className="anchor-chat" aria-busy="true">
        <h1>Chat with Anchor</h1>
        <p className="lede">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="anchor-chat">
        <h1>Chat with Anchor</h1>
        <p className="lede">Sign in to ask about your saved memories and files.</p>
        <p className="actions">
          <a className="btn btn-primary" href="/login">
            Sign in
          </a>
          <a className="btn btn-secondary" href="/signup">
            Create account
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="anchor-chat">
      <h1>Chat with Anchor</h1>
      <p className="lede">
        Ask about moments saved in the demo, or ask Anchor to find a file from your account. This conversation stays in
        the browser.
      </p>

      <div className="anchor-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with Anchor">
        {bubbles.length === 0 ? (
          <p className="anchor-empty">Try a question, or use one of the prompts below.</p>
        ) : (
          bubbles.map((bubble) => (
            <article key={bubble.id} className={`anchor-bubble ${bubble.role}`}>
              <p className="anchor-who">{bubble.role === 'user' ? 'You' : 'Anchor'}</p>
              <p className="anchor-text">{bubble.text}</p>
              {bubble.moments?.length ? (
                <ul className="anchor-cards">
                  {bubble.moments.map((moment) => (
                    <li key={moment.id}>
                      <strong>{moment.memory || moment.caption}</strong>
                      <span>
                        {moment.who} · {moment.what} · {moment.when}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {bubble.files?.length ? (
                <ul className="anchor-cards">
                  {bubble.files.map((file) => (
                    <li key={file.id}>
                      <strong>{file.name}</strong>
                      <span>{file.contentType}</span>
                      <button className="btn btn-secondary" type="button" onClick={() => void openFile(file).catch((err) => setError(err instanceof Error ? err.message : 'Could not open file.'))}>
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
        {busy ? <p className="anchor-pending">Anchor is looking…</p> : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="anchor-prompts">
        {prompts.map((prompt) => (
          <button key={prompt} className="btn btn-secondary" type="button" disabled={busy} onClick={() => void send(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <form className="anchor-compose" onSubmit={onSubmit}>
        <label htmlFor="anchor-message">Message</label>
        <input
          id="anchor-message"
          name="message"
          type="text"
          maxLength={2000}
          autoComplete="off"
          enterKeyHint="send"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Find the school photo"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
