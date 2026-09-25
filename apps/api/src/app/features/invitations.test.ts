process.env.TZ = 'Europe/Athens';

import { Logger } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { dayIndex } from '../core/clock';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { openStore } from '../core/store';
import { Blocked, type Context, type Family, type Incoming, type Invitation, type Moment, type Outgoing } from '../core/types';
import { ask, speak } from '../model/model';
import { invitations, nextSlot, qualifies } from './invitations';

vi.mock('../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/model')>()),
  ask: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
}));

let now: number;
let file: string;
let transport: FakeTransport;
let ctx: Context;
let family: Family;
let sequence: number;

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
const wav = Buffer.from('RIFF clip');
const invitationText = 'Sofia shared: «Maria on her first day at school»\nWhat does it remind you of?';
const inviteButtons = (id: string) => [
  { label: lines.buttons.notNow, data: `inv:later:${id}` },
  { label: lines.buttons.dontBringBack, data: `inv:never:${id}` },
  { label: lines.buttons.whatIsThis, data: `inv:what:${id}` },
];
const shareButtons = (id: string) => [
  { label: lines.buttons.share, data: `inv:share:${id}` },
  { label: lines.buttons.dontShare, data: `inv:keep:${id}` },
];

const build = (overrides: Partial<Moment> = {}): Moment => ({
  id: 'm1',
  by: { id: '1', name: 'Sofia' },
  messageIds: ['57', '58'],
  savedAt: at(25, 8),
  text: 'Maria on her first day at school',
  photo: { id: 'photo-57' },
  salience: 3,
  sensitive: false,
  people: ['Maria'],
  title: "Maria's first day at school",
  stories: [],
  lookbacks: [],
  memoryPostIds: [],
  returns: {},
  ...overrides,
});

const add = (overrides: Partial<Moment> = {}) => {
  const moment = build(overrides);
  family.moments.push(moment);
  return moment;
};

const nikos = () => family.storytellers[0];

const invite = (moment: Moment, overrides: Partial<Invitation> = {}) => {
  nikos().invitation = {
    momentId: moment.id,
    day: dayIndex(now),
    messageIds: [],
    shareAsked: false,
    helped: false,
    sentAt: now,
    replied: false,
    ...overrides,
  };
  return nikos().invitation;
};

const fromNikos = (overrides: Partial<Incoming>): Incoming => ({
  chat: 'private',
  chatId: '7',
  messageId: `p${++sequence}`,
  sender: { id: '7', name: 'Nikos' },
  at: now,
  ...overrides,
});

const inGroup = (overrides: Partial<Incoming>): Incoming => ({
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: `g${++sequence}`,
  sender: { id: '1', name: 'Sofia' },
  at: now,
  ...overrides,
});

const receive = (event: Incoming) =>
  invitations.handle(event, event.chat === 'group' ? ctx.store.family(event.familyId) : ctx.store.familyOfStoryteller(event.sender.id), ctx);

const tickAt = (time: number) => {
  now = time;
  return invitations.tick(family, { from: time - 60_000, to: time }, ctx);
};

const messages = () => transport.sent.map(({ chatId, message }) => [chatId, message]);
const saved = () => openStore(file).family('-100');
const silenceWarnings = () => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(speak).mockResolvedValue(wav);
  now = at(25, 12);
  sequence = 0;
  file = join(mkdtempSync(join(tmpdir(), 'anchor-')), 'state.json');
  transport = new FakeTransport();
  const store = openStore(file, now);
  ctx = { now: () => now, store, transport: () => transport };
  family = store.addFamily('-100', '-100');
  family.storytellers.push({ id: '7', name: 'Nikos', started: true });
});

test('qualifies takes a moment of another sender that is not sensitive, 3 hours old, due, and under 7 returns', () => {
  const slot = at(25, 11);
  const moment = build();
  expect(qualifies(moment, '7', slot)).toBe(true);
  expect(qualifies(moment, '1', slot)).toBe(false);
  expect(qualifies(build({ sensitive: true }), '7', slot)).toBe(false);
  expect(qualifies(build({ savedAt: at(25, 9) }), '7', slot)).toBe(false);
  expect(qualifies(build({ returns: { '7': { count: 1, due: slot + 1 } } }), '7', slot)).toBe(false);
  expect(qualifies(build({ returns: { '7': { count: 6, due: slot } } }), '7', slot)).toBe(true);
  expect(qualifies(build({ returns: { '7': { count: 7, due: 0 } } }), '7', slot)).toBe(false);
});

test('nextSlot is the first local 11:00 after now', () => {
  expect(nextSlot(at(25, 10))).toBe(at(25, 11));
  expect(nextSlot(at(25, 11))).toBe(at(26, 11));
  expect(nextSlot(at(25, 15))).toBe(at(26, 11));
});

