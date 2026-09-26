import { useEffect, useState } from 'react';

const KEY = 'anchor-consent-v1';

type ConsentState = 'unknown' | 'essential' | 'accepted';

export function ConsentBanner() {
  const [state, setState] = useState<ConsentState>('unknown');

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) as ConsentState | null;
    setState(saved === 'essential' || saved === 'accepted' ? saved : 'unknown');
  }, []);

  useEffect(() => {
    const open = state === 'unknown';
    document.body.classList.toggle('consent-open', open);
    return () => {
      document.body.classList.remove('consent-open');
    };
  }, [state]);

  if (state !== 'unknown') return null;

  function save(next: Exclude<ConsentState, 'unknown'>) {
    window.localStorage.setItem(KEY, next);
    setState(next);
  }

  return (
    <div className="consent-banner" role="region" aria-label="Cookies and privacy">
      <div className="consent-inner">
        <h2 id="consent-title">Cookies &amp; privacy</h2>
        <p id="consent-body">
          We use essential storage for chat connection on this device. Analytics cookies are off by default. The family
          record stays with the bot in the EU; AI processing via OpenAI may leave the EU — see{' '}
          <a href="/privacy">Privacy</a> and <a href="/cookies">Cookies</a>.
        </p>
        <div className="consent-actions">
          <button type="button" className="btn btn-secondary" onClick={() => save('essential')}>
            Essential only
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save('accepted')}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
