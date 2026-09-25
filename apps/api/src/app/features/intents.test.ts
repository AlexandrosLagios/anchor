process.env.TZ = 'Europe/Athens';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { createRouter } from '../core/router';
import { openStore } from '../core/store';
import type { Choices, Context, Family, Incoming, Member, Moment, Story } from '../core/types';
import * as model from '../model/model';
import { forget } from './capture/capture';
import { callMember } from './calls';
import { intents } from './intents';
import { memories } from './memories';
import { groupNextSteps, nextSteps } from './members';

vi.mock('../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/model')>()),
  ask: vi.fn(),
}));

vi.mock('./calls', () => ({ callMember: vi.fn() }));

const DEFAULT_CHOICES: Choices = { moments: false, reminders: true, shares: true, voice: false, call: false };
const NOW = new Date(2026, 8, 25, 12).getTime();

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'anchor-intents-')), 'state.json');
  const transport = new FakeTransport();
  const store = openStore(file, NOW);
  const family = store.addFamily('-100', '-100');
  const ctx: Context = { now: () => NOW, store, transport: () => transport };
  const router = createRouter([intents], ctx);
  return { file, transport, store, family, ctx, router };
}

function member(family: Family, overrides: Partial<Member> = {}): Member {
  const m: Member = { id: 'u1', name: 'Nikos', started: true, choices: { ...DEFAULT_CHOICES }, ...overrides };
  family.members.push(m);
  return m;
}

function moment(overrides: Partial<Moment> = {}): Moment {
  return {
    id: 'm1',
    by: { id: 'u2', name: 'Eleni' },
    messageIds: ['1'],
    savedAt: NOW,
    text: "Maria's first day at school, she was so proud",
    salience: 3,
    sensitive: false,
    people: ['Maria'],
    title: "Maria's first day at school",
    stories: [],
    lookbacks: [],
    memoryPostIds: [],
    returns: {},
    ...overrides,
  };
}

function story(overrides: Partial<Story> = {}): Story {
  return { id: 's1', by: { id: 'u3', name: 'Dimitris' }, at: NOW, text: 'She was so excited', messageIds: ['2'], ...overrides };
}

const groupEvent: Incoming = {
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: 'g1',
  sender: { id: 'u1', name: 'Nikos' },
  at: NOW,
  text: 'Anchor, can you send me the family photos?',
};

const privateEvent: Incoming = {
  chat: 'private',
  chatId: 'u1',
  messageId: 'p1',
  sender: { id: 'u1', name: 'Nikos' },
  at: NOW,
  text: 'Send me a moment',
};

beforeEach(() => {
  vi.mocked(model.ask).mockReset();
  vi.mocked(callMember).mockReset();
});

test('group: sendMe sends an invitation in private when the member started', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'sendMe', momentId: 'none' });

  await router.route(groupEvent);

  expect(transport.sent.some((s) => s.chatId === m.id)).toBe(true);
  const [prompt] = vi.mocked(model.ask).mock.calls[0];
  expect(prompt).toContain('"can you send me the family photos?"');
});

test('group: sendMe sends the ephemeral nudge when the member has not started', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: false });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'sendMe', momentId: 'none' });

  await router.route(groupEvent);

  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: '-100', message: expect.objectContaining({ text: lines.nudge(m.name), onlyFor: m.id }) }),
  ]);
  expect(m.nudged).toBe(true);
});

test('group: missed acts like sendMe', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: false });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'missed', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, what did I miss?' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ message: expect.objectContaining({ text: lines.nudge(m.name), onlyFor: m.id }) }),
  ]);
});

test('group: settings and stop send the ephemeral nudge', async () => {
  const { transport, family, router } = setup();
  const m = member(family);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'settings', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, settings' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ message: expect.objectContaining({ text: lines.nudge(m.name), onlyFor: m.id }) }),
  ]);
});

test('group: callMe rings the member when started', async () => {
  const { family, router } = setup();
  member(family, { started: true });
  vi.mocked(callMember).mockResolvedValue(true);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'callMe', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, call me' });

  expect(callMember).toHaveBeenCalledTimes(1);
});

