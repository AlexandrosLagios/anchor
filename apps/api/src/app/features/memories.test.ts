process.env.TZ = 'Europe/Athens';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { beforeEach, expect, test, vi } from 'vitest';
import { dayIndex } from '../core/clock';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { openStore } from '../core/store';
import type { Context, Family, Incoming, Media, Moment } from '../core/types';

// keep the real validators, mock every call that reaches the model
vi.mock('../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/model')>()),
  ask: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
}));

import { transcribe } from '../model/model';
import { dueKeys, labelFor, memories } from './memories';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
const daysBefore = (ms: number, days: number) => {
  const date = new Date(ms);
  date.setDate(date.getDate() - days);
  return date.getTime();
};

function moment(fields: Partial<Moment> = {}): Moment {
  return {
    id: 'm1',
    by: { id: '1', name: 'Sofia' },
    messageIds: ['5'],
    savedAt: at(25, 12),
    text: 'Maria on her first day at school',
    salience: 3,
    sensitive: false,
    people: [],
    title: "Maria's first day at school",
    stories: [],
    lookbacks: [],
    memoryPostIds: [],
    returns: {},
    ...fields,
  };
}

const now = at(25, 12);

test('dueKeys finds an age due at 7, 30, and 365 days, and none before', () => {
  expect(dueKeys(moment({ savedAt: daysBefore(now, 6) }), now)).toEqual([]);
  expect(dueKeys(moment({ savedAt: daysBefore(now, 7) }), now)).toEqual(['7']);
  expect(dueKeys(moment({ savedAt: daysBefore(now, 30) }), now)).toEqual(['7', '30']);
  expect(dueKeys(moment({ savedAt: daysBefore(now, 400) }), now)).toEqual(['7', '30', '365']);
});

test('dueKeys skips an age already marked done', () => {
  expect(dueKeys(moment({ savedAt: daysBefore(now, 400), lookbacks: ['7', '30'] }), now)).toEqual(['365']);
});

test('dueKeys is empty for a sensitive moment', () => {
  expect(dueKeys(moment({ savedAt: daysBefore(now, 400), sensitive: true }), now)).toEqual([]);
});

test('dueKeys adds the anniversary key on the matching day of an earlier year', () => {
  expect(dueKeys(moment({ savedAt: daysBefore(now, 1), eventDate: '2019-09-25' }), now)).toEqual(['anniversary-2026']);
});

test('dueKeys skips the anniversary key when it is already marked done', () => {
  expect(dueKeys(moment({ savedAt: daysBefore(now, 1), eventDate: '2019-09-25', lookbacks: ['anniversary-2026'] }), now)).toEqual([]);
});

test('labelFor names the year of the event date for an anniversary key', () => {
  expect(labelFor(moment({ eventDate: '2019-09-25' }), ['anniversary-2026'])).toBe(lines.labels.anniversary(2019));
});

test('labelFor picks the highest age among the due keys', () => {
  expect(labelFor(moment(), ['7', '30'])).toBe(lines.labels['30']);
});

let transport: FakeTransport;
let ctx: Context;
let family: Family;
let file: string;

beforeEach(() => {
  vi.clearAllMocks();
  transport = new FakeTransport();
  file = join(mkdtempSync(join(tmpdir(), 'anchor-')), 'state.json');
  const store = openStore(file, now);
  ctx = { now: () => now, store, transport: () => transport };
  family = store.addFamily('-100', '-100');
});

const groupEvent = (fields: Partial<Incoming> = {}): Incoming => ({
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: '9',
  sender: { id: '2', name: 'Nikos' },
  at: now,
  ...fields,
});

test('a tick with a window that holds 18:00 posts the due photo memory and marks it done', async () => {
  const due = moment({ savedAt: daysBefore(at(25, 18), 7), photo: { id: 'photo-1' } });
  family.moments.push(due);

  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);

  expect(transport.sent).toEqual([
    { chatId: '-100', messageId: 'sent-1', message: { photo: { id: 'photo-1' }, text: lines.memoryCaption(lines.labels['7'], due) } },
  ]);
  expect(due.memoryPostIds).toEqual(['sent-1']);
  expect(due.lookbacks).toEqual(['7']);
  expect(family.lastMemoryDay).toBe(dayIndex(at(25, 18)));
});

test('a second window on the same day posts nothing, and a window without 18:00 posts nothing', async () => {
  const due = moment({ savedAt: daysBefore(at(25, 18), 7), photo: { id: 'photo-1' } });
  family.moments.push(due);

  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);
  const lastMemoryDay = family.lastMemoryDay;
  await memories.tick?.(family, { from: at(25, 18, 1), to: at(25, 19) }, ctx);
  expect(transport.sent).toHaveLength(1);
  expect(family.lastMemoryDay).toBe(lastMemoryDay);

  await memories.tick?.(family, { from: at(26, 10), to: at(26, 10, 30) }, ctx);
  expect(transport.sent).toHaveLength(1);
});

