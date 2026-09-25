process.env.TZ = 'Europe/Athens';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { FakeTransport } from '../../core/fake-transport';
import { openStore } from '../../core/store';
import type { Context, Family, Incoming, Moment } from '../../core/types';
import { ask } from '../../gemini';
import { bundles, capture, forget } from './capture';
import { BUNDLE_GAP_MS } from './filter';

vi.mock('../../gemini', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../gemini')>()),
  ask: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
}));

let now: number;
let transport: FakeTransport;
let ctx: Context;
let family: Family;
let messageSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 12));
  now = Date.now();
  transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-')), 'state.json'), now);
  ctx = { now: () => now, store, transport: () => transport };
  family = store.addFamily('-100', '-100');
  bundles.length = 0;
  messageSeq = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms));
  now = Date.now();
}

function event(overrides: Partial<Incoming> = {}): Incoming {
  messageSeq += 1;
  return {
    familyId: '-100',
    chat: 'group',
    chatId: '-100',
    messageId: `m${messageSeq}`,
    sender: { id: 'sofia', name: 'Sofia' },
    at: Date.now(),
    ...overrides,
  };
}

function moment(overrides: Partial<Moment> = {}): Moment {
  return {
    id: 'existing-moment',
    by: { id: 'sofia', name: 'Sofia' },
    messageIds: [],
    savedAt: 0,
    text: 'Maria on her first day',
    salience: 3,
    sensitive: false,
    people: [],
    title: "Maria's first day at school",
    stories: [],
    lookbacks: [],
    memoryPostIds: [],
    returns: {},
    ...overrides,
  };
}

const classification = {
  verdict: 'family_moment' as const,
  salience: 4,
  people: ['Maria'],
  eventDate: '2026-09-01',
  title: "Maria's first day at school",
  transcript: '',
};

function tick() {
  return capture.tick?.(family, { from: now, to: now }, ctx);
}

test('a captioned photo becomes a family moment at the tick, and gets a heart', async () => {
  (ask as Mock).mockResolvedValue(classification);
  transport.files.set('photo-1', { data: Buffer.from('x'), mimeType: 'image/jpeg' });
  const photoEvent = event({ text: 'Maria on her first day', photo: { id: 'photo-1' } });

  expect(await capture.handle(photoEvent, family, ctx)).toBe(true);
  await tick();

  expect(ask).toHaveBeenCalledTimes(1);
  expect(family.moments).toEqual([
    {
      id: expect.any(String),
      by: { id: 'sofia', name: 'Sofia' },
      messageIds: [photoEvent.messageId],
      savedAt: now,
      text: 'Maria on her first day',
      photo: { id: 'photo-1' },
      video: undefined,
      voice: undefined,
      salience: 4,
      people: ['Maria'],
      eventDate: '2026-09-01',
      title: "Maria's first day at school",
      sensitive: false,
      stories: [],
      lookbacks: [],
      memoryPostIds: [],
      returns: {},
    },
  ]);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: photoEvent.messageId, emoji: '\u2764' }]);
  expect(family.counters.family_moment).toBe(1);
});

test('a sensitive verdict saves the moment with sensitive: true, and still gets a heart', async () => {
  (ask as Mock).mockResolvedValue({ ...classification, verdict: 'sensitive' });
  const textEvent = event({ text: 'We lost grandpa today, sharing this' });

  await capture.handle(textEvent, family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  expect(family.moments).toHaveLength(1);
  expect(family.moments[0].sensitive).toBe(true);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: textEvent.messageId, emoji: '\u2764' }]);
  expect(family.counters.sensitive).toBe(1);
});

