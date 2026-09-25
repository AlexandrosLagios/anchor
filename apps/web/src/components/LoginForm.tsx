import { useState, type FormEvent } from 'react';
import { signIn } from '../lib/auth';
import './AuthForms.css';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
      const next = new URLSearchParams(window.location.search).get('next');
      const dest = next && next.startsWith('/family') && !next.startsWith('//') ? next : '/family';
      window.location.href = dest;
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
