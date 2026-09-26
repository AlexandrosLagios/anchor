import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AccountError,
  accountLabel,
  completeRegistration,
  createFamily,
  getAccountToken,
  listFamilies,
  listFiles,
  readProgress,
  setAccountToken,
  signIn,
  signUp,
  uploadMemory,
  writeProgress,
  type AccountFamily,
  type AccountFile,
} from '../lib/account';
import { botAddLink, botOpenLink } from '../lib/config';
import './RegisterFlow.css';

const STEPS = ['Account', 'Bot', 'Family', 'Memory'] as const;

export function RegisterFlow() {
  const headingId = useId();
  const policyEndRef = useRef<HTMLParagraphElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'choose' | 'signup' | 'signin'>('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [policyRead, setPolicyRead] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [family, setFamily] = useState<AccountFamily | null>(null);
  const [uploads, setUploads] = useState<AccountFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function resume() {
      if (!getAccountToken()) {
        if (!cancelled) setReady(true);
        return;
      }
      const progress = readProgress();
      if (!progress.botAdded) {
        if (!cancelled) {
          setStep(2);
          setReady(true);
        }
        return;
      }
      try {
        const families = await listFamilies();
        if (cancelled) return;
        if (!families.length) {
          setStep(3);
          setReady(true);
          return;
        }
        setFamily(families[0]);
        setFamilyName(families[0].name);
        const files = await listFiles();
        if (cancelled) return;
        setUploads(files);
        setStep(4);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not resume registration.');
          setStep(3);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'signup' || step !== 1) return;
    const el = policyEndRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setPolicyRead(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, step, ready]);

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'signup') {
      if (!policyRead) {
        setError('Read the privacy policy to the end before continuing.');
        return;
      }
      if (!acceptPrivacy || !acceptTerms) {
        setError('Accept the Privacy Policy and the Terms to continue.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp({ email, password, displayName });
      } else {
        await signIn(email, password);
      }
      setStep(2);
    } catch (err) {
      if (err instanceof AccountError && err.status === 409) {
        setMode('signin');
        setError('An account with that email already exists. Sign in to continue.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the account.');
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmBot() {
    writeProgress({ botAdded: true, complete: false });
    setStep(3);
  }

  async function submitFamily(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = family ?? (await createFamily(familyName));
      setFamily(created);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the family.');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const saved = await uploadMemory(file);
      setUploads((current) => [saved, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that memory.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="family-shell">
        <p className="lede" role="status">
          Loading registration…
        </p>
      </div>
    );
  }

  const signedInAs = accountLabel(getAccountToken());

  return (
    <div className="family-shell">
      <section className="family-panel reg" aria-labelledby={headingId}>
        <p className="reg-kicker">Step {step} of 4</p>
        <ol className="reg-steps" aria-label="Registration steps">
          {STEPS.map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} aria-current={number === step ? 'step' : undefined}>
                <span className="reg-step-num" aria-hidden="true">
                  {number}
                </span>
                {label}
              </li>
            );
          })}
        </ol>

        {step === 1 && mode === 'choose' ? (
          <>
            <h1 id={headingId}>Get started</h1>
            <p className="lede">Create an account, or sign in if you already have one.</p>
            <div className="family-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
              >
                Create an account
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError('');
                }}
              >
                Sign in
              </button>
            </div>
          </>
        ) : null}

        {step === 1 && mode !== 'choose' ? (
          <form onSubmit={(event) => void submitAccount(event)}>
            <h1 id={headingId}>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
            <p className="lede">
              {mode === 'signup'
                ? 'Register with your email and read the privacy policy. Anchor asks for this before the bot, the family, or any memory.'
                : 'Sign in with the email you used to create your account.'}
            </p>
            {mode === 'signup' ? (
              <div className="reg-policy" role="region" aria-label="Privacy policy">
                <h2>Privacy policy</h2>
                <p>
                  Anchor processes your account and family memories for this hackathon prototype. Read this summary to the
                  end. The full policy is on the <a href="/privacy">privacy page</a>.
                </p>
                <h3>What we collect</h3>
                <ul>
                  <li>Email address, a password stored only as a hash, and an optional display name.</li>
                  <li>That you accepted the Terms and this policy.</li>
                  <li>The family you create, and photos or voice notes you upload.</li>
                  <li>If you later use Telegram: your Telegram name, the group, and moments shared there.</li>
                </ul>
                <h3>Why</h3>
                <p>
                  To run the family memory service you asked for, and to record that you read this policy before Anchor
                  joins a group. Security logs may be kept to protect the service.
                </p>
                <h3>Where</h3>
                <p>
                  Account and family records are stored in Neon Postgres in the EU (eu-central-1). Uploaded files go to
                  Vercel Blob (fra1). The Telegram family record, when you add the bot, stays with the bot on Cloud Run in
                  europe-west1. Text and audio sent for transcription may be processed by OpenAI outside the EU.
                </p>
                <h3>Your rights</h3>
                <p>
                  You can ask for access, correction, or deletion, and you can export or delete data from My data once you
                  are signed in. Contact privacy@anchor.com. You may also complain to your local supervisory authority.
                </p>
                <p ref={policyEndRef}>
                  That is the end of this summary. The acceptance box below unlocks after you reach this line.
                </p>
              </div>
            ) : null}
            {mode === 'signup' ? (
              <p className="reg-hint" id="policy-hint">
                {policyRead
                  ? 'You have reached the end of the privacy policy.'
                  : 'Scroll to the end of the privacy policy. The acceptance box stays locked until then.'}
              </p>
            ) : null}
            <label className="reg-field">
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {mode === 'signup' ? (
              <label className="reg-field">
                Your name
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            ) : null}
            <label className="reg-field">
              Password
              <input
                type="password"
                name="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === 'signup' ? <p className="reg-hint">At least 8 characters.</p> : null}
            {mode === 'signup' ? (
              <>
                <label className="reg-check">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    disabled={!policyRead}
                    onChange={(event) => setAcceptPrivacy(event.target.checked)}
                    aria-describedby="policy-hint"
                  />
                  I have read the Privacy Policy
                </label>
                <label className="reg-check">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) => setAcceptTerms(event.target.checked)}
                  />
                  I accept the <a href="/terms">Terms</a>
                </label>
              </>
            ) : null}
            <div className="family-actions">
              <button className="btn btn-primary" type="submit" disabled={busy || (mode === 'signup' && !policyRead)}>
                {busy ? 'Saving…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </div>
            <p className="reg-switch">
              {mode === 'signup' ? (
                <button
                  type="button"
                  className="reg-text-btn"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                  }}
                >
                  Sign in instead
                </button>
              ) : (
                <button
                  type="button"
                  className="reg-text-btn"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                >
                  Create an account instead
                </button>
              )}
            </p>
          </form>
        ) : null}

        {step === 2 ? (
          <>
            <h1 id={headingId}>Add the bot</h1>
            <p className="lede">
              {signedInAs ? `Signed in as ${signedInAs}. ` : null}
              Telegram will ask which family group to use, then add Anchor as an admin.
            </p>
            <div className="family-actions">
              <a className="btn btn-primary" href={botAddLink} target="_blank" rel="noreferrer">
                Add Anchor to a family group
              </a>
              <a className="btn btn-secondary" href={botOpenLink} target="_blank" rel="noreferrer">
                Open Anchor in Telegram
              </a>
              <button className="btn btn-secondary" type="button" onClick={confirmBot}>
                I added Anchor — continue
              </button>
            </div>
            <p className="reg-switch">
              <button
                type="button"
                className="reg-text-btn"
                onClick={() => {
                  setAccountToken(null);
                  writeProgress({ botAdded: false, complete: false });
                  setStep(1);
                }}
              >
                Use a different email
              </button>
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <form onSubmit={(event) => void submitFamily(event)}>
            <h1 id={headingId}>Create a family</h1>
            <p className="lede">
              {signedInAs ? `Signed in as ${signedInAs}. ` : null}
              Name the family this account belongs to. You can invite other people later.
            </p>
            <label className="reg-field">
              Family name
              <input
                type="text"
                name="family"
                required
                maxLength={80}
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
              />
            </label>
            <div className="family-actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create family'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 4 ? (
          <>
            <h1 id={headingId}>Upload a memory</h1>
            <p className="lede">
              {family ? `${family.name}. ` : null}
              Add a photo or a voice note. Files stay under 4.5 MB.
            </p>
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
            {uploads.length ? (
              <ul className="reg-uploads">
                {uploads.map((file) => (
                  <li key={file.id}>{file.originalName || 'Memory'}</li>
                ))}
              </ul>
            ) : (
              <p className="reg-hint">No memory uploaded yet.</p>
            )}
            <div className="family-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || uploads.length === 0}
                onClick={() => completeRegistration()}
              >
                Finish
              </button>
            </div>
          </>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p className="sr-only" role="status">
            Working…
          </p>
        ) : null}
      </section>
    </div>
  );
}
