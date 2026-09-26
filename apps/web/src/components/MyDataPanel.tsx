import { useEffect, useState } from 'react';
import {
  BotAuthError,
  deleteMyData,
  downloadMyData,
  getIdToken,
  watchTelegramAuth,
} from '../lib/telegram';
import { TelegramLogin } from './TelegramLogin';
import './FamilyRecord.css';

export function MyDataPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => watchTelegramAuth(setToken), []);

  async function onDownload() {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const blob = await downloadMyData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anchor-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('Saved your data as a JSON file.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download your data.');
      if (err instanceof BotAuthError && err.status === 401) setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const confirmed = window.confirm(
      'Delete my data removes your moments and stories from Anchor’s family record and signs you out. Messages already in the Telegram group stay in Telegram. Continue?',
    );
    if (!confirmed) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await deleteMyData();
      setStatus('Your data was deleted from Anchor’s record.');
      setToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your data.');
    } finally {
      setBusy(false);
    }
  }

  if (!token && !getIdToken()) {
    return (
      <div className="family-shell">
        <TelegramLogin label="Sign in with Telegram to manage my data" />
      </div>
    );
  }

  return (
    <div className="family-shell">
      <section className="my-data" aria-labelledby="my-data-heading">
        <h1 id="my-data-heading">My data</h1>
        <p className="lede">
          Download a copy of what Anchor stores about you, or delete it from the family record.
        </p>
        <ul className="my-data-list">
          <li>
            <strong>Download my data</strong> includes moments and stories you shared, including ones Anchor marked
            sensitive.
          </li>
          <li>
            <strong>Delete my data</strong> removes those items from Anchor and removes you from the record. Telegram
            group messages stay in Telegram.
          </li>
        </ul>
        <div className="family-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onDownload()}>
            {busy ? 'Working…' : 'Download my data'}
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onDelete()}>
            Delete my data
          </button>
          <a className="btn btn-secondary" href="/family">
            Back to family
          </a>
        </div>
        {status ? <p className="file-status">{status}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