test('/private from an admin registers the replied-to member once and posts storytellerStart with the Start link', async () => {
  family.storytellers.length = 0;
  transport.admins.add('1');
  const replyTo = { replyTo: '40', replyToSender: { id: '7', name: 'Nikos' } };
  expect(await receive(inGroup({ text: '/private', ...replyTo }))).toBe(true);
  expect(await receive(inGroup({ text: '/private please', ...replyTo }))).toBe(true);

  expect(saved()?.storytellers).toEqual([{ id: '7', name: 'Nikos', started: false }]);
  const start = { text: lines.storytellerStart('Nikos'), buttons: [{ label: lines.buttons.start, url: transport.startLink('-100') }] };
  expect(messages()).toEqual([
    ['-100', start],
    ['-100', start],
  ]);
});

test('/private from a member who is not an admin gets adminOnly and registers nobody, and an admin with no replied-to member gets nothing', async () => {
  family.storytellers.length = 0;
  const fromMember = inGroup({ text: '/private', replyToSender: { id: '7', name: 'Nikos' } });
  expect(await receive(fromMember)).toBe(true);
  transport.admins.add('1');
  expect(await receive(inGroup({ text: '/private' }))).toBe(true);
  expect(family.storytellers).toEqual([]);
  expect(messages()).toEqual([['-100', { text: lines.adminOnly, replyTo: fromMember.messageId }]]);
});

test('/start from a storyteller asks for a yes and leaves started alone, and any other person or group message is left to the next feature', async () => {
  nikos().started = false;
  const welcome = {
    text: lines.welcome('Nikos'),
    buttons: [
      { label: lines.buttons.agree, data: 'inv:agree' },
      { label: lines.buttons.notNow, data: 'inv:decline' },
    ],
  };
  expect(await receive(fromNikos({ text: '/start -100' }))).toBe(true);
  expect(nikos().started).toBe(false);
  expect(messages()).toEqual([['7', welcome]]);

  expect(await receive({ ...fromNikos({ text: '/start' }), chatId: '8', sender: { id: '8', name: 'Eleni' } })).toBe(false);
  expect(await receive(inGroup({ text: 'Maria on her first day at school' }))).toBe(false);
  expect(transport.sent).toHaveLength(1);

  nikos().started = true;
  await receive(fromNikos({ text: '/start' }));
  expect(nikos().started).toBe(true);
  expect(messages()[1]).toEqual(['7', welcome]);
});

test('"Not now" on the welcome sends notNow and changes nothing, and nothing comes back before the yes', async () => {
  nikos().started = false;
  add();
  const save = vi.spyOn(ctx.store, 'save');
  expect(await receive(fromNikos({ button: 'inv:decline' }))).toBe(true);
  expect(nikos().started).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(messages()).toEqual([['7', { text: lines.notNow }]]);

  await tickAt(at(25, 11));
  transport.admins.add('1');
  await receive(inGroup({ text: '/send' }));
  expect(transport.sent).toHaveLength(1);
  expect(nikos().invitation).toBeUndefined();
});

test('"Yes, I\'d like that" sets started and sends agreed, and the next 11:00 slot brings back a moment shared before the yes', async () => {
  nikos().started = false;
  add({ savedAt: at(24, 8) });
  now = at(25, 9);
  expect(await receive(fromNikos({ button: 'inv:agree' }))).toBe(true);
  expect(saved()?.storytellers[0].started).toBe(true);
  expect(messages()).toEqual([['7', { text: lines.agreed('Nikos') }]]);

  await tickAt(at(25, 11));
  expect(nikos().invitation?.momentId).toBe('m1');
  expect(messages().slice(1)).toEqual([
    ['7', { photo: { id: 'photo-57' } }],
    ['7', { voice: { wav }, text: invitationText, buttons: inviteButtons('m1') }],
  ]);
});

test('/stop and "Stop." end the returns, close the open invitation silently, and tell the family nothing', async () => {
  const moment = add();
  for (const text of ['/stop', 'Stop.', ' stop! ', 'STOP']) {
    nikos().started = true;
    invite(moment);
    expect(await receive(fromNikos({ text }))).toBe(true);
    expect(saved()?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: false });
  }
  expect(ask).not.toHaveBeenCalled();
  expect(messages()).toEqual(Array(4).fill(['7', { text: lines.stopped }]));

  await tickAt(at(26, 11));
  expect(transport.sent).toHaveLength(4);
});

