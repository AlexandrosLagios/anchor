import { useEffect, useState } from 'react';
import { watchAuth, type AuthUser } from '../lib/auth';

export function AuthNav() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => watchAuth(setUser), []);

  if (user) {
    return (
      <a href="/family" className="auth-nav-link" title={user.email ?? 'Family Space'}>
        {user.displayName || user.email || 'Family Space'}
      </a>
    );
  }

  return (
    <>
      <a href="/login" className="auth-nav-link">
        Sign in
      </a>
      <a href="/signup" className="auth-nav-link">
        Create account
      </a>
    </>
  );
}
