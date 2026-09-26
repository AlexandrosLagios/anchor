import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AccountError, askChat, type ChatCite, type ChatTurn } from '../lib/account';

type Line = {
  id: string;
  role: 'user' | 'anchor';
  text: string;
  cites?: ChatCite[];
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FamilyChat() {
  const headingId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([
    {
      id: 'welcome',
      role: 'anchor',
      text: 'Ask me what I know about your family. I answer only from memories and files saved for this account.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError('');
    const userLine: Line = { id: newId(), role: 'user', text };
    const nextLines = [...lines, userLine];
    setLines(nextLines);
    setBusy(true);
    try {
      const history: ChatTurn[] = nextLines
        .filter((line) => line.id !== 'welcome')
        .map((line) => ({ role: line.role, text: line.text }));
      const answer = await askChat(history.slice(-16));
      const cites = [...answer.moments, ...answer.files];
      setLines((current) => [
        ...current,
        {
          id: newId(),
          role: 'anchor',
          text: answer.reply,
          cites: cites.length ? cites : undefined,
        },
      ]);
    } catch (err) {
      setError(err instanceof AccountError ? err.message : err instanceof Error ? err.message : 'Could not reach Anchor.');
      setLines((current) => current.filter((line) => line.id !== userLine.id));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="family-panel family-chat" aria-labelledby={headingId}>
      <h2 id={headingId}>Ask Anchor</h2>
      <p className="lede">Check what the bot knows from your saved memories and uploads.</p>
      <div className="family-chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
        {lines.map((line) => (
          <div key={line.id} className={`family-chat-bubble family-chat-bubble--${line.role}`}>
            <p>{line.text}</p>
            {line.cites?.length ? (
              <ul className="family-chat-cites">
                {line.cites.map((cite) => (
                  <li key={cite.id}>{cite.label}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {busy ? (
          <p className="family-chat-status" role="status">
            Anchor is thinking…
          </p>
        ) : null}
      </div>
      <form className="family-chat-compose" onSubmit={(event) => void onSubmit(event)}>
        <label className="sr-only" htmlFor={`${headingId}-input`}>
          Message to Anchor
        </label>
        <input
          id={`${headingId}-input`}
          type="text"
          name="message"
          autoComplete="off"
          maxLength={2000}
          placeholder="What do you know about us?"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
