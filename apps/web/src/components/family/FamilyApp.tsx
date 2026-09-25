import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { logOut, refreshMe, watchAuth, type AuthUser } from '../../lib/auth';
import { CONNECTED_CHAT, FAMILY_NAME } from '../../family/data';
import { firstName, formatDate, mediaLabel, memberName, roleLabel, statusLabel } from '../../family/format';
import { todayStamp, useFamilyState, withAudit } from '../../family/store';
import type { FamilyMember, FamilyRole, Memory, MemoryStatus } from '../../family/types';
import './FamilySpace.css';

type View = 'overview' | 'memories' | 'memory' | 'members' | 'permissions';
type Filter = 'all' | MemoryStatus;

type DialogState =
  | { kind: 'help' }
  | { kind: 'confirm'; title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'invite' }
  | { kind: 'consent' }
  | { kind: 'sessions' }
  | { kind: 'connection' }
  | { kind: 'member'; id: string }
  | null;

const NAV = [
  { href: '/family', view: 'overview' as const, label: 'Overview' },
  { href: '/family/memories', view: 'memories' as const, label: 'Memories' },
  { href: '/family/members', view: 'members' as const, label: 'Family Members' },
  { href: '/family/permissions', view: 'permissions' as const, label: 'Permissions & Safety' },
];

