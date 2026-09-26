import { useCallback, useEffect, useId, useState } from 'react';
import {
  accountLabel,
  getAccountToken,
  isRegistrationComplete,
  listFamilies,
  signOut,
  watchAccountAuth,
  type AccountFamily,
} from '../lib/account';
import { botOpenLink } from '../lib/config';
import {
  BotAuthError,
  fetchMe,
  fetchMomentMedia,
  fetchMoments,
  getIdToken,
  joinFamily,
  tokenDisplayName,
  type FamilyMoment,
  type MeResult,
  watchTelegramAuth,
} from '../lib/telegram';
import { FamilyChat } from './FamilyChat';
import { MemoryUpload } from './MemoryUpload';
import { RegisterFlow } from './RegisterFlow';
import { TelegramLogin } from './TelegramLogin';
import './FamilyRecord.css';
import './RegisterFlow.css';

function formatWhen(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function MomentCard({ moment }: { moment: FamilyMoment }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState('');
  const transcriptId = useId();

  useEffect(() => {
    let photo: string | null = null;
    let voice: string | null = null;
    let cancelled = false;
    async function load() {
      try {
        if (moment.hasPhoto) {
          photo = await fetchMomentMedia(moment.id, 'photo');
          if (!cancelled) setPhotoUrl(photo);
        }
        if (moment.hasVoice) {
          voice = await fetchMomentMedia(moment.id, 'voice');
          if (!cancelled) setVoiceUrl(voice);
        }
      } catch (err) {
        if (!cancelled) setMediaError(err instanceof Error ? err.message : 'Could not load media.');
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (photo) URL.revokeObjectURL(photo);
      if (voice) URL.revokeObjectURL(voice);
    };
  }, [moment.hasPhoto, moment.hasVoice, moment.id]);

  return (
    <article className="family-moment">
      <header>
        <h3>{moment.title || 'Family moment'}</h3>
        <p>
          Shared by {moment.by.name}
          {moment.savedAt ? ` · ${formatWhen(moment.savedAt)}` : ''}
          {moment.eventDate ? ` · about ${moment.eventDate}` : ''}
        </p>
      </header>
      {moment.text ? (
        <p id={transcriptId} className="family-moment-text">
          {moment.hasVoice ? <strong className="family-transcript-label">Transcript. </strong> : null}
          {moment.text}
        </p>
      ) : null}
      {photoUrl ? <img src={photoUrl} alt={`Photo from ${moment.by.name}: ${moment.title}`} /> : null}
      {voiceUrl ? (
        <div className="family-voice">
          <audio
            controls
            src={voiceUrl}
            aria-label={`Voice note from ${moment.by.name}`}
            aria-describedby={moment.text ? transcriptId : undefined}
          >
            Voice note from {moment.by.name}
          </audio>
          {!moment.text ? (
            <p className="family-voice-note">
              Voice note from {moment.by.name}. No transcript is available for this recording.
            </p>
          ) : null}
        </div>
      ) : null}
      {mediaError ? (
        <p className="form-error" role="alert">
          {mediaError}
        </p>
      ) : null}
      {moment.stories?.length ? (
        <ul className="family-stories">
          {moment.stories.map((story) => (
            <li key={story.id}>
              <strong>{story.by.name}</strong>
              {story.at ? <span> · {formatWhen(story.at)}</span> : null}
              <p>{story.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function FamilyRecord() {
  const [phase, setPhase] = useState<'loading' | 'register' | 'record'>('loading');
  const [accountToken, setAccountTokenState] = useState<string | null>(null);
  const [accountFamily, setAccountFamily] = useState<AccountFamily | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeResult | null>(null);
  const [moments, setMoments] = useState<FamilyMoment[]>([]);
  const [addLink, setAddLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () =>
      watchAccountAuth((next) => {
        setAccountTokenState(next);
        setPhase(isRegistrationComplete() ? 'record' : 'register');
      }),
    [],
  );

  useEffect(() => watchTelegramAuth(setToken), []);

  useEffect(() => {
    if (phase !== 'record') return;
    let cancelled = false;
    void listFamilies()
      .then((families) => {
        if (!cancelled) setAccountFamily(families[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccountFamily(null);
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const refresh = useCallback(async () => {
    if (!getIdToken()) {
      setMe(null);
      setMoments([]);
      setAddLink(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const joined = await joinFamily();
      if (joined.status === 'no-family') {
        setAddLink(joined.addLink);
        setMe(null);
        setMoments([]);
        return;
      }
      setAddLink(null);
      const [profile, list] = await Promise.all([fetchMe(), fetchMoments()]);
      setMe(profile);
      setMoments(list);
    } catch (err) {
      if (err instanceof BotAuthError && err.status === 401) {
        setError('Sign in with Telegram again.');
      } else if (err instanceof BotAuthError && err.status === 403) {
        setError('You are not in this family group anymore. Sign in again after rejoining.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not load the family record.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'record') return;
    void refresh();
  }, [refresh, token, phase]);

  if (phase === 'loading') {
    return (
      <div className="family-shell">
        <p className="lede" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (phase === 'register') return <RegisterFlow />;

  const name =
    me?.member.name || tokenDisplayName(token) || accountLabel(accountToken || getAccountToken()) || 'You';

  return (
    <div className="family-shell">
      <header className="family-header">
        <div>
          <h1>Family record</h1>
          <p className="lede">
            {`Signed in as ${name}${accountFamily ? ` · ${accountFamily.name}` : ''}. This page is a mirror of the family’s kept moments — not a score. Everyday sharing lives in the group chat; choices and stop live with Anchor in Telegram.`}
          </p>
        </div>
        <div className="family-actions">
          <a className="btn btn-secondary" href="/my-data">
            My data
          </a>
          <a className="btn btn-secondary" href={botOpenLink}>
            Open Anchor in Telegram
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
      </header>

      {accountFamily?.members?.length ? (
        <p className="family-members" aria-label="Family members">
          {accountFamily.members.map((member) => member.displayName || member.email).join(' · ')}
        </p>
      ) : me?.family.members?.length ? (
        <p className="family-members" aria-label="Family members">
          {me.family.members.map((member) => member.name).join(' · ')}
        </p>
      ) : null}

      <MemoryUpload />
      <FamilyChat />

      {addLink ? (
        <section className="family-panel" aria-labelledby="add-anchor">
          <h2 id="add-anchor">Add Anchor to your family group</h2>
          <p className="lede">
            Telegram will ask which group to use, then add Anchor as an admin. After that, come back here and we will
            join you as the first member.
          </p>
          <div className="family-actions">
            <a className="btn btn-primary" href={addLink}>
              Add Anchor to a family group
            </a>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void refresh()}>
              {busy ? 'Checking…' : 'I added Anchor — continue'}
            </button>
            {busy ? (
              <p className="sr-only" role="status">
                Checking…
              </p>
            ) : null}
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {!token ? (
        <section className="family-panel" aria-labelledby="group-moments">
          <h2 id="group-moments">Group moments</h2>
          <p className="lede">
            Optional. Sign in with Telegram only if you want moments from a Telegram family group on this page.
          </p>
          <TelegramLogin onSignedIn={() => void refresh()} />
        </section>
      ) : null}

      {token && !addLink && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {token && !addLink && busy && !moments.length ? (
        <p className="lede" role="status">
          Loading the family record…
        </p>
      ) : null}

      {token && !addLink && !busy && !error && moments.length === 0 ? (
        <p className="lede">No moments yet. Share a photo or story in the family group on Telegram.</p>
      ) : null}

      {token && !addLink ? (
        <div className="family-moments">
          {moments.map((moment) => (
            <MomentCard key={moment.id} moment={moment} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
