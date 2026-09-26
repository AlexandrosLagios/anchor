import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { getIdToken, parseApiError } from '../lib/auth';
import { apiUrl } from '../lib/config';

export type DroppedFile = {
  id: string;
  pathname: string;
  url: string;
  size: number;
  contentType: string;
  originalName: string | null;
  createdAt: string;
};

const MAX_BYTES = Math.floor(4.5 * 1024 * 1024);

async function filesApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new Error('Sign in required');
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/files${path}`), {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the Anchor API. Start it with pnpm dev:api, or check PUBLIC_API_URL.');
  }
  if (!response.ok) throw new Error(await parseApiError(response));
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

  async function uploadAll(incoming: FileList | File[]) {
    const batch = Array.from(incoming);
    if (!batch.length || busy) return;
    setError('');
    setStatus('');
    setBusy(true);
    const failed: string[] = [];
    let sent = 0;
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const file = batch[index];
        setStatus(`Uploading ${index + 1} of ${batch.length} — ${file.name}`);
        if (file.size > MAX_BYTES) {
          failed.push(`${file.name} (over 4.5 MB)`);
          continue;
        }
        try {
          const body = new FormData();
          body.append('file', file, file.name);
          await filesApi<DroppedFile>('', { method: 'POST', body });
          sent += 1;
        } catch (err) {
          failed.push(`${file.name} (${err instanceof Error ? err.message : 'Upload failed'})`);
        }
      }
      await refresh();
      const summary = sent === 1 ? 'Uploaded 1 file.' : `Uploaded ${sent} files.`;
      setStatus(failed.length ? `${summary} ${failed.length} failed.` : summary);
      if (failed.length) setError(failed.join(' '));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void uploadAll(event.dataTransfer.files);
  }

  async function openFile(file: DroppedFile) {
    setError('');
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign in required');
      const response = await fetch(apiUrl(`/api/files/${file.id}/content`), {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await parseApiError(response));
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
        Drop or choose files to upload them now. Each stays private in Vercel Blob (<code>fra1</code>), under
        4.5&nbsp;MB.
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
        <p>{busy ? 'Uploading…' : 'Drop files here, or choose them'}</p>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void uploadAll(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="file-status" aria-live="polite">
          {status}
        </p>
      ) : null}

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