test('group: callMe nudges when the member has not started', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: false });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'callMe', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, call me' });

  expect(callMember).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([
    expect.objectContaining({ message: expect.objectContaining({ text: lines.nudge(m.name), onlyFor: m.id }) }),
  ]);
});

test('group: find answers with the moment of momentId', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1', photo: { id: 'photo-1' } }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  expect(transport.sent).toEqual([
    expect.objectContaining({
      message: expect.objectContaining({ photo: { id: 'photo-1' }, text: lines.askAnswer("Maria's first day at school", '25 September 2026', []), replyTo: 'g1' }),
    }),
  ]);
});

test('group: find with none replies notFound', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'g1' } }]);
});

test('group: memory posts a memory now, like /memory', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, show us a memory' });

  expect(transport.sent.some((s) => s.message.text?.includes(lines.labels.fromRecord))).toBe(true);
});

test('group: a nxt:memory tap posts a memory with no model call', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment());

  await router.route({ ...groupEvent, text: undefined, button: 'nxt:memory' });

  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent.some((s) => s.message.text?.includes(lines.labels.fromRecord))).toBe(true);
});

test('group: forget acts on the replied-to message', async () => {
  const { family, router, ctx } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1', messageIds: ['orig-1'] }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'forget', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, delete that one', replyTo: 'orig-1' });

  expect(family.moments).toEqual([]);
  expect(ctx).toBeTruthy();
});

test('group: forget with no reply gets unclear with groupNextSteps', async () => {
  const { transport, family, ctx, router } = setup();
  member(family);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'forget', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, forget that one' });

  expect(transport.sent).toEqual([
    { chatId: '-100', messageId: 'sent-1', message: { text: lines.unclear, replyTo: 'g1', buttons: groupNextSteps(family, ctx) } },
  ]);
});

test('group: quiet sets the moment sensitive on the replied-to message', async () => {
  const { family, router } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1', messageIds: ['orig-1'] }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'quiet', momentId: 'none' });

  await router.route({ ...groupEvent, text: "Anchor, don't show me that one again", replyTo: 'orig-1' });

  expect(family.moments[0].sensitive).toBe(true);
});

test('group: an unclear intent replies unclear with groupNextSteps', async () => {
  const { transport, family, ctx, router } = setup();
  member(family);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'unclear', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, what is the weather like?' });

  expect(transport.sent).toEqual([
    { chatId: '-100', messageId: 'sent-1', message: { text: lines.unclear, replyTo: 'g1', buttons: groupNextSteps(family, ctx) } },
  ]);
});

test('group: an invalid intent from the model counts as unclear', async () => {
  const { transport, family, router } = setup();
  member(family);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'nonsense', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, do a barrel roll' });

  expect(transport.sent[0].message.text).toBe(lines.unclear);
});

test('group: a failed model call counts as unclear', async () => {
  const { transport, family, router } = setup();
  member(family);
  vi.mocked(model.ask).mockRejectedValue(new Error('down'));

  await router.route({ ...groupEvent, text: 'Anchor, do a barrel roll' });

  expect(transport.sent[0].message.text).toBe(lines.unclear);
});

test('group: joinMember runs on a new sender, and saves', async () => {
  const { file, family, router } = setup();
  vi.mocked(model.ask).mockResolvedValue({ intent: 'unclear', momentId: 'none' });

  await router.route(groupEvent);

  expect(family.members.some((m) => m.id === 'u1')).toBe(true);
  const reloaded = openStore(file).family('-100');
  expect(reloaded?.members.some((m) => m.id === 'u1')).toBe(true);
});

test('group: a voice note goes to the model as audio', async () => {
  const { transport, family, router } = setup();
  member(family);
  transport.files.set('clip-1', { data: Buffer.from('hello'), mimeType: 'audio/ogg' });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'unclear', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, what happened here?', voice: { id: 'clip-1', mimeType: 'audio/ogg' } });

  const [, , options] = vi.mocked(model.ask).mock.calls[0];
  expect(options).toEqual({ media: [{ data: Buffer.from('hello'), mimeType: 'audio/ogg' }] });
});

test('group: a plain group message with no address prefix returns false', async () => {
  const { transport, family, ctx } = setup();
  member(family);

  expect(await intents.handle?.({ ...groupEvent, text: 'lovely weather today' }, family, ctx)).toBe(false);
  expect(transport.sent).toEqual([]);
  expect(model.ask).not.toHaveBeenCalled();
});