test('/stop works before the yes, and a stop inside a longer text is a reply', async () => {
  nikos().started = false;
  await receive(fromNikos({ text: '/stop' }));
  expect(messages()).toEqual([['7', { text: lines.stopped }]]);

  nikos().started = true;
  invite(add());
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  await receive(fromNikos({ text: 'Stop by the old school' }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(nikos().started).toBe(true);
});

test('the 11:00 tick sends the photo, then the invitation voice with both buttons, and schedules the next return', async () => {
  add();
  await tickAt(at(25, 11));

  expect(speak).toHaveBeenCalledWith(invitationText, 'warm, calm and slow, like a kind family friend talking to a grandparent');
  expect(messages()).toEqual([
    ['7', { photo: { id: 'photo-57' } }],
    ['7', { voice: { wav }, text: invitationText, buttons: inviteButtons('m1') }],
  ]);
  const record = saved();
  expect(record?.moments[0].invitationVoice).toEqual({ id: 'voice-sent-2', mimeType: 'audio/ogg' });
  expect(record?.moments[0].returns).toEqual({ '7': { count: 1, due: at(26, 11) } });
  expect(record?.storytellers[0]).toEqual({
    id: '7',
    name: 'Nikos',
    started: true,
    lastInvitationDay: dayIndex(at(25, 11)),
    invitation: {
      momentId: 'm1',
      day: dayIndex(at(25, 11)),
      messageIds: ['sent-1', 'sent-2'],
      shareAsked: false,
      helped: false,
      sentAt: at(25, 11),
      replied: false,
    },
  });

  const save = vi.spyOn(ctx.store, 'save');
  now = at(25, 11, 30);
  await invitations.tick(family, { from: at(25, 10), to: now }, ctx);
  expect(transport.sent).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
});

test('an invitation of a wordless photo speaks and captions the photo by its title, never as a quote', async () => {
  add({ text: "Maria's first day at school", wordless: true });
  await tickAt(at(25, 11));

  const text = "Sofia shared a photo: Maria's first day at school\nWhat does it remind you of?";
  expect(speak).toHaveBeenCalledWith(text, 'warm, calm and slow, like a kind family friend talking to a grandparent');
  expect(messages()).toEqual([
    ['7', { photo: { id: 'photo-57' } }],
    ['7', { voice: { wav }, text, buttons: inviteButtons('m1') }],
  ]);
});

test('the reply prompt of a wordless moment does not present the title as her words', async () => {
  invite(add({ text: "Maria's first day at school", wordless: true }));
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  await receive(fromNikos({ text: 'She would not let go of my hand' }));

  const [prompt] = vi.mocked(ask).mock.calls[0];
  expect(prompt).toContain("Sofia shared a photo: Maria's first day at school");
  expect(prompt).not.toContain('«Maria');
});

test('a moment with a video goes out as the video, and a moment with no picture as the voice alone', async () => {
  add({ video: { id: 'video-57' } });
  await tickAt(at(25, 11));
  expect(transport.sent[0].message).toEqual({ video: { id: 'video-57' } });

  family.moments = [build({ photo: undefined })];
  await tickAt(at(26, 11));
  expect(transport.sent.slice(2).map(({ message }) => message.text)).toEqual([invitationText]);
});

test('the tick skips an own, a sensitive, a young, and a not yet due moment, and picks by priority among the rest', async () => {
  family.storytellers.push({ id: '8', name: 'Eleni', started: false });
  add({ id: 'own', by: { id: '7', name: 'Nikos' }, salience: 5 });
  add({ id: 'sensitive', sensitive: true, salience: 5 });
  add({ id: 'young', savedAt: at(25, 8, 1), salience: 5 });
  add({ id: 'later', returns: { '7': { count: 1, due: at(25, 11, 1) } }, salience: 5 });
  add({ id: 'low', savedAt: at(20, 8), salience: 2 });
  add({ id: 'high', salience: 4 });
  await tickAt(at(25, 11));

  expect(nikos().invitation?.momentId).toBe('high');
  expect(transport.sent.map(({ chatId }) => chatId)).toEqual(['7', '7']);
});

test('each return reuses the invitation voice and doubles the gap, and a moment comes back at most 7 times', async () => {
  const moment = add();
  await tickAt(at(25, 11));
  await tickAt(at(26, 11));
  expect(speak).toHaveBeenCalledTimes(1);
  const voice = { id: 'voice-sent-2', mimeType: 'audio/ogg' };
  expect(transport.sent[3].message).toEqual({ voice, text: invitationText, buttons: inviteButtons('m1') });
  expect(moment.returns['7']).toEqual({ count: 2, due: at(28, 11) });

  const dues: number[] = [];
  for (let i = 0; i < 5; i++) {
    await tickAt(moment.returns['7'].due);
    dues.push(moment.returns['7'].due);
  }
  expect(moment.returns['7'].count).toBe(7);
  expect(dues.slice(0, 4)).toEqual([at(32, 11), at(40, 11), at(56, 11), at(88, 11)]);
  const sent = transport.sent.length;
  await tickAt(new Date(2027, 8, 25, 11).getTime());
  expect(transport.sent).toHaveLength(sent);
});

test('an invitation that is still open at the next 11:00 slot closes without a message', async () => {
  invite(add({ returns: { '7': { count: 1, due: at(27, 11) } } }));
  await tickAt(at(26, 11));
  expect(saved()?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: true, lastInvitationDay: dayIndex(at(26, 11)) });
  expect(transport.sent).toEqual([]);
});

test('a window that spans both the 3-hour silent mark and the next 11:00 slot lets the slot win: the old invitation closes silently and the next one goes out', async () => {
  add();
  await tickAt(at(25, 11));
  add({ id: 'm2', by: { id: '2', name: 'Eleni' }, photo: { id: 'photo-99' }, text: 'Sunday lunch with all the cousins', savedAt: at(20, 8), salience: 5 });
  const sentBefore = transport.sent.length;

  now = at(26, 11);
  await invitations.tick(family, { from: at(25, 10), to: now }, ctx);

  expect(messages().slice(sentBefore)).toEqual([
    ['7', { photo: { id: 'photo-99' } }],
    ['7', { voice: { wav }, text: 'Eleni shared: «Sunday lunch with all the cousins»\nWhat does it remind you of?', buttons: inviteButtons('m2') }],
  ]);
  expect(nikos().invitation?.momentId).toBe('m2');
  expect(transport.sent.slice(sentBefore).some(({ message }) => message.text?.includes('No rush'))).toBe(false);
});

test('when that same wide window leaves no moment to qualify, the tick closes the old invitation silently and sends nothing', async () => {
  invite(add({ returns: { '7': { count: 7, due: at(20, 11) } } }), { sentAt: at(25, 11) });
  nikos().lastInvitationDay = dayIndex(at(25, 11));

  now = at(26, 11);
  await invitations.tick(family, { from: at(25, 10), to: now }, ctx);

  expect(transport.sent).toEqual([]);
  expect(nikos().invitation).toBeUndefined();
  expect(saved()?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: true, lastInvitationDay: dayIndex(at(26, 11)) });
});

