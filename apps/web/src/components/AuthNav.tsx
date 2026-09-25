import { useEffect, useState } from 'react';
import { firebaseConfigured } from '../lib/firebase';
import { watchAuth, type AuthUser } from '../lib/auth';

export function AuthNav() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!firebaseConfigured()) return;
    return watchAuth(setUser);
  }, []);

  if (!firebaseConfigured()) {
    return (
      <a href="/signup" className="auth-nav-link">
        Create account
      </a>
    );
  }

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
