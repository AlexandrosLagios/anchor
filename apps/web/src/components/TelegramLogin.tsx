import { useId, useRef, useState } from 'react';
import { botOpenLink, telegramClientId } from '../lib/config';
import { setIdToken } from '../lib/telegram';

const OIDC_ORIGIN = 'https://oauth.telegram.org';

type AuthResult = { id_token?: string; error?: string };

/**
 * Telegram's library sets redirect_uri to origin + pathname (e.g. /family).
 * BotFather Allowed URLs are usually the site origin only, so that fails with
 * "redirect_uri required". Open the popup ourselves with the origin as redirect_uri.
 */
function openTelegramAuth(clientId: string, callback: (result: AuthResult) => void): void {
  const redirectUri = `${window.location.origin}/`;
  const scope = ['openid', 'profile', 'telegram:bot_access'].join(' ');
  const authUrl =
    `${OIDC_ORIGIN}/auth` +
    `?response_type=post_message` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&lang=en`;

  const width = 550;
  const height = 650;
  const left = Math.max(0, (screen.width - width) / 2);
  const top = Math.max(0, (screen.height - height) / 2);
  const features = `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`;

  let finished = false;
  const finish = (result: AuthResult) => {
    if (finished) return;
    finished = true;
    window.removeEventListener('message', onMessage);
    callback(result);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== OIDC_ORIGIN) return;
    if (popup && event.source !== popup) return;
    let data: { event?: string; result?: string; error?: string } | null = null;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (!data || data.event !== 'auth_result') return;
    if (data.error) {
      finish({ error: data.error });
      return;
    }
    if (typeof data.result !== 'string' || !data.result) {
      finish({ error: 'missing id_token' });
      return;
    }
    finish({ id_token: data.result });
  };

  window.addEventListener('message', onMessage);
  const popup = window.open(authUrl, 'telegram_oidc_login', features);
  if (!popup) {
    finish({
      error: 'Could not open Telegram Login. Allow popups for this site, then try again.',
    });
    return;
  }
  popup.focus();

  const checkClose = () => {
    if (!popup || popup.closed) {
      finish({ error: 'popup_closed' });
      return;
    }
    window.setTimeout(checkClose, 200);
  };
  checkClose();
}

type Props = {
  onSignedIn?: () => void;
  label?: string;
  title?: string;
  description?: string;
};

export function TelegramLogin({
  onSignedIn,
  label = 'Sign in with Telegram',
  title = 'Telegram group (optional)',
  description = 'Only if you want moments from a Telegram family group. Your website account stays email and password.',
}: Props) {
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = Boolean(telegramClientId);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  function handleResult(result: AuthResult) {
    if (result.error) {
      if (result.error === 'popup_closed') {
        setError('Telegram Login was closed before signing in.');
      } else if (/redirect_uri/i.test(result.error)) {
        setError(
          `Telegram rejected this site’s login URL. In BotFather → Login Widget, add ${window.location.origin} to Allowed URLs.`,
        );
      } else {
        setError(result.error);
      }
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
  }

  function openLogin() {
    setError('');
    setBusy(true);
    try {
      openTelegramAuth(telegramClientId, handleResult);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Telegram Login failed.');
    }
  }

  if (!configured) {
    return (
      <section className="tg-login" aria-labelledby={headingId}>
        <h2 id={headingId}>{title}</h2>
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
      <h2 id={headingId}>{title}</h2>
      <p className="lede">{description}</p>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => openLogin()}>
        {busy ? 'Opening Telegram…' : label}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="lede">
        Prefer the messenger app? <a href={botOpenLink}>Open Anchor in Telegram</a>.
      </p>
    </section>
  );
}