test('a failed voice clip sends the invitation as text with both buttons', async () => {
  silenceWarnings();
  vi.mocked(speak).mockRejectedValue(new Error('no TTS model left'));
  const moment = add();
  await tickAt(at(25, 11));
  expect(messages()).toEqual([
    ['7', { photo: { id: 'photo-57' } }],
    ['7', { text: invitationText, buttons: inviteButtons('m1') }],
  ]);
  expect(moment.invitationVoice).toBeUndefined();
  expect(nikos().invitation?.messageIds).toEqual(['sent-1', 'sent-2']);
});

test('a failed voice send sends the invitation as text, and the invitation stays open', async () => {
  silenceWarnings();
  const send = transport.send.bind(transport);
  vi.spyOn(transport, 'send').mockImplementation(async (chatId: string, message: Outgoing) => {
    if (message.voice) throw new Error('ffmpeg failed');
    return send(chatId, message);
  });
  add();
  await tickAt(at(25, 11));
  expect(messages()).toEqual([
    ['7', { photo: { id: 'photo-57' } }],
    ['7', { text: invitationText, buttons: inviteButtons('m1') }],
  ]);
  expect(nikos().invitation?.momentId).toBe('m1');
});

test('a storyteller who blocked Anchor stops getting invitations, and the return still counts', async () => {
  vi.spyOn(transport, 'send').mockRejectedValue(new Blocked());
  add();
  await tickAt(at(25, 11));
  const record = saved();
  expect(record?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: false, lastInvitationDay: dayIndex(at(25, 11)) });
  expect(record?.moments[0].returns['7'].count).toBe(1);
  expect(speak).not.toHaveBeenCalled();
});

test('a story reply gets thanks with the share buttons once, and a second story reply joins the first', async () => {
  invite(add());
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  expect(await receive(fromNikos({ text: 'She would not let go of my hand' }))).toBe(true);
  expect(await receive(fromNikos({ text: 'Then she ran in' }))).toBe(true);

  const [prompt, schema, options] = vi.mocked(ask).mock.calls[0];
  for (const part of [
    "Maria's first day at school",
    'Sofia',
    'Maria on her first day at school',
    'She would not let go of my hand',
    '- question: ',
  ]) {
    expect(prompt).toContain(part);
  }
  expect(schema).toEqual({
    type: 'object',
    properties: { transcript: { type: 'string' }, kind: { type: 'string', enum: ['story', 'unsure', 'question', 'other'] } },
    required: ['transcript', 'kind'],
  });
  expect(options).toEqual({ media: [], fast: true });
  expect(saved()?.storytellers[0].invitation).toEqual({
    momentId: 'm1',
    day: dayIndex(now),
    messageIds: [],
    shareAsked: true,
    helped: false,
    sentAt: now,
    replied: true,
    story: { text: 'She would not let go of my hand\nThen she ran in' },
  });
  expect(messages()).toEqual([['7', { text: lines.thanks, buttons: shareButtons('m1') }]]);
});

test('a voice reply sends the downloaded clip to the call, and the story keeps the first voice note and the transcripts', async () => {
  const first = { data: Buffer.from('first clip'), mimeType: 'audio/ogg' };
  transport.files.set('voice-a', first);
  transport.files.set('voice-b', { data: Buffer.from('second clip'), mimeType: 'audio/ogg' });
  const invitation = invite(add());
  vi.mocked(ask).mockResolvedValueOnce({ transcript: ' She held my hand ', kind: 'story' }).mockResolvedValueOnce({ transcript: '', kind: 'story' });
  await receive(fromNikos({ voice: { id: 'voice-a' } }));
  await receive(fromNikos({ voice: { id: 'voice-b' } }));

  expect(vi.mocked(ask).mock.calls[0][2]).toEqual({ media: [first], fast: true });
  expect(invitation.story).toEqual({ text: `She held my hand\n${lines.voiceNote}`, voice: { id: 'voice-a' } });
});