test('the anniversary moment wins over a 30-day moment', async () => {
  const anniversary = moment({ id: 'ann', savedAt: daysBefore(at(25, 18), 5), eventDate: '2019-09-25' });
  const thirtyDays = moment({ id: 'thirty', savedAt: daysBefore(at(25, 18), 30) });
  family.moments.push(thirtyDays, anniversary);

  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);

  expect(transport.sent).toHaveLength(1);
  expect(transport.sent[0].message.text).toBe(lines.memoryCaption(lines.labels.anniversary(2019), anniversary));
});

test('between two due moments, the higher salience wins', async () => {
  const weak = moment({ id: 'weak', savedAt: daysBefore(at(25, 18), 30), salience: 2 });
  const strong = moment({ id: 'strong', savedAt: daysBefore(at(25, 18), 30), salience: 5 });
  family.moments.push(weak, strong);

  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);

  expect(transport.sent).toHaveLength(1);
  expect(strong.memoryPostIds).toEqual(['sent-1']);
  expect(weak.memoryPostIds).toEqual([]);
});

test('a moment with no photo posts the caption as text, and a video wins over a photo', async () => {
  const textOnly = moment({ id: 'text-only', savedAt: daysBefore(at(25, 18), 7) });
  family.moments.push(textOnly);
  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);
  expect(transport.sent[0].message).toEqual({ text: lines.memoryCaption(lines.labels['7'], textOnly) });

  const withBoth = moment({ id: 'with-both', savedAt: daysBefore(at(26, 18), 7), photo: { id: 'p1' }, video: { id: 'v1' } });
  family.moments.push(withBoth);
  family.lastMemoryDay = undefined;
  await memories.tick?.(family, { from: at(26, 17, 59), to: at(26, 18, 1) }, ctx);
  expect(transport.sent[1].message).toEqual({ video: { id: 'v1' }, text: lines.memoryCaption(lines.labels['7'], withBoth) });
});

test('a sensitive moment is never posted', async () => {
  const sensitive = moment({ savedAt: daysBefore(at(25, 18), 400), sensitive: true });
  family.moments.push(sensitive);
  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);
  expect(transport.sent).toEqual([]);
  expect(family.lastMemoryDay).toBeDefined();
});

test('a send that rejects keeps the marked keys, and the store still saves', async () => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const due = moment({ savedAt: daysBefore(at(25, 18), 7) });
  family.moments.push(due);
  vi.spyOn(transport, 'send').mockRejectedValue(new Error('blocked'));

  await memories.tick?.(family, { from: at(25, 17, 59), to: at(25, 18, 1) }, ctx);

  expect(due.lookbacks).toEqual(['7']);
  expect(due.memoryPostIds).toEqual([]);
  const reloaded = openStore(file, now).family('-100')?.moments[0];
  expect(reloaded?.lookbacks).toEqual(['7']);
});

test('/memory from an admin posts the due moment with its label', async () => {
  transport.admins.add('2');
  const due = moment({ savedAt: daysBefore(now, 7) });
  family.moments.push(due);

  const handled = await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);

  expect(handled).toBe(true);
  expect(transport.sent[0].message.text).toBe(lines.memoryCaption(lines.labels['7'], due));
  expect(family.lastMemoryDay).toBeUndefined();
});

test('/memory on a wordless photo names the photo by its title and never quotes the title as her words', async () => {
  transport.admins.add('2');
  family.moments.push(moment({ savedAt: daysBefore(now, 7), photo: { id: 'photo-1' }, text: "Maria's first day at school", wordless: true }));

  await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);

  expect(transport.sent[0].message).toEqual({
    photo: { id: 'photo-1' },
    text: `${lines.labels['7']} 💛\nSofia shared a photo: Maria's first day at school\nReply with a story or a voice note to add it to the family record.`,
  });
  expect(transport.sent[0].message.text).not.toContain("«Maria's first day at school»");
});

test('/memory with nothing due posts the moment with the fewest memory posts, from the record', async () => {
  transport.admins.add('2');
  const seenOften = moment({ id: 'seen', memoryPostIds: ['x', 'y'] });
  const seenOnce = moment({ id: 'once', memoryPostIds: ['x'] });
  family.moments.push(seenOften, seenOnce);

  await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);

  expect(transport.sent[0].message.text).toBe(lines.memoryCaption(lines.labels.fromRecord, seenOnce));
});

test('/memory with a tie in memory posts breaks the tie by byPriority', async () => {
  transport.admins.add('2');
  const weak = moment({ id: 'weak', salience: 2 });
  const strong = moment({ id: 'strong', salience: 5 });
  family.moments.push(weak, strong);

  await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);

  expect(strong.memoryPostIds).toEqual(['sent-1']);
});

