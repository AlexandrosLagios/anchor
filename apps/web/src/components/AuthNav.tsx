import { useEffect, useState } from 'react';
import { accountLabel, getAccountToken, isRegistrationComplete, watchAccountAuth } from '../lib/account';
import { getIdToken, tokenDisplayName, watchTelegramAuth } from '../lib/telegram';

export function AuthNav() {
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(
    () =>
      watchAccountAuth((next) => {
        setAccountToken(next);
        setRegistered(isRegistrationComplete());
      }),
    [],
  );
  useEffect(() => watchTelegramAuth(setToken), []);

  const account = accountToken || getAccountToken();
  const telegram = token || getIdToken();
  if (account || telegram) {
    const name = accountLabel(account) || tokenDisplayName(telegram);
    const label = !account || registered
      ? name
        ? `Family record, ${name}`
        : 'Family record'
      : 'Continue registration';
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