test('a first unsure reply gets gentleHelp and the voice note of the moment, and a second one closes with warmClose', async () => {
  invite(add({ voice: { id: 'voice-57' } }));
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'unsure' });
  await receive(fromNikos({ text: 'a school?' }));
  expect(messages()).toEqual([
    ['7', { text: lines.gentleHelp('25 September 2026', "Maria's first day at school") }],
    ['7', { voice: { id: 'voice-57' } }],
  ]);
  expect(saved()?.storytellers[0].invitation).toEqual({
    momentId: 'm1',
    day: dayIndex(now),
    messageIds: [],
    shareAsked: false,
    helped: true,
    sentAt: now,
    replied: true,
  });

  await receive(fromNikos({ text: 'a park?' }));
  expect(transport.sent[2].message).toEqual({ text: lines.warmClose });
  expect(saved()?.storytellers[0].invitation).toBeUndefined();
  expect(ask).not.toHaveBeenCalled();
});

test('a short reply that ends with "?" is decided in code: "school?" is unsure, and "who is that?" is a question', async () => {
  invite(add({ eventDate: '1958-06-01' }));
  await receive(fromNikos({ text: 'school?' }));
  expect(messages()).toEqual([['7', { text: lines.gentleHelp('1 June 1958', "Maria's first day at school") }]]);

  await receive(fromNikos({ text: 'Who is that?' }));
  expect(transport.sent[1].message).toEqual({ text: lines.tellDirectly("Maria's first day at school", '1 June 1958', 'Sofia') });
  expect(ask).not.toHaveBeenCalled();
});

test('a longer reply that ends with "?" still goes to the model', async () => {
  invite(add());
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  await receive(fromNikos({ text: "It was her first day, wasn't it?" }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(transport.sent[0].message).toMatchObject({ text: lines.thanks });
});

test('an invitation with no reply for 3 hours gets gentleHelp and the voice note of the moment once', async () => {
  add({ voice: { id: 'voice-57' } });
  await tickAt(at(25, 11));
  const save = vi.spyOn(ctx.store, 'save');
  await tickAt(at(25, 13, 59));
  expect(transport.sent).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();

  await tickAt(at(25, 14));
  expect(messages().slice(2)).toEqual([
    ['7', { text: lines.gentleHelp('25 September 2026', "Maria's first day at school") }],
    ['7', { voice: { id: 'voice-57' } }],
  ]);
  expect(saved()?.storytellers[0].invitation).toMatchObject({ momentId: 'm1', helped: true, replied: false });

  save.mockClear();
  await tickAt(at(25, 18));
  expect(transport.sent).toHaveLength(4);
  expect(save).not.toHaveBeenCalled();
});

test('an invitation with no sentAt fails safe and never gets gentleHelp', async () => {
  const moment = add({ voice: { id: 'voice-57' } });
  invite(moment, { sentAt: undefined });

  await tickAt(at(25, 20));

  expect(transport.sent).toEqual([]);
  expect(nikos().invitation).toMatchObject({ helped: false });
});

test('after any reply, a tick past 3 hours sends no gentleHelp', async () => {
  const moment = add();
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  invite(moment);
  await receive(fromNikos({ text: 'She would not let go of my hand' }));
  await tickAt(at(25, 16));
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.thanks]);
});

test('a silent invitation whose moment is gone or kept quiet closes at 3 hours without a message', async () => {
  const moment = add();
  invite(moment);
  family.moments.length = 0;
  ctx.store.save();
  await tickAt(at(25, 15));
  expect(nikos().invitation).toBeUndefined();
  expect(saved()?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: true });

  family.moments.push(moment);
  moment.sensitive = true;
  invite(moment, { sentAt: at(25, 12) });
  ctx.store.save();
  await tickAt(at(25, 16));
  expect(nikos().invitation).toBeUndefined();
  expect(saved()?.storytellers[0]).toEqual({ id: '7', name: 'Nikos', started: true });
  expect(transport.sent).toEqual([]);
});

test('a story reply after a keep-quiet turns the moment sensitive sends no thanks and returns false', async () => {
  add();
  await tickAt(at(25, 11));
  const sentBefore = transport.sent.length;
  family.moments[0].sensitive = true;

  expect(await receive(fromNikos({ text: 'She would not let go of my hand' }))).toBe(false);
  expect(transport.sent).toHaveLength(sentBefore);
  expect(ask).not.toHaveBeenCalled();
  expect(nikos().invitation).toBeUndefined();
});

test('"Yes, share it" for a moment that turned sensitive while the story waited posts nothing in the group', async () => {
  const moment = add();
  invite(moment, { story: { text: 'She would not let go of my hand' }, shareAsked: true });
  moment.sensitive = true;

  expect(await receive(fromNikos({ button: 'inv:share:m1' }))).toBe(false);
  expect(transport.sent).toEqual([]);
  expect(nikos().invitation).toBeUndefined();
});

