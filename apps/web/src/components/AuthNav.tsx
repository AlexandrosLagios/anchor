import { useEffect, useState } from 'react';
import { watchAuth, type AuthUser } from '../lib/auth';

export function AuthNav() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => watchAuth(setUser), []);

  if (user) {
    return (
      <a href="/account" className="auth-nav-link" title={user.email ?? 'Account'}>
        {user.displayName || user.email || 'Account'}
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
