import { useEffect, useState } from 'react';

const KEY = 'anchor-consent-v1';

type ConsentState = 'unknown' | 'essential' | 'accepted';

export function ConsentBanner() {
  const [state, setState] = useState<ConsentState>('unknown');

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) as ConsentState | null;
    setState(saved === 'essential' || saved === 'accepted' ? saved : 'unknown');
  }, []);

  if (state !== 'unknown') return null;

  function save(next: Exclude<ConsentState, 'unknown'>) {
    window.localStorage.setItem(KEY, next);
    setState(next);
  }

  return (
    <div className="consent-banner" role="dialog" aria-labelledby="consent-title" aria-describedby="consent-body">
      <div className="consent-inner">
        <h2 id="consent-title">Cookies &amp; privacy</h2>
        <p id="consent-body">
          We use essential cookies for sign-in and security. Analytics cookies are off by default. Account data stays in
          the EU; AI processing via OpenAI may leave the EU — see <a href="/privacy">Privacy</a> and{' '}
          <a href="/cookies">Cookies</a>.
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