test('/memory with no moments, or only sensitive ones, sends nothingToShare', async () => {
  transport.admins.add('2');
  await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);
  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.nothingToShare } }]);

  family.moments.push(moment({ sensitive: true }));
  await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);
  expect(transport.sent[1].message.text).toBe(lines.nothingToShare);
});

test('/memory from a member who is not an admin returns true and sends nothing', async () => {
  family.moments.push(moment({ savedAt: daysBefore(now, 7) }));
  const handled = await memories.handle?.(groupEvent({ text: '/memory' }), family, ctx);
  expect(handled).toBe(true);
  expect(transport.sent).toEqual([]);
});

test('a reply with 3 words to a memory post becomes a story, and the reaction is a heart', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);

  const handled = await memories.handle?.(groupEvent({ text: 'She loved it', replyTo: 'sent-1', messageId: '11' }), family, ctx);

  expect(handled).toBe(true);
  expect(posted.stories).toEqual([{ id: expect.any(String), by: { id: '2', name: 'Nikos' }, at: now, text: 'She loved it', voice: undefined, messageIds: ['11'] }]);
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: '11', emoji: '\u2764' }]);
});

test('a voice reply gets its text from the transcript', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);
  const voice: Media = { id: 'voice-1' };
  transport.files.set('voice-1', { data: Buffer.from('clip'), mimeType: 'audio/ogg' });
  vi.mocked(transcribe).mockResolvedValue('a school memory');

  await memories.handle?.(groupEvent({ voice, replyTo: 'sent-1', messageId: '12' }), family, ctx);

  expect(transcribe).toHaveBeenCalledWith({ data: Buffer.from('clip'), mimeType: 'audio/ogg' });
  expect(posted.stories[0].text).toBe('a school memory');
});

test('a rejected or empty transcription gives the voice note line', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);
  const voice: Media = { id: 'voice-1' };
  transport.files.set('voice-1', { data: Buffer.from('clip'), mimeType: 'audio/ogg' });
  vi.mocked(transcribe).mockResolvedValue('');

  await memories.handle?.(groupEvent({ voice, replyTo: 'sent-1', messageId: '12' }), family, ctx);
  expect(posted.stories[0].text).toBe(lines.voiceNote);

  const posted2 = moment({ id: 'm2', memoryPostIds: ['sent-2'] });
  family.moments.push(posted2);
  vi.mocked(transcribe).mockRejectedValue(new Error('model down'));
  await memories.handle?.(groupEvent({ voice, replyTo: 'sent-2', messageId: '13' }), family, ctx);
  expect(posted2.stories[0].text).toBe(lines.voiceNote);
});

test('a reply with 2 words, a forwarded reply, and a reply to a non-memory-post get no story', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);

  expect(await memories.handle?.(groupEvent({ text: 'so nice', replyTo: 'sent-1', messageId: '20' }), family, ctx)).toBe(false);
  expect(await memories.handle?.(groupEvent({ text: 'she loved it', replyTo: 'sent-1', messageId: '21', forwarded: true }), family, ctx)).toBe(false);
  expect(await memories.handle?.(groupEvent({ text: 'she loved it so much', replyTo: 'nope', messageId: '22' }), family, ctx)).toBe(false);
  expect(posted.stories).toEqual([]);
});

test('a reply that addresses Anchor directly is a question, not a story, and adds nothing', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);

  const handled = await memories.handle?.(groupEvent({ text: 'Anchor, when was this taken?', replyTo: 'sent-1', messageId: '40' }), family, ctx);

  expect(handled).toBe(false);
  expect(posted.stories).toEqual([]);
});

test('a command reply to a memory post is never a story', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);

  const handled = await memories.handle?.(groupEvent({ text: '/help what is this', replyTo: 'sent-1', messageId: '41' }), family, ctx);

  expect(handled).toBe(false);
  expect(posted.stories).toEqual([]);
});

test('a moment that a forget deletes while transcribe runs gets no story', async () => {
  const posted = moment({ memoryPostIds: ['sent-1'] });
  family.moments.push(posted);
  const voice: Media = { id: 'voice-1' };
  transport.files.set('voice-1', { data: Buffer.from('clip'), mimeType: 'audio/ogg' });
  let resolveTranscribe: (value: string) => void = () => undefined;
  vi.mocked(transcribe).mockReturnValue(new Promise((resolve) => (resolveTranscribe = resolve)));

  const pending = memories.handle?.(groupEvent({ voice, replyTo: 'sent-1', messageId: '30' }), family, ctx);
  family.moments.splice(family.moments.indexOf(posted), 1);
  resolveTranscribe('a story');
  await pending;

  expect(posted.stories).toEqual([]);
  expect(transport.reactions).toEqual([]);
});
