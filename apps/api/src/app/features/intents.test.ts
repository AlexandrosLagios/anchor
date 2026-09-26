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

vi.mock('./calls', async (importOriginal) => ({ ...(await importOriginal<typeof import('./calls')>()), callMember: vi.fn() }));

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

test('group: the demo phrase "can you send me the family photos?" is sendMe in code, and sends an invitation in private', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true });
  family.moments.push(moment());

  await router.route(groupEvent);

  expect(transport.sent.some((s) => s.chatId === m.id)).toBe(true);
  expect(model.ask).not.toHaveBeenCalled();
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
  member(family, { started: true, phone: '+306900000000' });
  family.moments.push(moment());
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

test('group: the moment list sent to the model leaves out every sensitive moment', async () => {
  const { family, router } = setup();
  member(family);
  family.moments.push(moment({ id: 'm1' }), moment({ id: 'm-loss', title: 'Grandma in hospital', sensitive: true }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  const [prompt, schema] = vi.mocked(model.ask).mock.calls[0];
  expect(prompt).not.toContain('m-loss');
  expect(prompt).not.toContain('Grandma in hospital');
  expect((schema as { properties: { momentId: { enum: string[] } } }).properties.momentId.enum).toEqual(['m1', 'none']);
});

test('group: a moment id outside the list, or a moment deleted during the call, gets notFound', async () => {
  const { transport, family, router } = setup();
  member(family);
  const kept = moment({ id: 'm1', photo: { id: 'photo-1' } });
  family.moments.push(kept);
  vi.mocked(model.ask).mockResolvedValueOnce({ intent: 'find', momentId: 'm-invented' });
  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  vi.mocked(model.ask).mockImplementationOnce(async () => {
    family.moments.splice(family.moments.indexOf(kept), 1);
    return { intent: 'find', momentId: 'm1' };
  });
  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.notFound, lines.notFound]);
});

test('group: the answer shows the video over the photo, then the first voice story, and both ids land in memoryPostIds', async () => {
  const { transport, family, router, file } = setup();
  member(family);
  const found = moment({
    id: 'm1',
    photo: { id: 'photo-1' },
    video: { id: 'video-1' },
    stories: [story({ id: 's1' }), story({ id: 's2', by: { id: 'u4', name: 'Sofia' }, voice: { id: 'voice-s2' } })],
  });
  family.moments.push(found);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'find', momentId: 'm1' });

  await router.route({ ...groupEvent, text: 'Anchor, when did Maria start school?' });

  expect(transport.sent.map(({ message }) => message)).toEqual([
    { video: { id: 'video-1' }, text: lines.askAnswer("Maria's first day at school", '25 September 2026', ['Dimitris', 'Sofia']), replyTo: 'g1' },
    { voice: { id: 'voice-s2' } },
  ]);
  expect(found.memoryPostIds).toEqual(['sent-1', 'sent-2']);
  expect(openStore(file).family('-100')?.moments[0].memoryPostIds).toEqual(['sent-1', 'sent-2']);
});

test('group: "Anchorage was lovely", a bare "anchor", and a forwarded "Anchor, ..." are not questions', async () => {
  const { transport, family, ctx } = setup();
  member(family);
  family.moments.push(moment());
  for (const event of [
    { ...groupEvent, text: 'Anchorage was lovely' },
    { ...groupEvent, text: 'anchor' },
    { ...groupEvent, text: 'Anchor, when did Maria start school?', forwarded: true },
  ]) {
    expect(await intents.handle?.(event, family, ctx)).toBe(false);
  }
  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([]);
});

test('private: a fixed phrase decides the intent in code, and a voice note still goes to the model', async () => {
  const { transport, family, router } = setup();
  const m = member(family);
  await router.route({ ...privateEvent, text: 'What did I miss?' });
  expect(model.ask).not.toHaveBeenCalled();
  expect(transport.sent.at(-1)).toMatchObject({ chatId: m.id, message: { text: lines.nothingNew } });

  transport.files.set('clip-1', { data: Buffer.from('what did I miss'), mimeType: 'audio/ogg' });
  vi.mocked(model.ask).mockResolvedValue({ intent: 'missed', momentId: 'none' });
  await router.route({ ...privateEvent, text: undefined, voice: { id: 'clip-1', mimeType: 'audio/ogg' } });
  expect(model.ask).toHaveBeenCalledTimes(1);
});

test('group: memory posts a memory now, like /memory', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'none' });

  await router.route({ ...groupEvent, text: 'Anchor, show us a memory' });

  expect(transport.sent.some((s) => s.message.text?.includes(lines.labels.fromRecord))).toBe(true);
});

