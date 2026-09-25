import { useState, type FormEvent } from 'react';
import { firebaseConfigured } from '../lib/firebase';
import { signIn } from '../lib/auth';
import './AuthForms.css';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!firebaseConfigured()) {
    return (
      <div className="auth-panel" role="status">
        <h1>Sign in</h1>
        <p className="lede">Firebase is not configured yet. Set the public Firebase env vars to enable accounts.</p>
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
      window.location.href = '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit}>
      <h1>Sign in</h1>
      <p className="lede">Access your Anchor account stored in the EU.</p>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-switch">
        New here? <a href="/signup">Create an account</a>
      </p>
    </form>
  );
}
