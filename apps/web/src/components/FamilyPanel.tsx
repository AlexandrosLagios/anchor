import { useEffect, useState, type FormEvent } from 'react';
import { getIdToken, parseApiError, watchAuth, type AuthUser } from '../lib/auth';
import { apiUrl } from '../lib/config';
import './AuthForms.css';

type Member = {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'owner' | 'member';
};

type Invite = {
  id: string;
  email: string;
  displayName: string | null;
};

type Family = {
  id: string;
  name: string;
  role: 'owner' | 'member';
  members: Member[];
  invites: Invite[];
};

async function familyApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const response = await fetch(apiUrl(`/api/families${path}`), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<T>;
}

export function FamilyPanel() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [families, setFamilies] = useState<Family[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => watchAuth(setUser), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void familyApi<{ families: Family[] }>('')
      .then((data) => {
        if (!cancelled) setFamilies(data.families);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your family.');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function createFamily(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const created = await familyApi<Family>('', { method: 'POST', body: JSON.stringify({ name }) });
      setFamilies((current) => [...current, created]);
      setName('');
      setNotice(`${created.name} is ready. Add the people who belong in it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the family.');
    } finally {
      setBusy(false);
    }
  }

  function replaceFamily(next: Family) {
    setFamilies((current) => current.map((family) => (family.id === next.id ? next : family)));
  }

  if (user === undefined) {
    return (
      <div className="auth-panel" aria-busy="true">
        <h1>Your family</h1>
        <p className="lede">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-panel">
        <h1>Your family</h1>
        <p className="lede">Sign in to create a family and add the people in it.</p>
        <p className="actions">
          <a className="btn btn-primary" href="/login">
            Sign in
          </a>
          <a className="btn btn-secondary" href="/signup">
            Create account
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <h1>Your family</h1>
      <p className="lede">
        Create a family, then add someone by email. An existing Anchor account joins immediately. A new person can get an
        account now, or join later when they sign up with that email.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="file-status">{notice}</p> : null}

      {families.length === 0 ? (
        <form onSubmit={createFamily}>
          <div className="field">
            <label htmlFor="family-name">Family name</label>
            <input
              id="family-name"
              name="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="The Papadopoulos family"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create family'}
          </button>
        </form>
      ) : null}

      {families.map((family) => (
        <FamilyCard
          key={family.id}
          family={family}
          onChange={replaceFamily}
          onNotice={setNotice}
          onError={setError}
        />
      ))}

      {families.length > 0 ? (
        <form className="family-another" onSubmit={createFamily}>
          <h2>Another family</h2>
          <div className="field">
            <label htmlFor="another-family-name">Family name</label>
            <input
              id="another-family-name"
              name="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create family'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function FamilyCard({
  family,
  onChange,
  onNotice,
  onError,
}: {
  family: Family;
  onChange: (family: Family) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consents, setConsents] = useState(false);
  const [busy, setBusy] = useState(false);
  const owner = family.role === 'owner';

  async function addMember(event: FormEvent) {
    event.preventDefault();
    onError('');
    onNotice('');
    setBusy(true);
    try {
      const result = await familyApi<{ status: 'existing' | 'created' | 'invited'; family: Family }>(
        `/${family.id}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            displayName,
            password: password || undefined,
            consents,
          }),
        },
      );
      onChange(result.family);
      setDisplayName('');
      setEmail('');
      setPassword('');
      setConsents(false);
      onNotice(
        result.status === 'existing'
          ? 'Added their existing account.'
          : result.status === 'created'
            ? 'Created their account and added them to the family.'
            : 'They don’t have an account yet. They’ll join when they sign up with this email.',
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add that person.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    onError('');
    onNotice('');
    setBusy(true);
    try {
      const next = await familyApi<Family>(`/${family.id}/members/${userId}`, { method: 'DELETE' });
      onChange(next);
      onNotice('Removed from the family.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove that person.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvite(inviteId: string) {
    onError('');
    onNotice('');
    setBusy(true);
    try {
      const next = await familyApi<Family>(`/${family.id}/invites/${inviteId}`, { method: 'DELETE' });
      onChange(next);
      onNotice('Invite cancelled.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not cancel that invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="family-card">
      <h2>{family.name}</h2>
      <ul className="member-list">
        {family.members.map((member) => (
          <li key={member.userId}>
            <div>
              <strong>{member.displayName || member.email}</strong>
              <span>
                {member.email}
                {member.role === 'owner' ? ' · created this family' : ''}
              </span>
            </div>
            {owner && member.role === 'member' ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void removeMember(member.userId)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {family.invites.map((invite) => (
          <li key={invite.id}>
            <div>
              <strong>{invite.displayName || invite.email}</strong>
              <span>{invite.email} · waiting to sign up</span>
            </div>
            {owner ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void cancelInvite(invite.id)}>
                Cancel
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {owner ? (
        <form onSubmit={addMember}>
          <h3>Add someone</h3>
          <div className="field">
            <label htmlFor={`name-${family.id}`}>Name</label>
            <input
              id={`name-${family.id}`}
              name="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`email-${family.id}`}>Email</label>
            <input
              id={`email-${family.id}`}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`password-${family.id}`}>Password for a new account</label>
            <input
              id={`password-${family.id}`}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="field-hint">
              Leave this blank if they already have an account, or if they will create one themselves.
            </p>
          </div>
          {password ? (
            <label className="check">
              <input type="checkbox" checked={consents} onChange={(event) => setConsents(event.target.checked)} required />
              <span>
                They agreed to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>
              </span>
            </label>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add to family'}
          </button>
        </form>
      ) : (
        <p className="lede">The person who created this family can add people.</p>
      )}
    </section>
  );
}