test('group: a memory of a name posts the album of every moment the model picks, and the prompt lists the tags of each moment', async () => {
  const { transport, family, router } = setup();
  member(family);
  const dog = (id: string, days: number, tags: string[]) => moment({ id, tags, title: `Dog ${id}`, photo: { id: `photo-${id}` }, savedAt: NOW - days * 86_400_000 });
  family.moments.push(moment({ id: 'due', photo: { id: 'photo-due' }, savedAt: NOW - 7 * 86_400_000 }), dog('d1', 3, ['dog', 'park']), dog('l1', 2, ['Lucy', 'dog']), dog('l2', 1, ['Lucy']));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'l2', momentIds: ['d1', 'l1', 'l2', 'nope'] });

  await router.route({ ...groupEvent, text: 'Anchor, I want a memory of Lucy' });

  expect(vi.mocked(model.ask).mock.calls[0][0]).toContain('tags: Lucy, dog');
  expect(transport.sent[0].message.album).toEqual(['d1', 'l1', 'l2'].map((id) => ({ photo: { id: `photo-${id}` } })));
  expect(transport.sent[0].message.text).toContain('Lucy');
});

test('group: "send me photos of Lucy" names a subject, so it goes to the model and not to the fixed sendMe', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment({ id: 'l1', tags: ['Lucy'], photo: { id: 'photo-l1' } }), moment({ id: 'l2', tags: ['Lucy'], photo: { id: 'photo-l2' } }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'none', momentIds: ['l1', 'l2'] });

  await router.route({ ...groupEvent, text: 'Anchor, send me photos of Lucy' });

  expect(model.ask).toHaveBeenCalled();
  expect(transport.sent[0].message.album).toHaveLength(2);
});

test('group: a memory request needs no "Anchor," in many phrasings, and the intent call learns that the message does not name Anchor', async () => {
  const { transport, family, router } = setup();
  member(family);
  family.moments.push(moment({ id: 'l1', tags: ['Lucy', 'Λύση'], photo: { id: 'photo-l1' } }), moment({ id: 'l2', tags: ['Lucy'], photo: { id: 'photo-l2' } }));
  vi.mocked(model.ask).mockResolvedValue({ intent: 'memory', momentId: 'none', momentIds: ['l1', 'l2'] });
  const phrasings = ['a memory of Lucy?', 'Give me memories of Lucy', 'do you have pictures of Lucy?', 'Λύση photos?', 'send me a moment with Lucy'];

  for (const text of phrasings) await router.route({ ...groupEvent, text });

  expect(transport.sent.map((sent) => sent.message.album?.length)).toEqual(phrasings.map(() => 2));
  expect(vi.mocked(model.ask).mock.calls[0][0]).toContain('The message does not name Anchor');
});

test('group: an unaddressed message that the intent call does not read as a memory request gets no answer at all', async () => {
  const { transport, family, ctx } = setup();
  member(family);
  family.moments.push(moment());
  vi.mocked(model.ask).mockResolvedValue({ intent: 'unclear', momentId: 'none', momentIds: [] });

  for (const text of ['Photos of the trip are on Drive', 'I have fond memories of that summer']) {
    expect(await intents.handle?.({ ...groupEvent, text }, family, ctx)).toBe(false);
  }
  expect(transport.sent).toEqual([]);
});

test('group: an unaddressed message without a memory word, without a subject the record knows, or as a reply, never reaches the model', async () => {
  const { family, router } = setup();
  member(family);
  family.moments.push(moment({ tags: ['Lucy'], people: ['Maria'] }));

  await router.route({ ...groupEvent, text: 'See you at lunch tomorrow' });
  await router.route({ ...groupEvent, text: 'Do you remember Lucy as a puppy?' });
  await router.route({ ...groupEvent, text: 'Can you send me the photos from yesterday?' });
  await router.route({ ...groupEvent, text: 'Lucyana sent photos' });
  await router.route({ ...groupEvent, text: 'Send me the photos of Lucy later', replyTo: 'm-person' });

  expect(model.ask).not.toHaveBeenCalled();
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
  member(family, { started: true, phone: '+306900000000' });
  family.moments.push(moment());
  vi.mocked(callMember).mockResolvedValue(true);
  vi.mocked(model.ask).mockResolvedValue({ intent: 'callMe', momentId: 'none' });

  await router.route({ ...privateEvent, text: 'call me' });

  expect(callMember).toHaveBeenCalledTimes(1);
});

test('private: callMe asks for the phone number when the member has none', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true, choices: { ...DEFAULT_CHOICES, call: true } });

  await router.route({ ...privateEvent, button: 'nxt:callMe' });

  expect(callMember).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([
    expect.objectContaining({
      chatId: m.id,
      message: expect.objectContaining({ text: lines.askPhone, buttons: [{ label: lines.buttons.sharePhone, contact: true }] }),
    }),
  ]);
});

test('private: callMe says there is nothing new to talk about when the member shared or told every moment', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true, phone: '+306900000000', choices: { ...DEFAULT_CHOICES, call: true } });
  family.moments.push(moment({ id: 'own', by: { id: m.id, name: m.name } }), moment({ id: 'told', stories: [story({ by: { id: m.id, name: m.name } })] }));

  await router.route({ ...privateEvent, button: 'nxt:callMe' });

  expect(callMember).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([
    expect.objectContaining({ chatId: m.id, message: expect.objectContaining({ text: lines.nothingToCall, buttons: nextSteps(m, 'callMe') }) }),
  ]);
});

test('private: callMe tells callFailed with nextSteps on a false result', async () => {
  const { transport, family, router } = setup();
  const m = member(family, { started: true, phone: '+306900000000' });
  family.moments.push(moment());
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
