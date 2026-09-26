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
import { botAddLink, botOpenLink, privacyEmail } from '../lib/config';
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
                  This policy explains how Anchor (“we”) processes personal data for the OpenConf hackathon prototype.
                  Controller contact: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
                </p>

                <h3>Who we are</h3>
                <p>
                  Anchor is a family memory product that helps practise spaced retrieval in a Telegram family group. For
                  privacy requests email {privacyEmail}, or use <a href="/my-data">My data</a> when signed in with
                  Telegram.
                </p>

                <h3>What we collect</h3>
                <ul>
                  <li>Account: email address, a password stored only as a hash, and an optional display name.</li>
                  <li>Consent: that you read this policy and accepted the Terms before continuing.</li>
                  <li>Files you upload on the website, such as photos and voice notes.</li>
                  <li>Telegram identity: Telegram user id and display name from Telegram Login.</li>
                  <li>Family membership: Telegram group and the people who belong to it with Anchor.</li>
                  <li>
                    Family moments: text, photos, voice notes, and stories shared in the group or private chat with
                    Anchor.
                  </li>
                  <li>Technical logs needed to run the service (security, errors).</li>
                </ul>

                <h3>Purposes and legal bases (GDPR)</h3>
                <ul>
                  <li>
                    <strong>Contract / steps prior to contract</strong> — run the family memory service you asked for.
                  </li>
                  <li>
                    <strong>Consent</strong> — you read this policy and accept it, with the Terms, when you register with
                    email.
                  </li>
                  <li>
                    <strong>Legitimate interests</strong> — secure the service, prevent abuse, improve the prototype
                    (balanced against your rights).
                  </li>
                </ul>

                <h3>Where data is stored</h3>
                <p>
                  Account, consent, and the family you create on the website are stored in <strong>Neon Postgres</strong>{' '}
                  in <code>eu-central-1</code>. Files you upload are stored in <strong>Vercel Blob</strong> (
                  <code>fra1</code>). The Telegram family record lives with the bot on{' '}
                  <strong>
                    Google Cloud Run in <code>europe-west1</code>
                  </strong>
                  , stored as a file in <strong>Cloud Storage</strong> in the same region. The website is hosted on
                  Vercel.
                </p>

                <h3>Telegram Login</h3>
                <p>
                  After email registration, group moments use <strong>Telegram Login</strong> (OpenID Connect). Telegram
                  issues a short-lived <code>id_token</code>. The website keeps that token in <code>sessionStorage</code>{' '}
                  and sends it only to the bot API. It is not put in the URL, in logs, or in <code>localStorage</code>.
                </p>

                <h3>Artificial intelligence (OpenAI)</h3>
                <p>
                  To extract recallable moments, transcribe voice notes, describe photos, and synthesise speech we send
                  relevant text and audio to <strong>OpenAI’s API</strong> (<code>api.openai.com</code>). Prompts and
                  media may be processed <strong>outside the European Union</strong> under OpenAI’s API terms. Do not
                  submit special-category health data you are not prepared to share with that processor.
                </p>

                <h3>Processors</h3>
                <ul>
                  <li>Neon — account, consent, and website family records (<code>eu-central-1</code>).</li>
                  <li>Vercel Blob — files you upload (<code>fra1</code>).</li>
                  <li>Telegram — group chat, private messages, and Telegram Login.</li>
                  <li>
                    Google Cloud Run (<code>europe-west1</code>) — the Anchor bot.
                  </li>
                  <li>Google Cloud Storage — the family record file.</li>
                  <li>Vercel — the website.</li>
                  <li>
                    OpenAI API — moment extraction, transcription, photo description, and speech (may process outside the
                    EU).
                  </li>
                  <li>Twilio — voice calls when the demo features use a phone call.</li>
                </ul>

                <h3>Retention</h3>
                <p>
                  The family record is kept while the family uses Anchor, or until you delete your data from{' '}
                  <a href="/my-data">My data</a>. Messages in Telegram remain in Telegram under Telegram’s own rules.
                  Cached OpenAI answers on the bot filesystem are ephemeral operational caches.
                </p>

                <h3>Your rights</h3>
                <p>
                  Under GDPR you may request access, rectification, erasure, restriction, portability, and objection, and
                  you may withdraw consent where processing is consent-based. Use{' '}
                  <a href="/my-data">Download my data</a> and <a href="/my-data">Delete my data</a>, or contact{' '}
                  {privacyEmail}. You may also lodge a complaint with your local supervisory authority.
                </p>

                <h3>Children</h3>
                <p>Anchor is not directed at children under 16. Do not create accounts for minors without lawful basis.</p>

                <h3>Changes</h3>
                <p>
                  We may update this policy for the hackathon prototype; the date in the page footer or git history
                  reflects changes.
                </p>

                <h3>Contact</h3>
                <p>
                  Privacy / GDPR: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
                </p>

                <p ref={policyEndRef}>
                  That is the end of the privacy policy. The acceptance box below unlocks after you reach this line.
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
