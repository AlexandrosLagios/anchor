import { useEffect, useState } from 'react';
import {
  AccountError,
  accountLabel,
  getAccountToken,
  listFamilies,
  listFiles,
  signOut,
  watchAccountAuth,
} from '../lib/account';
import {
  BotAuthError,
  deleteMyData,
  downloadMyData,
  getIdToken,
  setIdToken,
  watchTelegramAuth,
} from '../lib/telegram';
import { TelegramLogin } from './TelegramLogin';
import './FamilyRecord.css';

export function MyDataPanel() {
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => watchAccountAuth(setAccountToken), []);
  useEffect(() => watchTelegramAuth(setTelegramToken), []);

  const account = accountToken || getAccountToken();
  const telegram = telegramToken || getIdToken();
  const name = accountLabel(account);

  async function onDownloadAccount() {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const [families, files] = await Promise.all([listFamilies(), listFiles()]);
      const payload = {
        exportedAt: new Date().toISOString(),
        account: name,
        families,
        files: files.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          size: file.size,
          contentType: file.contentType,
          createdAt: file.createdAt,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anchor-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('Saved your website account data as a JSON file.');
    } catch (err) {
      setError(err instanceof AccountError ? err.message : err instanceof Error ? err.message : 'Could not download your data.');
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadTelegram() {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const blob = await downloadMyData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anchor-telegram-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('Saved your Telegram family-record data as a JSON file.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download Telegram data.');
      if (err instanceof BotAuthError && err.status === 401) setIdToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTelegram() {
    const confirmed = window.confirm(
      'Delete Telegram data removes your moments and stories from Anchor’s Telegram family record. Messages already in the Telegram group stay in Telegram. Continue?',
    );
    if (!confirmed) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await deleteMyData();
      setStatus('Your Telegram family-record data was deleted from Anchor.');
      setIdToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete Telegram data.');
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <div className="family-shell">
        <section className="my-data" aria-labelledby="my-data-heading">
          <h1 id="my-data-heading">My data</h1>
          <p className="lede">
            Sign in with your email account to download or manage what Anchor stores for you on the website.
          </p>
          <div className="family-actions">
            <a className="btn btn-primary" href="/family">
              Sign in with email
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="family-shell">
      <section className="my-data" aria-labelledby="my-data-heading">
        <h1 id="my-data-heading">My data</h1>
        <p className="lede">
          {name ? `Signed in as ${name}. ` : null}
          Download a copy of what this website account holds, or manage optional Telegram group data separately.
        </p>
        <ul className="my-data-list">
          <li>
            <strong>Download my data</strong> exports your families and uploaded-file metadata from the website account.
          </li>
          <li>
            <strong>Telegram (optional)</strong> can export or delete moments from the Telegram family record if you
            linked that identity.
          </li>
        </ul>
        <div className="family-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onDownloadAccount()}>
            {busy ? 'Working…' : 'Download my data'}
          </button>
          <a className="btn btn-secondary" href="/family">
            Back to family
          </a>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              signOut();
            }}
          >
            Sign out
          </button>
        </div>
        {status ? (
          <p className="file-status" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {telegram ? (
        <section className="family-panel" aria-labelledby="telegram-data">
          <h2 id="telegram-data">Telegram family record</h2>
          <p className="lede">Optional. Export or delete what Anchor keeps from your Telegram group identity.</p>
          <div className="family-actions">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onDownloadTelegram()}>
              Download Telegram data
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onDeleteTelegram()}>
              Delete Telegram data
            </button>
          </div>
        </section>
      ) : (
        <TelegramLogin
          label="Sign in with Telegram"
          title="Telegram family record (optional)"
          description="Only if you also use Anchor in a Telegram group and want to export or delete that record."
        />
      )}
    </div>
  );
}
