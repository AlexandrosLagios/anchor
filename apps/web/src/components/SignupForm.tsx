import { useState, type FormEvent } from 'react';
import { dataRegion, privacyEmail } from '../lib/config';
import { signUp } from '../lib/auth';
import './AuthForms.css';

export function SignupForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signUp({
        email,
        password,
        displayName,
        consents: { terms, privacy, marketing },
      });
      window.location.href = '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit} noValidate>
      <h1>Create an account</h1>
      <p className="lede">
        Your profile and moments are stored in the EU (Neon Postgres, <code>{dataRegion}</code>). Moments sent for AI
        practice are processed by OpenAI, which may run outside the EU — see{' '}
        <a href="/privacy">Privacy</a>. Contact <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
      </p>

      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <fieldset className="consent-set">
        <legend>Agreements</legend>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>
            I agree to the <a href="/terms">Terms of use</a>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required />
          <span>
            I have read the <a href="/privacy">Privacy policy</a>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Optional: email me product updates (off by default)</span>
        </label>
      </fieldset>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={busy || !terms || !privacy}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="auth-switch">
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </form>
  );
}
