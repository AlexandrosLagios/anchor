import { useEffect, useState } from 'react';
import { getIdToken, tokenDisplayName, watchTelegramAuth } from '../lib/telegram';

export function AuthNav() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => watchTelegramAuth(setToken), []);

  if (token || getIdToken()) {
    const name = tokenDisplayName(token || getIdToken());
    const label = name ? `Family record, ${name}` : 'Family record';
    return (
      <a href="/family" className="auth-nav-link">
        {label}
      </a>
    );
  }

  return (
    <a href="/family" className="auth-nav-link">
      Get started
    </a>
  );
}