test('group: an answer replies to the message and a following 3-word reply becomes a story', async () => {
  const { family, ctx } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  expect(await intents.handle?.({ ...groupEvent, text: 'Anchor, when did Maria start school?' }, family, ctx)).toBe(true);
  const answerId = family.moments[0].memoryPostIds[0];

  const storyEvent: Incoming = { ...groupEvent, messageId: 's1', text: 'She loved that day', replyTo: answerId };
  expect(await memories.handle?.(storyEvent, family, ctx)).toBe(true);
  expect(family.moments[0].stories.some((s) => s.text === 'She loved that day')).toBe(true);
});

test('group: a forget on the answer post deletes the moment', async () => {
  const { family, ctx } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  expect(await intents.handle?.({ ...groupEvent, text: 'Anchor, when did Maria start school?' }, family, ctx)).toBe(true);
  const answerId = family.moments[0].memoryPostIds[0];

  const forgetEvent: Incoming = { ...groupEvent, messageId: 'f1', text: 'Anchor, forget this', replyTo: answerId };
  expect(await forget.handle?.(forgetEvent, family, ctx)).toBe(true);
  expect(family.moments).toEqual([]);
});

// --- private ---

test('private: a non-member returns false', async () => {
  const { family, ctx } = setup();
  expect(await intents.handle?.(privateEvent, family, ctx)).toBe(false);
});

test('private: sendMe sends an invitation now', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'sendMe', momentId: 'none' });

  await router.route(privateEvent);

  expect(transport.sent.some((s) => s.chatId === m.id)).toBe(true);
});

test('private: memory acts like sendMe', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'show us a memory' });

  expect(transport.sent.some((s) => s.chatId === m.id)).toBe(true);
});

test('private: settings shows the choices screen', async () => {
  const { transport, family, router } = setup();
  const m = member(family);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'settings', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'settings' });

  expect(transport.sent).toEqual([expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.choicesScreen }) })]);
});

test('private: stop acts like stopMember', async () => {
  const { family, router } = setup();
  const m = member(family, { started: true, choices: { ...DEFAULT_CHOICES, moments: true } });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'stop', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'stop' });

  expect(m.started).toBe(false);
  expect(m.choices.moments).toBe(false);
});

test('private: callMe calls callMember', async () => {
  const { family, router } = setup();
  member(family, { started: true });
  vi.mocked(callMember).mockResolvedValue(true);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'callMe', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'call me' });

  expect(callMember).toHaveBeenCalledTimes(1);
});

test('private: callMe tells callFailed with nextSteps on a false result', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  vi.mocked(callMember).mockResolvedValue(false);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'callMe', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'call me' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.callFailed, buttons: nextSteps(m, 'callMe') }) }),
  ]);
});

test('private: find sends the moment with the picture and askAnswer, and updates seenAt', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment({ id: 'm1', photo: { id: 'photo-1' }, savedAt: NOW + 1000 }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  await router.route({ ...privateEvent, text: 'when did Maria start school?' });

  expect(transport.sent).toEqual([
    expect.objectContaining({
      chatId: m.id,
      message: expect.objectContaining({ photo: { id: 'photo-1' }, buttons: nextSteps(m, 'find') }),
    }),
  ]);
  expect(m.seenAt).toBe(NOW + 1000);
});

test('private: find sends the first voice story after the moment', async () => {
  const { transport, family, router } = setup();
  member(family, { started: true });
  family.moments.push(moment({ id: 'm1', stories: [story({ voice: { id: 'voice-1' } })] }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  await router.route({ ...privateEvent, text: 'when did Maria start school?' });

  expect(transport.sent.some((s) => s.message.voice)).toBe(true);
});

test('private: find with none gets notFound with nextSteps', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'what happened here?' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.notFound, buttons: nextSteps(m, 'find') }) }),
  ]);
});

