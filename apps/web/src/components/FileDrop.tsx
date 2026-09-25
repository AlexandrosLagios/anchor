import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { getIdToken } from '../lib/auth';

export type DroppedFile = {
  id: string;
  pathname: string;
  url: string;
  size: number;
  contentType: string;
  originalName: string | null;
  createdAt: string;
};

async function filesApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new Error('Sign in required');
  const response = await fetch(`/api/files${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (typeof body.message === 'string') message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    const data = await filesApi<{ files: DroppedFile[] }>('');
    setFiles(data.files);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load files.');
    });
  }, [refresh]);

  async function upload(file: File) {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await filesApi<DroppedFile>('', { method: 'POST', body });
      setStatus(`Uploaded ${file.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  async function openFile(file: DroppedFile) {
    setError('');
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign in required');
      const response = await fetch(`/api/files/${file.id}/content`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Could not open file (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file.');
    }
  }

  async function removeFile(file: DroppedFile) {
    setError('');
    setBusy(true);
    try {
      await filesApi<{ ok: boolean }>(`/${file.id}`, { method: 'DELETE' });
      setStatus(`Removed ${file.originalName || file.pathname}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="file-drop" aria-labelledby="file-drop-heading">
      <h2 id="file-drop-heading">File drop</h2>
      <p className="lede">
        Private media in Vercel Blob (<code>fra1</code>), scoped to your account. Max 4.5&nbsp;MB per file.
      </p>

      <div
        className={`drop-zone${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <p>{busy ? 'Uploading…' : 'Drop a file here, or choose one'}</p>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="file-status">{status}</p> : null}

      {files.length > 0 ? (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id}>
              <div>
                <strong>{file.originalName || file.pathname}</strong>
                <span>
                  {formatSize(file.size)} · {file.contentType}
                </span>
              </div>
              <div className="file-actions">
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void openFile(file)}>
                  Open
                </button>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void removeFile(file)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lede">No files yet.</p>
      )}
    </section>
  );
}
