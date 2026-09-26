import { useId, useRef, useState } from 'react';
import { botAddLink, botOpenLink, telegramClientId } from '../lib/config';
import { setIdToken } from '../lib/telegram';
import './ChannelConnections.css';

const OIDC_ORIGIN = 'https://oauth.telegram.org';

type AuthResult = { id_token?: string; error?: string };

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
      error: 'Could not open the sign-in window. Allow popups for this site, then try again.',
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

export type ChannelConnectionsProps = {
  title?: string;
  description?: string;
  /** When true, show Telegram connect / add-group actions for the family record. */
  familyMode?: boolean;
  connected?: boolean;
  addLink?: string | null;
  busy?: boolean;
  onConnected?: () => void;
  onRefresh?: () => void;
};

export function ChannelConnections({
  title = 'Connections',
  description = 'Connect the chat your family already uses. Telegram works today. WhatsApp and Viber are placeholders for this demo.',
  familyMode = false,
  connected = false,
  addLink = null,
  busy = false,
  onConnected,
  onRefresh,
}: ChannelConnectionsProps) {
  const headingId = useId();
  const [connectBusy, setConnectBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = Boolean(telegramClientId);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const groupLink = addLink || botAddLink;

  function handleResult(result: AuthResult) {
    if (result.error) {
      if (result.error === 'popup_closed') {
        setError('Sign-in was closed before finishing.');
      } else if (/redirect_uri/i.test(result.error)) {
        setError(
          `Login rejected this site’s URL. Ask the team to add ${window.location.origin} to the allowed login URLs.`,
        );
      } else {
        setError(result.error);
      }
      setConnectBusy(false);
      return;
    }
    if (!result.id_token) {
      setError('Sign-in did not return a token.');
      setConnectBusy(false);
      return;
    }
    setIdToken(result.id_token);
    setConnectBusy(false);
    setError('');
    onConnectedRef.current?.();
  }

  function connectTelegram() {
    setError('');
    setConnectBusy(true);
    try {
      openTelegramAuth(telegramClientId, handleResult);
    } catch (err) {
      setConnectBusy(false);
      setError(err instanceof Error ? err.message : 'Could not start sign-in.');
    }
  }

  return (
    <section className="channel-connections family-panel" aria-labelledby={title ? headingId : undefined}>
      {title ? <h2 id={headingId}>{title}</h2> : null}
      {description ? <p className="lede">{description}</p> : null}
      <ul className="channel-list">
        <li>
          <div>
            <strong>Telegram</strong>
            {connected ? <span className="channel-badge">Connected</span> : null}
            <p>
              {addLink
                ? 'Add Anchor as an admin in a family group, then continue here.'
                : connected
                  ? 'Group moments sync from your connected chat.'
                  : 'Working today. Connect to pull group moments into this record.'}
            </p>
          </div>
          <div className="family-actions">
            {familyMode && !connected && configured ? (
              <button
                className="btn btn-primary"
                type="button"
                disabled={connectBusy}
                onClick={() => connectTelegram()}
              >
                {connectBusy ? 'Opening…' : 'Connect Telegram'}
              </button>
            ) : null}
            {!configured ? (
              <p className="lede channel-hint">Chat connection is not configured yet. Ask the team to finish setup.</p>
            ) : null}
            <a className="btn btn-secondary" href={groupLink} target="_blank" rel="noreferrer">
              Add to a group
            </a>
            <a className="btn btn-secondary" href={botOpenLink} target="_blank" rel="noreferrer">
              Open chat
            </a>
            {familyMode && addLink && onRefresh ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => onRefresh()}>
                {busy ? 'Checking…' : 'I added Anchor — continue'}
              </button>
            ) : null}
          </div>
        </li>
        <li>
          <div>
            <strong>WhatsApp</strong>
            <span className="channel-badge">Coming soon</span>
            <p>Demo placeholder — not connected in this prototype.</p>
          </div>
          <div className="family-actions">
            <button type="button" className="btn btn-secondary" disabled aria-disabled="true">
              Connect WhatsApp
            </button>
          </div>
        </li>
        <li>
          <div>
            <strong>Viber</strong>
            <span className="channel-badge">Coming soon</span>
            <p>Demo placeholder — not connected in this prototype.</p>
          </div>
          <div className="family-actions">
            <button type="button" className="btn btn-secondary" disabled aria-disabled="true">
              Connect Viber
            </button>
          </div>
        </li>
      </ul>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
