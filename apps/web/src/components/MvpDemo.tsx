import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './MvpDemo.css';

type From = 'sofia' | 'nikos' | 'anchor';
type Pane = 'group' | 'private';

type Line = {
  id: string;
  pane: Pane;
  from: From;
  text: string;
  photo?: boolean;
  voice?: boolean;
  heart?: boolean;
};

type Phase = 'share' | 'consent' | 'wait' | 'open' | 'share-choice' | 'done' | 'declined' | 'stopped';

const CAPTION = "Maria's first day of school — she didn't want to let go of my hand";
const WELCOME =
  'Hello Nikos. I’m Anchor, and I’m not a person. I keep this family’s photos and stories, each one in the words of the person who shared it. Now and then I’ll send you a moment, so you can add what it brings back. There’s no right answer, and I share nothing unless you say so. You can stop whenever you like, and nothing more will come back.';
const SAMPLE_VOICE = 'She held your hand at the gate. I can still see that little blue backpack.';

const names: Record<From, string> = {
  sofia: 'Sofia',
  nikos: 'Nikos',
  anchor: 'Anchor',
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognizer(): SpeechRec | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function SchoolPhoto() {
  return (
    <svg className="school-photo" viewBox="0 0 320 200" role="img" aria-label="Maria at the school gate, backpack on">
      <rect width="320" height="200" fill="#f3e6d4" />
      <rect x="36" y="48" width="120" height="120" rx="4" fill="#efe2cf" stroke="#c4a882" />
      <rect x="78" y="108" width="36" height="60" fill="#8f6a45" />
      <rect x="52" y="68" width="28" height="22" fill="#d7ebe7" />
      <rect x="112" y="68" width="28" height="22" fill="#d7ebe7" />
      <circle cx="214" cy="108" r="16" fill="#e7c2a4" />
      <path d="M198 128c8 18 28 18 36 0" fill="#1f4d48" />
      <rect x="206" y="124" width="16" height="28" fill="#c45c26" />
      <path d="M200 118h8l6 14h-6z" fill="#0f3d3a" />
      <rect x="248" y="132" width="28" height="8" rx="2" fill="#245c56" />
    </svg>
  );
}

export function MvpDemo() {
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>('share');
  const [helped, setHelped] = useState(false);
  const [asked, setAsked] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [shared, setShared] = useState(false);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState('');
  const [mobilePane, setMobilePane] = useState<Pane>('group');
  const groupRef = useRef<HTMLDivElement>(null);
  const privateRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef('');
  const [live, setLive] = useState('');
  const captionId = useId();
  const groupPanelId = useId();
  const privatePanelId = useId();
  const tabGroupId = useId();
  const tabPrivateId = useId();

  function say(message: string) {
    if (message !== liveRef.current) {
      liveRef.current = message;
      setLive(message);
    }
  }

  useEffect(() => {
    if (micNote) say(micNote);
  }, [micNote]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const next: Pane =
      event.key === 'Home'
        ? 'group'
        : event.key === 'End'
          ? 'private'
          : mobilePane === 'group'
            ? 'private'
            : 'group';
    setMobilePane(next);
    const targetId = next === 'group' ? tabGroupId : tabPrivateId;
    requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  }

  function push(line: Omit<Line, 'id'>) {
    setLines((prev) => [...prev, { ...line, id: uid() }]);
  }

  useEffect(() => {
    groupRef.current?.scrollTo({ top: groupRef.current.scrollHeight });
    privateRef.current?.scrollTo({ top: privateRef.current.scrollHeight });
  }, [lines]);

  function shareMoment() {
    push({ pane: 'group', from: 'sofia', text: CAPTION, photo: true, heart: true });
    setPhase('consent');
    setMobilePane('private');
    say('Sofia’s photo is kept with her words. Nikos has not been sent anything yet.');
  }

  function agree() {
    push({ pane: 'private', from: 'anchor', text: WELCOME });
    push({ pane: 'private', from: 'nikos', text: 'Yes. I’ll take part.' });
    setPhase('wait');
    say('Nikos agreed himself. Nothing has come back yet.');
  }

  function decline() {
    push({ pane: 'private', from: 'anchor', text: WELCOME });
    push({ pane: 'private', from: 'nikos', text: 'Not for me.' });
    push({ pane: 'private', from: 'anchor', text: 'Of course. Nothing will come back to you.' });
    setPhase('declined');
    say('Nikos declined. The moment stays with the family, and nothing comes back to him.');
  }

  function bringBack() {
    push({
      pane: 'private',
      from: 'anchor',
      text: `Sofia shared:\n«${CAPTION}»\n\nWhat does it remind you of?`,
      photo: true,
    });
    setPhase('open');
    setMobilePane('private');
    say('The moment came back only to Nikos, in Sofia’s words.');
  }

  function gentleHelp() {
    push({ pane: 'private', from: 'nikos', text: 'I’m not sure.' });
    push({
      pane: 'private',
      from: 'anchor',
      text: 'No rush. This is from today: Maria’s first day of school. Any memory it brings is welcome.',
    });
    setHelped(true);
    say('Gentle help stayed in the private chat. The family group did not see it.');
  }

  function silence() {
    push({
      pane: 'private',
      from: 'anchor',
      text: 'No rush. This is from today: Maria’s first day of school. Any memory it brings is welcome.',
    });
    setHelped(true);
    say('He didn’t reply. Anchor offered the same gentle help, still only to him.');
  }

  function justAsk() {
    push({ pane: 'private', from: 'nikos', text: 'What is this?' });
    push({
      pane: 'private',
      from: 'anchor',
      text: 'Sofia sent this today. It’s Maria on her first day of school — she didn’t want to let go of Sofia’s hand. You’re welcome to say whatever it brings back.',
    });
    setAsked(true);
    say('He asked, and Anchor told him directly. No hint that he should have known.');
  }

  function addVoice(text: string) {
    const spoken = text.trim();
    if (!spoken) return;
    push({ pane: 'private', from: 'nikos', text: spoken, voice: true });
    push({ pane: 'private', from: 'anchor', text: 'Thank you for that. Shall I share it with the family?' });
    setVoiceText(spoken);
    setPhase('share-choice');
    say('His voice is on the memory. The family has not heard it yet.');
  }

  function startListening() {
    const rec = getRecognizer();
    if (!rec) {
      setMicNote('This browser has no speech recognition. Use the sample line.');
      return;
    }
    rec.lang = 'en-US';
    rec.interimResults = false;
    setListening(true);
    setMicNote('Listening…');
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setListening(false);
      setMicNote('');
      if (transcript.trim()) addVoice(transcript);
      else setMicNote('Didn’t catch that. Try again, or use the sample line.');
    };
    rec.onerror = () => {
      setListening(false);
      setMicNote('The microphone didn’t come through. Use the sample line.');
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      setListening(false);
      setMicNote('The microphone didn’t come through. Use the sample line.');
    }
  }

  function shareWithFamily() {
    push({
      pane: 'group',
      from: 'anchor',
      text: `Nikos added a story to Sofia’s moment.\n«${voiceText}»`,
      voice: true,
    });
    push({ pane: 'private', from: 'anchor', text: 'Done. The family can hear it now.' });
    setShared(true);
    setPhase('done');
    setMobilePane('group');
    say('Only the story reached the family. His hesitation stayed private.');
  }

  function keepPrivate() {
    push({ pane: 'private', from: 'anchor', text: 'Of course. I won’t share it.' });
    setPhase('done');
    say('The story stays on the memory, and the family does not see it.');
  }

  function warmClose() {
    push({ pane: 'private', from: 'anchor', text: 'Thank you.' });
    setPhase('done');
    say('The exchange ended warmly. The family saw none of it.');
  }

  function stop() {
    if (phase === 'consent') push({ pane: 'private', from: 'anchor', text: WELCOME });
    push({
      pane: 'private',
      from: 'anchor',
      text: 'Of course. I’ll keep what the family shared, and I won’t bring anything back to you.',
    });
    setPhase('stopped');
    say('Nikos stopped. Nothing more comes back.');
  }

  function reset() {
    setLines([]);
    setPhase('share');
    setHelped(false);
    setAsked(false);
    setVoiceText('');
    setShared(false);
    setListening(false);
    setMicNote('');
    setMobilePane('group');
    say('Demo reset.');
  }

  const kept = phase !== 'share';
  const agreed = !['share', 'consent', 'declined'].includes(phase);
  const returned = lines.some((line) => line.pane === 'private' && line.photo);
  const canRespond = phase === 'open';
  const canStop = phase === 'consent' || phase === 'wait' || phase === 'open' || phase === 'share-choice';

  return (
    <div className="mvp">
      <header className="mvp-intro">
        <h1>A morning with the family</h1>
        <p>
          Sofia shares Maria’s first day. Nikos agrees himself. The moment comes back only to him — he can ask, take his time, or answer by voice.
        </p>
      </header>

      <ol className="mvp-rail" aria-label="Demo progress">
        <li className={kept ? 'done' : ''}>
          {kept ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{kept ? 'Done: ' : ''}Kept in her words</span>
        </li>
        <li className={agreed ? 'done' : ''}>
          {agreed ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{agreed ? 'Done: ' : ''}He agrees himself</span>
        </li>
        <li className={returned ? 'done' : ''}>
          {returned ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{returned ? 'Done: ' : ''}It comes back</span>
        </li>
        <li className={helped ? 'done' : ''}>
          {helped ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{helped ? 'Done: ' : ''}Gentle help stays private</span>
        </li>
        <li className={asked ? 'done' : ''}>
          {asked ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{asked ? 'Done: ' : ''}He can just ask</span>
        </li>
        <li className={voiceText ? 'done' : ''}>
          {voiceText ? <span className="mvp-rail-mark" aria-hidden="true">✓ </span> : null}
          <span>{voiceText ? 'Done: ' : ''}He answers by voice</span>
        </li>
      </ol>

      <div className="mvp-panes">
        <div className="mvp-switch" role="tablist" aria-label="Which chat">
          <button
            type="button"
            id={tabGroupId}
            role="tab"
            aria-selected={mobilePane === 'group'}
            aria-controls={groupPanelId}
            tabIndex={mobilePane === 'group' ? 0 : -1}
            onClick={() => setMobilePane('group')}
            onKeyDown={onTabKeyDown}
          >
            Family group
          </button>
          <button
            type="button"
            id={tabPrivateId}
            role="tab"
            aria-selected={mobilePane === 'private'}
            aria-controls={privatePanelId}
            tabIndex={mobilePane === 'private' ? 0 : -1}
            onClick={() => setMobilePane('private')}
            onKeyDown={onTabKeyDown}
          >
            Nikos, in private
          </button>
        </div>

        <section
          id={groupPanelId}
          role="tabpanel"
          aria-labelledby="group-heading"
          className={`panel chat-shell ${mobilePane === 'group' ? 'is-active' : ''}`}
        >
          <h2 className="panel-heading" id="group-heading">
            Family group
          </h2>
          <div className="chat-meta">
            <h3>Sofia, Nikos, and Anchor</h3>
            <p>What everyone sees. Hesitation never lands here.</p>
          </div>
          <div className="chat-log" ref={groupRef} role="log" aria-live="polite" aria-relevant="additions">
            {lines.every((line) => line.pane !== 'group') ? (
              <p className="empty">The chat is quiet. Sofia is about to send a photo.</p>
            ) : null}
            {lines
              .filter((line) => line.pane === 'group')
              .map((line) => (
                <Bubble key={line.id} line={line} />
              ))}
          </div>
          {phase === 'share' ? (
            <div className="composer">
              <p id={captionId} className="composer-caption">
                <strong>Sofia</strong> · {CAPTION}
              </p>
              <button className="btn btn-primary" type="button" aria-describedby={captionId} onClick={shareMoment}>
                Send the photo
              </button>
            </div>
          ) : (
            <p className="pane-note">Anchor kept the photo with Sofia’s name and her exact words. No extra step.</p>
          )}
        </section>

        <section
          id={privatePanelId}
          role="tabpanel"
          aria-labelledby="private-heading"
          className={`panel chat-shell ${mobilePane === 'private' ? 'is-active' : ''}`}
        >
          <h2 className="panel-heading" id="private-heading">
            Nikos, in private
          </h2>
          <div className="chat-meta">
            <h3>Only Nikos and Anchor</h3>
            <p>He joins as a member of the family. He can stop at any time.</p>
          </div>
          <div className="chat-log" ref={privateRef} role="log" aria-live="polite" aria-relevant="additions">
            {phase === 'share' ? <p className="empty">Nothing comes back until he has agreed.</p> : null}
            {phase === 'consent' && lines.every((line) => line.pane !== 'private') ? (
              <div className="invite-card">
                <p>{WELCOME}</p>
              </div>
            ) : null}
            {lines
              .filter((line) => line.pane === 'private')
              .map((line) => (
                <Bubble key={line.id} line={line} />
              ))}
          </div>
          <div className="composer">
            {phase === 'consent' ? (
              <div className="action-row">
                <button className="btn btn-primary" type="button" onClick={agree}>
                  Yes, I’ll take part
                </button>
                <button className="btn btn-secondary" type="button" onClick={decline}>
                  Not for me
                </button>
              </div>
            ) : null}
            {phase === 'wait' ? (
              <button className="btn btn-primary" type="button" onClick={bringBack}>
                A little later — bring it back
              </button>
            ) : null}
            {canRespond ? (
              <div className="action-row">
                <button className="btn btn-primary" type="button" disabled={listening} onClick={startListening}>
                  {listening ? 'Listening…' : 'Speak'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => addVoice(SAMPLE_VOICE)}>
                  Use a sample line
                </button>
                <button className="btn btn-secondary" type="button" onClick={justAsk} disabled={asked}>
                  What is this?
                </button>
                <button className="btn btn-secondary" type="button" onClick={gentleHelp} disabled={helped}>
                  I’m not sure
                </button>
                <button className="btn btn-secondary" type="button" onClick={silence} disabled={helped}>
                  He doesn’t reply
                </button>
                <button className="btn btn-secondary" type="button" onClick={warmClose}>
                  That’s enough
                </button>
              </div>
            ) : null}
            {phase === 'share-choice' ? (
              <div className="action-row">
                <button className="btn btn-primary" type="button" onClick={shareWithFamily}>
                  Yes, share it
                </button>
                <button className="btn btn-secondary" type="button" onClick={keepPrivate}>
                  No, thanks
                </button>
              </div>
            ) : null}
            {micNote ? <p className="pane-note">{micNote}</p> : null}
            {canStop ? (
              <button className="btn btn-quiet" type="button" onClick={stop}>
                Stop — nothing more comes back
              </button>
            ) : null}
            {phase === 'done' || phase === 'declined' || phase === 'stopped' ? (
              <button className="btn btn-secondary" type="button" onClick={reset}>
                Play it again
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel memory" aria-labelledby="memory-heading">
        <h2 id="memory-heading">The memory</h2>
        {kept ? (
          <article>
            <p className="memory-kicker">Kept with her name and her words</p>
            <h3>Sofia</h3>
            <p className="memory-quote">«{CAPTION}»</p>
            {voiceText ? (
              <>
                <h3>Nikos, by voice</h3>
                <p className="memory-quote">«{voiceText}»</p>
                <p className="memory-kicker">
                  {shared ? 'Shared with the family, after he said yes.' : 'On the memory. Not in the group unless he says yes.'}
                </p>
              </>
            ) : (
              <p className="memory-kicker">Waiting for his words.</p>
            )}
          </article>
        ) : (
          <p>Nothing kept yet.</p>
        )}
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
    </div>
  );
}

function Bubble({ line }: { line: Line }) {
  return (
    <div className={`bubble ${line.from}`}>
      <span className="who">{names[line.from]}</span>
      {line.photo ? <SchoolPhoto /> : null}
      <span className="text">{line.text}</span>
      {line.voice ? <span className="voice-tag">Voice note</span> : null}
      {line.heart ? <span className="heart">Anchor kept this</span> : null}
    </div>
  );
}