test('logistics and small_talk get no moment and no reaction, but their counters increment', async () => {
  (ask as Mock).mockResolvedValueOnce({ ...classification, verdict: 'logistics' });
  await capture.handle(event({ text: 'pick up the kids at five' }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  (ask as Mock).mockResolvedValueOnce({ ...classification, verdict: 'small_talk' });
  await capture.handle(event({ text: 'lol that is so funny honestly' }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  expect(family.moments).toEqual([]);
  expect(transport.reactions).toEqual([]);
  expect(family.counters.logistics).toBe(1);
  expect(family.counters.small_talk).toBe(1);
});

test('a sticker, a forwarded text, a command, and a bare link fail the rules and never reach ask', async () => {
  await capture.handle(event({ unsupported: true }), family, ctx);
  await capture.handle(event({ text: 'look at this', forwarded: true }), family, ctx);
  await capture.handle(event({ text: '/memory' }), family, ctx);
  await capture.handle(event({ text: 'https://example.com' }), family, ctx);

  expect(ask).not.toHaveBeenCalled();
  expect(family.counters.rules).toBe(4);
  expect(bundles).toEqual([]);
});

test('"ok great", a bare photo, and a bare video are dropped at the close, with no ask call', async () => {
  await capture.handle(event({ text: 'ok great' }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  transport.files.set('photo-1', { data: Buffer.from('x'), mimeType: 'image/jpeg' });
  await capture.handle(event({ photo: { id: 'photo-1' } }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  await capture.handle(event({ video: { id: 'video-1' } }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  expect(ask).not.toHaveBeenCalled();
  expect(family.counters.rules).toBe(3);
  expect(bundles).toEqual([]);
  expect(family.moments).toEqual([]);
});

test('a captioned video is classified from its thumbnail, and the moment keeps the video', async () => {
  (ask as Mock).mockResolvedValue(classification);
  transport.files.set('thumb-1', { data: Buffer.from('t'), mimeType: 'image/jpeg' });
  const videoEvent = event({ text: 'Maria at the party', video: { id: 'video-1' }, thumbnail: { id: 'thumb-1' } });

  await capture.handle(videoEvent, family, ctx);
  await tick();

  expect(family.moments[0].video).toEqual({ id: 'video-1' });
  const [, , options] = (ask as Mock).mock.calls[0];
  expect(options.media).toEqual([{ data: Buffer.from('t'), mimeType: 'image/jpeg' }]);
});

test('a bare photo, then a voice note from the same sender: one moment with the photo, the voice, and the transcript', async () => {
  (ask as Mock).mockResolvedValue({ ...classification, transcript: 'She was so happy that day' });
  transport.files.set('photo-1', { data: Buffer.from('x'), mimeType: 'image/jpeg' });
  transport.files.set('voice-1', { data: Buffer.from('v'), mimeType: 'audio/ogg' });
  const photoEvent = event({ photo: { id: 'photo-1' } });
  await capture.handle(photoEvent, family, ctx);

  advance(30_000);
  const voiceEvent = event({ voice: { id: 'voice-1' } });
  await capture.handle(voiceEvent, family, ctx);

  expect(bundles).toHaveLength(1);
  await tick();

  expect(family.moments).toHaveLength(1);
  expect(family.moments[0].photo).toEqual({ id: 'photo-1' });
  expect(family.moments[0].voice).toEqual({ id: 'voice-1' });
  expect(family.moments[0].text).toBe('She was so happy that day');
});

test('a text bundle is not classified at 1:59 after its last message, and is classified at 2:00', async () => {
  (ask as Mock).mockResolvedValue(classification);
  await capture.handle(event({ text: 'Maria on her first day' }), family, ctx);

  advance(BUNDLE_GAP_MS - 1000);
  await tick();
  expect(ask).not.toHaveBeenCalled();
  expect(bundles).toHaveLength(1);

  advance(1000);
  await tick();
  expect(ask).toHaveBeenCalledTimes(1);
  expect(family.moments).toHaveLength(1);
});

test('a photo, then a text 30 seconds later from the same sender: one bundle with both message ids', async () => {
  (ask as Mock).mockResolvedValue(classification);
  transport.files.set('photo-1', { data: Buffer.from('x'), mimeType: 'image/jpeg' });
  const photoEvent = event({ photo: { id: 'photo-1' } });
  await capture.handle(photoEvent, family, ctx);

  advance(30_000);
  const textEvent = event({ text: 'Maria on her first day' });
  await capture.handle(textEvent, family, ctx);

  expect(bundles).toHaveLength(1);
  await tick();

  expect(family.moments).toHaveLength(1);
  expect(family.moments[0].messageIds).toEqual([photoEvent.messageId, textEvent.messageId]);
});

test('two texts 3 minutes apart from the same sender open two bundles', async () => {
  await capture.handle(event({ text: 'first message here' }), family, ctx);
  advance(3 * 60_000);
  await capture.handle(event({ text: 'second message here' }), family, ctx);

  expect(bundles).toHaveLength(2);
});

test('a voice note alone uses the transcript, or the title when the transcript is empty', async () => {
  transport.files.set('voice-1', { data: Buffer.from('v'), mimeType: 'audio/ogg' });
  (ask as Mock).mockResolvedValueOnce({ ...classification, transcript: 'She loved that trip' });
  await capture.handle(event({ voice: { id: 'voice-1' } }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();
  expect(family.moments[0].text).toBe('She loved that trip');

  transport.files.set('voice-2', { data: Buffer.from('v'), mimeType: 'audio/ogg' });
  (ask as Mock).mockResolvedValueOnce({ ...classification, transcript: '' });
  await capture.handle(event({ voice: { id: 'voice-2' } }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();
  expect(family.moments[1].text).toBe(classification.title);
});

test('ask rejecting, or an invalid verdict, counts as failed with no moment', async () => {
  const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  (ask as Mock).mockRejectedValueOnce(new Error('boom'));
  await capture.handle(event({ text: 'Maria on her first day' }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  (ask as Mock).mockResolvedValueOnce({ ...classification, verdict: 'nonsense' });
  await capture.handle(event({ text: 'another moment worth keeping' }), family, ctx);
  advance(BUNDLE_GAP_MS);
  await tick();

  expect(family.moments).toEqual([]);
  expect(family.counters.failed).toBe(2);
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('classification failed'));
  warnSpy.mockRestore();
});

test('two concurrent ticks classify a pending bundle once', async () => {
  let resolveAsk!: (value: unknown) => void;
  (ask as Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveAsk = resolve;
    }),
  );
  await capture.handle(event({ text: 'Maria on her first day' }), family, ctx);
  advance(BUNDLE_GAP_MS);

  const tick1 = tick();
  const tick2 = tick();
  resolveAsk(classification);
  await Promise.all([tick1, tick2]);

  expect(ask).toHaveBeenCalledTimes(1);
  expect(family.moments).toHaveLength(1);
});

test('a forget deletes the moment it replies to, the moment of a memory post, or just the story of a story message', async () => {
  const saveSpy = vi.spyOn(ctx.store, 'save');
  const m1 = moment({ id: 'm1', messageIds: ['msg-1'] });
  const m2 = moment({ id: 'm2', messageIds: ['msg-2'], memoryPostIds: ['post-2'] });
  const m3 = moment({
    id: 'm3',
    messageIds: ['msg-3'],
    stories: [{ id: 's1', by: { id: 'nikos', name: 'Nikos' }, at: 0, text: 'story text', messageIds: ['story-3'] }],
  });
  family.moments.push(m1, m2, m3);

  const forgetMoment = event({ text: 'Anchor, forget this', replyTo: 'msg-1' });
  expect(await forget.handle(forgetMoment, family, ctx)).toBe(true);
  expect(family.moments.find((m) => m.id === 'm1')).toBeUndefined();
  expect(saveSpy).toHaveBeenCalledTimes(1);

  const forgetMemoryPost = event({ text: 'Anchor, forget this', replyTo: 'post-2' });
  await forget.handle(forgetMemoryPost, family, ctx);
  expect(family.moments.find((m) => m.id === 'm2')).toBeUndefined();
  expect(saveSpy).toHaveBeenCalledTimes(2);

  const forgetStory = event({ text: 'Anchor, forget this', replyTo: 'story-3' });
  await forget.handle(forgetStory, family, ctx);
  const remaining = family.moments.find((m) => m.id === 'm3');
  expect(remaining).toBeDefined();
  expect(remaining?.stories).toEqual([]);
  expect(saveSpy).toHaveBeenCalledTimes(3);

  expect(transport.reactions).toEqual([
    { chatId: '-100', messageId: forgetMoment.messageId, emoji: '👌' },
    { chatId: '-100', messageId: forgetMemoryPost.messageId, emoji: '👌' },
    { chatId: '-100', messageId: forgetStory.messageId, emoji: '👌' },
  ]);
});

test('a forget removes an open bundle before its tick, so the tick calls no ask, and the drop alone does not save', async () => {
  const saveSpy = vi.spyOn(ctx.store, 'save');
  const bundleEvent = event({ text: 'Maria on her first day' });
  await capture.handle(bundleEvent, family, ctx);
  await forget.handle(event({ text: 'Anchor, forget this', replyTo: bundleEvent.messageId }), family, ctx);
  expect(bundles).toEqual([]);
  expect(saveSpy).not.toHaveBeenCalled();

  advance(BUNDLE_GAP_MS);
  await tick();
  expect(ask).not.toHaveBeenCalled();
  expect(family.moments).toEqual([]);
});

test('a forget while ask is pending leaves no moment saved', async () => {
  let resolveAsk!: (value: unknown) => void;
  (ask as Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveAsk = resolve;
    }),
  );
  const bundleEvent = event({ text: 'Maria on her first day' });
  await capture.handle(bundleEvent, family, ctx);
  advance(BUNDLE_GAP_MS);

  const pending = tick();
  await forget.handle(event({ text: 'Anchor, forget this', replyTo: bundleEvent.messageId }), family, ctx);
  resolveAsk(classification);
  await pending;

  expect(family.moments).toEqual([]);
});

test('a forget that owns nothing still reacts but does not save, and a forget with no reply changes nothing silently', async () => {
  const saveSpy = vi.spyOn(ctx.store, 'save');
  const stray = event({ text: 'Anchor, forget this', replyTo: 'does-not-exist' });
  expect(await forget.handle(stray, family, ctx)).toBe(true);
  expect(family.moments).toEqual([]);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: stray.messageId, emoji: '👌' }]);
  expect(saveSpy).not.toHaveBeenCalled();

  const noReply = event({ text: 'Anchor, forget this' });
  expect(await forget.handle(noReply, family, ctx)).toBe(true);
  expect(transport.reactions).toHaveLength(1);
  expect(saveSpy).not.toHaveBeenCalled();
});

test('a keep-quiet marks the moment sensitive and keeps it in place', async () => {
  const saveSpy = vi.spyOn(ctx.store, 'save');
  const m1 = moment({ id: 'm1', messageIds: ['msg-1'], sensitive: false });
  family.moments.push(m1);
  const keepQuiet = event({ text: "Anchor, don't bring this back", replyTo: 'msg-1' });
  expect(await forget.handle(keepQuiet, family, ctx)).toBe(true);
  expect(family.moments).toHaveLength(1);
  expect(family.moments[0].id).toBe('m1');
  expect(family.moments[0].sensitive).toBe(true);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: keepQuiet.messageId, emoji: '👌' }]);
  expect(saveSpy).toHaveBeenCalledTimes(1);
});

test('a keep-quiet accepts the U+2019 apostrophe too', async () => {
  const m1 = moment({ id: 'm1', messageIds: ['msg-1'] });
  family.moments.push(m1);
  const keepQuiet = event({ text: 'Anchor, don’t bring this back', replyTo: 'msg-1' });
  expect(await forget.handle(keepQuiet, family, ctx)).toBe(true);
  expect(family.moments[0].sensitive).toBe(true);
});

test('a keep-quiet on an open bundle makes the saved moment sensitive', async () => {
  (ask as Mock).mockResolvedValue(classification);
  const saveSpy = vi.spyOn(ctx.store, 'save');
  const textEvent = event({ text: 'Maria on her first day' });
  await capture.handle(textEvent, family, ctx);
  await forget.handle(event({ text: "Anchor, don't bring this back", replyTo: textEvent.messageId }), family, ctx);
  expect(saveSpy).not.toHaveBeenCalled(); // no moment exists yet; only the in-memory bundle flag flipped

  advance(BUNDLE_GAP_MS);
  await tick();

  expect(family.moments[0].sensitive).toBe(true);
  expect(saveSpy).toHaveBeenCalled(); // the tick's close() saves the new, already-sensitive moment
});

test('forget.handle and capture.handle return false for a private event', async () => {
  const privateEvent: Incoming = {
    chat: 'private',
    chatId: 'sofia',
    messageId: 'p1',
    sender: { id: 'sofia', name: 'Sofia' },
    at: Date.now(),
    text: 'Anchor, forget this',
  };
  expect(await forget.handle(privateEvent, family, ctx)).toBe(false);
  expect(await capture.handle(privateEvent, family, ctx)).toBe(false);
});

test('forget.handle and capture.handle return false when the router found no family', async () => {
  expect(await forget.handle(event({ text: 'Anchor, forget this', replyTo: 'x' }), undefined, ctx)).toBe(false);
  expect(await capture.handle(event({ text: 'hello there friend' }), undefined, ctx)).toBe(false);
});