test('a forget during a pending reply call sends nothing after the call resolves', async () => {
  const moment = add();
  invite(moment);
  let answer: (value: unknown) => void;
  vi.mocked(ask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const reply = receive(fromNikos({ text: 'She would not let go of my hand' }));
  family.moments.splice(family.moments.indexOf(moment), 1);
  answer({ transcript: '', kind: 'story' });

  expect(await reply).toBe(true);
  expect(transport.sent).toEqual([]);
});

test('"What is this?" on a moment that turned sensitive sends nothing', async () => {
  const moment = add();
  invite(moment);
  moment.sensitive = true;

  expect(await receive(fromNikos({ button: 'inv:what:m1' }))).toBe(false);
  expect(transport.sent).toEqual([]);
  expect(nikos().invitation).toBeUndefined();
});

test('"What is this?" gets tellDirectly and the voice note of the moment, keeps the invitation open, and a story still gets thanks', async () => {
  const moment = add({ voice: { id: 'voice-57' } });
  const invitation = invite(moment);
  expect(await receive(fromNikos({ button: 'inv:what:m1' }))).toBe(true);
  expect(messages()).toEqual([
    ['7', { text: lines.tellDirectly("Maria's first day at school", '25 September 2026', 'Sofia') }],
    ['7', { voice: { id: 'voice-57' } }],
  ]);
  expect(saved()?.storytellers[0].invitation).toMatchObject({ momentId: 'm1', helped: false, replied: true });
  expect(ask).not.toHaveBeenCalled();

  await tickAt(at(25, 16));
  expect(transport.sent).toHaveLength(2);

  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'story' });
  await receive(fromNikos({ text: 'She would not let go of my hand' }));
  expect(transport.sent[2].message).toEqual({ text: lines.thanks, buttons: shareButtons('m1') });
  expect(nikos().invitation).toBe(invitation);
});

test('a stale "What is this?" sends nothing', async () => {
  add({ id: 'm2' });
  invite(add());
  expect(await receive(fromNikos({ button: 'inv:what:m2' }))).toBe(true);
  nikos().invitation = undefined;
  expect(await receive(fromNikos({ button: 'inv:what:m1' }))).toBe(true);
  expect(transport.sent).toEqual([]);
});

test('a question reply gets tellDirectly and keeps the invitation open, and a later unsure reply still gets gentleHelp', async () => {
  invite(add({ eventDate: '1958-06-01' }));
  vi.mocked(ask).mockResolvedValueOnce({ transcript: '', kind: 'question' }).mockResolvedValueOnce({ transcript: '', kind: 'unsure' });
  await receive(fromNikos({ text: 'who is that?' }));
  expect(messages()).toEqual([['7', { text: lines.tellDirectly("Maria's first day at school", '1 June 1958', 'Sofia') }]]);
  expect(saved()?.storytellers[0].invitation).toMatchObject({ momentId: 'm1', helped: false, replied: true });

  await receive(fromNikos({ text: 'a school?' }));
  expect(transport.sent[1].message).toEqual({ text: lines.gentleHelp('1 June 1958', "Maria's first day at school") });
  expect(nikos().invitation?.helped).toBe(true);
});

test('a question while a story waits for the share buttons still gets tellDirectly', async () => {
  const waiting = invite(add(), { story: { text: 'She ran in' }, shareAsked: true, replied: true });
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'question' });
  await receive(fromNikos({ text: 'what is this?' }));
  expect(messages()).toEqual([['7', { text: lines.tellDirectly("Maria's first day at school", '25 September 2026', 'Sofia') }]]);
  expect(nikos().invitation).toBe(waiting);
});

test('a reply marks the invitation replied before its call returns, so the silent-invitation help never interleaves', async () => {
  const invitation = invite(add());
  let answer: (value: unknown) => void;
  vi.mocked(ask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const reply = receive(fromNikos({ text: 'She would not let go of my hand' }));
  expect(invitation.replied).toBe(true);
  await tickAt(at(25, 16));
  answer({ transcript: '', kind: 'story' });
  await reply;
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.thanks]);
});

test('gentleHelp dates the moment by its event date when it has one', async () => {
  invite(add({ eventDate: '1958-06-01' }));
  await receive(fromNikos({ text: 'the old school?' }));
  expect(messages()).toEqual([['7', { text: lines.gentleHelp('1 June 1958', "Maria's first day at school") }]]);
});

test('an other reply closes with warmClose, a sticker or a forward is other with no call, and other while a story waits sends nothing', async () => {
  const moment = add();
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'other' });
  invite(moment);
  await receive(fromNikos({ text: 'ok' }));
  expect(nikos().invitation).toBeUndefined();

  invite(moment);
  await receive(fromNikos({ unsupported: true }));
  invite(moment);
  await receive(fromNikos({ text: 'Look at this one', forwarded: true }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(nikos().invitation).toBeUndefined();

  const waiting = invite(moment, { story: { text: 'She ran in' }, shareAsked: true });
  await receive(fromNikos({ text: '👍' }));
  expect(nikos().invitation).toEqual(waiting);
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.warmClose, lines.warmClose, lines.warmClose]);
});

