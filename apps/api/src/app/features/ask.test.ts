import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { createRouter } from '../core/router';
import { openStore } from '../core/store';
import type { Context, Incoming, Moment, Story } from '../core/types';
import * as model from '../model/model';
import { ask } from './ask';
import { forget } from './capture/capture';
import { memories } from './memories';

vi.mock('../model/model', async (importOriginal) => ({ ...(await importOriginal<typeof import('../model/model')>()), ask: vi.fn() }));

const NOW = new Date(2026, 8, 25, 12).getTime();

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'anchor-ask-')), 'state.json');
  const transport = new FakeTransport();
  const store = openStore(file, NOW);
  const family = store.addFamily('-100', '-100');
  const ctx: Context = { now: () => NOW, store, transport: () => transport };
  const router = createRouter([ask], ctx);
  return { file, transport, store, family, ctx, router };
}

function moment(overrides: Partial<Moment> = {}): Moment {
  return {
    id: 'm1',
    by: { id: 'u1', name: 'Sofia' },
    messageIds: ['1'],
    savedAt: NOW,
    text: 'Maria started school today, she was so proud',
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
  return { id: 's1', by: { id: 'u2', name: 'Dimitris' }, at: NOW, text: 'She was so excited', messageIds: ['2'], ...overrides };
}

const question: Incoming = {
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: 'q1',
  sender: { id: 'u1', name: 'Sofia' },
  at: NOW,
  text: 'Anchor, when did Maria start school?',
};

beforeEach(() => {
  vi.mocked(model.ask).mockReset();
});

test('a found moment replies to the question with its video and the voice story follows', async () => {
  const { transport, family, router } = setup();
  const withVoice = story({ id: 's2', by: { id: 'u3', name: 'Elena' }, text: 'I remember the tears', voice: { id: 'voice-1' } });
  family.moments.push(
    moment({
      id: 'm1',
      eventDate: '2019-09-25',
      photo: { id: 'photo-1' },
      video: { id: 'video-1' },
      stories: [story({ id: 's1', by: { id: 'u2', name: 'Dimitris' } }), withVoice],
    }),
  );
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  await router.route(question);

  expect(transport.sent).toEqual([
    {
      chatId: '-100',
      messageId: 'sent-1',
      message: {
        video: { id: 'video-1' },
        text: lines.askAnswer("Maria's first day at school", '25 September 2019', ['Dimitris', 'Elena']),
        replyTo: 'q1',
      },
    },
    { chatId: '-100', messageId: 'sent-2', message: { voice: { id: 'voice-1' } } },
  ]);
  expect(model.ask).toHaveBeenCalledTimes(1);
  const [prompt, schema, options] = vi.mocked(model.ask).mock.calls[0];
  expect(prompt).toContain('when did Maria start school?');
  expect(prompt).not.toContain('Anchor, when did Maria start school?');
  expect(schema).toEqual({ type: 'object', properties: { momentId: { type: 'string', enum: ['m1', 'none'] } }, required: ['momentId'] });
  expect(options).toEqual({});
});

test('a found moment with only a photo, no story, and no eventDate replies with the photo and the savedAt date', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1', photo: { id: 'photo-1' }, savedAt: NOW }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  await router.route(question);

  expect(transport.sent).toEqual([
    {
      chatId: '-100',
      messageId: 'sent-1',
      message: { photo: { id: 'photo-1' }, text: lines.askAnswer("Maria's first day at school", '25 September 2026', []), replyTo: 'q1' },
    },
  ]);
});

test('a "none" answer gets notFound', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'none' });

  await router.route(question);

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'q1' } }]);
});

test('an id outside the enum gets notFound', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm-does-not-exist' });

  await router.route(question);

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'q1' } }]);
});

test('a failed call gets notFound', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockRejectedValue(new Error('the model is down'));

  await router.route(question);

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'q1' } }]);
});

test('a voice question downloads the clip and passes it as media', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  transport.files.set('clip-1', { data: Buffer.from('hello'), mimeType: 'audio/ogg' });
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  await router.route({ ...question, text: 'Anchor, what happened here?', voice: { id: 'clip-1', mimeType: 'audio/ogg' } });

  expect(model.ask).toHaveBeenCalledTimes(1);
  const [prompt, , options] = vi.mocked(model.ask).mock.calls[0];
  expect(prompt).toContain('voice note');
  expect(options).toEqual({ media: [{ data: Buffer.from('hello'), mimeType: 'audio/ogg' }] });
});