export function FamilyApp({ view, memoryId }: { view: View; memoryId?: string }) {
  const { state, ready, update } = useFamilyState();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState('');
  const [memberQuery, setMemberQuery] = useState('');

  useEffect(() => watchAuth(setUser), []);
  useEffect(() => {
    void refreshMe().then(setUser);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMemberQuery(params.get('member') ?? '');
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  function notify(message: string) {
    setToast(message);
  }

  function ask(options: {
    title: string;
    body: string;
    confirm: string;
    danger?: boolean;
    onConfirm: () => void;
  }) {
    setDialog({ kind: 'confirm', ...options });
  }

  if (user === undefined || !ready) {
    return (
      <main id="main" className="fs-main">
        <p className="fs-lede">Loading Family Space…</p>
      </main>
    );
  }

  if (!user) {
    const next = `${window.location.pathname}${window.location.search}`;
    return (
      <main id="main" className="fs-main">
        <div className="fs-gate">
          <h1>Family Space</h1>
          <p className="fs-lede">Sign in to see what Anchor keeps for your family, and what it is allowed to do.</p>
          <p className="fs-actions">
            <a className="btn btn-primary" href={`/login?next=${encodeURIComponent(next)}`}>
              Sign in
            </a>
            <a className="btn btn-secondary" href="/signup">
              Create account
            </a>
          </p>
        </div>
      </main>
    );
  }

  const activeMembers = state.members.filter((member) => member.access === 'active');
  const nikos = state.members.find((member) => member.id === 'nikos');
  const selectedMember = state.members.find((member) => member.id === memberQuery);

  return (
    <div className="fs-shell">
      <header className="fs-top">
        <div>
          <a className="fs-brand" href="/family">
            Anchor
          </a>
          <p className="fs-family">{FAMILY_NAME}</p>
        </div>
        <div className="fs-tools">
          <p className="fs-user">
            <strong>{user.displayName || 'Signed in'}</strong>
            <span>{user.email}</span>
          </p>
          <button className="btn btn-secondary" type="button" onClick={() => setDialog({ kind: 'help' })}>
            Help
          </button>
          <a className="btn btn-secondary" href="/account">
            Account
          </a>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              void logOut().then(() => {
                window.location.href = '/';
              });
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <nav className="fs-nav" aria-label="Family Space">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} aria-current={view === item.view || (view === 'memory' && item.view === 'memories') ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
      </nav>

      <main id="main" className="fs-main">
        {view === 'overview' ? (
          <Overview state={state} members={activeMembers.length} />
        ) : null}
        {view === 'memories' ? (
          <Memories state={state} filter={filter} onFilter={setFilter} />
        ) : null}
        {view === 'memory' ? (
          <MemoryDetail
            memory={state.memories.find((item) => item.id === memoryId)}
            members={state.members}
            onChange={(recipe, message) => {
              update(recipe);
              if (message) notify(message);
            }}
            ask={ask}
          />
        ) : null}
        {view === 'members' ? (
          <Members
            members={state.members}
            selected={selectedMember}
            onOpen={(id) => {
              const url = `/family/members?member=${encodeURIComponent(id)}`;
              window.history.pushState({}, '', url);
              setMemberQuery(id);
            }}
            onClose={() => {
              window.history.pushState({}, '', '/family/members');
              setMemberQuery('');
            }}
            onInvite={() => setDialog({ kind: 'invite' })}
            onRole={(member, role) => {
              update((current) =>
                withAudit(
                  {
                    ...current,
                    members: current.members.map((item) => (item.id === member.id ? { ...item, role } : item)),
                  },
                  `${firstName(user.displayName || 'A family admin')} changed ${firstName(member.name)}’s role to ${roleLabel(role)}`,
                ),
              );
              notify(`${member.name} is now a ${roleLabel(role)}.`);
            }}
            onRemove={(member) => {
              ask({
                title: `Remove ${member.name}?`,
                body: `${member.name} will no longer have access to this Family Space. Memories they shared stay in the family archive.`,
                confirm: 'Remove access',
                danger: true,
                onConfirm: () => {
                  update((current) =>
                    withAudit(
                      {
                        ...current,
                        members: current.members.map((item) =>
                          item.id === member.id ? { ...item, access: 'removed' } : item,
                        ),
                      },
                      `${member.name} no longer has access to the Family Space`,
                    ),
                  );
                  notify(`Access removed for ${member.name}.`);
                  setDialog(null);
                },
              });
            }}
          />
        ) : null}
        {view === 'permissions' ? (
          <Permissions
            state={state}
            nikos={nikos}
            onSuggest={(value) => {
              update((current) =>
                withAudit(
                  { ...current, settings: { ...current.settings, suggestMoments: value } },
                  value
                    ? 'The family allowed Anchor to suggest moments worth keeping'
                    : 'The family turned off moment suggestions',
                ),
              );
              notify(value ? 'Moment suggestions are on. A family member still confirms each one.' : 'Moment suggestions are off.');
            }}
            onReview={() => setDialog({ kind: 'consent' })}
            onPauseSupport={() => {
              ask({
                title: 'Pause memory support?',
                body: 'Nikos keeps his place in the family. Anchor will stop private memory prompts until the family reviews this together with him.',
                confirm: 'Pause memory support',
                onConfirm: () => {
                  update((current) =>
                    withAudit(
                      {
                        ...current,
                        settings: {
                          ...current.settings,
                          memorySupportEnabled: false,
                          consentStatus: 'paused',
                          resurfacing: 'Paused',
                        },
                        members: current.members.map((member) =>
                          member.id === 'nikos' ? { ...member, memorySupport: false } : member,
                        ),
                      },
                      'Memory support for Nikos was paused',
                    ),
                  );
                  notify('Memory support is paused.');
                  setDialog(null);
                },
              });
            }}
            onResumeSupport={() => {
              update((current) =>
                withAudit(
                  {
                    ...current,
                    settings: {
                      ...current.settings,
                      memorySupportEnabled: true,
                      consentStatus: 'active',
                      lastReviewed: todayStamp(),
                      resurfacing: 'Occasional',
                    },
                    members: current.members.map((member) =>
                      member.id === 'nikos' ? { ...member, memorySupport: true } : member,
                    ),
                  },
                  'Memory support for Nikos was resumed after a family review',
                ),
              );
              notify('Memory support is enabled again.');
            }}
            onSessions={() => setDialog({ kind: 'sessions' })}
            onConnection={() => setDialog({ kind: 'connection' })}
            onExport={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'papadopoulos-family-archive.json';
              link.click();
              URL.revokeObjectURL(url);
              update((current) => withAudit(current, 'Eleni exported the family archive'));
              notify('Family archive downloaded to this device.');
            }}
            onDisconnect={() => {
              ask({
                title: 'Disconnect Family WhatsApp?',
                body: 'Anchor will stop receiving new moments from the connected chat. Memories already kept stay in the archive until the family deletes them.',
                confirm: 'Disconnect chat',
                danger: true,
                onConfirm: () => {
                  update((current) =>
                    withAudit(
                      { ...current, settings: { ...current.settings, connection: 'disconnected' } },
                      'Family WhatsApp was disconnected',
                    ),
                  );
                  notify('Family WhatsApp is disconnected.');
                  setDialog(null);
                },
              });
            }}
            onReconnect={() => {
              update((current) =>
                withAudit(
                  { ...current, settings: { ...current.settings, connection: 'active' } },
                  'Family WhatsApp was connected again',
                ),
              );
              notify('Family WhatsApp is connected.');
            }}
            onDeleteData={() => {
              ask({
                title: 'Delete family data from Anchor?',
                body: 'This removes the stored memories from this Family Space. It does not delete messages from Family WhatsApp.',
                confirm: 'Delete family data',
                danger: true,
                onConfirm: () => {
                  update((current) =>
                    withAudit(
                      { ...current, memories: [] },
                      'Stored family memories were deleted from Anchor',
                    ),
                  );
                  notify('Stored family memories were deleted from Anchor.');
                  setDialog(null);
                },
              });
            }}
          />
        ) : null}
      </main>

      <footer className="fs-foot">
        <p>Anchor is a system that keeps moments your family chooses. It is not a member of the family.</p>
      </footer>

      {toast ? (
        <div className="fs-toast" role="status">
          {toast}
        </div>
      ) : null}

      <Dialog dialog={dialog} onClose={() => setDialog(null)}>
        {dialog?.kind === 'help' ? (
          <>
            <h2>About Family Space</h2>
            <p>
              Everyday sharing stays in {CONNECTED_CHAT}. This space is where the family sees what Anchor holds, who has
              access, and which memories need extra care.
            </p>
            <p>Anchor always identifies itself as a system. It never speaks as a relative.</p>
          </>
        ) : null}
        {dialog?.kind === 'confirm' ? (
          <>
            <h2>{dialog.title}</h2>
            <p>{dialog.body}</p>
            <div className="fs-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  dialog.onConfirm();
                  setDialog(null);
                }}
              >
                {dialog.confirm}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
            </div>
          </>
        ) : null}
        {dialog?.kind === 'invite' ? (
          <InviteForm
            onCancel={() => setDialog(null)}
            onCreate={(person) => {
              update((current) =>
                withAudit(
                  { ...current, members: [...current.members, person] },
                  `${person.name} was invited to the Family Space`,
                ),
              );
              notify(`Invitation prepared for ${person.name}.`);
              setDialog(null);
            }}
          />
        ) : null}
        {dialog?.kind === 'consent' ? (
          <>
            <h2>Review permissions together</h2>
            <p>
              Consent stays revisitable. This review is something the family does with Nikos, not a switch a relative
              uses on their own.
            </p>
            <p>Memory support was last agreed with Nikos and the family.</p>
            <div className="fs-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  update((current) =>
                    withAudit(
                      {
                        ...current,
                        settings: { ...current.settings, lastReviewed: todayStamp(), consentStatus: 'active' },
                      },
                      'Family permissions were reviewed with Nikos',
                    ),
                  );
                  notify('Permissions marked as reviewed today.');
                  setDialog(null);
                }}
              >
                Mark reviewed today
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>
                Close
              </button>
            </div>
          </>
        ) : null}
        {dialog?.kind === 'sessions' ? (
          <>
            <h2>Active sessions</h2>
            <ul className="fs-activity">
              <li>
                <time dateTime={todayStamp()}>Today</time>
                This browser · {user.email} · {state.sessionNote}
              </li>
              <li>
                <time dateTime="2026-09-23">23 September 2026</time>
                Eleni’s phone · signed out
              </li>
            </ul>
            <div className="fs-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  update((current) => withAudit(current, 'Other family sessions were signed out'));
                  notify('Other sessions were signed out.');
                  setDialog(null);
                }}
              >
                Sign out other sessions
              </button>
            </div>
          </>
        ) : null}
        {dialog?.kind === 'connection' ? (
          <>
            <h2>Connected service</h2>
            <p>
              {CONNECTED_CHAT} is a mock connection for this prototype. Anchor does not read the chat from here, and it
              does not need to keep every message.
            </p>
            <p>
              Status: {state.settings.connection === 'active' ? 'Active' : 'Disconnected'}. Connected by{' '}
              {memberName(state.members, state.settings.connectedById)}.
            </p>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function Overview({
  state,
  members,
}: {
  state: ReturnType<typeof useFamilyState>['state'];
  members: number;
}) {
  const sensitive = state.memories.filter((memory) => memory.status === 'sensitive').length;
  const connection = state.settings.connection === 'active' ? 'Working normally' : 'Chat disconnected';
  const permissions = state.settings.consentStatus === 'active' ? 'Up to date' : 'Memory support paused';

  return (
    <>
      <header className="fs-page-head">
        <div>
          <h1>{FAMILY_NAME}</h1>
          <p className="fs-lede">A quiet reference for the shared archive. Everyday conversation stays in the family chat.</p>
        </div>
      </header>
      <section className="fs-grid" aria-label="Family summary">
        <article className="fs-stat">
          <span>Connected chat</span>
          <strong>{CONNECTED_CHAT}</strong>
        </article>
        <article className="fs-stat">
          <span>Family members</span>
          <strong>{members}</strong>
        </article>
        <article className="fs-stat">
          <span>Moments kept</span>
          <strong>{state.memories.length}</strong>
        </article>
        <article className="fs-stat">
          <span>Sensitive moments</span>
          <strong>{sensitive}</strong>
        </article>
        <article className="fs-stat">
          <span>Anchor status</span>
          <strong>{state.settings.connection === 'active' ? 'Active' : 'Paused'}</strong>
        </article>
        <article className="fs-stat">
          <span>Permissions</span>
          <strong>{permissions}</strong>
        </article>
        <article className="fs-stat">
          <span>Connection</span>
          <strong>{connection}</strong>
        </article>
      </section>
      <section className="fs-health">
        <h2>{state.settings.connection === 'active' ? 'Anchor is working normally' : 'The family chat is disconnected'}</h2>
        <p>Anchor keeps the moments your family chooses to preserve and brings them back through your connected family chat.</p>
      </section>
      <div className="fs-split">
        <section className="fs-panel">
          <h2>Recent administrative activity</h2>
          <ul className="fs-activity">
            {state.audit.slice(0, 4).map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
        <section className="fs-panel">
          <h2>What this space is for</h2>
          <p>See what Anchor holds, who can open it, and which memories should return only through a person.</p>
          <p className="fs-actions">
            <a className="btn btn-primary" href="/family/permissions">
              Review permissions
            </a>
          </p>
        </section>
      </div>
    </>
  );
}

function Memories({
  state,
  filter,
  onFilter,
}: {
  state: ReturnType<typeof useFamilyState>['state'];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'sensitive', label: 'Sensitive' },
    { id: 'paused', label: 'Paused' },
    { id: 'archived', label: 'Archived' },
  ];
  const visible = state.memories.filter((memory) => filter === 'all' || memory.status === filter);

  return (
    <>
      <header className="fs-page-head">
        <div>
          <h1>Memories</h1>
          <p className="fs-lede">
            Moments the family chose to keep. They begin in {CONNECTED_CHAT}. Here you can see them, and decide how they
            may return.
          </p>
        </div>
      </header>
      <div className="fs-filters" role="group" aria-label="Filter memories">
        {filters.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="fs-lede">Nothing in this view. The family archive is still here when you choose All.</p>
      ) : (
        <ul className="fs-memories">
          {visible.map((memory) => (
            <li key={memory.id}>
              <a className="fs-memory" href={`/family/memories/${memory.id}`}>
                <div className={`fs-scene scene-${memory.scene}`} role="img" aria-label={`Family photo for ${memory.title}`} />
                <div className="fs-memory-body">
                  <span className={`fs-badge fs-badge-${memory.status}`}>{statusLabel(memory.status)}</span>
                  <h2>{memory.title}</h2>
                  <p>
                    {formatDate(memory.date)} · {mediaLabel(memory.media)}
                  </p>
                  <p>Shared by {memberName(state.members, memory.sharedById)}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MemoryDetail({
  memory,
  members,
  onChange,
  ask,
}: {
  memory?: Memory;
  members: FamilyMember[];
  onChange: (recipe: (current: ReturnType<typeof useFamilyState>['state']) => ReturnType<typeof useFamilyState>['state'], message?: string) => void;
  ask: (options: { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void }) => void;
}) {
  if (!memory) {
    return (
      <>
        <a className="fs-back" href="/family/memories">
          Back to memories
        </a>
        <h1>This moment is not in the archive</h1>
        <p className="fs-lede">It may have been deleted from Anchor during this visit.</p>
      </>
    );
  }

  function patch(partial: Partial<Memory>, audit: string, message: string) {
    if (!memory) return;
    const currentMemory = memory;
    onChange((current) => {
      const next = {
        ...current,
        memories: current.memories.map((item) => (item.id === currentMemory.id ? { ...item, ...partial } : item)),
      };
      return withAudit(next, audit);
    }, message);
  }

  function setSensitivity(next: 'active' | 'sensitive' | 'paused') {
    if (!memory) return;
    if (next === 'sensitive') {
      patch(
        { status: 'sensitive', memorySupport: false, returnToFamily: memory.returnToFamily },
        `${memory.title} was marked sensitive`,
        'Marked sensitive. Anchor will not bring this back to Nikos on its own.',
      );
      return;
    }
    if (next === 'paused') {
      patch(
        { status: 'paused', returnToFamily: false, memorySupport: false },
        `${memory.title} was paused`,
        'This moment is paused.',
      );
      return;
    }
    patch(
      { status: 'active', returnToFamily: true, memorySupport: true },
      `${memory.title} was marked normal`,
      'This moment can return again.',
    );
  }

  const sensitivity = memory.status === 'archived' ? 'active' : memory.status;

  return (
    <>
      <a className="fs-back" href="/family/memories">
        Back to memories
      </a>
      <article className="fs-detail">
        <div>
          <div className={`fs-hero-scene scene-${memory.scene}`} role="img" aria-label={`Family photo for ${memory.title}`} />
          <p className="fs-quiet" style={{ marginTop: '0.6rem' }}>
            Source: {CONNECTED_CHAT}. Kept because a family member confirmed it.
          </p>
        </div>
        <div className="fs-detail-copy">
          <span className={`fs-badge fs-badge-${memory.status}`}>{statusLabel(memory.status)}</span>
          <h1>{memory.title}</h1>
          <p className="fs-quiet">
            {formatDate(memory.date)} · Started by {memberName(members, memory.sharedById)} · {mediaLabel(memory.media)}
          </p>
          <blockquote className="fs-quote">
            <p>{memory.originalMessage}</p>
          </blockquote>
          <h2>Family additions</h2>
          {memory.contributions.length === 0 ? (
            <p className="fs-quiet">No further additions yet.</p>
          ) : (
            <ul className="fs-additions">
              {memory.contributions.map((item) => (
                <li key={item.id}>
                  <strong>
                    {firstName(memberName(members, item.memberId))}
                    {item.kind === 'voice' ? ' — voice' : ''}
                  </strong>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          )}

          <section className="fs-controls" aria-labelledby="use-heading">
            <h2 id="use-heading">How Anchor may use this moment</h2>
            <div className="fs-control">
              <div>
                <strong>Return to family</strong>
                <p>Occasional look-backs in the connected chat.</p>
              </div>
              <button
                className="fs-switch"
                type="button"
                aria-pressed={memory.returnToFamily}
                disabled={memory.status === 'archived' || memory.status === 'paused'}
                onClick={() =>
                  patch(
                    { returnToFamily: !memory.returnToFamily },
                    memory.returnToFamily
                      ? `Return to family turned off for “${memory.title}”`
                      : `Return to family turned on for “${memory.title}”`,
                    memory.returnToFamily ? 'Anchor will not bring this back to the family chat.' : 'Anchor may bring this back to the family chat.',
                  )
                }
              >
                {memory.returnToFamily ? 'On' : 'Off'}
              </button>
            </div>
            <div className="fs-control">
              <div>
                <strong>Memory support for Nikos</strong>
                <p>Private prompts use this moment only when the family allows it.</p>
              </div>
              <button
                className="fs-switch"
                type="button"
                aria-pressed={memory.memorySupport}
                disabled={memory.status === 'sensitive' || memory.status === 'archived' || memory.status === 'paused'}
                onClick={() =>
                  patch(
                    { memorySupport: !memory.memorySupport },
                    memory.memorySupport
                      ? `Memory support turned off for “${memory.title}”`
                      : `Memory support turned on for “${memory.title}”`,
                    memory.memorySupport ? 'Nikos will not be prompted with this moment.' : 'This moment may be used as a prompt for Nikos.',
                  )
                }
              >
                {memory.memorySupport ? 'On' : 'Off'}
              </button>
            </div>
            <div className="fs-control">
              <div>
                <strong>Sensitivity</strong>
                <p>One shared memory, different rules for each person.</p>
              </div>
              <div className="fs-choice" role="group" aria-label="Sensitivity">
                {(
                  [
                    ['active', 'Normal'],
                    ['sensitive', 'Sensitive'],
                    ['paused', 'Paused'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={memory.status !== 'archived' && sensitivity === value}
                    disabled={memory.status === 'archived'}
                    onClick={() => setSensitivity(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {memory.status === 'sensitive' ? (
              <p className="fs-note">
                Anchor will never automatically resurface this memory to Nikos. A family member may choose when and how to
                share it.
              </p>
            ) : null}
            <div className="fs-actions">
              {memory.status === 'paused' ? (
                <button className="btn btn-primary" type="button" onClick={() => setSensitivity('active')}>
                  Resume
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={memory.status === 'archived'}
                  onClick={() => setSensitivity('paused')}
                >
                  Pause
                </button>
              )}
              {memory.status !== 'archived' ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    ask({
                      title: `Archive “${memory.title}”?`,
                      body: 'Archived moments stay in the family record but are not brought back.',
                      confirm: 'Archive',
                      onConfirm: () => {
                        patch(
                          { status: 'archived', returnToFamily: false, memorySupport: false },
                          `${memory.title} was archived`,
                          'Moment archived.',
                        );
                      },
                    })
                  }
                >
                  Archive
                </button>
              ) : (
                <button className="btn btn-secondary" type="button" onClick={() => setSensitivity('active')}>
                  Restore
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  ask({
                    title: `Delete “${memory.title}” from Anchor?`,
                    body: 'The moment leaves the family archive. Messages already in Family WhatsApp are not deleted.',
                    confirm: 'Delete from Anchor',
                    danger: true,
                    onConfirm: () => {
                      onChange((current) =>
                        withAudit(
                          { ...current, memories: current.memories.filter((item) => item.id !== memory.id) },
                          `${memory.title} was deleted from Anchor`,
                        ),
                      );
                      window.location.href = '/family/memories';
                    },
                  })
                }
              >
                Delete from Anchor
              </button>
            </div>
          </section>
        </div>
      </article>
    </>
  );
}

function Members({
  members,
  selected,
  onOpen,
  onClose,
  onInvite,
  onRole,
  onRemove,
}: {
  members: FamilyMember[];
  selected?: FamilyMember;
  onOpen: (id: string) => void;
  onClose: () => void;
  onInvite: () => void;
  onRole: (member: FamilyMember, role: FamilyRole) => void;
  onRemove: (member: FamilyMember) => void;
}) {
  const [role, setRole] = useState<FamilyRole>(selected?.role ?? 'member');
  useEffect(() => {
    if (selected) setRole(selected.role);
  }, [selected]);

  return (
    <>
      <header className="fs-page-head">
        <div>
          <h1>Family members</h1>
          <p className="fs-lede">People in the Papadopoulos family. Roles describe how they look after the shared space.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={onInvite}>
          Invite family member
        </button>
      </header>
      <ul className="fs-people">
        {members.map((member) => (
          <li key={member.id}>
            <button className="fs-person" type="button" onClick={() => onOpen(member.id)}>
              <h2>{member.name}</h2>
              <p>{member.relationship}</p>
              <p>
                <strong>{roleLabel(member.role)}</strong>
              </p>
              {member.memorySupport ? <p>Memory support enabled</p> : null}
              <p className="fs-quiet">
                <span className={`fs-badge ${member.access === 'active' ? 'fs-badge-active' : 'fs-badge-removed'}`}>
                  {member.access === 'active' ? 'Access active' : 'Access removed'}
                </span>
              </p>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <Dialog dialog={{ kind: 'member', id: selected.id }} onClose={onClose}>
          <h2>{selected.name}</h2>
          <dl className="fs-perm">
            <div>
              <dt>Relationship</dt>
              <dd>{selected.relationship}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(selected.role)}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{selected.access === 'active' ? 'Active' : 'Removed'}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(selected.joined)}</dd>
            </div>
            {selected.id === 'nikos' ? (
              <div>
                <dt>Memory support</dt>
                <dd>{selected.memorySupport ? 'Enabled' : 'Paused'}</dd>
              </div>
            ) : null}
          </dl>
          <h3>What this role can do</h3>
          {selected.role === 'admin' ? (
            <p>Manage members, review permissions, manage the connected service, and look after stored memories.</p>
          ) : (
            <p>Contribute memories through the connected family chat and take part in shared family memories.</p>
          )}
          {selected.access === 'active' ? (
            <form
              className="fs-field"
              onSubmit={(event) => {
                event.preventDefault();
                onRole(selected, role);
              }}
            >
              <label htmlFor="member-role">Change role</label>
              <select id="member-role" value={role} onChange={(event) => setRole(event.target.value as FamilyRole)}>
                <option value="member">Family Member</option>
                <option value="admin">Family Admin</option>
              </select>
              <div className="fs-actions">
                <button className="btn btn-primary" type="submit">
                  Save role
                </button>
                <a className="btn btn-secondary" href="/family/permissions">
                  Review permissions
                </a>
                <button className="btn btn-secondary" type="button" onClick={() => onRemove(selected)}>
                  Remove access
                </button>
              </div>
            </form>
          ) : (
            <p className="fs-quiet">This person no longer has access.</p>
          )}
        </Dialog>
      ) : null}
    </>
  );
}

function Permissions({
  state,
  nikos,
  onSuggest,
  onReview,
  onPauseSupport,
  onResumeSupport,
  onSessions,
  onConnection,
  onExport,
  onDisconnect,
  onReconnect,
  onDeleteData,
}: {
  state: ReturnType<typeof useFamilyState>['state'];
  nikos?: FamilyMember;
  onSuggest: (value: boolean) => void;
  onReview: () => void;
  onPauseSupport: () => void;
  onResumeSupport: () => void;
  onSessions: () => void;
  onConnection: () => void;
  onExport: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onDeleteData: () => void;
}) {
  const photos = state.memories.filter((memory) => memory.media.includes('photo')).length;
  const voices = state.memories.filter((memory) => memory.media.includes('voice')).length;
  const sensitive = state.memories.filter((memory) => memory.status === 'sensitive');

  return (
    <>
      <header className="fs-page-head">
        <div>
          <h1>Permissions & Safety</h1>
          <p className="fs-lede">What Anchor has, who can use it, and what it is never allowed to do.</p>
        </div>
      </header>
      <div className="fs-sections">
        <section className="fs-panel">
          <h2>Family data permissions</h2>
          <p>Anchor may use only the kinds of messages the family has allowed from {CONNECTED_CHAT}.</p>
          <ul className="fs-perm">
            <li><span>Photos</span> <strong>Allowed</strong></li>
            <li><span>Memory-related text</span> <strong>Allowed</strong></li>
            <li><span>Voice messages</span> <strong>Allowed</strong></li>
            <li><span>Video</span> <strong>Not enabled</strong></li>
            <li><span>Reactions</span> <strong>Allowed</strong></li>
          </ul>
          <p>Anchor does not need to permanently store every message in the family chat. It keeps the moments a family member confirms.</p>
        </section>

        <section className="fs-panel">
          <h2>Memory capture</h2>
          <div className="fs-control">
            <div>
              <strong>Suggest moments worth keeping</strong>
              <p>Anchor may suggest moments worth keeping. A family member confirms them before they become part of the family archive.</p>
            </div>
            <button className="fs-switch" type="button" aria-pressed={state.settings.suggestMoments} onClick={() => onSuggest(!state.settings.suggestMoments)}>
              {state.settings.suggestMoments ? 'On' : 'Off'}
            </button>
          </div>
        </section>

        <section className="fs-panel">
          <h2>Memory support</h2>
          <p>
            <strong>{nikos?.name ?? 'Nikos Papadopoulos'}</strong> · {nikos?.relationship ?? 'Grandfather'} · Family Member
          </p>
          <p>Memory support: {state.settings.memorySupportEnabled ? 'Enabled' : 'Paused'}</p>
          <div className="fs-two">
            <div>
              <h3>Allowed</h3>
              <ul className="fs-allowed">
                <li>Private memory prompts</li>
                <li>Voice interaction</li>
                <li>Adaptive memory resurfacing</li>
                <li>Use family-shared memories as prompts</li>
              </ul>
            </div>
            <div>
              <h3>Not allowed</h3>
              <ul className="fs-denied">
                <li>Share recall scores with family</li>
                <li>Report every time Nikos does not respond</li>
                <li>Show cognitive performance trends</li>
                <li>Infer or report cognitive decline</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="fs-panel">
          <h2>Sensitive memories</h2>
          <p>Some memories matter deeply but may also be painful. Sensitive memories stay in the family archive but Anchor does not automatically bring them back to Nikos.</p>
          <p>
            <strong>Sensitive memory handling:</strong> Family-led only
          </p>
          <p>A painful or sensitive memory always returns through a person, not directly through Anchor.</p>
          {sensitive.length === 0 ? (
            <p className="fs-quiet">No sensitive memories are in the archive right now.</p>
          ) : (
            <ul className="fs-activity">
              {sensitive.map((memory) => (
                <li key={memory.id}>
                  <a href={`/family/memories/${memory.id}`}>{memory.title}</a>
                  <span className="fs-quiet"> · shared by {memberName(state.members, memory.sharedById)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fs-panel">
          <h2>Consent</h2>
          <ul className="fs-perm">
            <li><span>Consent status</span> <strong>{state.settings.consentStatus === 'active' ? 'Active' : 'Paused'}</strong></li>
            <li><span>Last reviewed</span> <strong>{formatDate(state.settings.lastReviewed)}</strong></li>
            <li><span>Memory support agreed with</span> <strong>Nikos and family</strong></li>
          </ul>
          <div className="fs-actions">
            <button className="btn btn-primary" type="button" onClick={onReview}>
              Review permissions together
            </button>
            {state.settings.memorySupportEnabled ? (
              <button className="btn btn-secondary" type="button" onClick={onPauseSupport}>
                Pause memory support
              </button>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={onResumeSupport}>
                Resume memory support
              </button>
            )}
          </div>
        </section>

        <section className="fs-panel">
          <h2>Anchor behaviour</h2>
          <div className="fs-lock">
            <div>
              <strong>Identity</strong>
              <p>Anchor always identifies itself as a system, never as a family member.</p>
            </div>
            <span className="fs-badge">Locked</span>
          </div>
          <div className="fs-lock">
            <div>
              <strong>Attribution</strong>
              <p>Always show who originally shared a memory.</p>
            </div>
            <span className="fs-badge fs-badge-active">On</span>
          </div>
          <ul className="fs-perm">
            <li><span>Family resurfacing</span> <strong>{state.settings.resurfacing}</strong></li>
            <li><span>Memory support for Nikos</span> <strong>{state.settings.memorySupportEnabled ? 'Adaptive' : 'Paused'}</strong></li>
            <li><span>Sensitive memories</span> <strong>Never automatically send</strong></li>
          </ul>
        </section>

        <section className="fs-panel">
          <h2>Security & data</h2>
          <h3>Connected service</h3>
          <ul className="fs-perm">
            <li><span>Chat</span> <strong>{CONNECTED_CHAT}</strong></li>
            <li><span>Connected by</span> <strong>{firstName(memberName(state.members, state.settings.connectedById))}</strong></li>
            <li><span>Status</span> <strong>{state.settings.connection === 'active' ? 'Active' : 'Disconnected'}</strong></li>
          </ul>
          <h3>Stored family data</h3>
          <ul className="fs-perm">
            <li><span>Memories</span> <strong>{state.memories.length}</strong></li>
            <li><span>Photos</span> <strong>{photos}</strong></li>
            <li><span>Voice messages</span> <strong>{voices}</strong></li>
          </ul>
          <h3>Access</h3>
          <p>{state.members.filter((member) => member.access === 'active').length} authorised family members</p>
          <h3>Security</h3>
          <ul className="fs-perm">
            <li><span>Data</span> <strong>Encrypted</strong></li>
            <li><span>Active sessions</span> <strong>This browser</strong></li>
            <li><span>Last sign-in</span> <strong>Today</strong></li>
            <li><span>Recent security activity</span> <strong>{state.audit[0] ? state.audit[0].text : 'None yet'}</strong></li>
          </ul>
          <div className="fs-actions">
            <button className="btn btn-secondary" type="button" onClick={onConnection}>Manage connection</button>
            <button className="btn btn-secondary" type="button" onClick={onSessions}>View active sessions</button>
            <button className="btn btn-secondary" type="button" onClick={onExport}>Export family archive</button>
            {state.settings.connection === 'active' ? (
              <button className="btn btn-secondary" type="button" onClick={onDisconnect}>Disconnect chat</button>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={onReconnect}>Reconnect chat</button>
            )}
            <button className="btn btn-secondary" type="button" onClick={onDeleteData}>Delete family data</button>
          </div>
        </section>

        <section className="fs-panel">
          <h2>Audit log</h2>
          <ul className="fs-activity">
            {state.audit.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function InviteForm({
  onCreate,
  onCancel,
}: {
  onCreate: (member: FamilyMember) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [role, setRole] = useState<FamilyRole>('member');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const id = `invite-${Date.now()}`;
    onCreate({
      id,
      name: name.trim(),
      relationship: relationship.trim(),
      role,
      memorySupport: false,
      access: 'active',
      joined: todayStamp(),
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Invite family member</h2>
      <p>This prepares an invitation in the prototype. No message is sent.</p>
      <div className="fs-field">
        <label htmlFor="invite-name">Name</label>
        <input id="invite-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="fs-field">
        <label htmlFor="invite-relationship">Relationship</label>
        <input id="invite-relationship" required value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Cousin" />
      </div>
      <div className="fs-field">
        <label htmlFor="invite-role">Role</label>
        <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as FamilyRole)}>
          <option value="member">Family Member</option>
          <option value="admin">Family Admin</option>
        </select>
      </div>
      <div className="fs-actions">
        <button className="btn btn-primary" type="submit">
          Add to Family Space
        </button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Dialog({
  dialog,
  onClose,
  children,
}: {
  dialog: DialogState;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!dialog) return;
    const node = ref.current;
    const heading = node?.querySelector('h2');
    if (heading) heading.id = titleId;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = node?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    focusable?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
        (item) => !item.hasAttribute('disabled'),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [dialog, titleId]);

  if (!dialog) return null;

  return (
    <div className="fs-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="fs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