test('a failed or invalid reply call reads a voice note or 3 words as a story, and "ok" as other', async () => {
  silenceWarnings();
  const moment = add();
  vi.mocked(ask).mockRejectedValueOnce(new Error('Gemini is down')).mockResolvedValueOnce({ kind: 'maybe' });
  const told = invite(moment);
  await receive(fromNikos({ text: 'She ran in' }));
  expect(told.story).toEqual({ text: 'She ran in' });

  invite(moment);
  await receive(fromNikos({ text: 'ok' }));
  expect(nikos().invitation).toBeUndefined();

  const spoken = invite(moment);
  await receive(fromNikos({ voice: { id: 'missing-clip' } }));
  expect(spoken.story).toEqual({ text: lines.voiceNote, voice: { id: 'missing-clip' } });
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.thanks, lines.warmClose, lines.thanks]);
});

test('"Yes, share it" posts storyAdded as a reply to the moment with a mention of the sender, reacts with a big heart, and ignores a second tap', async () => {
  const moment = add();
  invite(moment, { story: { text: 'She would not let go of my hand' }, shareAsked: true });
  expect(await receive(fromNikos({ button: 'inv:share:m1' }))).toBe(true);
  expect(await receive(fromNikos({ button: 'inv:share:m1' }))).toBe(true);

  expect(messages()).toEqual([
    ['-100', { text: lines.storyAdded('Nikos', 'Sofia', 'She would not let go of my hand'), replyTo: '57', mention: { id: '1', name: 'Sofia' } }],
    ['7', { text: lines.shared }],
  ]);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: 'sent-1', emoji: '\u2764', big: true }]);
  const record = saved();
  expect(record?.moments[0].stories).toEqual([
    { id: expect.any(String), by: { id: '7', name: 'Nikos' }, at: now, text: 'She would not let go of my hand', messageIds: ['sent-1'] },
  ]);
  expect(record?.storytellers[0].invitation).toBeUndefined();
});

test('a shared voice story follows storyAdded as the voice note, not as a reply', async () => {
  const moment = add();
  invite(moment, { story: { text: 'She held my hand', voice: { id: 'voice-a' } }, shareAsked: true });
  await receive(fromNikos({ button: 'inv:share:m1' }));
  expect(messages()).toEqual([
    ['-100', { text: lines.storyAdded('Nikos', 'Sofia', 'She held my hand'), replyTo: '57', mention: { id: '1', name: 'Sofia' } }],
    ['-100', { voice: { id: 'voice-a' } }],
    ['7', { text: lines.shared }],
  ]);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: 'sent-1', emoji: '\u2764', big: true }]);
  expect(moment.stories[0]).toMatchObject({ text: 'She held my hand', voice: { id: 'voice-a' }, messageIds: ['sent-1', 'sent-2'] });
});

test('"No, thanks" sends notShared, closes the invitation, and keeps no story', async () => {
  const moment = add();
  invite(moment, { story: { text: 'She ran in' }, shareAsked: true });
  await receive(fromNikos({ button: 'inv:keep:m1' }));
  expect(messages()).toEqual([['7', { text: lines.notShared }]]);
  expect(saved()?.storytellers[0].invitation).toBeUndefined();
  expect(moment.stories).toEqual([]);
});

test('"Not now" moves the return to the next 11:00, keeps the count, closes the invitation, and a stale tap does nothing', async () => {
  const moment = add({ returns: { '7': { count: 3, due: at(29, 11) } } });
  invite(moment);
  await receive(fromNikos({ button: 'inv:later:m1' }));
  expect(saved()?.moments[0].returns['7']).toEqual({ count: 3, due: at(26, 11) });
  expect(nikos().invitation).toBeUndefined();

  await receive(fromNikos({ button: 'inv:later:m1' }));
  expect(messages()).toEqual([['7', { text: lines.notNow }]]);
});

test('"Not now" on a moment with no return entry yet creates one instead of throwing', async () => {
  const moment = add();
  invite(moment);
  await expect(receive(fromNikos({ button: 'inv:later:m1' }))).resolves.toBe(true);
  expect(moment.returns['7']).toEqual({ count: 0, due: at(26, 11) });
});

test('"Don\'t bring this back" marks the moment sensitive and closes its invitation, also from a stale invitation', async () => {
  const moment = add();
  const older = add({ id: 'm2' });
  const invitation = invite(moment);
  await receive(fromNikos({ button: 'inv:never:m2' }));
  expect(older.sensitive).toBe(true);
  expect(nikos().invitation).toBe(invitation);

  await receive(fromNikos({ button: 'inv:never:m1' }));
  expect(saved()?.moments.map(({ sensitive }) => sensitive)).toEqual([true, true]);
  expect(nikos().invitation).toBeUndefined();
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.dontBringBack, lines.dontBringBack]);
});

