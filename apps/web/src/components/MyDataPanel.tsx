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
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => watchAccountAuth(setAccountToken), []);
  useEffect(() => watchTelegramAuth(setChatToken), []);

  const account = accountToken || getAccountToken();
  const chatConnected = chatToken || getIdToken();
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

  async function onDownloadChatData() {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const blob = await downloadMyData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anchor-family-record-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('Saved your connected-chat family-record data as a JSON file.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download connected-chat data.');
      if (err instanceof BotAuthError && err.status === 401) setIdToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteChatData() {
    const confirmed = window.confirm(
      'This removes your moments and stories from Anchor’s family record for the connected chat. Messages already in the group chat stay in that chat. Continue?',
    );
    if (!confirmed) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await deleteMyData();
      setStatus('Your connected-chat family-record data was deleted from Anchor.');
      setIdToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete connected-chat data.');
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
          Download a copy of what this website account holds, or manage optional connected-chat data separately.
        </p>
        <ul className="my-data-list">
          <li>
            <strong>Download my data</strong> exports your families and uploaded-file metadata from the website account.
          </li>
          <li>
            <strong>Connected chat (optional)</strong> can export or delete moments from the family record if you linked
            a chat under Connections.
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

      {chatConnected ? (
        <section className="family-panel" aria-labelledby="chat-data">
          <h2 id="chat-data">Connected-chat family record</h2>
          <p className="lede">Optional. Export or delete what Anchor keeps from your connected group identity.</p>
          <div className="family-actions">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onDownloadChatData()}>
              Download chat data
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onDeleteChatData()}>
              Delete chat data
            </button>
          </div>
        </section>
      ) : (
        <TelegramLogin
          label="Connect a chat"
          title="Connected-chat family record (optional)"
          description="Only if you also use Anchor in a family group chat and want to export or delete that record. You can connect from the family page under Connections."
        />
      )}
    </div>
  );
}
