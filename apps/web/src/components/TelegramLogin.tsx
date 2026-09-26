import { useEffect, useId, useRef, useState } from 'react';
import { botOpenLink, telegramClientId } from '../lib/config';
import { setIdToken } from '../lib/telegram';

type TelegramLoginApi = {
  init: (
    options: { client_id: number; scope?: string[]; lang?: string },
    callback: (result: { id_token?: string; error?: string }) => void,
  ) => void;
  open: (callback?: (result: { id_token?: string; error?: string }) => void) => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginApi };
  }
}

const SCRIPT = 'https://oauth.telegram.org/js/telegram-login.js';

function loadScript(): Promise<TelegramLoginApi> {
  if (window.Telegram?.Login) return Promise.resolve(window.Telegram.Login);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Telegram?.Login) resolve(window.Telegram.Login);
        else reject(new Error('Telegram Login did not load'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Telegram?.Login) resolve(window.Telegram.Login);
      else reject(new Error('Telegram Login did not load'));
    };
    script.onerror = () => reject(new Error('Could not load Telegram Login'));
    document.head.appendChild(script);
  });
}

type Props = {
  onSignedIn?: () => void;
  label?: string;
};

export function TelegramLogin({ onSignedIn, label = 'Get started with Telegram' }: Props) {
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = Boolean(telegramClientId);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void loadScript()
      .then((login) => {
        if (cancelled) return;
        login.init(
          {
            client_id: Number(telegramClientId),
            scope: ['profile', 'write'],
            lang: 'en',
          },
          (result) => {
            if (result.error) {
              setError(result.error);
              setBusy(false);
              return;
            }
            if (!result.id_token) {
              setError('Telegram did not return a sign-in token.');
              setBusy(false);
              return;
            }
            setIdToken(result.id_token);
            setBusy(false);
            setError('');
            onSignedInRef.current?.();
          },
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Telegram Login failed to load.');
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function openLogin() {
    setError('');
    setBusy(true);
    try {
      const login = await loadScript();
      login.open();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Telegram Login failed.');
    }
  }

  if (!configured) {
    return (
      <section className="tg-login" aria-labelledby={headingId}>
        <h2 id={headingId}>Get started with Telegram</h2>
        <p className="lede">
          Telegram Login is not configured yet. Add <code>PUBLIC_TELEGRAM_CLIENT_ID</code> from BotFather (Login Widget)
          for <code>@anchor_family_bot</code>.
        </p>
        <a className="btn btn-secondary" href={botOpenLink}>
          Open Anchor in Telegram
        </a>
      </section>
    );
  }

  return (
    <section className="tg-login" aria-labelledby={headingId}>
      <h2 id={headingId}>Get started with Telegram</h2>
      <p className="lede">
        Sign in with your Telegram account. Anchor uses that identity for the family record — no email or password.
      </p>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void openLogin()}>
        {busy ? 'Opening Telegram…' : label}
      </button>
      <p className="tg-accept">
        By signing in, you accept the <a href="/terms">Terms</a> and the <a href="/privacy">Privacy Policy</a>.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="lede">
        If Anchor’s private message does not arrive, <a href={botOpenLink}>open Anchor in Telegram</a>.
      </p>
    </section>
  );
}