test('a repeated "Don\'t bring this back" tap sends dontBringBack again but saves nothing', async () => {
  const moment = add();
  await receive(fromNikos({ button: 'inv:never:m1' }));
  const save = vi.spyOn(ctx.store, 'save');

  expect(await receive(fromNikos({ button: 'inv:never:m1' }))).toBe(true);
  expect(moment.sensitive).toBe(true);
  expect(save).not.toHaveBeenCalled();
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.dontBringBack, lines.dontBringBack]);
});

test('/send from an admin closes the open invitation and invites with the fewest returns, whatever the age and the due time', async () => {
  transport.admins.add('1');
  const open = add({ id: 'open', returns: { '7': { count: 1, due: at(26, 11) } } });
  add({ id: 'own', by: { id: '7', name: 'Nikos' } });
  add({ id: 'sensitive', sensitive: true });
  add({ id: 'done', returns: { '7': { count: 7, due: 0 } } });
  add({ id: 'many', salience: 5, returns: { '7': { count: 2, due: 0 } } });
  add({ id: 'fresh', savedAt: at(25, 11, 59), salience: 4, returns: { '7': { count: 1, due: at(27, 11) } } });
  invite(open);
  nikos().lastInvitationDay = dayIndex(at(24, 11));
  expect(await receive(inGroup({ text: '/send' }))).toBe(true);

  expect(nikos().invitation?.momentId).toBe('fresh');
  expect(family.moments.find(({ id }) => id === 'fresh')?.returns['7']).toEqual({ count: 2, due: at(27, 11) });
  expect(nikos().lastInvitationDay).toBe(dayIndex(at(24, 11)));
  expect(transport.sent.map(({ chatId }) => chatId)).toEqual(['7', '7']);
});

test('/send posts nothingToInvite for a storyteller with no moment left, and a member who is not an admin gets adminOnly', async () => {
  family.storytellers.push({ id: '8', name: 'Eleni', started: false });
  invite(add({ by: { id: '7', name: 'Nikos' } }));
  const fromMember = inGroup({ text: '/send' });
  expect(await receive(fromMember)).toBe(true);
  expect(messages()).toEqual([['-100', { text: lines.adminOnly, replyTo: fromMember.messageId }]]);
  expect(nikos().invitation).toBeDefined();

  transport.admins.add('1');
  await receive(inGroup({ text: '/send' }));
  expect(messages().slice(1)).toEqual([['-100', { text: lines.nothingToInvite('Nikos') }]]);
  expect(saved()?.storytellers[0].invitation).toBeUndefined();
});

test('a reply whose call is still pending when the 11:00 slot closes the invitation sends nothing', async () => {
  invite(add({ returns: { '7': { count: 1, due: at(27, 11) } } }));
  let answer: (value: unknown) => void;
  vi.mocked(ask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const reply = receive(fromNikos({ text: 'She would not let go of my hand' }));
  await tickAt(at(26, 11));
  answer({ transcript: '', kind: 'story' });

  expect(await reply).toBe(true);
  expect(transport.sent).toEqual([]);
  expect(nikos().invitation).toBeUndefined();
});

test('a delivery stops when its invitation closes while the voice clip is pending', async () => {
  add();
  vi.mocked(ask).mockResolvedValue({ transcript: '', kind: 'other' });
  let clip: (value: Buffer) => void;
  vi.mocked(speak).mockReturnValue(new Promise((resolve) => (clip = resolve)));
  const delivery = tickAt(at(25, 11));
  await vi.waitFor(() => expect(speak).toHaveBeenCalled());
  await receive(fromNikos({ text: 'ok' }));
  clip(wav);
  await delivery;

  expect(transport.sent.map(({ message }) => message)).toEqual([{ photo: { id: 'photo-57' } }, { text: lines.warmClose }]);
});

test('a delivery stops before the voice note when the moment is forgotten while the voice clip is pending', async () => {
  const moment = add();
  let clip: (value: Buffer) => void;
  vi.mocked(speak).mockReturnValue(new Promise((resolve) => (clip = resolve)));
  const delivery = tickAt(at(25, 11));
  await vi.waitFor(() => expect(speak).toHaveBeenCalled());
  family.moments.splice(family.moments.indexOf(moment), 1);
  clip(wav);
  await delivery;

  expect(transport.sent.map(({ message }) => message)).toEqual([{ photo: { id: 'photo-57' } }]);
});

test('a reply to an invitation whose moment was forgotten closes the invitation and is left to the router', async () => {
  invite(add());
  family.moments.length = 0;
  expect(await receive(fromNikos({ text: 'She would not let go of my hand' }))).toBe(false);
  expect(saved()?.storytellers[0].invitation).toBeUndefined();
  expect(ask).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([]);
});

test('with no open invitation, or for another command, a private message is left to the router', async () => {
  expect(await receive(fromNikos({ text: 'hello' }))).toBe(false);
  invite(add());
  expect(await receive(fromNikos({ text: '/help' }))).toBe(false);
  expect(ask).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([]);
});
