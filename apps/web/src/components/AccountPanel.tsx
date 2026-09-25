import { useEffect, useState } from 'react';
import { dataRegion, privacyEmail } from '../lib/config';
import { logOut, refreshMe, watchAuth, type AuthUser } from '../lib/auth';
import { FileDrop } from './FileDrop';
import './AuthForms.css';

export function AccountPanel() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    const stop = watchAuth(setUser);
    void refreshMe().then(setUser);
    return stop;
  }, []);

  if (user === undefined) {
    return (
      <div className="auth-panel" aria-busy="true">
        <h1>Your account</h1>
        <p className="lede">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-panel">
        <h1>Your account</h1>
        <p className="lede">You are signed out.</p>
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
    <div className="auth-panel">
      <h1>Your account</h1>
      <p className="lede">Signed in as {user.email}</p>
      <dl className="account-meta">
        <div>
          <dt>Display name</dt>
          <dd>{user.displayName || '—'}</dd>
        </div>
        <div>
          <dt>Data region</dt>
          <dd>
            Neon EU <code>{user.region || dataRegion}</code>
          </dd>
        </div>
        <div>
          <dt>Privacy contact</dt>
          <dd>
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
          </dd>
        </div>
      </dl>
      <p className="lede">
        To exercise GDPR rights (access, erasure, portability), email {privacyEmail} from this address.
      </p>
      <div className="actions">
        <a className="btn btn-primary" href="/chat">
          Chat with Anchor
        </a>
        <a className="btn btn-secondary" href="/app">
          Open demo
        </a>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            void logOut().then(() => {
              window.location.href = '/';
            });
          }}
        >
          Sign out
        </button>
      </div>

      <FileDrop />
    </div>
  );
}
