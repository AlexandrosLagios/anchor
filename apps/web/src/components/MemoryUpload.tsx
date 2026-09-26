import { useState, type ChangeEvent } from 'react';
import { AccountError, uploadMemory } from '../lib/account';

/** Continuous memory upload — confirmation only, no gallery of past files. */
export function MemoryUpload() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await uploadMemory(file);
      setStatus('Uploaded. Add as many as you like — Anchor keeps them for later.');
    } catch (err) {
      setError(err instanceof AccountError ? err.message : err instanceof Error ? err.message : 'Could not upload that memory.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="family-panel" aria-labelledby="add-memories">
      <h2 id="add-memories">Add memories</h2>
      <p className="lede">Drop photos or voice notes whenever you want. Files stay under 4.5 MB.</p>
      <label className="reg-field">
        Photo or voice note
        <input
          className="reg-file"
          type="file"
          accept="image/*,audio/*"
          disabled={busy}
          onChange={(event) => void onFile(event)}
        />
      </label>
      {busy ? (
        <p className="reg-hint" role="status">
          Uploading…
        </p>
      ) : null}
      {status ? (
        <p className="reg-hint" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