test('private: missed pages up to 3 moments oldest first and updates seenAt', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true, seenAt: NOW - 4000 });
  family.moments.push(
    moment({ id: 'm1', savedAt: NOW - 3000, photo: { id: 'p1' } }),
    moment({ id: 'm2', savedAt: NOW - 2000, photo: { id: 'p2' } }),
    moment({ id: 'm3', savedAt: NOW - 1000, photo: { id: 'p3' } }),
    moment({ id: 'm4', savedAt: NOW, photo: { id: 'p4' } }),
  );
  vi.mocked(model.ask).mockResolvedValue({ intent: 'missed', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'what did I miss?' });

  const sentToMember = transport.sent.filter((s) => s.chatId === m.id);
  expect(sentToMember[0].message.text).toBe(lines.missed(4));
  expect(sentToMember[1].message.photo).toEqual({ id: 'p1' });
  expect(sentToMember[2].message.photo).toEqual({ id: 'p2' });
  expect(sentToMember[3].message.photo).toEqual({ id: 'p3' });
  expect(sentToMember[3].message.buttons).toEqual(nextSteps(m, 'missed'));
  expect(m.seenAt).toBe(NOW - 1000);
});

test('private: missed with no seenAt counts moments of the last 7 demo-clock days', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(
    moment({ id: 'm1', savedAt: NOW - 8 * 86_400_000, photo: { id: 'p1' } }),
    moment({ id: 'm2', savedAt: NOW - 1000, photo: { id: 'p2' } }),
  );
  vi.mocked(model.ask).mockResolvedValue({ intent: 'missed', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'what did I miss?' });

  const sentToMember = transport.sent.filter((s) => s.chatId === m.id);
  expect(sentToMember[0].message.text).toBe(lines.missed(1));
});

test('private: missed with nothing new sends nothingNew with nextSteps', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true, seenAt: NOW });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'missed', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'what did I miss?' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.nothingNew, buttons: nextSteps(m, 'missed') }) }),
  ]);
});

test('private: forget, quiet, and unclear all tell unclear with nextSteps', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  vi.mocked(model.ask).mockResolvedValueOnce({ intent: 'forget', momentId: 'none' });
  await router.route({ ...privateEvent, text: 'delete that one' });
  vi.mocked(model.ask).mockResolvedValueOnce({ intent: 'quiet', momentId: 'none' });
  await router.route({ ...privateEvent, text: "don't show me that one again" });
  vi.mocked(model.ask).mockResolvedValueOnce({ intent: 'unclear', momentId: 'none' });
  await router.route({ ...privateEvent, text: 'do a barrel roll' });

  expect(transport.sent.every((s) => s.message.text === lines.unclear && s.message.buttons?.length)).toBe(true);
  expect(transport.sent.length).toBe(3);
  expect(nextSteps(m)).toEqual(transport.sent[0].message.buttons);
});

test('private: a nxt: tap acts like the intent with no model call', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());

  await router.route({ ...privateEvent, text: undefined, button: 'nxt:sendMe' });

  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent.some((s) => s.chatId === m.id)).toBe(true);
});

test('private: an unknown button gets unclear', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });

  await router.route({ ...privateEvent, text: undefined, button: 'inv:agree' });

  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.unclear, buttons: nextSteps(m) }) }),
  ]);
});

test('private: a message with no text and no voice gets unclear with no model call', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });

  await router.route({ ...privateEvent, text: undefined, photo: { id: 'photo-1' } });

  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.unclear, buttons: nextSteps(m) }) }),
  ]);
});

test('private: a voice note goes to the model as audio', async () => {
  const { transport, family, router } = setup();
  member(family, { started: true });
  transport.files.set('clip-1', { data: Buffer.from('hello'), mimeType: 'audio/ogg' });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'unclear', momentId: 'none' });

  await router.route({ ...privateEvent, text: undefined, voice: { id: 'clip-1', mimeType: 'audio/ogg' } });

  const [, , options] = vi.mocked(model.ask).mock.calls[0];
  expect(options).toEqual({ media: [{ data: Buffer.from('hello'), mimeType: 'audio/ogg' }] });
});

test('private: a failed model call counts as unclear', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  vi.mocked(model.ask).mockRejectedValue(new Error('down'));

  await router.route({ ...privateEvent, text: 'gibberish' });

  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.unclear, buttons: nextSteps(m) }) }),
  ]);
});