test('a sensitive moment is excluded from the enum', async () => {
  const { family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  family.moments.push(moment({ id: 'm2', sensitive: true }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  await router.route(question);

  const [, schema] = vi.mocked(model.ask).mock.calls[0];
  expect(schema).toEqual({ type: 'object', properties: { momentId: { type: 'string', enum: ['m1', 'none'] } }, required: ['momentId'] });
});

test('a family whose every moment is sensitive gets notFound without a call', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1', sensitive: true }));

  await router.route(question);

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'q1' } }]);
  expect(model.ask).not.toHaveBeenCalled();
});

test('a moment deleted during the call gets notFound', async () => {
  const { transport, family, router } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockImplementation(async () => {
    family.moments.length = 0;
    return { momentId: 'm1' };
  });

  await router.route(question);

  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.notFound, replyTo: 'q1' } }]);
});

test('the answer post id lands in memoryPostIds, and the store saves it', async () => {
  const { file, family, ctx } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  expect(await ask.handle?.(question, family, ctx)).toBe(true);

  expect(family.moments[0].memoryPostIds).toEqual(['sent-1']);
  const reloaded = openStore(file).family('-100');
  expect(reloaded?.moments[0].memoryPostIds).toEqual(['sent-1']);
});

test('the voice story follow-up id also lands in memoryPostIds, and a forget on it deletes the moment', async () => {
  const { family, ctx } = setup();
  const withVoice = story({ id: 's2', by: { id: 'u3', name: 'Elena' }, text: 'I remember the tears', voice: { id: 'voice-1' } });
  family.moments.push(moment({ id: 'm1', stories: [withVoice] }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  expect(await ask.handle?.(question, family, ctx)).toBe(true);

  expect(family.moments[0].memoryPostIds).toEqual(['sent-1', 'sent-2']);

  const voicePostId = family.moments[0].memoryPostIds[1];
  const forgetEvent: Incoming = { ...question, messageId: 'f1', text: 'Anchor, forget this', replyTo: voicePostId };
  expect(await forget.handle?.(forgetEvent, family, ctx)).toBe(true);
  expect(family.moments).toEqual([]);
});

test('a forget on the answer deletes the moment', async () => {
  const { family, ctx } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  expect(await ask.handle?.(question, family, ctx)).toBe(true);
  const answerId = family.moments[0].memoryPostIds[0];

  const forgetEvent: Incoming = { ...question, messageId: 'f1', text: 'Anchor, forget this', replyTo: answerId };
  expect(await forget.handle?.(forgetEvent, family, ctx)).toBe(true);
  expect(family.moments).toEqual([]);
});

test('a 3-word reply to the answer becomes a group story', async () => {
  const { family, ctx } = setup();
  family.moments.push(moment({ id: 'm1' }));
  vi.mocked(model.ask).mockResolvedValue({ momentId: 'm1' });

  expect(await ask.handle?.(question, family, ctx)).toBe(true);
  const answerId = family.moments[0].memoryPostIds[0];

  const storyEvent: Incoming = { ...question, messageId: 's1', text: 'She loved that day', replyTo: answerId };
  expect(await memories.handle?.(storyEvent, family, ctx)).toBe(true);
  expect(family.moments[0].stories.some((story) => story.text === 'She loved that day')).toBe(true);
});

test('a group text that does not start the question, and a private question, return false', async () => {
  const { transport, family, ctx } = setup();
  family.moments.push(moment({ id: 'm1' }));

  expect(await ask.handle?.({ ...question, text: 'Anchorage was lovely' }, family, ctx)).toBe(false);
  expect(await ask.handle?.({ ...question, text: 'anchor' }, family, ctx)).toBe(false);
  expect(await ask.handle?.({ ...question, chat: 'private' }, family, ctx)).toBe(false);
  expect(await ask.handle?.({ ...question, familyId: undefined }, undefined, ctx)).toBe(false);
  expect(await ask.handle?.({ ...question, forwarded: true }, family, ctx)).toBe(false);

  expect(transport.sent).toEqual([]);
  expect(model.ask).not.toHaveBeenCalled();
});
